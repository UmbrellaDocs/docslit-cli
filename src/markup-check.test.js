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
    expect(i.level).toBe('error');
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

describe('helpers', () => {
  it('editDistance and nearest', () => {
    expect(editDistance('kitten', 'sitting')).toBe(3);
    expect(nearest('wc-calout', ['wc-callout', 'wc-card'])).toBe('wc-callout');
    expect(nearest('zzzzzz', ['wc-callout'])).toBeNull();
  });
});
