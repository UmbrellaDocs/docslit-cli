// Regressions for visitor-facing page performance (Lighthouse TBT and CLS).
import { describe, it, expect } from 'vitest';
import { renderShell, buildAppFile, buildComponentsFile } from './template.js';
import { renderMarkdown } from './unified.js';

describe('search index is not built on page load', () => {
  it('only prefetches search on intent, never unconditionally', async () => {
    const app = await buildAppFile('static');
    expect(app).toContain("trigger.addEventListener('pointerenter', _prefetchSearch");
    expect(app).not.toMatch(/if \(trigger\) _prefetchSearch\(\);/);
  });

  it('indexes documents in slices that yield to the main thread', async () => {
    const app = await buildAppFile('static');
    expect(app).not.toContain('for (var doc of _searchIndex) _searchFlex.add(doc);');
    expect(app).toMatch(/_searchFlex\.add\(_searchIndex\[_i\]\);\s*if \(performance\.now\(\) - _sliceStart > 8\) \{ await _yield\(\);/);
  });
});

describe('code blocks do not force a layout per block', () => {
  it('batches overflow checks into one animation frame', async () => {
    const js = await buildComponentsFile('static');
    expect(js).toContain('requestAnimationFrame(_cbFlushScrollables)');
  });
});

describe('announcement banner', () => {
  it('sets --announcement-h right after the banner is parsed', async () => {
    const config = { name: 'T', sidebar: [{ group: 'G', pages: ['intro'] }], announcement: { message: 'Hello', type: 'info' } };
    const html = await renderShell({ config, mode: 'dev', port: 3000 });
    const banner = html.indexOf('id="announcement-banner"');
    const measure = html.indexOf("setProperty('--announcement-h'", banner);
    const nav = html.indexOf('<nav class="nav">');
    expect(banner).toBeGreaterThan(-1);
    expect(measure).toBeGreaterThan(banner);
    expect(measure).toBeLessThan(nav);
  });
});

describe('web fonts', () => {
  it('loads the Google Fonts stylesheet without blocking render', async () => {
    const html = await renderShell({ config: { name: 'T', sidebar: [] }, mode: 'dev', port: 3000 });
    expect(html).toMatch(/<link href="https:\/\/fonts\.googleapis\.com\/css2\?[^"]*" rel="stylesheet" media="print" onload="this\.media='all'">/);
    expect(html).toMatch(/<noscript><link href="https:\/\/fonts\.googleapis\.com\/css2\?[^"]*" rel="stylesheet"><\/noscript>/);
  });

});

describe('tables are wrapped at build time', () => {
  it('wraps Markdown tables in .table-wrap', async () => {
    const html = await renderMarkdown('| a | b |\n|---|---|\n| 1 | 2 |\n');
    expect(html).toMatch(/^<div class="table-wrap"><table>/);
  });

  it('does not double-wrap or touch AsciiDoc tables', async () => {
    const pre = await renderMarkdown('<div class="table-wrap"><table><tr><td>x</td></tr></table></div>\n');
    expect(pre.match(/table-wrap/g)).toHaveLength(1);
    const adoc = await renderMarkdown('<wc-asciidoc-table>\n|===\n| a | b\n| 1 | 2\n|===\n</wc-asciidoc-table>\n');
    expect(adoc).not.toContain('class="table-wrap"');
  });
});

describe('deferred rendering of block components', () => {
  it('wraps block components in _lazy and leaves inline ones alone', async () => {
    const js = await buildComponentsFile('static');
    for (const tag of ['wc-code-block', 'wc-callout', 'wc-tabs', 'wc-accordion', 'wc-steps', 'wc-card']) {
      expect(js).toMatch(new RegExp(`customElements\\.define\\('${tag}',_lazy\\(`));
    }
    for (const tag of ['wc-icon', 'wc-badge', 'wc-var', 'wc-tooltip']) {
      expect(js).not.toMatch(new RegExp(`customElements\\.define\\('${tag}',_lazy\\(`));
    }
    expect(js).toContain('function _lazy(Base)');
    expect(js).toContain("window.addEventListener('beforeprint',_dlWakeAll)");
  });

  it('keeps pre-upgrade styling while a component is deferred', async () => {
    const { buildStylesFile } = await import('./template.js');
    const css = await buildStylesFile();
    expect(css).not.toMatch(/wc-[a-z-]+:not\(:defined\)(?!,\[data-dl-defer\])/);
    expect(css).toContain('wc-code-block:is(:not(:defined),[data-dl-defer])');
    expect(css).toContain('wc-callout:is(:not(:defined),[data-dl-defer])');
  });

  it('renders components above a scroll target before measuring it', async () => {
    const app = await buildAppFile('static');
    expect(app).toMatch(/function _tocScroll[\s\S]*?_renderBefore\(el\)\.then\(/);
    expect(app).toMatch(/function _scrollToHash[\s\S]*?_renderBefore\(el\)\.then\(/);
  });
});

describe('split component modules for static builds', () => {
  it('maps every built-in tag to a family, except wc-icon which lives in the core', async () => {
    const { buildComponents, buildComponentChunks } = await import('./components/index.js');
    const all = [...buildComponents().matchAll(/customElements\.define\('(wc-[a-z0-9-]+)'/g)].map((m) => m[1]);
    const { core, chunks, tagChunks } = buildComponentChunks();
    expect(core).toContain("customElements.define('wc-icon'");
    for (const tag of all.filter((t) => t !== 'wc-icon')) expect(tagChunks[tag], tag).toBeTruthy();
    for (const [tag, family] of Object.entries(tagChunks)) expect(chunks[family]).toContain(`customElements.define('${tag}'`);
  });

  it('family modules import the shared helpers from the core', async () => {
    const { buildComponentChunks } = await import('./components/index.js');
    const { core, chunks } = buildComponentChunks();
    for (const src of Object.values(chunks)) {
      expect(src).toMatch(/^import \{ LitElement, html, css, nothing \} from 'lit';/);
      expect(src).toContain("from './docslit-core.js';");
      expect(src).not.toContain('function _lazy(Base)');
    }
    expect(core).toMatch(/export \{ [^}]*\b_lazy\b[^}]*\};/);
    expect(core).toContain("import(new URL('./docslit-c-' + c + '.js', import.meta.url).href)");
  });

  it('builds parseable, minified modules', async () => {
    const { buildComponentFiles } = await import('./template.js');
    const files = await buildComponentFiles({ minify: true });
    expect(Object.keys(files)).toEqual(expect.arrayContaining(['docslit.js', 'docslit-core.js', 'docslit-c-code.js']));
    expect(files['docslit-core.js'].length).toBeLessThan(files['docslit.js'].length / 5);
  });

  it('static pages load the core and preload only the families they use', async () => {
    const { renderPage } = await import('./template.js');
    const html = await renderPage({ config: { name: 'T', sidebar: [{ group: 'G', pages: ['a'] }] }, id: 'a', meta: { title: 'A' }, html: '<wc-callout type="tip">x</wc-callout>\n<wc-code-block language="js">y</wc-code-block>' });
    expect(html).toContain('<script type="module" src="docslit-core.js"></script>');
    expect(html).not.toContain('src="docslit.js"');
    expect(html).toContain('<link rel="modulepreload" href="docslit-c-callouts.js">');
    expect(html).toContain('<link rel="modulepreload" href="docslit-c-code.js">');
    expect(html).not.toContain('docslit-c-data.js');
    expect(html.indexOf('rel="modulepreload"')).toBeGreaterThan(html.indexOf('<script type="importmap">'));
  });
});
