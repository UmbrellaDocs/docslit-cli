import { describe, it, expect } from 'vitest';
import { checkMarkup, editDistance, nearest } from './markup-check.js';

const codes = (r) => r.issues.map((i) => i.code);

describe('checkMarkup', () => {
  it('accepts valid markup', () => {
    const r = checkMarkup(`# Hi

<wc-callout type="tip" title="Hello">
Body **text**
</wc-callout>

<wc-steps>
<wc-step title="One">

Do it

</wc-step>
</wc-steps>

<wc-include src="x.md" />
`);
    expect(r.issues).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.componentsUsed['wc-step']).toBe(1);
  });

  it('flags unknown tags with a nearest suggestion', () => {
    const r = checkMarkup('<wc-calout type="info">x</wc-calout>');
    const i = r.issues.find((x) => x.code === 'unknown-component');
    expect(i.suggestion).toBe('wc-callout');
    expect(r.ok).toBe(false);
  });

  it('allows custom tags passed in', () => {
    expect(checkMarkup('<wc-mine>x</wc-mine>', { customTags: ['wc-mine'] }).issues).toEqual([]);
    expect(checkMarkup('<wc-mine>x</wc-mine>').issues[0].code).toBe('unknown-component');
  });

  it('flags unknown attributes and suggests the right one', () => {
    const r = checkMarkup('<wc-tabs><wc-tab title="JS">x</wc-tab></wc-tabs>');
    const i = r.issues.find((x) => x.code === 'unknown-attribute');
    expect(i.attribute).toBe('title');
    expect(i.suggestion).toBe('label');
    expect(codes(r)).toContain('missing-required-attribute');
  });

  it('flags invalid enum values with suggestion', () => {
    const r = checkMarkup('<wc-callout type="warnning">x</wc-callout>');
    const i = r.issues.find((x) => x.code === 'invalid-attribute-value');
    expect(i.suggestion).toBe('warning');
    expect(i.level).toBe('warning');
    expect(i.fix).toMatch(/warning/);
  });

  it('flags wrong parents and children', () => {
    const a = checkMarkup('<wc-step title="x">y</wc-step>');
    expect(codes(a)).toContain('invalid-parent');
    const b = checkMarkup('<wc-steps><wc-callout>hi</wc-callout></wc-steps>');
    expect(codes(b)).toContain('invalid-child');
  });

  it('allows a generic container between required parent and child', () => {
    const r = checkMarkup('<wc-steps><wc-step title="a"><wc-callout>x</wc-callout></wc-step></wc-steps>');
    expect(r.issues).toEqual([]);
  });

  it('flags unclosed and stray closing tags with line numbers', () => {
    const r = checkMarkup('line1\n\n<wc-callout>\nbody\n');
    const i = r.issues.find((x) => x.code === 'unclosed-tag');
    expect(i.line).toBe(3);
    const s = checkMarkup('text\n</wc-callout>');
    expect(s.issues[0].code).toBe('unexpected-closing-tag');
    expect(s.issues[0].line).toBe(2);
  });

  it('reports an inner unclosed tag when the outer closes', () => {
    const r = checkMarkup('<wc-tabs>\n<wc-tab label="a">\nx\n</wc-tabs>');
    expect(r.issues.filter((x) => x.code === 'unclosed-tag')).toHaveLength(1);
  });

  it('ignores fenced code, inline code, comments and frontmatter', () => {
    const r = checkMarkup(`---
title: <wc-bogus>
---

\`\`\`html
<wc-nope type="x">
\`\`\`

~~~
<wc-nope2>
~~~

Use \`<wc-also-nope>\` here. <!-- <wc-hidden> -->
`);
    expect(r.issues).toEqual([]);
  });

  it('keeps line numbers stable after masked regions and supports lineOffset', () => {
    const r = checkMarkup('---\ntitle: x\n---\n```\ncode\n```\n<wc-bogus></wc-bogus>', { lineOffset: 0 });
    expect(r.issues[0].line).toBe(7);
    expect(checkMarkup('<wc-bogus></wc-bogus>', { lineOffset: 10 }).issues[0].line).toBe(11);
  });

  it('treats raw-content components as opaque', () => {
    const r = checkMarkup('<wc-code-block language="js">\nif (a <wc-x> b) {}\n</wc-code-block>');
    expect(r.issues).toEqual([]);
    const m = checkMarkup('<wc-mermaid>\ngraph LR\n A-->B\n</wc-mermaid>');
    expect(m.issues).toEqual([]);
  });

  it('handles ">" inside quoted attribute values and JSON values', () => {
    const r = checkMarkup(`<wc-table headers='["a","b>c"]' rows='[["1","2"]]'></wc-table>`);
    expect(r.issues).toEqual([]);
  });

  it('warns on /> for non-self-closing components but not wc-include', () => {
    expect(codes(checkMarkup('<wc-icon name="zap" />'))).toEqual(['self-closing-syntax']);
    expect(checkMarkup('<wc-include src="a.md" />').issues).toEqual([]);
  });

  it('reports malformed tags without throwing', () => {
    expect(codes(checkMarkup('<wc-callout type="info'))).toContain('malformed-tag');
    expect(() => checkMarkup(undefined)).not.toThrow();
    expect(checkMarkup('').ok).toBe(true);
  });

  it('accepts boolean attributes, data-*, aria-*, class', () => {
    expect(checkMarkup('<wc-banner dismissible class="x" data-a="1" aria-label="b">hi</wc-banner>').issues).toEqual([]);
  });
});

describe('fenced code masking', () => {
  const body = '<wc-callout>\nx\n</wc-callout>';
  const inFence = (open, close = open) => `${open}html\n${body}\n\n  ${body}\n${close}\n\n<wc-bogus></wc-bogus>\n`;

  it('masks every line of a multi-line backtick fence', () => {
    const r = checkMarkup(inFence('```'));
    expect(r.issues.map((i) => i.code)).toEqual(['unknown-component']);
    expect(r.issues[0].line).toBe(11);
  });

  it('masks tilde fences, longer fences and indented fences', () => {
    expect(checkMarkup(inFence('~~~')).issues).toHaveLength(1);
    expect(checkMarkup(inFence('````', '````')).issues).toHaveLength(1);
    expect(checkMarkup(inFence('   ```', '   ```')).issues).toHaveLength(1);
    expect(checkMarkup(inFence('~~~~~', '~~~~~~')).issues).toHaveLength(1);
  });

  it('a longer fence is not closed by a shorter inner fence', () => {
    const r = checkMarkup('````md\n```\n</wc-callout>\n```\n</wc-callout>\n````\n');
    expect(r.issues).toEqual([]);
  });

  it('a fence of the other character does not close the block', () => {
    const r = checkMarkup('```\n~~~\n</wc-callout>\n```\n');
    expect(r.issues).toEqual([]);
  });

  it('an unterminated fence runs to the end of the file', () => {
    const r = checkMarkup('text\n```bash\n</wc-callout>\n<wc-bogus>\n');
    expect(r.issues).toEqual([]);
  });

  it('does not treat inline triple-backtick spans as fences', () => {
    const r = checkMarkup('Use ```x``` inline\n</wc-callout>\n');
    expect(codes(r)).toEqual(['unexpected-closing-tag']);
  });

  it('works with CRLF line endings', () => {
    const r = checkMarkup('```html\r\n</wc-callout>\r\n</wc-callout>\r\n```\r\n');
    expect(r.issues).toEqual([]);
  });
});

describe('nesting and compile-time forms', () => {
  it('accepts wc-field directly inside wc-schema (the component slots any children)', () => {
    const r = checkMarkup('<wc-schema type="User">\n<wc-field name="id" type="string">Id.</wc-field>\n</wc-schema>');
    expect(r.issues).toEqual([]);
  });

  it('accepts the compile-time self-closing <wc-var name value />', () => {
    expect(checkMarkup('<wc-var name="DOMAIN" value="docs.example.com" />').issues).toEqual([]);
    expect(codes(checkMarkup('<wc-var name="DOMAIN" default="x" />'))).toEqual(['self-closing-syntax']);
    expect(checkMarkup('<wc-var name="DOMAIN" default="x"></wc-var>').issues).toEqual([]);
  });

  it('knows the sync attribute on wc-tabs and wc-code-group', () => {
    const r = checkMarkup('<wc-tabs sync="os"><wc-tab label="a">x</wc-tab></wc-tabs>\n<wc-code-group sync="os"><wc-code-tab label="a">x</wc-code-tab></wc-code-group>');
    expect(r.issues).toEqual([]);
  });
});

describe('helpers', () => {
  it('editDistance and nearest', () => {
    expect(editDistance('kitten', 'sitting')).toBe(3);
    expect(nearest('wc-calout', ['wc-callout', 'wc-card'])).toBe('wc-callout');
    expect(nearest('zzzzzz', ['wc-callout'])).toBeNull();
  });
});

describe('fenced code masking follows CommonMark closing rules', () => {
  it('an indented inner fence inside a code example does not close the outer fence', async () => {
    const { checkMarkup } = await import('./markup-check.js');
    const md = '```markdown\n=== "C"\n\n    ```c\n    int x;\n    ```\n\n</wc-tab>\n```\n\nText.\n';
    expect(checkMarkup(md).issues.filter((i) => i.level === 'error')).toEqual([]);
  });
});
