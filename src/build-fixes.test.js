import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import git from 'isomorphic-git';
import * as nodeFs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BIN = path.join(__dirname, '..', 'bin', 'docslit.js');

function run(args, cwd, timeout = 60000) {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', [BIN, ...args], { cwd });
    let stdout = ''; let stderr = '';
    proc.stdout.on('data', (d) => (stdout += d));
    proc.stderr.on('data', (d) => (stderr += d));
    const timer = setTimeout(() => { proc.kill(); reject(new Error(`timeout: ${args.join(' ')}`)); }, timeout);
    proc.on('close', (code) => { clearTimeout(timer); resolve({ code: code ?? 0, stdout, stderr }); });
  });
}

/** Drive a generated stdio MCP server: send requests, collect responses by id. */
function driveStdio(script, requests, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', [script]);
    const out = new Map();
    let buf = '';
    const timer = setTimeout(() => { proc.kill(); reject(new Error('mcp-server timeout')); }, timeout);
    proc.stdout.on('data', (d) => {
      buf += d;
      let nl;
      while ((nl = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
        if (!line.trim()) continue;
        const msg = JSON.parse(line); // stdout must be pure JSON-RPC
        out.set(msg.id, msg);
        if (out.size === requests.filter((r) => r.id !== undefined).length) { clearTimeout(timer); proc.kill(); resolve(out); }
      }
    });
    proc.on('error', reject);
    for (const r of requests) proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...r }) + '\n');
  });
}

const call = (id, name, args) => ({ id, method: 'tools/call', params: { name, arguments: args } });
const textOf = (msg) => msg.result.content[0].text;

async function commitAll(dir, message, ref) {
  const walk = async (d) => {
    const out = [];
    for (const e of await fs.readdir(path.join(dir, d), { withFileTypes: true })) {
      if (e.name === '.git' || e.name === 'out') continue;
      const rel = path.posix.join(d, e.name);
      if (e.isDirectory()) out.push(...await walk(rel)); else out.push(rel);
    }
    return out;
  };
  for (const f of await walk('.')) await git.add({ fs: nodeFs, dir, filepath: f.replace(/^\.\//, '') });
  return git.commit({ fs: nodeFs, dir, message, ref, author: { name: 't', email: 't@example.com' } });
}

describe('versioned build: generated mcp-server.js', () => {
  let dir; let out;
  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'docslit-vermcp-'));
    out = path.join(dir, 'out');
    const cfg = {
      name: 'Versioned Docs', description: 'Fixture',
      sidebar: [{ group: 'Guide', pages: ['intro', 'setup'] }],
      versions: { default: '2.0', list: [{ version: '2.0', branch: 'main' }, { version: '1.0', branch: 'v1' }] },
    };
    await fs.outputJson(path.join(dir, 'docslit.json'), cfg);
    await fs.outputFile(path.join(dir, 'docs/intro.md'), '---\ntitle: Intro\ndescription: Start here\n---\n\n# Intro\n\nShared page about zebras.\n');
    await fs.outputFile(path.join(dir, 'docs/setup.md'), '---\ntitle: Setup 2\n---\n\n# Setup\n\nVersion two setup mentions quokkas.\n');
    await fs.outputFile(path.join(dir, 'docs/assets/pic.png'), 'png');
    await git.init({ fs: nodeFs, dir, defaultBranch: 'main' });
    await commitAll(dir, 'v2', 'main');
    await git.branch({ fs: nodeFs, dir, ref: 'v1', checkout: true });
    await fs.outputFile(path.join(dir, 'docs/setup.md'), '---\ntitle: Setup 1\n---\n\n# Setup\n\nVersion one setup mentions wombats.\n');
    await commitAll(dir, 'v1', 'v1');
    await git.checkout({ fs: nodeFs, dir, ref: 'main', force: true });
    await fs.outputFile(path.join(dir, 'docs/setup.md'), '---\ntitle: Setup 2\n---\n\n# Setup\n\nVersion two setup mentions quokkas.\n');
    const r = await run(['build', '--out', out, '--no-minify'], dir);
    expect(r.code, r.stdout + r.stderr).toBe(0);
  }, 120000);
  afterAll(async () => { await fs.remove(dir); });

  it('writes the server at the root and Markdown + search index under <version>/', async () => {
    expect(await fs.pathExists(path.join(out, 'mcp-server.js'))).toBe(true);
    expect(await fs.pathExists(path.join(out, '2.0', 'setup.md'))).toBe(true);
    expect(await fs.pathExists(path.join(out, '2.0', 'search-index.json'))).toBe(true);
    expect(await fs.pathExists(path.join(out, 'setup.md'))).toBe(false);
  });

  it('copies docs media into every version directory so relative image paths resolve', async () => {
    for (const v of ['2.0', '1.0']) expect(await fs.pathExists(path.join(out, v, 'assets', 'pic.png'))).toBe(true);
    expect(await fs.pathExists(path.join(out, 'assets', 'pic.png'))).toBe(true);
  });

  it('serves the default version by default and any version on request over stdio', async () => {
    const res = await driveStdio(path.join(out, 'mcp-server.js'), [
      { id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 't', version: '0' } } },
      { method: 'notifications/initialized' },
      { id: 2, method: 'tools/list' },
      call(3, 'list_pages', {}),
      call(4, 'get_page', { slug: 'setup' }),
      call(5, 'get_page', { slug: 'setup', version: '1.0' }),
      call(6, 'get_page', { slug: 'intro', version: '1.0' }), // shared with the default version
      call(7, 'search_docs', { query: 'quokkas' }),
      call(8, 'search_docs', { query: 'wombats', version: '1.0' }),
      call(9, 'search_docs', { query: 'wombats' }), // not in the default version
      call(10, 'get_page', { slug: 'setup', version: '9.9' }),
      call(11, 'get_page', { slug: '../../etc/passwd' }),
    ]);
    expect(res.get(1).result.protocolVersion).toBe('2025-11-25');
    const props = res.get(2).result.tools.map((t) => t.inputSchema.properties.version);
    expect(props.every((p) => p && p.type === 'string')).toBe(true);
    expect(textOf(res.get(3))).toMatch(/Versioned Docs \(version 2\.0\)[\s\S]*Setup 2\*\* \(setup\)/);
    expect(textOf(res.get(4))).toMatch(/quokkas/);
    expect(textOf(res.get(5))).toMatch(/wombats/);
    expect(textOf(res.get(6))).toMatch(/zebras/);
    expect(textOf(res.get(7))).toMatch(/Setup 2/);
    expect(textOf(res.get(8))).toMatch(/Setup 1|wombats/);
    expect(textOf(res.get(9))).toMatch(/No results/);
    expect(res.get(10).result.isError).toBe(true);
    expect(textOf(res.get(10))).toMatch(/Unknown version "9\.9"[\s\S]*2\.0, 1\.0/);
    expect(res.get(11).result.isError).toBe(true);
  });
});

describe('unversioned build: sidebar_title, math warning, offline assets, mcp-server', () => {
  let dir; let out;
  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'docslit-build-'));
    out = path.join(dir, 'out');
    await fs.outputJson(path.join(dir, 'docslit.json'), {
      name: 'Plain', sidebar: [{ group: 'Guide', pages: ['intro', 'long-title'] }, { group: 'Auto', autogenerate: 'auto' }],
    });
    await fs.outputFile(path.join(dir, 'docs/intro.md'), '---\ntitle: Introduction\n---\n\n# Introduction\n\nBad math $$\\foo{x}$$ here.\n');
    await fs.outputFile(path.join(dir, 'docs/long-title.md'), '---\ntitle: A Very Long Page Title About Things\nsidebar_title: Short\n---\n\n# A Very Long Page Title About Things\n\nBody about okapis.\n');
    await fs.outputFile(path.join(dir, 'docs/auto/a.md'), '---\ntitle: Auto Page Title\nsidebar_title: Auto Short\n---\n\n# Auto Page Title\n');
  });
  afterAll(async () => { await fs.remove(dir); });

  it('applies sidebar_title to sidebar labels only (explicit and autogenerated)', async () => {
    const r = await run(['build', '--out', out, '--no-minify'], dir);
    expect(r.code, r.stdout + r.stderr).toBe(0);
    const html = await fs.readFile(path.join(out, 'long-title.html'), 'utf8');
    expect(html).toMatch(/data-page="long-title"[^>]*>Short<\/a>/);
    expect(html).toMatch(/data-page="auto\/a"[^>]*>Auto Short<\/a>/);
    expect(html).not.toMatch(/data-page="long-title"[^>]*>A Very Long/);
    // The page title is untouched.
    expect(html).toMatch(/<title>[^<]*A Very Long Page Title About Things/);
    expect(html).toMatch(/<h1[^>]*>A Very Long Page Title About Things<\/h1>/);
  }, 60000);

  it('prints a build warning for invalid TeX', async () => {
    const r = await run(['build', '--out', out, '--no-minify'], dir);
    expect(r.stdout).toMatch(/intro\.md:7\s+Invalid math: Undefined control sequence: \\foo/);
  }, 60000);

  it('does not copy the unused ESM flexsearch.js to the root of offline builds', async () => {
    const offOut = path.join(dir, 'out-offline');
    const r = await run(['build', '--offline', '--out', offOut, '--no-minify'], dir);
    expect(r.code, r.stdout + r.stderr).toBe(0);
    expect(await fs.pathExists(path.join(offOut, 'flexsearch.js'))).toBe(false);
    expect(await fs.pathExists(path.join(offOut, 'flexsearch.iife.js'))).toBe(true);
    // Online builds still ship it.
    expect(await fs.pathExists(path.join(out, 'flexsearch.js'))).toBe(true);
  }, 60000);

  it('ships the vendored Lit bundles instead of loading Lit from a CDN', async () => {
    for (const f of ['lit.js', 'lit-unsafe-html.js', 'lit-decorators.js', 'reactive-element.js', 'lit-html.js', 'lit-element.js']) {
      expect(await fs.pathExists(path.join(out, 'docslit-vendor', f)), f).toBe(true);
    }
    const html = await fs.readFile(path.join(out, 'auto', 'a.html'), 'utf8');
    expect(html).toContain('"lit":"../docslit-vendor/lit.js"');
    expect(html).not.toContain('esm.sh');
  }, 60000);

  it('unversioned mcp-server.js still works and accepts the newest protocol version', async () => {
    const res = await driveStdio(path.join(out, 'mcp-server.js'), [
      { id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25' } },
      call(2, 'list_pages', {}),
      call(3, 'get_page', { slug: 'long-title' }),
      call(4, 'search_docs', { query: 'okapis' }),
      call(5, 'get_page', { slug: 'nope' }),
    ]);
    expect(res.get(1).result.protocolVersion).toBe('2025-11-25');
    expect(textOf(res.get(2))).toMatch(/Plain[\s\S]*long-title/);
    expect(textOf(res.get(3))).toMatch(/okapis/);
    expect(textOf(res.get(4))).toMatch(/long-title/);
    expect(res.get(5).result.isError).toBe(true);
  });
});
