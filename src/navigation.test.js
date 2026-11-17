import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import {
  normalizeSidebarGroups, normalizeTabs, applyNavigation, tabIdForPage, tabLandingId, walkPages, badgesFor,
  resolvePageOptions, resolveSiteLayout, buildLayoutCss, normalizeNavbar, normalizeSocials, normalizeContextual,
  collectHiddenIds, isNavFrontmatterKey,
} from './navigation.js';
import { expandAllSidebars } from './auto-sidebar.js';
import { checkNavigation, checkPageNavigation } from './nav-validate.js';
import { renderIcon } from './nav-icons.js';
import { addPageToSidebar } from './new-page.js';

const BIN = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'docslit.js');
const run = (args, cwd) => new Promise((resolve) => {
  const p = spawn('node', [BIN, ...args], { cwd });
  let out = '';
  p.stdout.on('data', (d) => (out += d)); p.stderr.on('data', (d) => (out += d));
  p.on('close', (code) => resolve({ code, out }));
});

describe('sidebar item normalisation', () => {
  it('maps Mintlify/Fern shapes: expanded, open-by-default, root, label, badge, link items', () => {
    const [g, loose] = normalizeSidebarGroups([
      { group: 'A', root: 'a', expanded: true, pages: ['x', 'a', { group: 'N', expanded: false, pages: ['y'] }, { href: 'https://x.test', label: 'Ext' }, { id: 'z', badge: 'New' }] },
      { group: 'F', collapsed: 'open-by-default', pages: ['f'] },
      'loose',
    ].slice(0, 2).concat(['loose']));
    expect(g.collapsed).toBe(false);
    expect(g.pages[0]).toEqual({ id: 'a', root: true });
    expect(g.pages.filter((p) => p === 'a' || p.id === 'a')).toHaveLength(1);
    expect(g.pages[2]).toMatchObject({ group: 'N', collapsed: true });
    expect(g.pages[3]).toMatchObject({ href: 'https://x.test', title: 'Ext', external: true });
    expect(g.pages[4]).toMatchObject({ id: 'z', tag: 'New' });
    expect(loose).toMatchObject({ group: 'F', collapsed: false });
  });
  it('wraps loose entries in an unnamed group', () => {
    expect(normalizeSidebarGroups(['a', 'b'])).toEqual([{ group: '', pages: ['a', 'b'] }]);
  });
});

describe('tabs', () => {
  const config = applyNavigation({
    name: 'T',
    tabs: [
      { tab: 'Guides', sidebar: [{ group: 'G', pages: ['a', { id: 'h', hidden: true }, 'b'] }] },
      { tab: 'API reference', path: 'api', sidebar: [{ group: 'R', pages: ['api/x'] }] },
      { tab: 'Blog', href: 'https://blog.test' },
    ],
  });
  it('derives a flat sidebar across tabs and keeps config without tabs untouched', () => {
    expect(config.sidebar.map((g) => g.group)).toEqual(['G', 'R']);
    const plain = { sidebar: [{ group: 'x', pages: ['a'] }] };
    expect(applyNavigation(plain)).toBe(plain);
  });
  it('assigns ids and external flags', () => {
    expect(config.tabs.map((t) => t.id)).toEqual(['guides', 'api-reference', 'blog']);
    expect(config.tabs[2]).toMatchObject({ href: 'https://blog.test', external: true });
  });
  it('resolves the active tab: listing, frontmatter, path prefix', () => {
    expect(tabIdForPage(config, 'b')).toBe('guides');
    expect(tabIdForPage(config, 'h')).toBe('guides');
    expect(tabIdForPage(config, 'unlisted', { tab: 'API reference' })).toBe('api-reference');
    expect(tabIdForPage(config, 'api/other')).toBe('api-reference');
    expect(tabIdForPage(config, 'nowhere')).toBe(null);
  });
  it('lands on the first visible page and reports the tab per page', () => {
    expect(tabLandingId(config.tabs[0], new Set(['a', 'h']))).toBe('b');
    const entries = walkPages(config);
    expect(entries.find((e) => e.id === 'api/x')).toMatchObject({ tab: 'api-reference', group: 'R' });
    expect(collectHiddenIds(config.sidebar).has('h')).toBe(true);
  });
  it('dedupes tab ids', () => {
    expect(normalizeTabs([{ tab: 'A', sidebar: [] }, { tab: 'a', sidebar: [] }]).map((t) => t.id)).toEqual(['a', 'a-2']);
  });
});

describe('autogenerate with tabs', () => {
  let dir;
  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dl-tabs-'));
    await fs.outputFile(path.join(dir, 'docs/guides/one.md'), '---\ntitle: One\n---\n# One\n');
    await fs.outputFile(path.join(dir, 'docs/ref/two.md'), '---\ntitle: Two\n---\n# Two\n');
    await fs.outputFile(path.join(dir, 'docs/ref/sub/three.md'), '---\ntitle: Three\n---\n# Three\n');
    await fs.outputFile(path.join(dir, 'docs/secret.md'), '---\ntitle: S\nhidden: true\ntab: Reference\n---\n# S\n');
  });
  afterAll(() => fs.remove(dir));
  it('expands "auto" scoped to the tab path and appends hidden pages to their tab', async () => {
    const out = await expandAllSidebars({ name: 'X', tabs: [
      { tab: 'Guides', sidebar: [{ group: 'G', autogenerate: 'guides' }] },
      { tab: 'Reference', path: 'ref', sidebar: 'auto' },
    ] }, dir);
    const ref = out.tabs.find((t) => t.id === 'reference');
    expect(ref.sidebar[0]).toMatchObject({ group: 'Reference', pages: ['ref/two'] });
    expect(ref.sidebar[1].group).toBe('Sub');
    expect(out.tabs[0].sidebar[0].pages).toEqual(['guides/one']);
    expect(tabIdForPage(out, 'secret')).toBe('reference');
    expect(out.sidebar.flatMap((g) => g.pages).some((p) => p && p.id === 'secret' && p.hidden)).toBe(true);
  });
  it('docslit new --tab adds to the named tab and rejects unknown tabs', async () => {
    await fs.writeJson(path.join(dir, 'docslit.json'), { name: 'X', tabs: [
      { tab: 'Guides', sidebar: [{ group: 'G', pages: ['guides/one'] }] },
      { tab: 'Other', sidebar: [{ group: 'O', pages: [] }] },
    ] });
    const r = await addPageToSidebar(dir, 'extra', { tab: 'Other', group: 'O' });
    expect(r).toMatchObject({ status: 'ok', sidebarUpdated: true, tab: 'Other' });
    expect((await fs.readJson(path.join(dir, 'docslit.json'))).tabs[1].sidebar[0].pages).toEqual(['extra']);
    expect((await addPageToSidebar(dir, 'e2', { tab: 'Nope' })).status).toBe('unknown-tab');
  });
});

describe('badges, layout, navbar, contextual, icons', () => {
  it('builds availability and tag badges', () => {
    expect(badgesFor({ availability: 'deprecated' })).toEqual([{ label: 'Deprecated', kind: 'deprecated' }]);
    expect(badgesFor({ deprecated: true, tag: 'New' }).map((b) => b.kind)).toEqual(['deprecated', 'new']);
    expect(badgesFor({ availability: 'stable' })).toEqual([]);
  });
  it('resolves page layout aliases and flags', () => {
    expect(resolvePageOptions({}, { mode: 'custom' }).layout).toBe('full');
    expect(resolvePageOptions({}, { layout: 'reference' })).toMatchObject({ layout: 'wide', hideToc: true });
    expect(resolvePageOptions({}, { 'hide-toc': true, 'max-toc-depth': 4, hideNav: true })).toMatchObject({ hideToc: true, tocDepth: 4, hideNav: true });
    expect(resolvePageOptions({ layout: { tocDepth: 2 } }, {}).tocDepth).toBe(2);
    expect(isNavFrontmatterKey('hide-nav-links')).toBe(true);
  });
  it('validates site layout and emits only safe CSS', () => {
    const { values, issues } = resolveSiteLayout({ layout: { contentWidth: 720, sidebarWidth: '20rem', pageWidth: 'full', headerHeight: 'url(x)', tabsPlacement: 'sidebar' } });
    expect(values).toMatchObject({ contentWidth: '720px', sidebarWidth: '20rem', pageWidth: '100%', tabsPlacement: 'sidebar' });
    expect(issues).toHaveLength(1);
    const css = buildLayoutCss({ layout: { contentWidth: 720, headerHeight: '1;}body{x' } });
    expect(css).toBe(':root{--content-text-w:720px}');
  });
  it('normalises navbar entries and footer socials', () => {
    const n = normalizeNavbar({ links: [{ type: 'github', href: 'https://github.com/a/b' }, { type: 'dropdown', label: 'M', links: [{ text: 'x', href: '/x' }] }, { type: 'filled', text: 'Go', href: '/go' }, { label: 'bad' }], primary: { label: 'Start', href: '/s' } });
    expect(n.links.map((l) => l.type)).toEqual(['github', 'dropdown', 'filled']);
    expect(n.links[0].repo).toBe('a/b');
    expect(n.primary.type).toBe('filled');
    expect(normalizeSocials({ x: 'https://x.com/a', github: 'github.com/a' }).map((s) => s.icon)).toEqual(['x-twitter', 'github']);
  });
  it('normalises contextual options', () => {
    expect(normalizeContextual(['copy', 'view', 'bogus']).options.map((o) => o.id)).toEqual(['copy', 'view-markdown']);
    expect(normalizeContextual(false).options).toEqual([]);
    expect(normalizeContextual(undefined).options.map((o) => o.id)).toEqual(['copy', 'chatgpt', 'claude', 'mcp']);
  });
  it('renders inline icons, aliases, images and runtime fallbacks', () => {
    expect(renderIcon('fa-regular fa-rocket')).toContain('<svg');
    expect(renderIcon('github')).toContain('viewBox="0 0 496 512"');
    expect(renderIcon('/img/x.svg')).toContain('<img');
    expect(renderIcon('totally-unknown-icon')).toContain('<wc-icon');
  });
});

describe('navigation validation', () => {
  it('reports stable codes', async () => {
    const raw = { tabs: [{ tab: 'A', sidebar: [{ group: 'G', pages: ['x'] }], anchors: [{ label: 'q' }] }, { tab: 'a', sidebar: [{ group: 'H', pages: ['x'] }] }, { tab: 'E' }], sidebar: [], layout: { tocDepth: 9 }, contextual: ['nope'] };
    const config = applyNavigation(raw);
    const codes = (await checkNavigation({ raw, config, dir: null })).map((i) => i.code);
    for (const c of ['tab-duplicate-name', 'tab-duplicate-page', 'tab-empty', 'tabs-sidebar-ignored', 'anchor-invalid', 'layout-invalid', 'contextual-option-invalid']) expect(codes).toContain(c);
  });
  it('checks page frontmatter', () => {
    const config = applyNavigation({ tabs: [{ tab: 'A', sidebar: [] }] });
    const codes = checkPageNavigation({ layout: 'weird', toc_depth: 9, hidden: 'yes', tab: 'Zed', subtitle: 3 }, config).map((i) => i.code);
    expect(codes).toEqual(['frontmatter-invalid-layout', 'frontmatter-invalid-toc-depth', 'frontmatter-invalid-flag', 'frontmatter-invalid-text', 'frontmatter-unknown-tab']);
    expect(checkPageNavigation({ layout: 'wide', hide_toc: true, tab: 'A' }, config)).toEqual([]);
  });
});

describe('build output with tabs', () => {
  let dir; let out;
  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dl-navbuild-'));
    out = path.join(dir, 'dist');
    const page = (t, extra = '') => `---\ntitle: ${t}\ndescription: ${t} desc\n${extra}---\n\n# ${t}\n\n## Sec A\n\ntext\n\n## Sec B\n\ntext\n`;
    await fs.writeJson(path.join(dir, 'docslit.json'), {
      name: 'Nav', url: 'https://x.test',
      tabs: [
        { tab: 'Guides', icon: 'book-open', sidebar: [{ group: 'Start', pages: ['a', 'b', { id: 'c', tag: 'New' }, { id: 'hid', hidden: true }] }] },
        { tab: 'Reference', sidebar: [{ group: 'Ref', pages: ['r1', 'r2'] }] },
        { tab: 'Blog', href: 'https://blog.test' },
      ],
    });
    await fs.outputFile(path.join(dir, 'docs/a.md'), page('A'));
    await fs.outputFile(path.join(dir, 'docs/b.md'), page('B', 'layout: wide\n'));
    await fs.outputFile(path.join(dir, 'docs/c.md'), page('C', 'hide_nav: true\n'));
    await fs.outputFile(path.join(dir, 'docs/hid.md'), page('Hidden page'));
    await fs.outputFile(path.join(dir, 'docs/r1.md'), page('R1'));
    await fs.outputFile(path.join(dir, 'docs/r2.md'), page('R2'));
    const r = await run(['build', '--out', out], dir);
    expect(r.code).toBe(0);
  }, 60000);
  afterAll(() => fs.remove(dir));

  it('marks the active tab and renders one pane per tab', async () => {
    const html = await fs.readFile(path.join(out, 'r1.html'), 'utf8');
    expect(html).toMatch(/class="nav-tab active"[^>]*data-tab="reference"[^>]*aria-current="page"/);
    expect(html).toMatch(/<div class="sidebar-pane" data-tab="guides"[^>]* hidden>/);
    expect(html).toMatch(/<div class="sidebar-pane" data-tab="reference"[^>]*>(?!.*hidden>)/);
    expect(html).toContain('class="nav-tab nav-tab-external"');
    expect(html).toContain('data-layout="guide"');
    expect((await fs.readFile(path.join(out, 'b.html'), 'utf8'))).toContain('data-layout="wide"');
    expect((await fs.readFile(path.join(out, 'c.html'), 'utf8'))).toContain('data-hide-nav="true"');
  });
  it('keeps hidden pages out of sidebar, search, llms.txt and sitemap but builds them', async () => {
    const hid = await fs.readFile(path.join(out, 'hid.html'), 'utf8');
    expect(hid).toContain('name="robots" content="noindex"');
    expect(hid).toMatch(/class="nav-tab active"[^>]*data-tab="guides"/);
    expect(hid).not.toContain('data-page="hid"');
    expect(await fs.readFile(path.join(out, 'sitemap.xml'), 'utf8')).not.toContain('/hid<');
    const llms = await fs.readFile(path.join(out, 'llms.txt'), 'utf8');
    expect(llms).not.toContain('hid.md');
    expect(llms).toContain('## Guides — Start');
    expect(llms).toContain('## Reference — Ref');
    const search = JSON.parse(await fs.readFile(path.join(out, 'search-index.json'), 'utf8'));
    expect(search.some((d) => d.id === 'hid')).toBe(false);
    expect(search.find((d) => d.id === 'r1').tab).toBe('Reference');
  });
  it('lists every tab in agent.json and the sidebar badge shows', async () => {
    const agent = JSON.parse(await fs.readFile(path.join(out, '.well-known/agent.json'), 'utf8'));
    expect(agent.tabs.map((t) => t.id)).toEqual(['guides', 'reference', 'blog']);
    expect(agent.pages.find((p) => p.slug === 'r2').tab).toBe('reference');
    expect(await fs.readFile(path.join(out, 'a.html'), 'utf8')).toContain('data-kind="new">New</span>');
  });
});
