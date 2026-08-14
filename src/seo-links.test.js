/**
 * Search-engine correctness of the static build: every generated link resolves from
 * every page depth, the site root agrees with the sitemap and robots.txt lists only
 * real sitemaps. The crawl tests resolve each <a href> against its page URL the way a
 * crawler does (scripts/crawl-dist.js) and require zero broken links.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import git from 'isomorphic-git';
import * as nodeFs from 'node:fs';
import { buildNavState, buildSidebarHtml } from './nav-chrome.js';
import { buildOfflineAppFile } from './template.js';
import { crawlDist } from '../scripts/crawl-dist.js';

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

async function build(dir, args = []) {
  const res = await run(['build', ...args], dir);
  if (res.code !== 0) throw new Error(`build failed:\n${res.stdout}\n${res.stderr}`);
  return res;
}

const SIDEBAR = [
  { group: 'Overview', pages: ['overview/introduction', 'overview/who-its-for'] },
  { group: 'Get started', pages: ['get-started/sign-in', { id: 'get-started/setup' }] },
  { group: 'Reference', pages: ['reference/limits', 'faq'] },
];

const SPEC = `openapi: 3.0.0
info: { title: Pets, version: "1.0" }
paths:
  /pets:
    get: { operationId: listPets, summary: List pets, tags: [pets], responses: { "200": { description: ok } } }
    post: { operationId: createPet, summary: Create pet, tags: [pets], responses: { "201": { description: ok } } }
`;

/** Nested sections with sibling, parent-relative and .md links, as authors write them. */
async function writeDocs(dir, { api = false } = {}) {
  const page = (title, body = '') => `---\ntitle: ${title}\n---\n\n# ${title}\n\n${body}\n`;
  await fs.outputFile(path.join(dir, 'docs/overview/introduction.md'),
    page('Introduction', 'See [who it is for](who-its-for), [limits](../reference/limits), [the FAQ](../faq) and [setup](../get-started/setup.md).'));
  await fs.outputFile(path.join(dir, 'docs/overview/who-its-for.md'), page('Who it is for', 'Back to the [introduction](introduction).'));
  await fs.outputFile(path.join(dir, 'docs/get-started/sign-in.md'), page('Sign in', 'Next: [setup](setup).'));
  await fs.outputFile(path.join(dir, 'docs/get-started/setup.md'), page('Setup', 'Read [limits](../reference/limits).'));
  await fs.outputFile(path.join(dir, 'docs/reference/limits.md'), page('Limits', 'Start at [the introduction](../overview/introduction).'));
  await fs.outputFile(path.join(dir, 'docs/faq.md'), page('FAQ', 'See [overview/introduction](overview/introduction).'));
  if (api) {
    await fs.outputFile(path.join(dir, 'openapi.yaml'), SPEC);
    for (const [slug, op, title] of [['list-pets', 'listPets', 'List pets'], ['create-pet', 'createPet', 'Create pet']]) {
      await fs.outputFile(path.join(dir, `docs/api/${slug}.md`), `---\ntitle: ${title}\nlayout: api\n---\n\n# ${title}\n\n<wc-endpoint ref="${op}">\n\n</wc-endpoint>\n`);
    }
  }
}

function expectNoBrokenLinks(result) {
  const sample = result.broken.slice(0, 10).map((b) => `${b.page} -> ${b.href} (${b.target})`).join('\n');
  expect(result.checked).toBeGreaterThan(0);
  expect(result.broken, sample).toEqual([]);
}

const sitemapLocs = (xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const canonicalOf = (html) => /<link rel="canonical" href="([^"]+)"/.exec(html)?.[1] ?? null;
const sidebarHrefs = (html) => [...html.matchAll(/<a class="sidebar-item[^"]*"[^>]*?\shref="([^"]*)"/g)].map((m) => m[1]);

// ── Unit: sidebar hrefs ────────────────────────────────────────────────────

describe('sidebar hrefs', () => {
  const config = { name: 'T', sidebar: SIDEBAR };

  it('are absolute for plain and { id } items', () => {
    const nav = buildNavState({ config, hrefPrefix: '' });
    const html = buildSidebarHtml(config, [], null, null, false, null, nav);
    expect(sidebarHrefs(html)).toEqual([
      '/overview/introduction', '/overview/who-its-for', '/get-started/sign-in', '/get-started/setup', '/reference/limits', '/faq',
    ]);
  });

  it('carry basePath, locale and version', () => {
    const nav = buildNavState({ config, basePath: '/docs', hrefPrefix: '/docs/fr/1.0' });
    const hrefs = sidebarHrefs(buildSidebarHtml(config, [], null, null, false, null, nav));
    expect(hrefs).toContain('/docs/fr/1.0/get-started/sign-in');
    expect(hrefs).toContain('/docs/fr/1.0/get-started/setup');
    expect(hrefs.every((h) => h.startsWith('/docs/fr/1.0/'))).toBe(true);
  });

  it('use #id in the offline shell, never a bare id', () => {
    const nav = buildNavState({ config, offline: true });
    const hrefs = sidebarHrefs(buildSidebarHtml(config, [], null, null, true, null, nav));
    expect(hrefs).toContain('#get-started/sign-in');
    expect(hrefs.every((h) => h.startsWith('#'))).toBe(true);
    // Without nav state the fallback is still never a bare (folder-relative) id.
    const bare = sidebarHrefs(buildSidebarHtml(config, [], null, null, false, null, null));
    expect(bare.every((h) => h.startsWith('/'))).toBe(true);
  });
});

// ── Build + crawl ──────────────────────────────────────────────────────────

describe('static build: nested sections with OpenAPI (hybrid sidebar)', () => {
  let dir; let dist;
  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'docslit-seo-'));
    dist = path.join(dir, 'dist');
    await writeDocs(dir, { api: true });
    await fs.outputJson(path.join(dir, 'docslit.json'), {
      name: 'SEO', url: 'https://example.com', openapi: 'openapi.yaml',
      sidebar: [...SIDEBAR, { group: 'API Reference', pages: [{ id: 'api/list-pets', method: 'GET' }, { id: 'api/create-pet', method: 'POST' }] }],
    });
    await build(dir);
  }, 180000);
  afterAll(() => fs.remove(dir));

  it('has no broken links when crawled', () => {
    expectNoBrokenLinks(crawlDist(dist));
  });

  it('gives API items and the Docs/API mode links absolute hrefs', async () => {
    const html = await fs.readFile(path.join(dist, 'reference/limits.html'), 'utf8');
    expect(html).toMatch(/class="sidebar-item api-nav-item[^"]*" data-page="api\/list-pets" href="\/api\/list-pets"/);
    expect(html).toMatch(/id="nav-api-link"[^>]*href="\/api\/list-pets"/);
    expect(html).toMatch(/class="sidebar-item sidebar-mode-item" data-page="api\/list-pets" href="\/api\/list-pets"/);
  });

  it('robots.txt lists sitemap.xml and not llms.txt as a sitemap', async () => {
    const robots = await fs.readFile(path.join(dist, 'robots.txt'), 'utf8');
    expect(robots).toContain('Sitemap: https://example.com/sitemap.xml');
    expect(robots).not.toMatch(/Sitemap:.*llms\.txt/);
  });

  it('makes the root a redirect to the first page whose canonical is in the sitemap', async () => {
    const index = await fs.readFile(path.join(dist, 'index.html'), 'utf8');
    const locs = sitemapLocs(await fs.readFile(path.join(dist, 'sitemap.xml'), 'utf8'));
    expect(index).toContain('http-equiv="refresh" content="0;url=/overview/introduction"');
    expect(canonicalOf(index)).toBe('https://example.com/overview/introduction');
    expect(locs).toContain(canonicalOf(index));
    expect(locs).not.toContain('https://example.com/');
    // Every sitemap URL is the canonical of the page it names.
    for (const loc of locs) {
      const rel = loc.replace('https://example.com/', '');
      expect(canonicalOf(await fs.readFile(path.join(dist, `${rel}.html`), 'utf8'))).toBe(loc);
    }
  });
});

describe('static build: basePath "/docs" with i18n and OpenAPI', () => {
  let dir; let dist;
  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'docslit-seo-bp-'));
    dist = path.join(dir, 'dist');
    await writeDocs(dir, { api: true });
    // Only one page is translated; the rest fall back to the default locale.
    await fs.outputFile(path.join(dir, 'docs.fr/overview/introduction.md'), '---\ntitle: Introduction FR\n---\n\n# Introduction\n\nVoir [pour qui](who-its-for).\n');
    await fs.outputJson(path.join(dir, 'docslit.json'), {
      name: 'SEO', url: 'https://example.com', basePath: '/docs', openapi: 'openapi.yaml',
      i18n: { defaultLocale: 'en', locales: ['en', 'fr'] },
      sidebar: [...SIDEBAR, { group: 'API Reference', pages: [{ id: 'api/list-pets', method: 'GET' }, { id: 'api/create-pet', method: 'POST' }] }],
    });
    await build(dir);
  }, 180000);
  afterAll(() => fs.remove(dir));

  it('has no broken links when crawled under /docs', () => {
    expectNoBrokenLinks(crawlDist(dist, { base: '/docs' }));
  });

  it('prefixes sidebar hrefs with basePath and locale', async () => {
    const en = sidebarHrefs(await fs.readFile(path.join(dist, 'reference/limits.html'), 'utf8'));
    const fr = sidebarHrefs(await fs.readFile(path.join(dist, 'fr/overview/introduction.html'), 'utf8'));
    expect(en).toContain('/docs/get-started/sign-in');
    expect(en).toContain('/docs/api/list-pets');
    expect(fr).toContain('/docs/fr/get-started/sign-in');
    expect([...en, ...fr].every((h) => h.startsWith('/docs/'))).toBe(true);
  });

  it('builds untranslated locale pages with a canonical to the default locale', async () => {
    expect(canonicalOf(await fs.readFile(path.join(dist, 'fr/faq.html'), 'utf8'))).toBe('https://example.com/docs/faq');
    expect(canonicalOf(await fs.readFile(path.join(dist, 'fr/overview/introduction.html'), 'utf8'))).toBe('https://example.com/docs/fr/overview/introduction');
  });

  it('keeps sitemap, robots and root canonical under basePath', async () => {
    const robots = await fs.readFile(path.join(dist, 'robots.txt'), 'utf8');
    expect(robots).toContain('Sitemap: https://example.com/docs/sitemap.xml');
    expect(robots).not.toContain('llms.txt');
    const locs = sitemapLocs(await fs.readFile(path.join(dist, 'sitemap.xml'), 'utf8'));
    expect(locs.every((l) => l.startsWith('https://example.com/docs/'))).toBe(true);
    const index = await fs.readFile(path.join(dist, 'index.html'), 'utf8');
    expect(canonicalOf(index)).toBe('https://example.com/docs/overview/introduction');
    expect(locs).toContain(canonicalOf(index));
    const frIndex = await fs.readFile(path.join(dist, 'fr/index.html'), 'utf8');
    expect(frIndex).toContain('content="0;url=/docs/fr/overview/introduction"');
  });
});

describe('static build: versions with basePath "/docs"', () => {
  let dir; let dist;
  const commitAll = async (message) => {
    const walk = async (d) => {
      const out = [];
      for (const e of await fs.readdir(path.join(dir, d), { withFileTypes: true })) {
        if (e.name === '.git' || e.name === 'dist') continue;
        const rel = path.posix.join(d, e.name);
        if (e.isDirectory()) out.push(...await walk(rel)); else out.push(rel);
      }
      return out;
    };
    for (const f of await walk('.')) await git.add({ fs: nodeFs, dir, filepath: f.replace(/^\.\//, '') });
    await git.commit({ fs: nodeFs, dir, message, author: { name: 't', email: 't@example.com' } });
  };
  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'docslit-seo-ver-'));
    dist = path.join(dir, 'dist');
    await writeDocs(dir);
    await fs.outputJson(path.join(dir, 'docslit.json'), {
      name: 'SEO', url: 'https://example.com', basePath: '/docs', sidebar: SIDEBAR,
      versions: { default: '2.0', list: [{ version: '2.0', branch: 'main' }, { version: '1.0', branch: 'v1' }] },
    });
    await git.init({ fs: nodeFs, dir, defaultBranch: 'main' });
    await commitAll('v2');
    await git.branch({ fs: nodeFs, dir, ref: 'v1', checkout: true });
    await fs.appendFile(path.join(dir, 'docs/faq.md'), '\nVersion one only.\n');
    await commitAll('v1');
    await git.checkout({ fs: nodeFs, dir, ref: 'main' });
    await build(dir);
  }, 180000);
  afterAll(() => fs.remove(dir));

  it('has no broken links when crawled under /docs', () => {
    expectNoBrokenLinks(crawlDist(dist, { base: '/docs' }));
  });

  it('writes basePath + version into sidebar and content links', async () => {
    const html = await fs.readFile(path.join(dist, '2.0/reference/limits.html'), 'utf8');
    expect(sidebarHrefs(html)).toContain('/docs/2.0/get-started/sign-in');
    const intro = await fs.readFile(path.join(dist, '2.0/overview/introduction.html'), 'utf8');
    // The content link (not the sidebar item) is rewritten with basePath + version.
    expect(intro).toMatch(/<a href="\/docs\/2\.0\/overview\/who-its-for">who it is for</);
  });

  it('redirects the roots and lists only canonical page URLs per version', async () => {
    const root = await fs.readFile(path.join(dist, 'index.html'), 'utf8');
    expect(root).toContain('content="0;url=/docs/2.0/overview/introduction"');
    const robots = await fs.readFile(path.join(dist, 'robots.txt'), 'utf8');
    expect(robots).toContain('Sitemap: https://example.com/docs/2.0/sitemap.xml');
    expect(robots).not.toContain('llms.txt');
    for (const v of ['2.0', '1.0']) {
      const index = await fs.readFile(path.join(dist, v, 'index.html'), 'utf8');
      const locs = sitemapLocs(await fs.readFile(path.join(dist, v, 'sitemap.xml'), 'utf8'));
      expect(canonicalOf(index)).toBe(`https://example.com/docs/${v}/overview/introduction`);
      expect(locs).toContain(canonicalOf(index));
      expect(locs).not.toContain(`https://example.com/docs/${v}/`);
    }
  });
});

describe('offline build', () => {
  let dir; let out;
  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'docslit-seo-off-'));
    out = path.join(dir, 'offline');
    await writeDocs(dir);
    await fs.outputJson(path.join(dir, 'docslit.json'), { name: 'SEO', sidebar: SIDEBAR });
    await build(dir, ['--offline', '--out', 'offline']);
  }, 180000);
  afterAll(() => fs.remove(dir));

  it('uses #id hrefs that work from file:// and has no broken links', async () => {
    const html = await fs.readFile(path.join(out, 'index.html'), 'utf8');
    const hrefs = sidebarHrefs(html);
    expect(hrefs).toContain('#get-started/sign-in');
    expect(hrefs.every((h) => h.startsWith('#'))).toBe(true);
    expect(html).toMatch(/class="nav-logo" href="index\.html"/);
    expectNoBrokenLinks(crawlDist(out, { file: true }));
  });

  it('offline click handlers read data-page, not the #id href', async () => {
    const app = await buildOfflineAppFile({ minify: false });
    expect(app).toContain('loadPage(navBtn.dataset.page)');
    expect(app).toContain('loadPage(this.dataset.page)');
    expect(app).not.toMatch(/loadPage\((navBtn|this)\.getAttribute\('href'\)\)/);
    // Prev/next links carry the id for that handler and a working #id href.
    expect(app).toContain(`'<a class="page-nav-btn" data-page="' + pid + '" href="' + phref + '"'`);
    expect(app).toContain("_OFFLINE ? '#' + prev.dataset.page");
  });
});
