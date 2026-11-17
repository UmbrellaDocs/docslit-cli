import { describe, it, expect, beforeAll } from 'vitest';
import { parseDoc } from './markdown.js';
import { initHighlighter } from './highlighter.js';
import {
  parseCodeMeta, parseLineSpec, formatLineSpec, applyNotation, diffLineMarks, cleanNotationForMarkdown, tokenizeMeta,
} from './code-meta.js';

const block = (html) => html.match(/<wc-code-block[^>]*>[\s\S]*?<\/wc-code-block>/)[0];
const lineClasses = (html) => [...html.matchAll(/<span class="(line[^"]*)"/g)].map((m) => m[1]);

describe('code meta parser', () => {
  it('parses line specs from Mintlify and Fern syntaxes', () => {
    expect(parseLineSpec('1,3-5')).toEqual([1, 3, 4, 5]);
    expect(parseLineSpec('[1,3,4,5]')).toEqual([1, 3, 4, 5]);
    expect(parseLineSpec('{[1-3, 5]}')).toEqual([1, 2, 3, 5]);
    expect(parseLineSpec('2-4, 6')).toEqual([2, 3, 4, 6]);
    expect(parseLineSpec('x,0,5-3')).toEqual([]);
    expect(formatLineSpec([1, 3, 4, 5, 9])).toBe('1,3-5,9');
  });

  it('tokenizes braces, quotes and key=value forms', () => {
    expect(tokenizeMeta('{2-4, 6} title="a b" focus={1} x')).toEqual([
      { kind: 'brace', value: '2-4, 6' }, { kind: 'kv', key: 'title', value: 'a b' },
      { kind: 'kv', key: 'focus', value: '1' }, { kind: 'word', value: 'x' },
    ]);
  });

  it('understands Mintlify meta', () => {
    const o = parseCodeMeta('HelloWorld.java example icon=java lines wrap expandable nocopy twoslash theme={null}');
    expect(o).toMatchObject({ filename: 'HelloWorld.java example', icon: 'java', linenumbers: true, wrap: true, expandable: true, nocopy: true, twoslash: true });
    expect(o.theme).toBeUndefined();
    expect(parseCodeMeta('title="utils/hello.js" highlight={1-2,5} focus=2,4').highlight).toEqual([1, 2, 5]);
    expect(parseCodeMeta('{1,3} focus={2,4-5}')).toMatchObject({ highlight: [1, 3], focus: [2, 4, 5] });
  });

  it('understands Fern meta', () => {
    const o = parseCodeMeta('title={"example.js"} startLine={6} maxLines=10 wordWrap showLineNumbers={false} for="npm" {2-4, 6}');
    expect(o).toMatchObject({ filename: 'example.js', startLine: 6, maxLines: 10, wrap: true, linenumbers: false, for: 'npm', highlight: [2, 3, 4, 6] });
  });

  it('understands DocsLit meta and ignores unexpanded import ranges', () => {
    expect(parseCodeMeta('filename="app.js" linenumbers="true" start-line="3" max-lines="5"')).toMatchObject({ filename: 'app.js', linenumbers: true, startLine: 3, maxLines: 5 });
    expect(parseCodeMeta('lines="10-25"').linenumbers).toBeUndefined();
  });
});

describe('Shiki-style notation', () => {
  it('strips markers and reports line marks', () => {
    const r = applyNotation('a // [!code ++]\nb // [!code --]\nc\nd # [!code focus]', 'js');
    expect(r.code).toBe('a\nb\nc\nd');
    expect([...r.marks].map(([k, v]) => [k, [...v][0]])).toEqual([[1, 'add'], [2, 'remove'], [4, 'focus']]);
  });

  it('supports counts, comment-only lines and other comment syntaxes', () => {
    expect([...applyNotation('a // [!code ++:2]\nb\nc', 'js').marks.keys()]).toEqual([1, 2]);
    const r = applyNotation('// [!code highlight:2]\na\nb\nc', 'js');
    expect(r.code).toBe('a\nb\nc');
    expect([...r.marks.keys()]).toEqual([1, 2]);
    expect(applyNotation('<p>x</p> <!-- [!code ++] -->', 'html').code).toBe('<p>x</p>');
    expect(applyNotation('SELECT 1 -- [!code --]', 'sql').code).toBe('SELECT 1');
    expect(applyNotation('a { } /* [!code error] */', 'css').code).toBe('a { }');
  });

  it('leaves languages without comments alone', () => {
    const src = 'x // [!code ++]';
    expect(applyNotation(src, 'text').code).toBe(src);
    expect(applyNotation(src, 'markdown').code).toBe(src);
  });

  it('marks diff language lines', () => {
    const m = diffLineMarks('@@ -1 +1 @@\n a\n-b\n+c');
    expect([...m].map(([k, v]) => [k, [...v][0]])).toEqual([[1, 'hunk'], [3, 'remove'], [4, 'add']]);
  });
});

describe('markdown / llms output', () => {
  it('strips presentation notation and turns ++/-- into a diff fence', () => {
    const md = '```js a.js\nfoo() // [!code ++]\nbar() // [!code --]\nbaz // [!code highlight]\n```\n';
    expect(cleanNotationForMarkdown(md)).toBe('```diff a.js\n+ foo()\n- bar()\n  baz\n```\n');
    expect(cleanNotationForMarkdown('```js\na // [!code focus]\nb\n```')).toBe('```js\na\nb\n```');
    const keep = '```text\nx // [!code ++]\n```';
    expect(cleanNotationForMarkdown(keep)).toBe(keep);
  });

  it('parseDoc returns cleaned markdown', async () => {
    const { preprocessedMarkdown } = await parseDoc('```js\na // [!code highlight]\n```\n');
    expect(preprocessedMarkdown).not.toContain('[!code');
  });
});

describe('rendered structure', () => {
  beforeAll(async () => { await initHighlighter(); }, 30000);

  it('bakes line marks from meta and notation into line classes', async () => {
    const { html } = await parseDoc('```js {1} focus=3\na\nb\nc // [!code ++]\nd // [!code --]\n```\n');
    expect(lineClasses(html)).toEqual(['line hl', 'line', 'line add focus', 'line remove']);
    expect(html).not.toContain('[!code');
  });

  it('keeps the signs of the diff language and marks its lines', async () => {
    const { html } = await parseDoc('```diff\n-a\n+b\n```\n');
    expect(lineClasses(html)).toEqual(['line remove', 'line add']);
    expect(html).toContain('-a');
  });

  it('maps every option to the element attributes (fence form)', async () => {
    const { html } = await parseDoc('```ts app.ts icon=code lines startLine={5} wrap expandable maxLines=3 nocopy for="x"\na\nb\nc\nd\n```\n');
    const open = block(html).match(/<wc-code-block[^>]*>/)[0];
    expect(open).toBe('<wc-code-block language="ts" filename="app.ts" icon="code" linenumbers="true" start-line="5" wrap expandable max-lines="3" nocopy for="x" style="--cb-ml:3" highlighted>');
  });

  it('attribute form on <wc-code-block> is built identically to the fence form', async () => {
    const a = await parseDoc('```js title="a.js" {2} wrap lines\nx\ny\n```\n');
    const b = await parseDoc('<wc-code-block language="js" filename="a.js" highlight="2" wrap linenumbers="true">\nx\ny\n</wc-code-block>\n');
    expect(block(b.html)).toBe(block(a.html));
  });

  it('hand-written blocks keep code verbatim (escaped once) and honour false booleans', async () => {
    const { html } = await parseDoc('<wc-code-block language="html" wrap="false">\n<div a="b">&amp;</div>\n</wc-code-block>\n');
    expect(html).not.toMatch(/<wc-code-block[^>]* wrap/);
    expect(html).toContain('&#x3C;');
  });

  it('keeps {{VAR}} placeholders as spans, also when highlighted', async () => {
    const { html } = await parseDoc('```bash\ncurl -H "Authorization: Bearer {{API_KEY}}" {{BASE_URL}}/v1\n```\n');
    expect(html).toContain('<span class="dl-var" data-var="API_KEY">{{API_KEY}}</span>');
    expect(html).toContain('data-var="BASE_URL"');
    expect(html).toMatch(/style="color:#/); // still Shiki-highlighted
    expect(html).not.toMatch(/DLVAR/);
  });

  it('no layout-affecting block display on .line and single-newline separation survive', async () => {
    const { html } = await parseDoc('```js\na\nb\n```\n');
    expect(block(html)).toMatch(/<\/span>\n<span class="line">/);
  });

  it('builds a highlighted block inside code groups for plain-text tabs and sets the pre-upgrade height hint', async () => {
    const { html } = await parseDoc('<wc-code-group>\n<wc-code-tab label="npm" language="bash">npm i foo</wc-code-tab>\n</wc-code-group>\n');
    expect(html).toContain('<wc-code-block language="bash" highlighted>');
    expect(html).toContain('<wc-code-group style="--cb-gn:1">');
  });

  it('accepts js{1,3} (no space before the line spec)', async () => {
    const { html } = await parseDoc('```js{2}\na\nb\n```\n');
    expect(lineClasses(html)).toEqual(['line', 'line hl']);
  });

  it('code imported with file= takes the same options', async () => {
    const { html } = await parseDoc('```js file="x.js" title="routes" {1} lines\n```\n', {
      projectRoot: '/proj', pathExists: async () => true, readFile: async () => 'const a = 1;\nconst b = 2;\n', strictFsSafety: false,
    });
    expect(block(html)).toContain('filename="routes"');
    expect(lineClasses(html)).toEqual(['line hl', 'line']);
  });
});
