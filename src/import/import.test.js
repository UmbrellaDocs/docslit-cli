import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { runImport, detectFormat, ImportError } from '../import.js';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'test-fixtures', 'import');
let tmp;
const outs = {};
const reports = {};

async function hashTree(dir) {
  const h = crypto.createHash('sha1');
  const walk = async (d) => {
    for (const e of (await fs.readdir(d, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(d, e.name);
      if (e.isDirectory() && e.name === 'dist') continue;
      if (e.isDirectory()) await walk(p); else { h.update(path.relative(dir, p)); h.update(await fs.readFile(p)); }
    }
  };
  await walk(dir);
  return h.digest('hex');
}
const readJson = (p) => fs.readJson(p);
const codes = (r, sev) => r.items.filter((i) => (sev ? i.severity === sev : i.severity !== 'info')).map((i) => i.code).sort();

beforeAll(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'docslit-import-test-'));
  for (const name of ['mintlify', 'mintlify-legacy', 'fern', 'gitbook']) {
    outs[name] = path.join(tmp, name);
    reports[name] = await runImport({ sourceDir: path.join(FIX, name), outDir: outs[name], fetchText: null });
  }
}, 120000);
afterAll(async () => { await fs.remove(tmp); });

describe('end-to-end: fixtures import cleanly', () => {
  for (const name of ['mintlify', 'mintlify-legacy', 'fern', 'gitbook']) {
    it(`${name}: validates with zero errors and zero warnings`, () => {
      const r = reports[name];
      expect(r.validation.issues.filter((i) => i.level === 'error')).toEqual([]);
      // only explicit, documented warnings are allowed
      const allowed = { 'mintlify-legacy': ['openapi-undocumented-endpoint'] }[name] || [];
      expect(r.validation.issues.filter((i) => i.level === 'warning' && !allowed.includes(i.code))).toEqual([]);
      expect(r.markup.errors).toBe(0);
    });
  }

  it('mintlify: structure', async () => {
    const out = outs.mintlify;
    const cfg = await readJson(path.join(out, 'docslit.json'));
    expect(cfg.name).toBe('Orbit');
    expect(cfg.tabs.map((t) => t.tab)).toEqual(['Guides', 'Components', 'API reference', 'Blog']);
    expect(cfg.tabs[3].href).toBe('https://orbit.example.com/blog');
    expect(cfg.tabs[0].sidebar[1].pages[1]).toMatchObject({ group: 'Advanced', collapsed: true });
    expect(cfg.anchors).toEqual([{ label: 'Community', href: 'https://orbit.example.com/community', icon: 'discord' }]);
    expect(cfg.logo).toMatchObject({ light: 'logo/light.svg', dark: 'logo/dark.svg', href: 'https://orbit.example.com' });
    expect(cfg.redirects).toEqual({ '/start': '/quickstart' });
    expect(cfg.contextual).toEqual(['copy', 'chatgpt', 'claude']);
    expect(cfg.analytics).toMatchObject({ provider: 'ga4', measurementId: 'G-TEST12345' });
    expect(cfg.announcement.message).toMatch(/Orbit 2.0/);
    expect(cfg.openapi).toBe('api-reference/openapi.json');
    expect(cfg.theme.light.accent).toBe('#4F46E5');
    expect(cfg.attributes).toMatchObject({ PLAN_NAME: 'Pro' });
    expect(cfg.navbar.primary.label).toBe('Dashboard');
    expect(cfg.icons).toEqual({ library: 'fontawesome' });
    for (const f of ['docs/index.md', 'docs/_reusables/greeting.md', 'docs/api/list-events.md', 'MIGRATION.md', 'logo/light.svg', 'docs/images/dashboard-dark.svg']) expect(await fs.pathExists(path.join(out, f)), f).toBe(true);
    const index = await fs.readFile(path.join(out, 'docs/index.md'), 'utf8');
    expect(index).toContain('![Dashboard](/images/dashboard-light.svg#dark=/images/dashboard-dark.svg)');
    expect(index).toContain('<wc-include src="greeting.md" name="friend" product="Orbit" />');
    expect(index).toContain('{{PRODUCT_NAME}}');
    expect(index).not.toContain('TODO: replace hero image');
    expect(await fs.readFile(path.join(out, 'docs/_reusables/greeting.md'), 'utf8')).toContain('{{name}}');
    expect(await fs.readFile(path.join(out, 'docs/quickstart.md'), 'utf8')).toContain('badge: New');
  });

  it('mintlify: MIGRATION report lists exactly the expected manual items', () => {
    const r = reports.mintlify;
    expect(codes(r)).toEqual(['integration-unsupported', 'mintlify-panel', 'redirect-wildcard', 'unknown-component', 'unknown-component']);
    expect(r.items.filter((i) => i.code === 'unknown-component').map((i) => `${i.file}:${i.line}`).sort()).toEqual(['components/layout.mdx:31', 'installation.mdx:30']);
    expect(r.counts.error).toBe(2);
    expect(r.summary.pages).toBe(11);
  });

  it('mintlify-legacy: mint.json converts tabs, anchors, navbar and openapi', async () => {
    const cfg = await readJson(path.join(outs['mintlify-legacy'], 'docslit.json'));
    expect(cfg.tabs.map((t) => t.tab)).toEqual(['Documentation', 'API']);
    expect(cfg.navbar.links[0].label).toBe('Status');
    expect(cfg.navbar.primary.href).toBe('https://kestrel.example.com/start');
    expect(cfg.anchors[0]).toMatchObject({ label: 'Blog', href: 'https://kestrel.example.com/blog' });
    expect(cfg.analytics).toMatchObject({ provider: 'plausible', domain: 'docs.kestrel.example.com' });
    expect(cfg.footer.socials.github).toMatch(/kestrel-example/);
    const api = await fs.readFile(path.join(outs['mintlify-legacy'], 'docs/api/get-alert.md'), 'utf8');
    expect(api).toContain('<wc-endpoint ref="getAlert">');
    expect(codes(reports['mintlify-legacy'])).toEqual([]);
  });

  it('fern: tabs, slugs, api, changelog and redirects', async () => {
    const out = outs.fern;
    const cfg = await readJson(path.join(out, 'docslit.json'));
    expect(cfg.tabs.map((t) => t.tab)).toEqual(['Guides', 'API Reference', 'Changelog']);
    expect(cfg.url).toBe('https://docs.tidepool.example.com');
    expect(cfg.navbar.links.map((l) => l.type || 'link')).toEqual(['link', 'github', 'dropdown', 'filled']);
    expect(cfg.layout).toMatchObject({ pageWidth: 1376, hideFeedback: true });
    expect(cfg.redirects['/old-start']).toBe('/guides/getting-started');
    expect(cfg.theme.dark.accent).toBe('#22D3EE');
    expect(await fs.pathExists(path.join(out, 'docs/live-streams.md'))).toBe(true);
    expect(await fs.pathExists(path.join(out, 'docs/api/list-streams.md'))).toBe(true);
    const changelog = await fs.readFile(path.join(out, 'docs/changelog.md'), 'utf8');
    expect(changelog.indexOf('Release 3.0')).toBeLessThan(changelog.indexOf('2024-01-10'));
    const code = await fs.readFile(path.join(out, 'docs/guides/code-samples.md'), 'utf8');
    expect(code).toContain('file="snippets/hello.js"');
    expect(code).toContain('```python title="demo.py" startLine={4} maxLines=10 lines');
    expect(await fs.pathExists(path.join(out, 'snippets/hello.js'))).toBe(true);
    const start = await fs.readFile(path.join(out, 'docs/guides/getting-started/quickstart.md'), 'utf8');
    expect(start).toContain('```typescript title="main.ts"\n');
    expect(codes(reports.fern)).toEqual(['fern-api-snippet', 'fern-api-snippet', 'fern-codeblock-links', 'fern-runnable-endpoint', 'integration-unsupported', 'redirect-wildcard', 'unknown-component']);
  });

  it('gitbook: SUMMARY.md becomes the sidebar and block tags convert', async () => {
    const out = outs.gitbook;
    const cfg = await readJson(path.join(out, 'docslit.json'));
    expect(cfg.sidebar.map((g) => g.group)).toEqual(['Documentation', 'Guides', 'Reference']);
    expect(cfg.sidebar[1].pages[0]).toMatchObject({ group: 'Setup', root: 'guides/setup' });
    const setup = await fs.readFile(path.join(out, 'docs/guides/setup.md'), 'utf8');
    expect(setup).toContain('<wc-tabs>');
    expect(setup).toContain('<wc-step title="Install">');
    expect(setup).toContain('<wc-callout type="warning">');
    const docker = await fs.readFile(path.join(out, 'docs/guides/docker.md'), 'utf8');
    expect(docker).toContain('```yaml title="docker-compose.yml" lines');
    expect(codes(reports.gitbook)).toEqual([]);
  });
});

describe('end-to-end: builds', () => {
  for (const name of ['mintlify', 'mintlify-legacy', 'fern', 'gitbook']) {
    it(`${name}: the converted project builds`, async () => {
      const { build } = await import('../build.js');
      const cwd = process.cwd();
      const log = console.log;
      process.chdir(outs[name]);
      console.log = () => {};
      try { await build({ out: 'dist', offline: true }); } finally { console.log = log; process.chdir(cwd); }
      expect(await fs.pathExists(path.join(outs[name], 'dist', 'index.html'))).toBe(true);
    }, 120000);
  }
});

describe('migration UX', () => {
  it('never writes into the source directory and is deterministic/idempotent', async () => {
    const before = await hashTree(path.join(FIX, 'mintlify'));
    const out2 = path.join(tmp, 'again');
    await runImport({ sourceDir: path.join(FIX, 'mintlify'), outDir: out2, fetchText: null });
    const first = await hashTree(out2);
    expect(first).toBe(await hashTree(outs.mintlify));
    await runImport({ sourceDir: path.join(FIX, 'mintlify'), outDir: out2, force: true, fetchText: null });
    expect(await hashTree(out2)).toBe(first);
    expect(await hashTree(path.join(FIX, 'mintlify'))).toBe(before);
  });

  it('refuses a non-empty output directory without --force', async () => {
    await expect(runImport({ sourceDir: path.join(FIX, 'gitbook'), outDir: outs.gitbook, fetchText: null })).rejects.toThrow(ImportError);
  });

  it('--dry-run writes nothing but still reports', async () => {
    const out = path.join(tmp, 'dry');
    const r = await runImport({ sourceDir: path.join(FIX, 'fern'), outDir: out, dryRun: true, fetchText: null });
    expect(await fs.pathExists(out)).toBe(false);
    expect(r.dryRun).toBe(true);
    expect(r.summary.pages).toBeGreaterThan(5);
  });

  it('report JSON has a stable shape', () => {
    const r = reports.mintlify;
    expect(Object.keys(r).sort()).toEqual(['components', 'config', 'counts', 'dryRun', 'items', 'markup', 'out', 'source', 'summary', 'theme', 'tool', 'validation', 'version']);
    expect(Object.keys(r.items[0]).sort()).toEqual(['action', 'code', 'component', 'file', 'fix', 'line', 'message', 'severity']);
    expect(r.source).toMatchObject({ format: 'mintlify', formatLabel: 'Mintlify' });
    expect(() => JSON.stringify(r)).not.toThrow();
  });

  it('detects formats', async () => {
    expect((await detectFormat(path.join(FIX, 'mintlify'))).format).toBe('mintlify');
    expect((await detectFormat(path.join(FIX, 'mintlify-legacy'))).why).toMatch(/mint\.json/);
    expect((await detectFormat(path.join(FIX, 'fern'))).format).toBe('fern');
    expect((await detectFormat(path.join(FIX, 'gitbook'))).format).toBe('gitbook');
  });

  it('--theme / --no-theme control the theme selection', async () => {
    const a = await runImport({ sourceDir: path.join(FIX, 'gitbook'), outDir: path.join(tmp, 't1'), themeOpt: 'ocean', fetchText: null });
    expect(a.theme).toBe('ocean');
    const b = await runImport({ sourceDir: path.join(FIX, 'mintlify'), outDir: path.join(tmp, 't2'), noTheme: true, themeOpt: null, fetchText: null });
    expect(JSON.stringify(b.theme)).not.toMatch(/peppermint/);
  });
});

describe('unlisted pages and generic folders', () => {
  it('pages missing from the navigation are built as hidden pages and validate cleanly', async () => {
    const src = path.join(tmp, 'unl-src');
    await fs.outputFile(path.join(src, 'docs.json'), JSON.stringify({ name: 'U', navigation: { pages: ['a'] } }));
    await fs.outputFile(path.join(src, 'a.mdx'), '---\ntitle: A\n---\n\nSee [secret](/secret).\n');
    await fs.outputFile(path.join(src, 'secret.mdx'), '---\ntitle: Secret\n---\n\nhi\n');
    const r = await runImport({ sourceDir: src, outDir: path.join(tmp, 'unl-out'), fetchText: null });
    expect(await fs.readFile(path.join(tmp, 'unl-out/docs/secret.md'), 'utf8')).toMatch(/hidden: true/);
    expect(r.validation.errors).toBe(0);
    expect(r.items.map((i) => i.code)).toContain('pages-unlisted');
  });

  it('a plain Markdown folder imports with an auto sidebar', async () => {
    const src = path.join(tmp, 'gen-src');
    await fs.outputFile(path.join(src, 'intro.md'), '# Intro\n\nHello\n');
    await fs.outputFile(path.join(src, 'guide/setup.md'), '# Setup\n\nText\n');
    const r = await runImport({ sourceDir: src, outDir: path.join(tmp, 'gen-out'), fetchText: null });
    expect(r.source.format).toBe('generic');
    expect((await fs.readJson(path.join(tmp, 'gen-out/docslit.json'))).sidebar).toBe('auto');
    expect(r.validation.errors).toBe(0);
  });
});
