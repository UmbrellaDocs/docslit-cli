import { describe, it, expect } from 'vitest';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { visit } from 'unist-util-visit';
import { splitAtHeadings, parseMaybeChunked } from './chunked-parse.js';

const proc = unified().use(remarkParse).use(remarkGfm);
const parse = (t) => proc.parse(t);
const opts = { threshold: 200, target: 100 };
const sig = (tree) => {
  const out = [];
  visit(tree, (n) => { if (n.type !== 'root') out.push([n.type, n.url || '', n.position?.start?.line, n.position?.end?.line]); });
  return JSON.stringify(out);
};
const section = (i) => `## Section ${i}\n\nSome text with a [link](./page-${i}.md) and ![img](a${i}.png).\n\n` + 'filler words '.repeat(12) + '\n\n';

describe('splitAtHeadings', () => {
  it('does not split small input', () => {
    expect(splitAtHeadings('# a\n\ntext\n\n# b\n')).toBeNull();
  });
  it('splits at top-level headings with correct line offsets', () => {
    const src = '# Title\n\n' + [1, 2, 3, 4].map(section).join('');
    const chunks = splitAtHeadings(src, opts);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.map((c) => c.text).join('')).toBe(src);
    for (const c of chunks.slice(1)) {
      expect(src.split('\n')[c.lineOffset]).toMatch(/^## /);
    }
  });
  it('never splits inside fenced code, comments, or raw HTML', () => {
    const filler = 'x '.repeat(100) + '\n\n';
    for (const wrap of [['```md\n', '```\n'], ['<!--\n', '-->\n'], ['<pre>\n', '</pre>\n']]) {
      const src = wrap[0] + filler + '# not a heading\n\n' + filler + wrap[1] + '\n' + 'y\n';
      expect(splitAtHeadings(src, opts)).toBeNull();
    }
  });
  it('does not split documents with reference definitions or footnotes', () => {
    const src = '[ref]: https://example.com\n\n' + [1, 2, 3, 4].map(section).join('');
    expect(splitAtHeadings(src, opts)).toBeNull();
  });
  it('requires a blank line before the heading', () => {
    const src = ('para ' + 'x '.repeat(100) + '\n# h\n').repeat(4);
    expect(splitAtHeadings(src, opts)).toBeNull();
  });
});

describe('parseMaybeChunked', () => {
  it('produces the same nodes and line numbers as an unchunked parse', () => {
    const src = '# Title\n\n' + [1, 2, 3, 4, 5].map(section).join('') + '```js\n# comment\n```\n';
    expect(splitAtHeadings(src, opts).length).toBeGreaterThan(1);
    expect(sig(parseMaybeChunked(src, parse, opts))).toBe(sig(parse(src)));
  });
});
