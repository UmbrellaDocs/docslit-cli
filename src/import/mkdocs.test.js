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
    const out = conv('Term\n:   Meaning\n\n```mermaid\ngraph LR\n  A --> B\n```\n\n<div class="grid cards" markdown>\n- one\n</div>\n', ['def_list']);
    expect(out).toContain('<dl>\n<dt>\n\nTerm\n\n</dt>\n<dd>\n\nMeaning\n\n</dd>\n</dl>');
    expect(out).toContain('<wc-mermaid>\ngraph LR\n  A --> B\n</wc-mermaid>');
    expect(out).toContain('<div class="grid cards">\n\n- one\n\n</div>');
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
    expect(cfg.sidebar[3]).toMatchObject({ root: 'blog/index', pages: ['blog/posts/hello'] });
    expect(cfg.sidebar[5]).toMatchObject({ hidden: true, pages: ['orphan'] });
    expect(cfg.redirects).toEqual({ '/old-start': '/guide/setup' });
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
    for (const p of ['index.html', 'guide/setup.html', 'blog/posts/hello.html', 'orphan.html', 'old-start.html']) expect(await fs.pathExists(path.join(out, 'dist', p)), p).toBe(true);
  }, 120000);
});
