import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import http from 'http';
import { spawn } from 'child_process';
import { PassThrough } from 'stream';
import { fileURLToPath } from 'url';
import { createMcpServer, SUPPORTED_PROTOCOL_VERSIONS } from './server.js';
import { buildServer } from './index.js';

const BIN = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'bin', 'docslit.js');

let nextId = 1;
async function rpc(server, method, params) {
  const res = await server.handle({ jsonrpc: '2.0', id: nextId++, method, params });
  return res;
}
async function call(server, name, args = {}) {
  const res = await rpc(server, 'tools/call', { name, arguments: args });
  expect(res.error).toBeUndefined();
  const texts = res.result.content.map((c) => c.text);
  let json = null;
  try { json = JSON.parse(texts[0]); } catch { /* text result */ }
  return { ...res.result, texts, json };
}

describe('protocol core', () => {
  const server = createMcpServer({ name: 't', version: '1', tools: [{ name: 'echo', description: 'e', inputSchema: { type: 'object', properties: { s: { type: 'string' } }, required: ['s'] }, handler: ({ s }) => s }] });

  it('negotiates protocol versions', async () => {
    for (const v of SUPPORTED_PROTOCOL_VERSIONS) {
      expect((await rpc(server, 'initialize', { protocolVersion: v, capabilities: {}, clientInfo: { name: 'x' } })).result.protocolVersion).toBe(v);
    }
    const r = await rpc(server, 'initialize', { protocolVersion: '1999-01-01' });
    expect(r.result.protocolVersion).toBe('2025-06-18');
    expect(r.result.capabilities.tools).toBeDefined();
    expect(r.result.serverInfo.name).toBe('t');
  });

  it('ping, notifications, unknown method, bad args', async () => {
    expect((await rpc(server, 'ping')).result).toEqual({});
    expect(await server.handle({ jsonrpc: '2.0', method: 'notifications/initialized' })).toBeNull();
    expect((await rpc(server, 'nope/nothing')).error.code).toBe(-32601);
    expect((await rpc(server, 'resources/list')).error.code).toBe(-32601);
    expect((await rpc(server, 'tools/call', { name: 'zzz' })).error.code).toBe(-32602);
    const bad = await rpc(server, 'tools/call', { name: 'echo', arguments: {} });
    expect(bad.result.isError).toBe(true);
    expect(bad.result.content[0].text).toMatch(/missing required argument "s"/);
  });

  it('serves newline-delimited JSON, handles malformed input and batches', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const lines = [];
    output.on('data', (d) => lines.push(...d.toString().split('\n').filter(Boolean)));
    const done = server.serve({ input, output, log: () => {} });
    input.write('{not json}\n');
    input.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }) + '\n');
    input.write(JSON.stringify([{ jsonrpc: '2.0', id: 2, method: 'ping' }, { jsonrpc: '2.0', method: 'notifications/initialized' }]) + '\r\n');
    input.write(JSON.stringify({ id: 3, method: 'ping' }) + '\n');
    input.end(JSON.stringify({ jsonrpc: '2.0', id: 4, method: 'ping' }));
    await done;
    const msgs = lines.map((l) => JSON.parse(l));
    expect(msgs.find((m) => m.error?.code === -32700).id).toBeNull();
    expect(msgs.find((m) => m.id === 1).result).toEqual({});
    expect(msgs.find((m) => Array.isArray(m)).length).toBe(1);
    expect(msgs.find((m) => m.id === 3).error.code).toBe(-32600);
    expect(msgs.find((m) => m.id === 4).result).toEqual({});
  });
});

describe('authoring mode', () => {
  let dir; let server;
  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'docslit-mcp-'));
    await fs.ensureDir(path.join(dir, 'docs', 'guides'));
    await fs.writeJson(path.join(dir, 'docslit.json'), {
      name: 'Fixture', description: 'Fixture docs',
      sidebar: [{ group: 'Start', pages: ['index'] }, { group: 'Guides', pages: ['guides/setup'] }],
    });
    await fs.writeFile(path.join(dir, 'docs', 'index.md'), '---\ntitle: Home\ndescription: Welcome home\n---\n\n# Home\n\nWelcome to the fixture. Details are in the [setup](guides/setup).\n');
    await fs.writeFile(path.join(dir, 'docs', 'guides', 'setup.md'), '---\ntitle: Setup\n---\n\n# Setup\n\n## Install\n\nRun the installer.\n\n## Authentication\n\nCreate a token and export it.\n');
    server = buildServer(['--dir', dir]);
  });
  afterAll(async () => { await fs.remove(dir); });

  it('tools/list has sane schemas and annotations', async () => {
    const { tools } = (await rpc(server, 'tools/list')).result;
    const names = tools.map((t) => t.name);
    for (const n of ['get_project_info', 'list_pages', 'read_page', 'search_docs', 'list_components', 'get_component', 'get_authoring_guide', 'get_schema', 'create_page', 'update_page', 'validate', 'check_markup', 'preview_page']) expect(names).toContain(n);
    for (const t of tools) {
      expect(t.description.length).toBeGreaterThan(30);
      expect(t.inputSchema.type).toBe('object');
      for (const r of t.inputSchema.required || []) expect(t.inputSchema.properties[r]).toBeDefined();
      expect(t.handler).toBeUndefined();
      expect(typeof t.annotations.readOnlyHint).toBe('boolean');
    }
    expect(tools.find((t) => t.name === 'update_page').annotations.destructiveHint).toBe(true);
    expect(tools.find((t) => t.name === 'read_page').annotations.readOnlyHint).toBe(true);
  });

  it('get_project_info / list_pages / read_page / search_docs', async () => {
    const info = (await call(server, 'get_project_info')).json;
    expect(info.name).toBe('Fixture');
    expect(info.pageCount).toBe(2);
    expect(info.sidebar[1].pages[0]).toEqual({ id: 'guides/setup', title: 'Setup' });
    expect(info.howToWork.length).toBeGreaterThan(2);
    const pages = (await call(server, 'list_pages')).json.pages;
    expect(pages.map((p) => p.id)).toEqual(['index', 'guides/setup']);
    expect(pages[1].group).toBe('Guides');
    const rp = await call(server, 'read_page', { page: 'guides/setup' });
    expect(JSON.parse(rp.texts[0]).file).toBe('docs/guides/setup.md');
    expect(rp.texts[1]).toContain('title: Setup');
    const s = (await call(server, 'search_docs', { query: 'authentication token' })).json;
    expect(s.results[0].id).toBe('guides/setup');
    expect(s.results[0].section).toBe('Authentication');
    const miss = await call(server, 'read_page', { page: 'nope' });
    expect(miss.isError).toBe(true);
  });

  it('reference tools', async () => {
    const lc = (await call(server, 'list_components', { category: 'callouts' })).json;
    expect(lc.components.map((c) => c.tag)).toContain('wc-callout');
    expect((await call(server, 'get_component', { tag: 'callout' })).json.example).toContain('wc-callout');
    const bad = await call(server, 'get_component', { tag: 'wc-calout' });
    expect(bad.isError).toBe(true);
    expect(bad.texts[0]).toContain('wc-callout');
    for (const topic of ['overview', 'frontmatter', 'config', 'components', 'reusables', 'openapi']) {
      expect((await call(server, 'get_authoring_guide', { topic })).texts[0].length).toBeGreaterThan(200);
    }
    expect((await call(server, 'get_schema', { kind: 'frontmatter' })).json.properties.title).toBeDefined();
    expect((await call(server, 'get_schema', { kind: 'nope' })).isError).toBe(true);
  });

  it('check_markup tool', async () => {
    const r = (await call(server, 'check_markup', { markdown: '<wc-calout type="info">x</wc-calout>\n\n<wc-callout type="oops">y</wc-callout>' })).json;
    expect(r.ok).toBe(false);
    expect(r.issues.map((i) => i.code)).toEqual(expect.arrayContaining(['unknown-component', 'invalid-attribute-value']));
  });

  it('create_page writes file, updates sidebar, reports issues, refuses overwrite', async () => {
    const r = await call(server, 'create_page', {
      id: 'guides/webhooks', title: 'Webhooks', description: 'Receive events.', group: 'Guides', position: 1,
      content: 'Intro.\n\n<wc-callout type="warnning" title="x">\nCareful\n</wc-callout>\n',
    });
    expect(r.json.created).toBe(true);
    expect(r.json.addedH1).toBe(true);
    expect(r.json.ok).toBe(false);
    expect(r.json.markup.some((i) => i.code === 'invalid-attribute-value' && i.suggestion === 'warning')).toBe(true);
    const text = await fs.readFile(path.join(dir, 'docs/guides/webhooks.md'), 'utf8');
    expect(text).toMatch(/^---\ntitle: Webhooks\ndescription: Receive events\.\nsidebar_position: 1\n---\n# Webhooks/);
    const cfg = await fs.readJson(path.join(dir, 'docslit.json'));
    expect(cfg.sidebar[1].pages).toEqual(['guides/webhooks', 'guides/setup']);
    const again = await call(server, 'create_page', { id: 'guides/webhooks', title: 'W', content: 'x' });
    expect(again.isError).toBe(true);
    expect(again.texts[0]).toContain('update_page');
  });

  it('create_page infers group from folder siblings', async () => {
    const r = await call(server, 'create_page', { id: 'guides/more', title: 'More', content: '# More\n\nok\n' });
    expect(r.json.sidebar).toContain('"Guides"');
  });

  it('update_page: targeted edit, uniqueness, content, frontmatter', async () => {
    const ok = await call(server, 'update_page', { page: 'guides/webhooks', old_string: 'type="warnning"', new_string: 'type="warning"' });
    expect(ok.json.updated).toBe(true);
    expect(ok.json.markup).toEqual([]);
    expect(ok.json.validation.filter((i) => i.level === 'error')).toEqual([]);
    const none = await call(server, 'update_page', { page: 'guides/webhooks', old_string: 'zzzz', new_string: 'y' });
    expect(none.isError).toBe(true);
    const dup = await call(server, 'update_page', { page: 'guides/setup', old_string: 'Create', new_string: 'x' });
    expect(dup.isError).toBeFalsy();
    const multi = await call(server, 'update_page', { page: 'guides/setup', old_string: '##', new_string: '###' });
    expect(multi.isError).toBe(true);
    expect(multi.texts[0]).toMatch(/matches 2 times/);
    const fm = await call(server, 'update_page', { page: 'guides/setup', frontmatter: { description: 'Set up', title: 'Setup!' } });
    expect(fm.json.updated).toBe(true);
    const c = await call(server, 'update_page', { page: 'guides/setup', content: '# Setup!\n\nNew body\n' });
    const raw = await fs.readFile(path.join(dir, 'docs/guides/setup.md'), 'utf8');
    expect(raw).toContain('description: Set up');
    expect(raw).toContain('New body');
    expect(c.json.updated).toBe(true);
    expect((await call(server, 'update_page', { page: 'guides/setup' })).isError).toBe(true);
    expect((await call(server, 'update_page', { page: 'ghost', content: 'x' })).isError).toBe(true);
  });

  it('validate (project and page scope) and preview_page', async () => {
    await fs.writeFile(path.join(dir, 'docs', 'broken.md'), '---\ntitle: Broken\n---\n\n# Broken\n\n<wc-bogus>x</wc-bogus>\n');
    const all = (await call(server, 'validate')).json;
    expect(all.summary.pages).toBeGreaterThanOrEqual(4);
    expect(all.issues.some((i) => i.file === 'docs/broken.md')).toBe(true);
    const one = (await call(server, 'validate', { page: 'index' })).json;
    expect(one.issues.every((i) => i.file === 'docs/index.md' || i.file === 'docslit.json')).toBe(true);
    expect(one.scope).toBe('docs/index.md');
    const pv = (await call(server, 'preview_page', { page: 'guides/webhooks' })).json;
    expect(pv.headings[0].text).toBe('Webhooks');
    expect(pv.components['wc-callout']).toBeGreaterThanOrEqual(1);
  });

  it('rejects path traversal and absolute ids', async () => {
    for (const id of ['../evil', 'a/../../evil', '/etc/passwd', 'C:/x', '..\\evil', 'a//b', '.hidden/x', 'x/..']) {
      const r = await call(server, 'create_page', { id, title: 't', content: 'x' });
      expect(r.isError, id).toBe(true);
    }
    for (const p of ['../docslit', '../../etc/passwd', '/etc/passwd']) {
      expect((await call(server, 'read_page', { page: p })).isError, p).toBe(true);
      expect((await call(server, 'update_page', { page: p, content: 'x' })).isError, p).toBe(true);
    }
    expect(await fs.pathExists(path.join(dir, '..', 'evil.md'))).toBe(false);
    const rr = await rpc(server, 'resources/read', { uri: 'docslit://page/../docslit' });
    expect(rr.error).toBeDefined();
  });

  it('resources and prompts', async () => {
    const list = (await rpc(server, 'resources/list')).result.resources.map((r) => r.uri);
    expect(list).toEqual(expect.arrayContaining(['docslit://guide', 'docslit://components', 'docslit://schema/config', 'docslit://schema/frontmatter', 'docslit://page/index']));
    const page = (await rpc(server, 'resources/read', { uri: 'docslit://page/index' })).result.contents[0];
    expect(page.text).toContain('Welcome');
    expect((await rpc(server, 'resources/read', { uri: 'docslit://page/missing' })).error.code).toBe(-32002);
    expect((await rpc(server, 'resources/read', { uri: 'docslit://components' })).result.contents[0].text).toContain('wc-callout');
    const prompts = (await rpc(server, 'prompts/list')).result.prompts;
    expect(prompts.map((p) => p.name).sort()).toEqual(['document-api-endpoint', 'migrate-page', 'review-page', 'write-page']);
    const wp = (await rpc(server, 'prompts/get', { name: 'write-page', arguments: { topic: 'Webhooks' } })).result;
    expect(wp.messages[0].content.text).toContain('create_page');
    expect((await rpc(server, 'prompts/get', { name: 'write-page', arguments: {} })).error.code).toBe(-32602);
    expect((await rpc(server, 'prompts/get', { name: 'nope' })).error.code).toBe(-32602);
  });

  it('works without a project (reference tools + init hint)', async () => {
    const empty = await fs.mkdtemp(path.join(os.tmpdir(), 'docslit-mcp-empty-'));
    try {
      const s = buildServer(['--dir', empty]);
      const info = (await call(s, 'get_project_info')).json;
      expect(info.initialized).toBe(false);
      expect(info.init_project.command).toContain('docslit init');
      expect((await call(s, 'list_pages')).isError).toBe(true);
      expect((await call(s, 'check_markup', { markdown: '<wc-x>' })).json.ok).toBe(false);
      expect((await call(s, 'get_component', { tag: 'wc-tabs' })).json.tag).toBe('wc-tabs');
      expect((await rpc(s, 'resources/list')).result.resources.length).toBe(4);
    } finally { await fs.remove(empty); }
  });
});

describe('reader mode', () => {
  let srv; let url; let hits;
  const flat = {
    '/.well-known/agent.json': JSON.stringify({ name: 'Fake', description: 'Fake docs', docs: {}, pages: [] }),
    '/llms.txt': '# Fake\n\n> Fake docs\n\n## Start\n\n- [Intro](/intro.md): Hello there\n- [Setup](/guides/setup.md)\n',
    '/intro.md': '---\ntitle: Intro\n---\n\n# Intro\n\nWelcome aboard.\n',
    '/guides/setup.md': '# Setup\n\nInstall the widget with a token.\n',
    '/search-index.json': JSON.stringify([{ id: 'intro', title: 'Intro', group: 'Start', desc: 'Hello there', body: 'Welcome aboard' }, { id: 'guides/setup', title: 'Setup', group: 'Start', desc: '', body: 'Install the widget with a token' }]),
  };
  const versioned = {
    '/.well-known/agent.json': JSON.stringify({ name: 'V', versions: ['v1', 'v2'], default_version: 'v2' }),
    '/llms.txt': '# V\n\n- [v1](/v1/llms.txt)\n',
    '/v2/llms.txt': '# V\n\n## G\n\n- [Two](http://other.example/v2/two.md): second\n',
    '/v2/two.md': '# Two v2\n',
    '/v1/two.md': '# Two v1\n',
    '/v1/llms.txt': '# V\n\n## G\n\n- [Two](/v1/two.md)\n',
    '/v2/llms-full.txt': '# V\n\n---\n# Source: two.md\n\n# Two v2\n\nunicorn here\n',
  };
  beforeAll(async () => {
    hits = [];
    srv = http.createServer((req, res) => {
      hits.push(req.url);
      const p = req.url.split('?')[0];
      const site = p.startsWith('/site/') ? flat : p.startsWith('/ver/') ? versioned : null;
      const key = p.replace(/^\/(site|ver)/, '');
      if (p === '/evil') { res.writeHead(302, { location: 'http://127.0.0.1:1/x' }); return res.end(); }
      if (p.startsWith('/nodocs/')) { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<!doctype html><html></html>'); }
      if (site && site[key] !== undefined) { res.writeHead(200, { 'content-type': 'text/plain' }); return res.end(site[key]); }
      res.writeHead(404); res.end('nope');
    });
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    url = `http://127.0.0.1:${srv.address().port}`;
  });
  afterAll(() => new Promise((r) => srv.close(r)));

  it('overview, list_pages, get_page, search (flat site under a base path)', async () => {
    const s = buildServer([`${url}/site/`]);
    expect((await call(s, 'get_docs_overview')).texts[0]).toContain('Hello there');
    const lp = (await call(s, 'list_pages')).json;
    expect(lp.pages.map((p) => p.slug)).toEqual(['intro', 'guides/setup']);
    expect(lp.pages[0].group).toBe('Start');
    expect((await call(s, 'get_page', { slug: 'guides/setup' })).texts[0]).toContain('widget');
    expect((await call(s, 'get_page', { slug: 'intro.md' })).texts[0]).toContain('Welcome');
    const missing = await call(s, 'get_page', { slug: 'intr' });
    expect(missing.isError).toBe(true);
    expect(missing.texts[0]).toContain('intro');
    const sr = (await call(s, 'search_docs', { query: 'widget token' })).json;
    expect(sr.results[0].id).toBe('guides/setup');
    expect(sr.source).toBe('search-index.json');
  });

  it('versioned site: default version, explicit version, fallback search', async () => {
    const s = buildServer([`${url}/ver`]);
    const lp = (await call(s, 'list_pages')).json;
    expect(lp.version).toBe('v2');
    expect(lp.pages[0].slug).toBe('two');
    expect((await call(s, 'get_page', { slug: 'two' })).texts[0]).toContain('v2');
    expect((await call(s, 'get_page', { slug: 'two', version: 'v1' })).texts[0]).toContain('v1');
    expect((await call(s, 'get_page', { slug: 'two', version: 'v9' })).isError).toBe(true);
    const sr = (await call(s, 'search_docs', { query: 'unicorn' })).json;
    expect(sr.source).toBe('llms-full.txt');
    expect(sr.results[0].id).toBe('two');
  });

  it('rejects out-of-scope slugs and redirects, never fetching them', async () => {
    const s = buildServer([`${url}/site/`]);
    hits.length = 0;
    for (const slug of ['http://evil.example/x', '//evil.example/x', '../ver/v2/two', 'a/../../x', 'a\\..\\b', 'javascript:alert(1)']) {
      const r = await call(s, 'get_page', { slug });
      expect(r.isError, slug).toBe(true);
    }
    expect(hits.filter((h) => !h.includes('agent.json'))).toEqual([]);
  });

  it('reports non-DocsLit sites and network failures helpfully', async () => {
    const s = buildServer([`${url}/nodocs/`]);
    const r = await call(s, 'list_pages');
    expect(r.isError).toBe(true);
    expect(r.texts[0]).toMatch(/does not look like a DocsLit site/);
    const dead = buildServer(['http://127.0.0.1:1/']);
    const d = await call(dead, 'get_docs_overview');
    expect(d.isError).toBe(true);
    expect(d.texts[0]).toMatch(/Network error/);
  });

  it('caches responses for the TTL', async () => {
    const s = buildServer([`${url}/site/`]);
    await call(s, 'get_page', { slug: 'intro' });
    hits.length = 0;
    await call(s, 'get_page', { slug: 'intro' });
    expect(hits.filter((h) => h.endsWith('/intro.md'))).toEqual([]);
  });
});

describe('real binary', () => {
  it('prints only JSON on stdout', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'docslit-mcp-bin-'));
    try {
      await fs.ensureDir(path.join(dir, 'docs'));
      await fs.writeJson(path.join(dir, 'docslit.json'), { name: 'B', sidebar: [{ group: 'G', pages: ['a'] }] });
      await fs.writeFile(path.join(dir, 'docs', 'a.md'), '---\ntitle: A\n---\n\n# A\n');
      const msgs = [
        { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 't', version: '0' } } },
        { jsonrpc: '2.0', method: 'notifications/initialized' },
        { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'validate', arguments: {} } },
      ];
      const out = await new Promise((resolve) => {
        const p = spawn('node', [BIN, 'mcp', '--dir', dir]);
        let so = '';
        p.stdout.on('data', (d) => { so += d; });
        p.on('close', () => resolve(so));
        p.stdin.end(msgs.map((m) => JSON.stringify(m)).join('\n') + '\n');
      });
      const lines = out.split('\n').filter(Boolean);
      expect(lines.length).toBe(2);
      const parsed = lines.map((l) => JSON.parse(l));
      expect(parsed[0].result.protocolVersion).toBe('2025-03-26');
      expect(parsed[1].result.content[0].text).toContain('"ok"');
    } finally { await fs.remove(dir); }
  }, 30000);
});
