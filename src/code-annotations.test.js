import { describe, it, expect, beforeAll } from 'vitest';
import { parseDoc } from './markdown.js';
import { initHighlighter } from './highlighter.js';
import { parseCodeMeta, findAnnotationMarker, cleanNotationForMarkdown } from './code-meta.js';
import { annotateLineHtml } from './plugins/rehype-docslit-code.js';

const BTN = (n) => `<button class="code-annotation" data-annotation="${n}" aria-label="Annotation ${n}">${n}</button>`;
const apply = (line) => {
  const f = findAnnotationMarker(line);
  if (!f) return null;
  let out = '';
  let cur = 0;
  for (const op of f.ops) { out += line.slice(cur, op.start) + (op.marker ? `[${f.n}]` : ''); cur = op.end; }
  return out + line.slice(cur);
};

describe('annotation marker detection', () => {
  it('parses the annotate meta flag', () => {
    expect(parseCodeMeta('annotate').annotate).toBe(true);
    expect(parseCodeMeta('title="a" annotate wrap').annotate).toBe(true);
    expect(parseCodeMeta('annotate=false').annotate).toBe(false);
    expect(parseCodeMeta('').annotate).toBe(false);
    expect(parseCodeMeta('annotate').filename).toBe('');
  });

  it.each([
    ['x = 1  # (1)', 1],
    ['let a; // note (2)', 2],
    ['int a; /* (3) */', 3],
    ['<div> <!-- (4) -->', 4],
    ['select 1 -- (5)', 5],
    ['a: b ; (6)', 6],
    ['f(x) % (7)', 7],
    ['# (12)', 12],
  ])('finds the marker in %s', (line, n) => {
    expect(findAnnotationMarker(line).n).toBe(n);
  });

  it('keeps comment text for (N) and strips comment characters for (N)!', () => {
    expect(apply('x = 1  # note (1)')).toBe('x = 1  # note [1]');
    expect(apply('x = 1  # (1)!')).toBe('x = 1  [1]');
    expect(apply('a // (2)!')).toBe('a [2]');
    expect(apply('a /* (3)! */')).toBe('a [3]');
    expect(apply('<p> <!-- (4)! -->')).toBe('<p> [4]');
    expect(apply('# (1)!')).toBe('[1]');
  });

  it('has no false positives', () => {
    for (const l of ['print("(1)")', 'foo(1)', 'x = f(1)  # call foo(1)', '# (1) not at the end', '# (0)', '# (100)', 'plain text (1)', '# (a)']) {
      expect(findAnnotationMarker(l), l).toBeNull();
    }
  });
});

describe('annotateLineHtml', () => {
  it('replaces the marker inside a token span and escapes the rest', () => {
    const r = annotateLineHtml('<span class="line"><span style="color:#fff">a &lt; b </span><span style="color:#888"># tip (3)</span></span>');
    expect(r.n).toBe(3);
    expect(r.html).toBe(`<span class="line"><span style="color:#fff">a &lt; b </span><span style="color:#888"># tip ${BTN(3)}</span></span>`);
  });
  it('(N)! removes the comment characters even across token spans', () => {
    const r = annotateLineHtml('<span class="line"><span>x = 1</span><span>  #</span><span> (1)!</span></span>');
    expect(r.html).toBe(`<span class="line"><span>x = 1</span><span>  </span><span>${BTN(1)}</span></span>`);
  });
  it('returns null without a marker', () => {
    expect(annotateLineHtml('<span class="line">x = 1</span>')).toBeNull();
  });
});

describe('rehype output', () => {
  beforeAll(async () => { await initHighlighter(); }, 30000);

  const doc = '```python annotate\nx = 1  # (1)\ny = 2  # (2)!\n```\n\n1. First **note**\n2. Second note\n';

  it('replaces markers with buttons and moves the list into the block', async () => {
    const { html } = await parseDoc(doc);
    expect(html).toContain(BTN(1));
    expect(html).toContain(BTN(2));
    expect(html).toMatch(/<wc-code-block [^>]*>[\s\S]*<ol slot="annotations">[\s\S]*<strong>note<\/strong>[\s\S]*<\/ol><\/wc-code-block>/);
    expect(html.match(/<ol/g)).toHaveLength(1);
    expect(html).not.toContain('(2)!');
    expect(html).not.toMatch(/\(1\)/);
  });

  it('works inside tabs and callouts', async () => {
    const { html } = await parseDoc(`<wc-tabs>\n<wc-tab label="a">\n\n${doc}\n</wc-tab>\n</wc-tabs>\n\n<wc-callout type="info">\n\n${doc}\n</wc-callout>\n`);
    expect(html.match(/<ol slot="annotations">/g)).toHaveLength(2);
    expect(html.match(/class="code-annotation"/g)).toHaveLength(4);
  });

  it('without a following list the markers stay text and a warning is emitted', async () => {
    const warnings = [];
    const { html } = await parseDoc('```python annotate\nx = 1  # (1)\n```\n\nJust text.\n', { onWarning: (w) => warnings.push(w) });
    expect(html).not.toContain('code-annotation');
    expect(html).toContain('(1)');
    expect(warnings.map((w) => w.code)).toEqual(['code-annotation-no-list']);
  });

  it('warns when a marker has no list item', async () => {
    const warnings = [];
    await parseDoc('```python annotate\nx = 1  # (2)\n```\n\n1. only one\n', { onWarning: (w) => warnings.push(w) });
    expect(warnings.map((w) => w.code)).toEqual(['code-annotation-missing-item']);
  });

  it('ignores markers and following lists in blocks without the flag', async () => {
    const { html } = await parseDoc('```python\nx = 1  # (1)\n```\n\n1. note\n');
    expect(html).not.toContain('code-annotation');
    expect(html).not.toContain('slot="annotations"');
  });
});

describe('markdown output', () => {
  it('keeps (N) markers and the list; (N)! becomes (N)', () => {
    const md = '```python annotate\nx = 1  # (1)!\ny = 2  # (2)\n```\n\n1. a\n2. b\n';
    expect(cleanNotationForMarkdown(md)).toBe('```python annotate\nx = 1  # (1)\ny = 2  # (2)\n```\n\n1. a\n2. b\n');
    const plain = '```python\nx = 1  # (1)!\n```\n';
    expect(cleanNotationForMarkdown(plain)).toBe(plain);
  });
});
