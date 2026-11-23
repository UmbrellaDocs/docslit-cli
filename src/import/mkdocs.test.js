import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { runImport, detectFormat } from '../import.js';
import { convertPymdown, rewriteLinks } from './pymdown.js';
import { parseToml } from './toml.js';
import { sanitizeMkdocsYaml, loadMkdocsConfig, namedEntries, compileGitignore, mkdocsSlug, mkdocsFrontmatter } from './mkdocs.js';
import { load as yamlLoad } from 'js-yaml';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'test-fixtures', 'import', 'mkdocs');

const conv = (src, exts = [], extra = {}) => convertPymdown(src, {
  exts: new Set(exts), readSnippet: () => null, report: () => {}, count: () => {}, macros: { enabled: false }, ...extra,
}).body;

describe('pymdown: block syntax', () => {
  it('admonitions become callouts, keeping the Material label when the type is renamed', () => {
    const out = conv('!!! abstract\n    Body **bold**\n\n!!! tip "My title"\n    Tip body\n\n!!! note ""\n    No title\n');
    expect(out).toContain('<wc-callout type="info" title="Abstract">\n\nBody **bold**\n\n</wc-callout>');
    expect(out).toContain('<wc-callout type="tip" title="My title">');
    expect(out).toContain('<wc-callout type="note">\n\nNo title');
  });

  it('collapsible admonitions become accordions inside a group; ???+ starts open', () => {
    const out = conv('??? note "Closed"\n    a\n\n???+ warning\n    b\n');
    expect(out).toMatch(/<wc-accordion-group>\n<wc-accordion title="Closed">\n\na\n\n<\/wc-accordion>\n<\/wc-accordion-group>/);
    expect(out).toContain('<wc-accordion title="Warning" open>');
  });

  it('nested admonitions and code inside admonitions are dedented', () => {
    const out = conv('!!! note\n    Outer\n\n    !!! tip\n        Inner\n\n    ```py\n    x = 1\n    ```\n');
    expect(out).toContain('<wc-callout type="tip">\n\nInner');
    expect(out).toContain('```py\nx = 1\n```');
  });

  it('content tabs (=== and /// tab) become one wc-tabs group, synced with content.tabs.link', () => {
    const out = conv('=== "pip"\n\n    pip install x\n\n=== ":fontawesome-brands-python: uv"\n\n    uv add x\n', [], { tabsSync: true });
    expect(out).toMatch(/^<wc-tabs sync="mkdocs-tabs">\n<wc-tab label="pip">/);
    expect(out).toContain('<wc-tab label="uv" icon="fa-brands fa-python">');
    expect(out.match(/<wc-tabs/g)).toHaveLength(1);
    const blocks = conv('/// tab | One\nA\n///\n\n/// tab | Two\nB\n///\n');
    expect(blocks.match(/<wc-tab /g)).toHaveLength(2);
    expect(blocks.match(/<wc-tabs/g)).toHaveLength(1);
  });

  it('pymdownx.blocks: admonitions, details with options, custom blocks', () => {
    const out = conv('/// warning | Careful\nText\n///\n\n/// details | More\n    open: True\nHidden\n///\n\n/// version-added | v2.9\nNew\n///\n');
    expect(out).toContain('<wc-callout type="warning" title="Careful">\n\nText');
    expect(out).toContain('<wc-accordion title="More" open>\n\nHidden');
    expect(out).toContain('<wc-callout type="success" title="Version Added: v2.9">');
    expect(out).not.toMatch(/^\/\/\//m);
  });

  it('definition lists, mermaid, md_in_html', () => {
    const out = conv('Term\n:   Meaning\n\n```mermaid\ngraph LR\n  A --> B\n```\n\n<div class="grid" markdown>\n- one\n</div>\n', ['def_list']);
    expect(out).toContain('<dl>\n<dt>\n\nTerm\n\n</dt>\n<dd>\n\nMeaning\n\n</dd>\n</dl>');
    expect(out).toContain('<wc-mermaid>\ngraph LR\n  A --> B\n</wc-mermaid>');
    expect(out).toContain('<div class="grid">\n\n- one\n\n</div>');
  });

  it('code fence options map to DocsLit meta', () => {
    expect(conv('``` python title="a.py" hl_lines="1 3-4" linenums="5"\nx\n```\n')).toContain('```python title="a.py" {1,3-4} lines startLine=5');
    expect(conv('``` { .yaml .no-copy title="c.yml" }\nk: v\n```\n')).toContain('```yaml title="c.yml" nocopy');
    expect(conv('```ts file="src/a.ts"\nx\n```\n')).toContain('```ts title="src/a.ts"\n');
    expect(conv('## Notes ## {: #release-v1.2.0 }\n')).toBe('## Notes <a id="release-v1.2.0"></a>\n');
  });

  it('mkdocstrings directives become placeholders and are reported', () => {
    const r = convertPymdown('::: pkg.mod.Client\n    options:\n      show_source: false\n\nAfter.\n', { exts: new Set(), readSnippet: () => null });
    expect(r.body).toContain('title="API reference: pkg.mod.Client"');
    expect(r.body).not.toContain('show_source');
    expect(r.notes.mkdocstrings).toEqual([{ id: 'pkg.mod.Client', line: 1 }]);
  });
});

describe('pymdown: inline syntax', () => {
  it('heading ids, buttons, image sizes, keys, mark, icons', () => {
    const out = conv('## Title { #custom .x }\n\n[Go](a.md){ .md-button .md-button--primary }\n\n![x](i.png){ width="300" }\n\nPress ++ctrl+alt+del++, ==hi==, :material-check: :octicons-zzz-nope-16:\n', ['pymdownx.keys', 'pymdownx.mark']);
    expect(out).toContain('## Title <a id="custom"></a>');
    expect(out).toContain('<wc-button label="Go" href="a.md" variant="primary"></wc-button>');
    expect(out).toContain('<img src="i.png" alt="x" width="300" />');
    expect(out).toContain('<kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>Del</kbd>');
    expect(out).toContain('<mark>hi</mark>');
    expect(out).toContain('<wc-icon name="check"></wc-icon>');
    expect(out).not.toContain(':octicons-');
  });

  it('never touches code spans, fences or math', () => {
    const src = 'Use `!!! note` and `==x==`.\n\n```\n!!! note\n==x== {: .y }\n```\n\n$$\n\\sum_{k=0}^{n}\n$$\n\nInline \\(x_{i=1}\\) too.\n';
    const out = conv(src, ['pymdownx.mark', 'pymdownx.arithmatex']);
    expect(out).toContain('Use `!!! note` and `==x==`.');
    expect(out).toContain('```\n!!! note\n==x== {: .y }\n```');
    expect(out).toContain('\\sum_{k=0}^{n}');
    expect(out).toContain('Inline $x_{i=1}$ too.');
  });

  it('arithmatex: block \\[ \\] becomes $$, an inline \\[ stays an escaped bracket', () => {
    const out = conv('<sup>\\[[1](u)\\]</sup>\n\n\\[\nx^2\n\\]\n', ['pymdownx.arithmatex']);
    expect(out).toBe('<sup>\\[[1](u)\\]</sup>\n\n$$\nx^2\n$$\n');
  });

  it('abbreviations wrap the words and drop the definitions', () => {
    const out = conv('The HTML spec.\n\n*[HTML]: Hyper Text Markup Language\n', ['abbr']);
    expect(out).toContain('<abbr title="Hyper Text Markup Language">HTML</abbr> spec.');
    expect(out).not.toContain('*[HTML]');
  });

  it('macros: extra values become DocsLit variables when the plugin is on', () => {
    const r = convertPymdown('Version {{ version }} and {{ config.extra.missing }}.\n', {
      exts: new Set(), readSnippet: () => null, macros: { enabled: true, resolve: (n) => (n === 'version' ? 'VERSION' : null) },
    });
    expect(r.body).toContain('Version {{VERSION}}');
    expect(r.notes.macros.map((m) => m.text)).toEqual(['{{ config.extra.missing }}']);
  });

  it('snippets are inlined; a fence holding only a snippet becomes a file= code import', () => {
    const read = (spec, o) => (spec === 'part.md' ? { text: '!!! info\n    From a snippet.\n' } : o?.code ? { codeFile: 'snippets/ex.py', lines: '2-3' } : null);
    const out = conv('--8<-- "part.md"\n\n``` python\n--8<-- "ex.py:2:3"\n```\n', [], { readSnippet: read });
    expect(out).toContain('<wc-callout type="info">\n\nFrom a snippet.');
    expect(out).toContain('```python file="snippets/ex.py" lines="2-3"\n```');
  });

  it('rewriteLinks rewrites Markdown links, images and raw HTML src/href', () => {
    const out = rewriteLinks('[a](x.md) ![b](i.png)\n\n<img src="j.png">\n', {
      link: (u) => '/' + u.replace(/\.md$/, ''), asset: (u) => '/assets/' + u,
    });
    expect(out).toBe('[a](/x) ![b](/assets/i.png)\n\n<img src="/assets/j.png">\n');
  });
});

describe('mkdocs config helpers', () => {
  it('loads Python-tagged YAML and !ENV values', () => {
    const y = yamlLoad(sanitizeMkdocsYaml('a: !!python/name:pkg.fn\nb: !!python/object/apply:pkg.slug\n  kwds:\n    case: lower\nc: !ENV [MISSING, fallback]\nd: !ENV MISSING\n'));
    expect(y).toEqual({ a: null, b: { kwds: { case: 'lower' } }, c: 'fallback', d: null });
  });

  it('parses zensical.toml', () => {
    const t = parseToml('[project]\nsite_name = "X" # comment\nnav = [\n  { Home = "index.md" },\n  { Guide = ["a.md", "b.md",] },\n]\n[project.theme]\nfeatures = ["navigation.tabs"]\n[project.markdown_extensions.pymdownx.details]\n[[project.extra.social]]\nicon = \'fontawesome/brands/github\'\n');
    expect(t.project.site_name).toBe('X');
    expect(t.project.nav).toEqual([{ Home: 'index.md' }, { Guide: ['a.md', 'b.md'] }]);
    expect(t.project.theme.features).toEqual(['navigation.tabs']);
    expect([...namedEntries(t.project.markdown_extensions).keys()]).toEqual(['pymdownx.details']);
    expect(t.project.extra.social[0].icon).toBe('fontawesome/brands/github');
  });

  it('exclude_docs patterns, slugs and frontmatter', () => {
    const ex = compileGitignore('drafts/\n*.tmp.md\n!keep.tmp.md\n');
    expect(ex('drafts/a.md')).toBe(true);
    expect(ex('x/y.tmp.md')).toBe(true);
    expect(ex('keep.tmp.md')).toBe(false);
    expect(mkdocsSlug('guide/README.md', false)).toBe('guide/index');
    expect(mkdocsSlug('guide/README.md', true)).toBe('guide/README');
    expect(mkdocsFrontmatter({ title: 'T', hide: ['toc', 'footer'], status: 'new', search: { exclude: true } })).toEqual({ title: 'T', hide_toc: true, hide_nav: true, availability: 'new', searchable: false });
  });

  it('follows INHERIT', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mk-inherit-'));
    await fs.outputFile(path.join(dir, 'base.yml'), 'site_name: Base\ntheme:\n  name: material\n  features: [a]\n');
    await fs.outputFile(path.join(dir, 'mkdocs.yml'), 'INHERIT: base.yml\ntheme:\n  features: [b]\n');
    const l = await loadMkdocsConfig(dir);
    expect(l.cfg).toEqual({ site_name: 'Base', theme: { name: 'material', features: ['b'] } });
    await fs.remove(dir);
  });
});

describe('end-to-end: MkDocs / Material project', () => {
  let tmp; let out; let r; let cfg;
  beforeAll(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'docslit-mkdocs-test-'));
    out = path.join(tmp, 'out');
    r = await runImport({ sourceDir: FIX, outDir: out, fetchText: null });
    cfg = await fs.readJson(path.join(out, 'docslit.json'));
  }, 120000);
  afterAll(async () => { await fs.remove(tmp); });

  it('detects MkDocs and validates with zero errors and warnings', async () => {
    expect((await detectFormat(FIX)).format).toBe('mkdocs');
    expect(r.source.format).toBe('mkdocs');
    expect(r.summary.pagesFailed).toBe(0);
    expect(r.validation.issues).toEqual([]);
    expect(r.markup.errors).toBe(0);
  });

  it('maps mkdocs.yml: identity, theme, nav, redirects, analytics, footer', () => {
    expect(cfg).toMatchObject({ name: 'Acme Docs', description: 'Docs for the Acme toolkit.', url: 'https://acme.example.com', basePath: '/docs', logo: 'img/logo.svg' });
    expect(cfg.theme).toMatchObject({ name: 'default', colors: { primary: '#009485' }, fonts: { sans: 'Inter' }, appearance: 'system' });
    expect(cfg.sidebar.map((g) => g.group)).toEqual(['Acme Docs', 'Guide', 'API', 'Blog', 'GitHub', 'Not in navigation']);
    expect(cfg.sidebar[1]).toMatchObject({ group: 'Guide', root: 'guide/index', pages: [{ id: 'guide/setup', title: 'Setup' }, 'guide/syntax'] });
    expect(cfg.sidebar[3].root).toBe('blog/index');
    expect(cfg.sidebar[3].pages.slice(0, 3)).toEqual(['blog/posts/team-update', 'blog/posts/hello', 'blog/posts/version-2']);
    expect(cfg.sidebar[5]).toMatchObject({ hidden: true, pages: ['orphan'] });
    expect(cfg.redirects['/old-start']).toBe('/guide/setup');
    expect(cfg.analytics).toEqual({ provider: 'ga4', measurementId: 'G-ABC123' });
    expect(cfg.footer).toEqual({ copyright: 'Copyright © 2026 Acme', socials: { github: 'https://github.com/acme' } });
    expect(cfg.attributes).toEqual({ VERSION: '2.4' });
    expect(cfg.math).toEqual({ singleDollar: true });
  });

  it('honours docs_dir: repository files are not pages, static files are copied', async () => {
    expect(await fs.pathExists(path.join(out, 'docs', 'README.md'))).toBe(false);
    expect(await fs.pathExists(path.join(out, 'docs', 'docs'))).toBe(false);
    expect(await fs.pathExists(path.join(out, 'docs', 'img', 'logo.svg'))).toBe(true);
    expect(await fs.pathExists(path.join(out, 'snippets', 'examples', 'hello.py'))).toBe(true);
    expect(await fs.readFile(path.join(out, 'custom.css'), 'utf8')).toContain('url(/img/logo.svg)');
  });

  it('leaves no Material syntax behind', async () => {
    for (const f of ['index.md', 'guide/setup.md', 'guide/syntax.md', 'api.md']) {
      const text = (await fs.readFile(path.join(out, 'docs', f), 'utf8')).replace(/```[\s\S]*?```/g, '');
      expect(text, f).not.toMatch(/^\s*(!!!|\?\?\?|===|\/\/\/|--8<--|:::)\s/m);
      expect(text, f).not.toMatch(/\{\s*[.#][\w-]+\s*\}|:material-|\+\+\w/);
    }
    const setup = await fs.readFile(path.join(out, 'docs', 'guide', 'setup.md'), 'utf8');
    expect(setup).toContain('See [the guide](/guide/index) and\n[the syntax page](/guide/syntax).');
    expect(setup).toContain('```python file="snippets/examples/hello.py" title="example.py" {2}');
  });

  it('reports what could not be carried over, loudly', async () => {
    const codes = r.items.map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining(['mkdocstrings', 'mkdocs-plugin-mkdocstrings', 'mkdocs-plugin-not-carried', 'mkdocs-theme-overrides', 'mkdocs-css-material', 'mkdocs-not-in-nav', 'mkdocs-blog-posts']));
    const md = await fs.readFile(path.join(out, 'MIGRATION.md'), 'utf8');
    expect(md).toContain('Plugin "some-custom-plugin" has no DocsLit equivalent and was not run.');
  });

  it('builds every page, including blog posts and pages outside the nav', async () => {
    const { build } = await import('../build.js');
    const cwd = process.cwd();
    const log = console.log;
    process.chdir(out);
    console.log = () => {};
    try { await build({ out: 'dist' }); } finally { console.log = log; process.chdir(cwd); }
    for (const p of ['index.html', 'guide/index.html', 'blog/index.html', 'blog/category/news.html', 'blog/archive/2025.html', 'blog/posts/version-2.html', 'blog/2025/11/05/big-release.html', 'guide/setup.html', 'blog/posts/hello.html', 'orphan.html', 'old-start.html']) expect(await fs.pathExists(path.join(out, 'dist', p)), p).toBe(true);
  }, 120000);
});

describe('MkDocs config discovery and --config', () => {
  const mk = async (files) => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mk-cfg-'));
    for (const [f, c] of Object.entries(files)) await fs.outputFile(path.join(dir, f), c);
    return dir;
  };
  const run = async (dir, extra = {}) => {
    const out = path.join(dir, '..', path.basename(dir) + '-out');
    const r = await runImport({ sourceDir: dir, outDir: out, fetchText: null, validateOutput: false, ...extra });
    const cfg = await fs.readJson(path.join(out, 'docslit.json'));
    await fs.remove(out);
    return { r, cfg };
  };

  it('--config with a file in a subfolder resolves docs_dir relative to that file', async () => {
    const dir = await mk({ 'site/mkdocs.yml': 'site_name: Sub\nnav:\n  - Home: index.md\n', 'site/docs/index.md': '# Home\n', 'docs/other.md': '# Wrong\n' });
    try {
      const { r, cfg } = await run(dir, { config: path.join(dir, 'site', 'mkdocs.yml') });
      expect(cfg.name).toBe('Sub');
      expect(JSON.stringify(r)).not.toContain('Wrong');
    } finally { await fs.remove(dir); }
  });

  it('auto-detects docs/mkdocs.yml', async () => {
    const dir = await mk({ 'docs/mkdocs.yml': 'site_name: Nested\n', 'docs/docs/index.md': '# Hi\n' });
    try {
      expect(await detectFormat(dir)).toEqual({ format: 'mkdocs', why: 'docs/mkdocs.yml', config: 'docs/mkdocs.yml' });
      const { cfg } = await run(dir);
      expect(cfg.name).toBe('Nested');
    } finally { await fs.remove(dir); }
  });

  it('auto-detects mkdocs-online.yml (INHERIT to a nav fragment) over offline and nav-only files', async () => {
    const dir = await mk({
      'mkdocs-nav.yml': 'nav:\n  - Home: index.md\n',
      'mkdocs-common.yml': 'site_name: Common\n',
      'mkdocs-online.yml': 'INHERIT: mkdocs-nav.yml\nsite_name: Online Site\n',
      'mkdocs-offline.yml': 'INHERIT: mkdocs-nav.yml\nsite_name: Offline Site\n',
      'docs/index.md': '# Home\n',
    });
    try {
      const d = await detectFormat(dir);
      expect(d.format).toBe('mkdocs');
      expect(d.config).toBe('mkdocs-online.yml');
      const { cfg } = await run(dir);
      expect(cfg.name).toBe('Online Site');
    } finally { await fs.remove(dir); }
  });

  it('loadMkdocsConfig with an explicit file reports the config dir', async () => {
    const dir = await mk({ 'a/b/mkdocs.yml': 'site_name: X\n' });
    try {
      const l = await loadMkdocsConfig(dir, { file: 'a/b/mkdocs.yml' });
      expect(l.cfg.site_name).toBe('X');
      expect(l.dir).toBe(path.join(dir, 'a', 'b'));
    } finally { await fs.remove(dir); }
  });
});

describe('pymdown: md_in_html grids become wc-tiles / wc-card', () => {
  it('list-card grid: icon, bold title, --- dropped, trailing arrow link becomes href + cta', () => {
    const out = conv('<div class="grid cards" markdown>\n\n-   :material-clock-fast:{ .lg .middle } __Set up in 5 minutes__\n\n    ---\n\n    Install it with `pip`.\n\n    * nested one\n    * nested two\n\n    [:octicons-arrow-right-24: Getting started](getting-started.md)\n\n-   :fontawesome-brands-markdown:{ .lg .middle } **Just Markdown**\n\n    ---\n\n    Plain text.\n\n</div>\n');
    expect(out).toMatch(/^<wc-tiles cols="2">\n/);
    expect(out).toContain('<wc-card title="Set up in 5 minutes" icon="clock" href="getting-started.md" cta="Getting started">\n\nInstall it with `pip`.\n\n* nested one\n* nested two\n\n</wc-card>');
    expect(out).toContain('<wc-card title="Just Markdown" icon="fa-brands fa-markdown">');
    expect(out).not.toContain('---');
    expect(out).not.toContain('class="grid');
  });

  it('a card without a bold title keeps all its content as the body', () => {
    const out = conv('<div class="grid cards" markdown>\n\n*   Field validators\n\n    * [a](#a)\n    * [b](#b)\n\n</div>\n');
    expect(out).toContain('<wc-card>\n\nField validators\n\n* [a](#a)\n* [b](#b)\n\n</wc-card>');
  });

  it('a link-only last paragraph stays in the body when the body has other links', () => {
    const out = conv('<div class="grid cards" markdown>\n\n- __T__\n\n    See [x](x.md).\n\n    [Go](go.md)\n\n</div>\n');
    expect(out).toContain('<wc-card title="T">');
    expect(out).toContain('[Go](go.md)');
  });

  it('`{ .card }` blocks in a plain grid become cards; three cards use 3 columns', () => {
    const out = conv('<div class="grid" markdown>\n\n:fontawesome-brands-html5: __HTML__ for content\n{ .card }\n\n:fontawesome-brands-js: __JS__ for fun\n{ .card }\n\n:fontawesome-brands-css3: __CSS__\n{ .card }\n\n</div>\n');
    expect(out).toMatch(/^<wc-tiles cols="3">/);
    expect(out).toContain(`<wc-card title="HTML" icon="fa-brands fa-html5">\n\nfor content\n\n</wc-card>`);
    expect(out.match(/<wc-card /g)).toHaveLength(3);
  });

  it('a plain grid (mixed blocks) and raw HTML grids stay untouched', () => {
    const notes = convertPymdown('<div class="grid" markdown>\n\n> quote\n\n!!! note\n    hi\n\n</div>\n\n<div class="grid cards">\n<ul><li>x</li></ul>\n</div>\n', { exts: new Set(), report: () => {}, count: () => {}, macros: { enabled: false } });
    expect(notes.body).toContain('<div class="grid">');
    expect(notes.body).toContain('<div class="grid cards">\n<ul>');
    expect(notes.body).not.toContain('wc-tiles');
    expect(notes.notes.gridCards).toBe(1);
  });
});

describe('MkDocs blog plugin (Material)', () => {
  let tmp; let out; let r; let cfg;
  const read = (f) => fs.readFile(path.join(out, 'docs', f), 'utf8');
  beforeAll(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'docslit-mkdocs-blog-'));
    out = path.join(tmp, 'out');
    r = await runImport({ sourceDir: FIX, outDir: out, fetchText: null });
    cfg = await fs.readJson(path.join(out, 'docslit.json'));
  }, 120000);
  afterAll(async () => { await fs.remove(tmp); });

  it('maps post frontmatter: date kept, date.updated -> updated, layout post, readtime, draft', async () => {
    const v2 = yamlLoad((await read('blog/posts/version-2.md')).split('---')[1]);
    expect(v2).toMatchObject({ title: 'Version 2 is here', layout: 'post', date: '2025-11-05', updated: '2026-02-01', readtime: '4 min read', authors: ['jane', 'joe'], categories: ['News', 'Release Notes'] });
    const hello = yamlLoad((await read('blog/posts/hello.md')).split('---')[1]);
    expect(hello).toMatchObject({ layout: 'post', date: '2026-01-15' });
    expect(yamlLoad((await read('blog/posts/unreleased.md')).split('---')[1]).draft).toBe(true);
  });

  it('appends a newest-first post list to the blog index with bylines, categories and excerpts', async () => {
    const idx = await read('blog/index.md');
    expect(idx.startsWith('---\ntitle: Blog\n---')).toBe(true);
    expect(idx.indexOf('Team update')).toBeLessThan(idx.indexOf('Hello world'));
    expect(idx.indexOf('Hello world')).toBeLessThan(idx.indexOf('Version 2 is here'));
    expect(idx).toContain('## [Version 2 is here](/blog/posts/version-2)');
    expect(idx).toContain('*November 5, 2025 · by Jane Doe, Joe Roe · in [News](/blog/category/news), [Release Notes](/blog/category/release-notes)*');
    expect(idx).toContain('The **big** release, with links.'); // content before <!-- more -->, links flattened, admonition left out
    expect(idx).not.toContain('Not in the excerpt');
    expect(idx).toContain('A short note from the team.'); // description when there is no separator
    expect(idx).not.toContain('Unreleased'); // drafts are not listed
  });

  it('generates category and archive pages (drafts excluded)', async () => {
    const news = await read('blog/category/news.md');
    expect(news).toContain('title: "News"');
    expect(news).toContain('[Team update](/blog/posts/team-update)');
    expect(news).toContain('[Hello world](/blog/posts/hello)');
    expect(news).not.toContain('Release Notes');
    expect(await fs.pathExists(path.join(out, 'docs/blog/category/release-notes.md'))).toBe(true);
    expect(await fs.pathExists(path.join(out, 'docs/blog/category/secret.md'))).toBe(false);
    const y2026 = await read('blog/archive/2026.md');
    expect(y2026).toContain('Team update');
    expect(y2026).not.toContain('Version 2');
    expect(await read('blog/archive/2025.md')).toContain('Version 2 is here');
  });

  it('lists posts, then collapsed Categories and Archive subgroups, in the blog sidebar group', () => {
    const blog = cfg.sidebar.find((g) => g.root === 'blog/index');
    expect(blog.pages).toEqual([
      'blog/posts/team-update', 'blog/posts/hello', 'blog/posts/version-2',
      { group: 'Categories', collapsed: true, pages: ['blog/category/news', 'blog/category/release-notes'] },
      { group: 'Archive', collapsed: true, pages: ['blog/archive/2026', 'blog/archive/2025'] },
    ]);
    expect(JSON.stringify(cfg.sidebar)).not.toContain('unreleased');
  });

  it('redirects old Material post URLs (date/slug, with a slug override) to the new pages', () => {
    expect(cfg.redirects).toMatchObject({
      '/blog/2025/11/05/big-release': '/blog/posts/version-2',
      '/blog/2026/01/15/hello-world': '/blog/posts/hello',
      '/blog/2026/03/10/team-update': '/blog/posts/team-update',
    });
    expect(Object.keys(cfg.redirects).some((k) => k.includes('unreleased') || k.includes('2026/04'))).toBe(false);
  });

  it('reports what was generated and what is unsupported, and validates cleanly', () => {
    const byCode = Object.fromEntries(r.items.map((i) => [i.code, i]));
    expect(byCode['mkdocs-blog-posts'].message).toMatch(/4 blog post\(s\) mapped.*1 draft.*2 category page\(s\).*2 archive page\(s\).*3 old post URL/);
    expect(byCode['mkdocs-blog-unsupported'].message).toContain('pinned posts');
    expect(byCode['mkdocs-blog-authors']).toBeTruthy();
    expect(r.validation.issues).toEqual([]);
    expect(r.markup.errors).toBe(0);
  });
});

describe('MkDocs blog plugin options', () => {
  const mk = async (files) => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mk-blog-'));
    for (const [f, c] of Object.entries(files)) await fs.outputFile(path.join(dir, f), c);
    return dir;
  };

  it('honours blog_dir, post_url_format, archive/categories switches, and generates a missing index', async () => {
    const dir = await mk({
      'mkdocs.yml': 'site_name: S\nplugins:\n  - blog:\n      blog_dir: news\n      post_url_format: "{date}/{file}"\n      post_date_format: yyyy-MM\n      archive: false\n      categories: false\nnav:\n  - Home: index.md\n',
      'docs/index.md': '# Home\n',
      'docs/news/posts/a.md': '---\ndate: 2025-02-03\ncategories: [X]\n---\n\n# Post A\n\nHi.\n',
    });
    const out = dir + '-out';
    try {
      const r = await runImport({ sourceDir: dir, outDir: out, fetchText: null });
      const cfg = await fs.readJson(path.join(out, 'docslit.json'));
      expect(cfg.redirects).toEqual({ '/news/2025-02/a': '/news/posts/a' });
      expect(await fs.pathExists(path.join(out, 'docs/news/category'))).toBe(false);
      expect(await fs.pathExists(path.join(out, 'docs/news/archive'))).toBe(false);
      expect(await fs.readFile(path.join(out, 'docs/news/index.md'), 'utf8')).toContain('[Post A](/news/posts/a)');
      expect(JSON.stringify(cfg.sidebar)).toContain('"root":"news/index"');
      expect(r.validation.issues).toEqual([]);
    } finally { await fs.remove(dir); await fs.remove(out); }
  });

  it('mkdocsFrontmatter: plain date on a non-post stays updated; numeric readtime becomes text', () => {
    expect(mkdocsFrontmatter({ date: '2024-05-06 10:00' })).toEqual({ updated: '2024-05-06' });
    expect(mkdocsFrontmatter({ date: { created: '2024-01-01', updated: '2024-02-02' }, readtime: 7 })).toEqual({ updated: '2024-02-02', readtime: '7 min read' });
  });
});
