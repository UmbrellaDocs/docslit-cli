/**
 * Markdown content negotiation (Accept: text/markdown) on static hosts, and the
 * agent-facing outputs an AI-readiness checker reads: llms.txt and vercel.json.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';
import { prefersMarkdown } from './negotiation.js';
import { vercelMiddleware } from './deploy.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BIN = path.join(__dirname, '..', 'bin', 'docslit.js');

function run(args, cwd, timeout = 120000) {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', [BIN, ...args], { cwd });
    let stdout = ''; let stderr = '';
    proc.stdout.on('data', (d) => (stdout += d));
    proc.stderr.on('data', (d) => (stderr += d));
    const timer = setTimeout(() => { proc.kill(); reject(new Error(`timeout: ${args.join(' ')}`)); }, timeout);
    proc.on('close', (code) => { clearTimeout(timer); resolve({ code: code ?? 0, stdout, stderr }); });
  });
}

describe('prefersMarkdown', () => {
  it.each([
    ['text/markdown', true],
    ['text/markdown, text/html;q=0.9', true],
    ['text/markdown, text/html', true],
    ['text/markdown;q=1, text/*;q=0.5', true],
    ['text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', false],
    ['text/html, text/markdown;q=0.5', false],
    ['text/markdown;q=0', false],
    ['*/*', false],
    ['', false],
  ])('%j -> %s', (accept, expected) => {
    expect(prefersMarkdown(accept)).toBe(expected);
  });
});

describe('Vercel middleware.js', () => {
  let tmp; let mw;
  const files = {
    '/docs/overview/introduction.md': '# Intro\n',
    '/docs/faq.md': '# FAQ\n',
  };
  const load = async (opts) => {
    const file = path.join(tmp, `mw-${Math.random().toString(36).slice(2)}.mjs`);
    await fs.writeFile(file, vercelMiddleware(opts));
    return import(pathToFileURL(file).href);
  };
  const req = (p, accept) => new Request(`https://docs.example.com${p}`, { headers: accept ? { accept } : {} });

  beforeAll(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'docslit-vercel-mw-'));
    mw = await load({ basePath: '/docs', rootPath: '/docs/overview/introduction' });
  });
  afterAll(() => fs.remove(tmp));
  afterEach(() => vi.unstubAllGlobals());

  const stubFetch = () => {
    const calls = [];
    vi.stubGlobal('fetch', async (url, init) => {
      calls.push({ url: String(url), accept: init?.headers?.accept });
      const body = files[new URL(url).pathname];
      return body ? new Response(body, { status: 200 }) : new Response('nf', { status: 404 });
    });
    return calls;
  };

  it('serves the page .md when the client prefers Markdown', async () => {
    const calls = stubFetch();
    const res = await mw.default(req('/docs/faq', 'text/markdown'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/markdown; charset=utf-8');
    expect(res.headers.get('vary')).toBe('Accept');
    expect(await res.text()).toBe('# FAQ\n');
    // The sub-request does not ask for Markdown, so it cannot loop through the middleware.
    expect(calls).toEqual([{ url: 'https://docs.example.com/docs/faq.md', accept: 'text/plain' }]);
  });

  it('maps the site root (and a trailing slash) to the first page', async () => {
    stubFetch();
    expect(await (await mw.default(req('/docs/', 'text/markdown'))).text()).toBe('# Intro\n');
    expect(await (await mw.default(req('/docs', 'text/markdown'))).text()).toBe('# Intro\n');
  });

  it('falls through for browsers and for pages without Markdown', async () => {
    const calls = stubFetch();
    expect(await mw.default(req('/docs/faq', 'text/html,*/*;q=0.8'))).toBeUndefined();
    expect(await mw.default(req('/docs/faq'))).toBeUndefined();
    expect(calls).toEqual([]);
    expect(await mw.default(req('/docs/missing', 'text/markdown'))).toBeUndefined();
  });

  it('never fetches another origin', async () => {
    const calls = stubFetch();
    for (const p of ['//evil.example/x', '/\\evil.example/x', '/docs//evil.example/x']) {
      // Request normalises some of these; call with a hand-built request object as well.
      const fake = { url: `https://docs.example.com${p}`, headers: new Headers({ accept: 'text/markdown' }) };
      await mw.default(fake);
    }
    expect(calls.every((c) => new URL(c.url).origin === 'https://docs.example.com')).toBe(true);
  });

  it('only matches extensionless page URLs', () => {
    const [pattern] = mw.config.matcher;
    // Vercel matchers are path-to-regexp; this one is a plain regex group.
    const re = new RegExp(`^${pattern}$`);
    expect(re.test('/docs/faq')).toBe(true);
    expect(re.test('/')).toBe(true);
    expect(re.test('/docs/faq.md')).toBe(false);
    expect(re.test('/docslit.css')).toBe(false);
    expect(re.test('/llms.txt')).toBe(false);
  });
});

describe('build + deploy --vercel', () => {
  let dir;
  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'docslit-vercel-'));
    await fs.outputJson(path.join(dir, 'docslit.json'), {
      name: 'Neg', url: 'https://docs.example.com', basePath: '/docs',
      sidebar: [{ group: 'Overview', pages: ['overview/introduction', 'faq'] }],
    });
    await fs.outputFile(path.join(dir, 'docs/overview/introduction.md'), '---\ntitle: Intro\n---\n\n# Intro\n');
    await fs.outputFile(path.join(dir, 'docs/faq.md'), '---\ntitle: FAQ\n---\n\n# FAQ\n');
    const res = await run(['build'], dir);
    if (res.code !== 0) throw new Error(res.stdout + res.stderr);
  }, 180000);
  afterAll(() => fs.remove(dir));

  it('llms.txt has no literal {slug} URL and links real .md files', async () => {
    const llms = await fs.readFile(path.join(dir, 'dist/llms.txt'), 'utf8');
    expect(llms).not.toContain('{slug}');
    expect(llms).toMatch(/Accept: text\/markdown/);
    expect(llms).toContain('/faq.md');
  });

  it('dist/vercel.json uses cleanUrls instead of an Accept rewrite that never runs', async () => {
    const vj = await fs.readJson(path.join(dir, 'dist/vercel.json'));
    expect(vj.cleanUrls).toBe(true);
    expect(vj.rewrites).toBeUndefined();
    expect(vj.headers[0].source).toBe('/docs/(.*)\\.md');
  });

  it('writes vercel.json and a middleware.js rooted at the first page', async () => {
    const res = await run(['deploy', '--vercel'], dir);
    expect(res.code).toBe(0);
    const vj = await fs.readJson(path.join(dir, 'vercel.json'));
    expect(vj).toMatchObject({ outputDirectory: 'dist', cleanUrls: true, trailingSlash: false });
    const mw = await fs.readFile(path.join(dir, 'middleware.js'), 'utf8');
    expect(mw).toContain('const BASE_PATH = "/docs";');
    expect(mw).toContain('const ROOT_PAGE = "/docs/overview/introduction";');
  });

  it('keeps an existing vercel.json and a middleware.js it did not write', async () => {
    await fs.writeJson(path.join(dir, 'vercel.json'), { cleanUrls: true, redirects: [] });
    await fs.writeFile(path.join(dir, 'middleware.js'), 'export default function m() {}\n');
    const res = await run(['deploy', '--vercel'], dir);
    expect(res.code).toBe(0);
    expect(await fs.readJson(path.join(dir, 'vercel.json'))).toEqual({ cleanUrls: true, redirects: [] });
    expect(await fs.readFile(path.join(dir, 'middleware.js'), 'utf8')).toBe('export default function m() {}\n');
    expect(res.stdout).toContain('not written by DocsLit');
  });
});
