import { describe, it, expect } from 'vitest';
import {
  parseAttributeList,
  parseColspecs,
  parseAsciiDocTable,
  asciidocTableToHtml,
} from './asciidoc-table.js';
import { parseDoc } from './markdown.js';
import { buildComponents } from './components/index.js';

describe('parseAttributeList', () => {
  it('parses %header shorthand into options', () => {
    const attrs = parseAttributeList('%header,cols="2*"');
    expect(attrs['header-option']).toBe('');
    expect(attrs.cols).toBe('2*');
    expect(attrs.options).toContain('header');
  });

  it('parses options= and quoted values', () => {
    const attrs = parseAttributeList('cols="1,2",options="header,footer",format=csv');
    expect(attrs.cols).toBe('1,2');
    expect(attrs.format).toBe('csv');
    expect(attrs['header-option']).toBe('');
    expect(attrs['footer-option']).toBe('');
  });
});

describe('parseColspecs', () => {
  it('expands multipliers', () => {
    expect(parseColspecs('3*')).toEqual([
      { width: 1 },
      { width: 1 },
      { width: 1 },
    ]);
  });

  it('parses widths, alignment, and style', () => {
    const cols = parseColspecs('2,>s,^.^m,~');
    expect(cols).toHaveLength(4);
    expect(cols[0].width).toBe(2);
    expect(cols[1]).toMatchObject({ width: 1, halign: 'right', style: 'strong' });
    expect(cols[2]).toMatchObject({ width: 1, halign: 'center', valign: 'middle', style: 'monospaced' });
    expect(cols[3].width).toBe(-1);
  });

  it('supports deprecated integer col count', () => {
    expect(parseColspecs('4')).toHaveLength(4);
  });
});

describe('parseAsciiDocTable', () => {
  it('parses a basic implicit-header PSV table', () => {
    const parsed = parseAsciiDocTable(`
|===
|Name |Role

|Ada |Engineer
|Grace |Admiral
|===
`);
    expect(parsed.head).toHaveLength(1);
    expect(parsed.head[0].map((c) => c.text)).toEqual(['Name', 'Role']);
    expect(parsed.body).toHaveLength(2);
    expect(parsed.body[0].map((c) => c.text)).toEqual(['Ada', 'Engineer']);
    expect(parsed.columns).toHaveLength(2);
  });

  it('uses options=header when first row is not implicit', () => {
    const parsed = parseAsciiDocTable(`
[cols="2*",options="header"]
|===
|Name
|Role

|Ada
|Engineer
|===
`);
    expect(parsed.head[0].map((c) => c.text)).toEqual(['Name', 'Role']);
    expect(parsed.body).toHaveLength(1);
  });

  it('supports cell spans and alignment operators', () => {
    const parsed = parseAsciiDocTable(`
[cols="3*"]
|===
|A |B |C

2+|Spans two
|Right

|x
|y
|z
|===
`);
    expect(parsed.body[0][0].colspan).toBe(2);
    expect(parsed.body[0][0].text).toBe('Spans two');
    expect(parsed.body[0]).toHaveLength(2);
  });

  it('supports rowspan', () => {
    const parsed = parseAsciiDocTable(`
[cols="2*"]
|===
|A |B

.2+|Tall
|First

|Second
|===
`);
    expect(parsed.body[0][0].rowspan).toBe(2);
    expect(parsed.body[0]).toHaveLength(2);
    expect(parsed.body[1]).toHaveLength(1);
    expect(parsed.body[1][0].text).toBe('Second');
  });

  it('supports combined col+row span (2.2+)', () => {
    const parsed = parseAsciiDocTable(`
[cols="3*"]
|===
|A |B |C

2.2+|Block
|r1c3

|r2c3
|D |E |F
|===
`);
    expect(parsed.body[0][0]).toMatchObject({ text: 'Block', colspan: 2, rowspan: 2 });
    expect(parsed.body.map((r) => r.length)).toEqual([2, 1, 3]);
  });

  it('inherits column styles from cols attribute', () => {
    const parsed = parseAsciiDocTable(`
[cols="s,m",options="header"]
|===
|H1 |H2
|bold |mono
|===
`);
    expect(parsed.columns.map((c) => c.style)).toEqual(['strong', 'monospaced']);
    expect(parsed.body[0].map((c) => c.style)).toEqual(['strong', 'monospaced']);
  });

  it('supports cell styles s/e/m', () => {
    const parsed = parseAsciiDocTable(`
[cols="2*"]
|===
|k |v

s|Bold
e|Italic

m|CODE
|plain
|===
`);
    expect(parsed.body[0][0].style).toBe('strong');
    expect(parsed.body[0][1].style).toBe('emphasis');
    expect(parsed.body[1][0].style).toBe('monospaced');
  });

  it('escapes pipe with backslash', () => {
    const parsed = parseAsciiDocTable(`
[cols="2*"]
|===
|The \\| character
|Also {vbar} works
|===
`);
    expect(parsed.body[0][0].text).toContain('|');
    expect(parsed.body[0][0].text).not.toContain('\\|');
    expect(parsed.body[0][1].text).toContain('|');
  });

  it('parses CSV format', () => {
    const parsed = parseAsciiDocTable(
      `
|===
Name,Role
Ada,Engineer
|===
`,
      { format: 'csv', options: 'header' },
    );
    expect(parsed.head[0].map((c) => c.text)).toEqual(['Name', 'Role']);
    expect(parsed.body[0].map((c) => c.text)).toEqual(['Ada', 'Engineer']);
  });

  it('parses CSV shorthand delimiter', () => {
    const parsed = parseAsciiDocTable(`
[%header]
,===
A,B
1,2
,===
`);
    expect(parsed.head[0].map((c) => c.text)).toEqual(['A', 'B']);
    expect(parsed.body[0].map((c) => c.text)).toEqual(['1', '2']);
  });

  it('parses DSV format', () => {
    const parsed = parseAsciiDocTable(
      `
|===
A:B
1:2
|===
`,
      { format: 'dsv', options: 'header' },
    );
    expect(parsed.head[0].map((c) => c.text)).toEqual(['A', 'B']);
    expect(parsed.body[0].map((c) => c.text)).toEqual(['1', '2']);
  });

  it('parses quoted CSV values with commas', () => {
    const parsed = parseAsciiDocTable(
      `
|===
"Last, First",Role
"Hopper, Grace",Admiral
|===
`,
      { format: 'csv', options: 'header' },
    );
    expect(parsed.head[0][0].text).toBe('Last, First');
    expect(parsed.body[0][0].text).toBe('Hopper, Grace');
  });

  it('supports custom separator', () => {
    const parsed = parseAsciiDocTable(
      `
|===
¦A¦B
¦1¦2
|===
`,
      { cols: '2*', separator: '¦' },
    );
    expect(parsed.body[0].map((c) => c.text)).toEqual(['A', 'B']);
  });

  it('supports footer option and title', () => {
    const parsed = parseAsciiDocTable(`
.API routes
[cols="2*",options="header,footer"]
|===
|Method |Path
|GET |/users
|Total |1
|===
`);
    expect(parsed.title).toBe('API routes');
    expect(parsed.head).toHaveLength(1);
    expect(parsed.body).toHaveLength(1);
    expect(parsed.foot).toHaveLength(1);
    expect(parsed.foot[0].map((c) => c.text)).toEqual(['Total', '1']);
  });

  it('supports repeat operator', () => {
    const parsed = parseAsciiDocTable(`
[cols="3*"]
|===
3*|Repeated
|===
`);
    expect(parsed.body[0]).toHaveLength(3);
    expect(parsed.body[0].every((c) => c.text === 'Repeated')).toBe(true);
  });

  it('renders HTML with caption, colgroup, and styles', () => {
    const html = asciidocTableToHtml(`
.Title here
[cols="2,1",options="header",stripes="even"]
|===
|A |B
|1 |2
|===
`);
    expect(html).toContain('<caption>Title here</caption>');
    expect(html).toContain('<colgroup>');
    expect(html).toContain('stripes-even');
    expect(html).toContain('<thead>');
    expect(html).toContain('<th');
    expect(html).toContain('>A</th>');
    expect(html).toContain('>1</td>');
  });

  it('renders strong/emphasis/mono cell styles', () => {
    const html = asciidocTableToHtml(`
[cols="3*"]
|===
s|Bold
e|Italic
m|Code
|===
`);
    expect(html).toContain('<strong>');
    expect(html).toContain('<em>');
    expect(html).toContain('<code>');
  });
});

describe('wc-asciidoc-table integration', () => {
  it('registers the custom element', () => {
    expect(buildComponents()).toContain("customElements.define('wc-asciidoc-table'");
  });

  it('parseDoc renders AsciiDoc table inside the component', async () => {
    const md = `<wc-asciidoc-table>
[cols="2*",options="header"]
|===
|Name |Role

|Ada |Engineer
|===
</wc-asciidoc-table>
`;
    const { html } = await parseDoc(md);
    expect(html).toContain('<wc-asciidoc-table>');
    expect(html).toContain('<table class="adoc-table');
    expect(html).toContain('<thead>');
    expect(html).toContain('>Name</th>');
    expect(html).toContain('>Ada</td>');
    expect(html).not.toContain('|===');
  });

  it('honors element attributes', async () => {
    const md = `<wc-asciidoc-table cols="1,2" options="header" stripes="odd">
|===
|K |V

|a |b
|===
</wc-asciidoc-table>
`;
    const { html } = await parseDoc(md);
    expect(html).toContain('stripes-odd');
    expect(html).toContain('<col style="width:');
    expect(html).toContain('>K</th>');
  });

  it('does not let GFM eat blank lines inside the component', async () => {
    const md = `Before

<wc-asciidoc-table>
|===
|A |B

|1 |2

|3 |4
|===
</wc-asciidoc-table>

After
`;
    const { html } = await parseDoc(md);
    expect(html).toContain('>1</td>');
    expect(html).toContain('>3</td>');
    expect(html).toContain('Before');
    expect(html).toContain('After');
  });
});
