import { describe, it, expect } from 'vitest';
import { parseDoc } from './markdown.js';

async function renderWithVersion(md, versionSlug, pagePath = 'docs/getting-started/introduction.md') {
  const { html } = await parseDoc(md, {
    docsRoot: 'docs',
    pagePath,
    globalAttributes: versionSlug
      ? { DOCSLIT_VERSION: versionSlug }
      : { DOCSLIT_VERSION: 'unversioned' },
  });
  return html;
}

describe('relative link rewriting', () => {
  it('rewrites relative hrefs with version slug', async () => {
    const html = await renderWithVersion(
      '[Go to quickstart](../getting-started/quickstart)',
      '0.1',
    );
    expect(html).toContain('href="/0.1/getting-started/quickstart"');
  });

  it('rewrites relative hrefs with latest', async () => {
    const html = await renderWithVersion(
      '[Check command](../commands/check?query=--help)',
      'latest',
    );
    expect(html).toContain('href="/latest/commands/check?query=--help"');
  });

  it('does not rewrite when no version', async () => {
    const html = await renderWithVersion('[Link](../getting-started/quickstart)', null);
    expect(html).toContain('href="../getting-started/quickstart"');
    expect(html).not.toContain('href="/undefined/');
  });

  it('preserves anchor-only hrefs (e.g. #section)', async () => {
    const html = await renderWithVersion('[Section](#section)', '0.1');
    expect(html).toContain('href="#section"');
  });

  it('preserves absolute URLs', async () => {
    const html = await renderWithVersion('[Google](https://google.com)', '0.1');
    expect(html).toContain('href="https://google.com"');
  });

  it('rewrites site-root paths with version prefix', async () => {
    const html = await renderWithVersion('[Root](/some/page)', '0.1');
    expect(html).toContain('href="/0.1/some/page"');
  });

  it('preserves hash-only hrefs', async () => {
    const html = await renderWithVersion('[Top](#top)', '0.1');
    expect(html).toContain('href="#top"');
  });

  it('does not crash on empty href or data-* attrs', async () => {
    const md = '<a href="">empty</a>\n<a href="https://example.com" data-foo="bar">attr test</a>';
    const html = await renderWithVersion(md, '0.1');
    expect(html).toBeDefined();
  });
});

describe('wc-code-block content preservation', () => {
  it('does not rewrite links inside fenced code blocks', async () => {
    const md = '```\n[raw link](../not/rewritten)\n```';
    const html = await renderWithVersion(md, '0.1');
    expect(html).toContain('[raw link](../not/rewritten)');
  });

  it('preserves wc-code-block innerHTML verbatim', async () => {
    const md = '```\n<wc-example attr="../broken"></wc-example>\n```';
    const html = await renderWithVersion(md, '0.1');
    expect(html).toContain('attr="../broken"');
    expect(html).not.toContain('href="/0.1/');
  });

  it('preserves wc-code-block content with links', async () => {
    const md = '```\n[keep as text](../also/text)\n```';
    const html = await renderWithVersion(md, '0.1');
    expect(html).toContain('[keep as text](../also/text)');
  });
});

describe('external URL handling', () => {
  it('preserves external URLs with paths', async () => {
    const md = '[API](https://api.example.com/v2/users?token=abc)';
    const html = await renderWithVersion(md, '0.1');
    expect(html).toContain('href="https://api.example.com/v2/users?token=abc"');
  });

  it('preserves query strings in relative links', async () => {
    const md = '[Search](/search?q=hello&lang=en)';
    const html = await renderWithVersion(md, '0.1');
    expect(html).toMatch(/href="\/0\.1\/search\?q=hello(?:&|&#x26;)lang=en"/);
  });

  it('preserves hash and query in relative links', async () => {
    const md = '[Link](/page?param=value#section)';
    const html = await renderWithVersion(md, '0.1');
    expect(html).toContain('href="/0.1/page?param=value#section"');
  });

  it('preserves fragment-only URLs', async () => {
    const md = '[Section](#introduction)';
    const html = await renderWithVersion(md, '0.1');
    expect(html).toContain('href="#introduction"');
  });
});

describe('relative link edge cases', () => {
  it('rewrites same-directory sibling links using pagePath', async () => {
    const html = await renderWithVersion(
      '[Logo](logo)',
      '0.1',
      'docs/customization/theming.md',
    );
    expect(html).toContain('href="/0.1/customization/logo"');
  });

  it('rewrites links inside wc-update raw HTML', async () => {
    const html = await renderWithVersion(
      '<wc-update version="1" date="2026" type="added">See [Logo](../customization/logo).</wc-update>',
      '0.1',
      'docs/changelog/whats-new.md',
    );
    expect(html).toContain('href="/0.1/customization/logo"');
  });

  it('renders bold + inline <wc-*> code inside wc-update without swallowing prose', async () => {
    const html = await renderWithVersion(
      '<wc-update type="added">**API playground:** `<wc-playground>` lets readers try it.</wc-update>',
      '0.1',
      'docs/changelog/whats-new.md',
    );
    expect(html).toContain('<strong>API playground:</strong>');
    expect(html).toContain('lets readers try it');
    expect(html).not.toContain('**API');
    expect(html).not.toMatch(/<wc-update[^>]*>[\s\S]*<wc-playground[\s>]/);
    expect(html).toMatch(/<code>(&lt;|&#x3C;)wc-playground(&gt;|&#x3E;)<\/code>/);
    expect(html).not.toMatch(/&amp;lt;|&amp;#x3C;/);
  });

  it('renders inline <wc-*> code in normal prose without double-escaping', async () => {
    const html = await renderWithVersion(
      'Drop in `<wc-*>` components.',
      '0.1',
      'docs/getting-started/introduction.md',
    );
    expect(html).toMatch(/<code>(&lt;|&#x3C;)wc-\*(&gt;|&#x3E;)<\/code>/);
    expect(html).not.toMatch(/&amp;lt;|&amp;#x3C;/);
    expect(html).not.toContain('&amp;lt;wc-');
  });

  it('rewrites docs-root page ids without a leading slash', async () => {
    const html = await renderWithVersion(
      '<a href="getting-started/quickstart">Quickstart</a>',
      '0.1',
      'docs/customization/announcement-banner.md',
    );
    expect(html).toContain('href="/0.1/getting-started/quickstart"');
  });

  it('rewrites href on wc-tile elements', async () => {
    const html = await renderWithVersion(
      '<wc-tile title="Fast" href="deployment/static-hosting"></wc-tile>',
      '0.1',
      'docs/components/cards-and-tiles.md',
    );
    expect(html).toContain('href="/0.1/deployment/static-hosting"');
  });

  it('rewrites links inside wc-step content', async () => {
    const html = await renderWithVersion(
      '<wc-step title="Install">Follow the [installation guide](installation) to set up.</wc-step>',
      '0.1',
      'docs/getting-started/introduction.md',
    );
    expect(html).toContain('href="/0.1/getting-started/installation"');
  });

  it('rewrites relative paths with ../ navigation', async () => {
    const md = '[Doc](../getting-started/introduction)';
    const html = await renderWithVersion(md, '0.1');
    expect(html).toContain('href="/0.1/getting-started/introduction"');
  });

  it('preserves non-href attributes (data-, aria-)', async () => {
    const md = '<a data-page="home" aria-label="Home">link</a>';
    const html = await renderWithVersion(md, '0.1');
    expect(html).toContain('data-page="home"');
  });

  it('does not rewrite absolute asset paths', async () => {
    const html = await renderWithVersion(
      '<wc-download href="/files/sample.pdf" filename="sample.pdf"></wc-download>',
      '0.1',
      'docs/components/file-trees.md',
    );
    expect(html).toContain('href="/files/sample.pdf"');
    expect(html).not.toContain('href="/0.1/files/sample.pdf"');
  });

  it('does not crash on malformed hrefs', async () => {
    const md = '<a href="../broken/path/with/../../../traversal">test</a>';
    const html = await renderWithVersion(md, '0.1');
    expect(html).toBeDefined();
  });
});

describe('GFM table: pipe inside inline code', () => {
  it('renders pipe characters inside backtick code spans as cell content, not separators', async () => {
    const md = [
      '| Operator | Effect |',
      '|----------|--------|',
      '| `2+|` | Span 2 columns |',
      '| `.2+|` | Span 2 rows |',
      '| `2.2+|` | Span 2 columns and 2 rows |',
      '| `3*|` | Repeat the cell across 3 columns |',
    ].join('\n');
    const html = await renderWithVersion(md, null);
    // Each operator must be in a <code> tag, not split across cells
    expect(html).toContain('<code>2+|</code>');
    expect(html).toContain('<code>.2+|</code>');
    expect(html).toContain('<code>2.2+|</code>');
    expect(html).toContain('<code>3*|</code>');
    // The Effect column must contain the full description text
    expect(html).toContain('Span 2 columns');
    expect(html).toContain('Span 2 rows');
    expect(html).toContain('Span 2 columns and 2 rows');
    expect(html).toContain('Repeat the cell across 3 columns');
    // Table must have exactly 2 columns (th count)
    const thCount = (html.match(/<th>/g) || []).length;
    expect(thCount).toBe(2);
  });
});
