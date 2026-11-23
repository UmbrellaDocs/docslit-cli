import { describe, it, expect, afterEach } from 'vitest';
import { parseDoc } from './markdown.js';
import { setMathConfig, resolveMathConfig, htmlUsesMath } from './math.js';
import { stripForSearch } from './search-index.js';
import { renderPage } from './template.js';

const render = async (md) => (await parseDoc(md, { docsRoot: 'docs' })).html;

afterEach(() => setMathConfig(undefined));

describe('math (build-time KaTeX)', () => {
  it('renders $$…$$ inline and block, and ```math fences', async () => {
    const html = await render('A $$a^2$$ b.\n\n$$E = mc^2$$\n\n$$\n\\frac{a}{b}\n$$\n\n```math\n\\sum_i i\n```\n');
    expect(html).toContain('class="katex"');
    expect((html.match(/katex-display/g) || []).length).toBeGreaterThanOrEqual(3);
    expect(htmlUsesMath(html)).toBe(true);
    expect(html).not.toContain('wc-code-block');
  });

  it('keeps mid-sentence $$x$$ inline', async () => {
    const html = await render('Inline $$x$$ here.');
    expect(html).toContain('class="katex"');
    expect(html).not.toContain('katex-display');
  });

  it('does not treat single dollars as math by default', async () => {
    const html = await render('It costs $5 and $10, or $x_1$ maybe.');
    expect(html).toContain('$5 and $10');
    expect(html).not.toContain('katex');
  });

  it('supports single-dollar inline when opted in', async () => {
    setMathConfig({ singleDollar: true });
    const html = await render('Value $x_1 + y$ here.');
    expect(html).toContain('class="katex"');
    expect(html).not.toContain('<em>');
  });

  it('is disabled with "math": false', async () => {
    setMathConfig(false);
    const html = await render('$$x^2$$\n\n```math\nx\n```');
    expect(html).not.toContain('class="katex');
    expect(html).toContain('$$x^2$$');
  });

  it('leaves code and {{VAR}} alone', async () => {
    const html = await render('`$$x$$` and {{FOO}}\n\n```js\nconst a = "$$x$$";\n```');
    expect(html).not.toContain('class="katex');
    expect(html).toContain('$$x$$');
    expect(html).toContain('<wc-var name="FOO"');
  });

  it('renders math inside wc-* components', async () => {
    const html = await render('<wc-callout type="info">Energy $$E=mc^2$$ rules</wc-callout>');
    expect(html).toContain('class="katex"');
  });

  it('keeps raw LaTeX in the preprocessed markdown for agents', async () => {
    const { preprocessedMarkdown } = await parseDoc('$$\\frac{a}{b}$$\n', { docsRoot: 'docs' });
    expect(preprocessedMarkdown).toContain('\\frac{a}{b}');
    expect(preprocessedMarkdown).not.toContain('katex');
  });

  it('renders invalid TeX as an error span instead of throwing', async () => {
    const html = await render('$$\\notacommand{$$');
    expect(html).toContain('katex-error');
  });

  it('resolves config shapes', () => {
    expect(resolveMathConfig(undefined)).toEqual({ enabled: true, singleDollar: false });
    expect(resolveMathConfig(false).enabled).toBe(false);
    expect(resolveMathConfig({ singleDollar: true }).singleDollar).toBe(true);
  });

  it('search text drops the MathML duplicate', async () => {
    const html = await render('$$x^2$$ tail');
    expect(stripForSearch(html)).not.toContain('annotation');
    expect(stripForSearch(html)).not.toContain('application/x-tex');
  });
});

describe('page feedback + math CSS in rendered pages', () => {
  const base = { siteTheme: null, id: 'intro', html: '<h1>Intro</h1><p>x</p>', draftPageIds: [] };

  it('emits feedback config and the katex stylesheet only when relevant', async () => {
    const withFb = await renderPage({ ...base, config: { name: 'T', feedback: { question: 'Useful?', url: 'https://example.com/fb' }, sidebar: [] }, meta: { title: 'Intro' } });
    expect(withFb).toContain('window.__DOCSLIT_FEEDBACK__={"question":"Useful?","url":"https://example.com/fb"}');
    expect(withFb).not.toContain('katex.min.css');
    const off = await renderPage({ ...base, config: { name: 'T', sidebar: [] }, meta: { title: 'Intro' } });
    expect(off).not.toContain('__DOCSLIT_FEEDBACK__=');
    const perPage = await renderPage({ ...base, config: { name: 'T', feedback: true, sidebar: [] }, meta: { title: 'Intro', feedback: false } });
    expect(perPage).toContain('data-feedback-off');
    const math = await renderPage({ ...base, html: '<h1>M</h1><span class="katex">x</span>', config: { name: 'T', sidebar: [] }, meta: { title: 'M' } });
    expect(math).toContain('href="katex/katex.min.css"');
  });

  it('ignores a non-http feedback url', async () => {
    const out = await renderPage({ ...base, config: { name: 'T', feedback: { url: 'javascript:alert(1)' }, sidebar: [] }, meta: { title: 'Intro' } });
    expect(out).toContain('window.__DOCSLIT_FEEDBACK__={}');
  });
});

describe('math vs {{VAR}} expansion', () => {
  const parse = (md, globalAttributes = {}) => parseDoc(md, { docsRoot: 'docs', globalAttributes });

  it('does not expand {{VAR}} inside $$…$$, multi-line $$ and ```math fences', async () => {
    const r = await parse('A $$x^{{N}}$$ and {{N}}.\n\n$$\n\\frac{{N}}{2}\n$$\n\n```math\ny^{{N}}\n```\n', { N: '7' });
    expect(r.html).toContain('class="katex"');
    expect(r.html).not.toMatch(/wc-var[^>]*name="N"[^>]*>[^]*katex/); // sanity
    // outside math the variable is still substituted
    expect(r.html).toMatch(/and 7\./);
    // inside math the LaTeX source still contains the double braces (KaTeX annotation)
    expect((r.html.match(/\{\{N\}\}/g) || []).length).toBeGreaterThanOrEqual(3);
  });

  it('does not warn about invalid placeholders for x^{{2}}', async () => {
    const r = await parse('$$x^{{2}}$$');
    expect(JSON.stringify(r.preprocess.diagnostics)).not.toContain('Invalid variable placeholder');
    expect(r.html).toContain('class="katex"');
  });

  it('skips $…$ only when singleDollar is enabled', async () => {
    setMathConfig({ singleDollar: true });
    const on = await parse('Inline $a^{{N}}$ and {{N}}.', { N: '7' });
    expect(on.html).toMatch(/and 7\./);
    expect(on.html).toContain('{{N}}');
    setMathConfig(undefined);
    const off = await parse('Cost $5 {{N}} and $6.', { N: '7' });
    expect(off.html).toContain('$5 7 and $6');
  });
});
