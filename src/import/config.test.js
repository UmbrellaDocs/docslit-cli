import { describe, it, expect, afterAll } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { runImport, convertMdxSource } from '../import.js';

const tmps = [];
async function project(files) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'docslit-cfg-'));
  tmps.push(dir);
  for (const [rel, content] of Object.entries(files)) {
    await fs.ensureDir(path.dirname(path.join(dir, rel)));
    await fs.writeFile(path.join(dir, rel), typeof content === 'string' ? content : JSON.stringify(content));
  }
  return dir;
}
async function convert(files, opts = {}) {
  const src = await project(files);
  const out = src + '-out';
  tmps.push(out);
  const report = await runImport({ sourceDir: src, outDir: out, fetchText: null, validateOutput: false, ...opts });
  const config = await fs.readJson(path.join(out, 'docslit.json'));
  return { report, config, out, src };
}
afterAll(async () => { await Promise.all(tmps.map((d) => fs.remove(d))); });
const page = (t = 'T') => `---\ntitle: ${t}\n---\n\nbody\n`;
const codes = (r) => r.items.map((i) => i.code);

describe('Mintlify docs.json navigation forms', () => {
  it('groups: nested groups, icon, tag, hidden, expanded, root', async () => {
    const { config } = await convert({
      'docs.json': { name: 'N', navigation: { groups: [
        { group: 'A', icon: 'rocket', tag: 'New', pages: ['a', { group: 'Nested', expanded: true, hidden: true, root: 'n/root', pages: ['n/one'] }, { group: 'Closed', pages: ['n/two'] }] },
      ] } },
      'a.mdx': page(), 'n/root.mdx': page(), 'n/one.mdx': page(), 'n/two.mdx': page(),
    });
    const a = config.sidebar[0];
    expect(a).toMatchObject({ group: 'A', icon: 'rocket', tag: 'New' });
    expect(a.pages[1]).toMatchObject({ group: 'Nested', collapsed: false, hidden: true, root: 'n/root' });
    expect(a.pages[2]).toMatchObject({ group: 'Closed', collapsed: true });
  });

  it('top-level pages array, fontawesome iconType, page objects and missing pages', async () => {
    const { config, report } = await convert({
      'docs.json': { name: 'N', navigation: { pages: ['a', 'missing', { group: 'G', icon: 'github', iconType: 'brands', pages: ['b'] }] } },
      'a.mdx': page(), 'b.mdx': page(),
    });
    expect(config.sidebar[0].pages).toEqual(['a']);
    expect(config.sidebar[1].icon).toBe('fa-brands fa-github');
    expect(codes(report)).toContain('nav-page-missing');
  });

  it('anchors with content and dropdowns become sidebar-placed tabs; link-only anchors stay anchors', async () => {
    const { config } = await convert({
      'docs.json': { name: 'N', navigation: { anchors: [
        { anchor: 'Docs', icon: 'book', groups: [{ group: 'G', pages: ['a'] }] },
        { anchor: 'Forum', icon: 'comments', href: 'https://forum.example.com' },
      ] } },
      'a.mdx': page(),
    });
    expect(config.tabs.map((t) => t.tab)).toEqual(['Docs']);
    expect(config.layout.tabsPlacement).toBe('sidebar');
    expect(config.anchors).toEqual([{ label: 'Forum', href: 'https://forum.example.com', icon: 'comments' }]);
    const d = await convert({
      'docs.json': { name: 'N', navigation: { dropdowns: [{ dropdown: 'API', icon: 'code', groups: [{ group: 'G', pages: ['a'] }] }] } },
      'a.mdx': page(),
    });
    expect(d.config.tabs[0].tab).toBe('API');
  });

  it('tabs: external tab, hidden tab, menu flattened into groups', async () => {
    const { config, report } = await convert({
      'docs.json': { name: 'N', navigation: { tabs: [
        { tab: 'Home', menu: [{ item: 'One', groups: [{ group: 'G1', pages: ['a'] }] }, { item: 'Two', pages: ['b'] }] },
        { tab: 'Ext', href: 'https://x.example.com' },
        { tab: 'Secret', hidden: true, groups: [{ group: 'S', pages: ['c'] }] },
      ] } },
      'a.mdx': page(), 'b.mdx': page(), 'c.mdx': page(),
    });
    expect(config.tabs.map((t) => t.tab)).toEqual(['Home', 'Ext', 'Secret']);
    expect(config.tabs[0].sidebar.map((g) => g.group)).toEqual(['One', 'Two']);
    expect(config.tabs[1].href).toBe('https://x.example.com');
    expect(config.tabs[2].hidden).toBe(true);
    expect(codes(report)).toContain('nav-flattened');
  });

  it('versions: tab per version (default) or latest only; languages: first language only', async () => {
    const files = {
      'docs.json': { name: 'N', navigation: { versions: [
        { version: 'v2', default: true, groups: [{ group: 'G', pages: ['a'] }] },
        { version: 'v1', groups: [{ group: 'G', pages: ['b'] }] },
      ] } },
      'a.mdx': page(), 'b.mdx': page(),
    };
    const t = await convert(files);
    expect(t.config.tabs.map((x) => x.tab)).toEqual(['v2', 'v1']);
    expect(codes(t.report)).toContain('nav-versions');
    const l = await convert(files, { versions: 'latest' });
    expect(l.config.sidebar[0].pages).toEqual(['a']);
    const lang = await convert({
      'docs.json': { name: 'N', navigation: { languages: [{ language: 'en', groups: [{ group: 'G', pages: ['a'] }] }, { language: 'fr', groups: [{ group: 'G', pages: ['b'] }] }] } },
      'a.mdx': page(), 'b.mdx': page(),
    });
    expect(lang.config.sidebar[0].pages).toEqual(['a']);
    expect(codes(lang.report)).toContain('nav-languages');
    expect(await fs.pathExists(path.join(lang.out, 'docs/b.md'))).toBe(true);
  });

  it('openapi group without pages expands to every operation; operation strings keep order', async () => {
    const spec = { openapi: '3.0.3', info: { title: 'x', version: '1' }, paths: { '/a': { get: { operationId: 'getA', summary: 'Get A', responses: { 200: { description: 'ok' } } } }, '/b': { post: { operationId: 'postB', summary: 'Post B', responses: { 200: { description: 'ok' } } } } } };
    const { config, out } = await convert({
      'docs.json': { name: 'N', navigation: { groups: [{ group: 'All', openapi: 'spec.json' }, { group: 'One', openapi: 'spec.json', pages: ['POST /b'] }] } },
      'spec.json': spec,
    });
    expect(config.openapi).toBe('spec.json');
    expect(config.sidebar[0].pages.map((p) => p.id)).toEqual(['api/get-a', 'api/post-b']);
    expect(config.sidebar[1].pages.map((p) => p.id)).toEqual(['api/post-b']);
    expect(await fs.readFile(path.join(out, 'docs/api/get-a.md'), 'utf8')).toContain('<wc-endpoint ref="getA">');
  });

  it('page frontmatter keys convert (tag->badge, mode, hideFooterPagination, iconType, unknown keys reported)', async () => {
    const { out, report } = await convert({
      'docs.json': { name: 'N', navigation: { pages: ['a'] } },
      'a.mdx': '---\ntitle: A\nsidebarTitle: Short\ntag: Beta\nmode: wide\nicon: github\niconType: brands\nhideFooterPagination: true\nnoindex: true\nog:title: X\n---\n\nbody\n',
    });
    const text = await fs.readFile(path.join(out, 'docs/a.md'), 'utf8');
    expect(text).toMatch(/sidebar_title: Short/);
    expect(text).toMatch(/badge: Beta/);
    expect(text).toMatch(/layout: wide/);
    expect(text).toMatch(/icon: fa-brands fa-github/);
    expect(text).toMatch(/hide_nav: true/);
    expect(text).toMatch(/noindex: true/);
    expect(codes(report)).toContain('frontmatter-dropped');
  });
});

describe('Mintlify docs.json site settings', () => {
  it('navbar link types, banner types, footer, contextual, analytics, fonts, metatags', async () => {
    const { config, report } = await convert({
      'docs.json': {
        name: 'N', navigation: { pages: ['a'] },
        navbar: { links: [{ label: 'A', href: 'https://a.example.com', icon: 'star' }, { type: 'github', href: 'https://github.com/o/r' }, { type: 'discord', href: 'https://discord.gg/x' }], primary: { type: 'github', href: 'https://github.com/o/r' } },
        banner: { content: 'Heads up', type: 'critical', dismissible: false },
        footer: { links: [{ header: 'Col', items: [{ label: 'L', href: '/a' }] }] },
        contextual: { options: ['copy', 'view', 'mcp', { title: 'Mine', href: 'https://x.example.com?u={url}', icon: 'star' }, 'devin'] },
        integrations: { posthog: { apiKey: 'phc_x', apiHost: 'https://eu.i.posthog.com' }, gtm: { tagId: 'GTM-ABC' }, fathom: { siteId: 'ABCDE' }, mixpanel: { projectToken: 't' } },
        fonts: { family: 'Source Sans 3', weight: 400 },
        seo: { metatags: { 'og:image': 'https://x.example.com/og.png' } },
        background: { image: '/bg.png' },
      },
      'a.mdx': page(),
    });
    expect(config.navbar.links).toEqual([{ label: 'A', href: 'https://a.example.com', icon: 'star' }, { type: 'github', href: 'https://github.com/o/r' }, { type: 'discord', href: 'https://discord.gg/x' }]);
    expect(config.navbar.primary).toMatchObject({ type: 'github' });
    expect(config.announcement).toEqual({ message: 'Heads up', dismissible: false, type: 'error' });
    expect(config.footer.columns[0]).toEqual({ title: 'Col', links: [{ label: 'L', href: '/a' }] });
    expect(config.contextual).toEqual(['copy', 'view-markdown', 'mcp', { title: 'Mine', href: 'https://x.example.com?u={url}', icon: 'star' }]);
    expect(config.analytics).toEqual({ provider: 'posthog', apiKey: 'phc_x', host: 'https://eu.i.posthog.com' });
    expect(config.head.join('\n')).toMatch(/googletagmanager.*GTM-ABC|GTM-ABC/s);
    expect(config.head.join('\n')).toMatch(/fonts.googleapis.com.*Source\+Sans\+3/);
    expect(config.head.join('\n')).toMatch(/og:image/);
    expect(config.theme.fonts.fontSans).toMatch(/Source Sans 3/);
    expect(codes(report)).toEqual(expect.arrayContaining(['integration-unsupported', 'contextual-unsupported']));
  });

  it('custom font with source becomes @font-face css; root css files are merged', async () => {
    const { config, out } = await convert({
      'docs.json': { name: 'N', navigation: { pages: ['a'] }, fonts: { family: 'Brand', source: 'https://cdn.example.com/brand.woff2', format: 'woff2' } },
      'style.css': '.x{color:red}',
      'a.mdx': page(),
    });
    expect(config.css).toBe('custom.css');
    const css = await fs.readFile(path.join(out, 'custom.css'), 'utf8');
    expect(css).toContain('@font-face{font-family:"Brand"');
    expect(css).toContain('.x{color:red}');
  });

  it('theme selection goes through one function: --theme and --no-theme', async () => {
    const a = await convert({ 'docs.json': { name: 'N', colors: { primary: '#123456' }, navigation: { pages: ['a'] } }, 'a.mdx': page() }, { themeOpt: 'ocean' });
    expect(a.config.theme).toMatchObject({ extends: 'ocean' });
    expect(a.config.theme.light.accent).toBe('#123456');
    const b = await convert({ 'docs.json': { name: 'N', colors: { primary: '#123456' }, navigation: { pages: ['a'] } }, 'a.mdx': page() }, { noTheme: true });
    expect(b.config.theme.extends).toBeUndefined();
    expect(b.config.theme.light.accent).toBe('#123456');
  });
});

describe('Mintlify legacy mint.json', () => {
  it('versions (groups carry version), tabs by url prefix, topbar, footerSocials', async () => {
    const { config } = await convert({
      'mint.json': { name: 'L', versions: ['v2', 'v1'], tabs: [{ name: 'API', url: 'api' }], navigation: [
        { group: 'Intro', version: 'v2', pages: ['a'] }, { group: 'Old', version: 'v1', pages: ['b'] }, { group: 'Ref', version: 'v2', pages: ['api/x'] },
      ], topbarLinks: [{ name: 'T', url: 'https://t.example.com' }], footerSocials: { x: 'https://x.com/a' } },
      'a.mdx': page(), 'b.mdx': page(), 'api/x.mdx': page(),
    });
    expect(config.tabs.map((t) => t.tab)).toEqual(['v2', 'v1']);
    expect(config.navbar.links[0]).toEqual({ label: 'T', href: 'https://t.example.com' });
    expect(config.footer.socials.x).toBe('https://x.com/a');
  });
});

describe('Fern docs.yml variants', () => {
  const base = (extra = '') => `title: T\n${extra}`;
  it('versions as tabs, slug override, skip-slug section, folder autogenerate, link, availability, landing page', async () => {
    const { config, report, out } = await convert({
      'fern/fern.config.json': '{"organization":"o","version":"1"}',
      'fern/docs.yml': base(`landing-page:
  page: Home
  path: ./pages/home.mdx
versions:
  - display-name: v2
    path: ./versions/v2.yml
    slug: v2
  - display-name: v1
    path: ./versions/v1.yml
`),
      'fern/versions/v2.yml': `navigation:
  - section: Intro
    skip-slug: true
    contents:
      - page: One
        path: ../pages/one.mdx
        availability: beta
      - page: Two
        path: ../pages/two.mdx
        slug: custom-two
      - link: Ext
        href: https://x.example.com
  - folder: ../pages/auto
    title: Auto
`,
      'fern/versions/v1.yml': 'navigation:\n  - page: Old\n    path: ../pages/old.mdx\n',
      'fern/pages/home.mdx': page('Home'), 'fern/pages/one.mdx': page('One'), 'fern/pages/two.mdx': page('Two'), 'fern/pages/old.mdx': page('Old'),
      'fern/pages/auto/z.mdx': page('Z'), 'fern/pages/auto/y.mdx': page('Y'),
    });
    expect(config.tabs.map((t) => t.tab)).toEqual(['v2', 'v1']);
    const v2 = config.tabs[0].sidebar;
    expect(v2[0].pages[0]).toMatchObject({ id: 'v2/one', availability: 'beta' });
    expect(v2[0].pages[1]).toBe('v2/custom-two');
    expect(v2[0].pages[2]).toEqual({ href: 'https://x.example.com', title: 'Ext' });
    expect(v2[1]).toMatchObject({ group: 'Auto' });
    expect(v2[1].pages.map((p) => (typeof p === 'string' ? p : p.id))).toEqual(['v2/auto/y', 'v2/auto/z']);
    expect(await fs.pathExists(path.join(out, 'docs/index.md'))).toBe(true);
    expect(codes(report)).toContain('nav-versions');
  });

  it('tab variants flattened (reported), hidden tab, external tab, nested sections with collapsed', async () => {
    const { config, report } = await convert({
      'fern/fern.config.json': '{"organization":"o","version":"1"}',
      'fern/docs.yml': base(`tabs:
  guides:
    display-name: Guides
    variants:
      - title: A
        layout: []
  ext:
    display-name: External
    href: https://e.example.com
  hid:
    display-name: Hidden
    hidden: true
navigation:
  - tab: guides
    layout:
      - section: Outer
        collapsed: open-by-default
        contents:
          - section: Inner
            collapsed: true
            contents:
              - page: P
                path: ./pages/p.mdx
  - tab: ext
  - tab: hid
    layout:
      - page: Q
        path: ./pages/q.mdx
`),
      'fern/pages/p.mdx': page('P'), 'fern/pages/q.mdx': page('Q'),
    });
    expect(config.tabs.map((t) => t.tab)).toEqual(['Guides', 'External', 'Hidden']);
    expect(config.tabs[0].sidebar[0]).toMatchObject({ group: 'Outer', collapsed: 'open-by-default' });
    expect(config.tabs[0].sidebar[0].pages[0]).toMatchObject({ group: 'Inner', collapsed: true });
    expect(config.tabs[2].hidden).toBe(true);
    expect(codes(report)).toContain('fern-tab-variants');
  });

  it('products become tabs; typography fonts become @font-face; css merged; js reported; layout + theme.tabs', async () => {
    const { config, report, out } = await convert({
      'fern/fern.config.json': '{"organization":"o","version":"1"}',
      'fern/docs.yml': base(`products:
  - display-name: Alpha
    path: ./products/alpha.yml
  - display-name: Beta
    path: ./products/beta.yml
typography:
  bodyFont:
    name: Brand Sans
    paths:
      - path: ./fonts/brand.woff2
        weight: 400
  codeFont:
    name: Brand Mono
    path: ./fonts/mono.woff2
css: ./custom.css
js: ./custom.js
layout:
  page-width: full
  sidebar-width: 280px
  tabs-placement: sidebar
  content-alignment: left
theme:
  tabs:
    style: bubble
    alignment: center
footer-links:
  slack: https://slack.example.com
`),
      'fern/products/alpha.yml': 'navigation:\n  - page: A\n    path: ../pages/a.mdx\n',
      'fern/products/beta.yml': 'navigation:\n  - page: B\n    path: ../pages/b.mdx\n',
      'fern/pages/a.mdx': page('A'), 'fern/pages/b.mdx': page('B'),
      'fern/fonts/brand.woff2': 'x', 'fern/fonts/mono.woff2': 'x', 'fern/custom.css': '.y{color:blue}', 'fern/custom.js': 'console.log(1)',
    });
    expect(config.tabs.map((t) => t.tab)).toEqual(['Alpha', 'Beta']);
    expect(config.layout).toMatchObject({ pageWidth: 'full', sidebarWidth: 280, tabsPlacement: 'sidebar', contentAlignment: 'left', tabsStyle: 'pill', tabsAlign: 'center' });
    expect(config.footer.socials.slack).toBe('https://slack.example.com');
    expect(config.theme.fonts.fontSans).toMatch(/Brand Sans/);
    const css = await fs.readFile(path.join(out, 'custom.css'), 'utf8');
    expect(css).toContain('@font-face{font-family:"Brand Sans"');
    expect(css).toContain('.y{color:blue}');
    expect(codes(report)).toContain('fern-js');
  });

  it('frontmatter keys: hide-toc, max-toc-depth, sidebar-title, subtitle, last-updated, unsupported keys reported', async () => {
    const { out, report } = await convert({
      'fern/fern.config.json': '{"organization":"o","version":"1"}',
      'fern/docs.yml': base('navigation:\n  - page: P\n    path: ./pages/p.mdx\n'),
      'fern/pages/p.mdx': '---\ntitle: P\nsubtitle: Sub\nsidebar-title: SB\nhide-toc: true\nmax-toc-depth: 3\nlast-updated: 2024-01-02\nlayout: reference\nedit-this-page-url: https://x\n---\n\nbody\n',
    });
    const text = await fs.readFile(path.join(out, 'docs/p.md'), 'utf8');
    for (const re of [/subtitle: Sub/, /sidebar_title: SB/, /hide_toc: true/, /toc_depth: 3/, /updated: ['"]?2024-01-02/, /layout: reference/]) expect(text).toMatch(re);
    expect(codes(report)).toContain('frontmatter-dropped');
  });

  it('Fern <Code src="https://..."> is downloaded at import time and referenced with file=', async () => {
    const { out, report } = await convert({
      'fern/fern.config.json': '{"organization":"o","version":"1"}',
      'fern/docs.yml': base('navigation:\n  - page: P\n    path: ./pages/p.mdx\n'),
      'fern/pages/p.mdx': page('P').replace('body', '<Code src="https://raw.example.com/x/hello.py" title="hello.py" />'),
    }, { fetchText: async () => 'print("hi")\n' });
    expect(await fs.readFile(path.join(out, 'docs/p.md'), 'utf8')).toContain('file="snippets/hello.py"');
    expect(await fs.readFile(path.join(out, 'snippets/hello.py'), 'utf8')).toContain('print("hi")');
    expect(codes(report)).toContain('code-src-downloaded');
  });
});

describe('convertMdxSource (MCP convert_mdx)', () => {
  it('converts a snippet without a project and returns issues', async () => {
    const r = await convertMdxSource('---\ntitle: X\n---\n\n<Tip>hi</Tip>\n\n<Nope />\n', { from: 'mintlify' });
    expect(r.markdown).toContain('<wc-callout type="tip">');
    expect(r.issues.map((i) => i.code)).toContain('unknown-component');
    expect(r.components.find((c) => c.from === 'Tip')).toBeTruthy();
  });
  it('converts GitBook blocks', async () => {
    const r = await convertMdxSource('{% hint style="danger" %}\nCareful\n{% endhint %}\n', { from: 'gitbook' });
    expect(r.markdown).toContain('<wc-callout type="danger">');
  });
});
