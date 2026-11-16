import { describe, it, expect } from 'vitest';
import { COMPONENT_MAP, rewriteMdxTags } from './mdx-bridge.js';
import { getComponent } from './component-manifest.js';
import { checkMarkup } from './markup-check.js';

const SAMPLE = `
<Note>n</Note>
<Info>i</Info>
<Warning>w</Warning>
<Danger>d</Danger>
<Caution>c</Caution>
<Tip>t</Tip>
<Check>ch</Check>
<Success>s</Success>

<CardGroup cols={2}>
<Card title="A" href="a" icon="rocket" color="#fff">body</Card>
</CardGroup>

<Tabs>
<Tab title="One">1</Tab>
<Tab label="Two">2</Tab>
</Tabs>

<AccordionGroup>
<Accordion title="Q" defaultOpen>A</Accordion>
</AccordionGroup>

<Steps>
<Step title="First">x</Step>
<Step title="Second">y</Step>
</Steps>

<CodeGroup>

\`\`\`js a.js
1
\`\`\`

</CodeGroup>

<Frame caption="cap" type="glass">![x](x.png)</Frame>

<Columns cols={2}>
<Column>left</Column>
<Column>right</Column>
</Columns>

<Panel title="P">p</Panel>

<Badge color="green">ok</Badge> <Badge color="nonsense">x</Badge> <Badge variant="info">v</Badge>

<Expandable title="More" defaultOpen>e</Expandable>
<Update label="v1" date="May 2026">u</Update>

<AsciidocTable cols="1,1" options="header" stripes="even">
a|b
</AsciidocTable>

<Tooltip tip="t">hover</Tooltip> <Icon icon="x" /> <Snippet file="a.mdx" />
`;

const FIELDS = `
<wc-fields>
${rewriteMdxTags(`<ParamField path="id" type="string" required>x</ParamField>
<ParamField query="q" type="string" default="1">x</ParamField>
<ResponseField name="r" type="string" required>x</ResponseField>`)}
</wc-fields>
`;

function checkTags(md) {
  const out = [];
  for (const m of md.matchAll(/<(wc-[a-z0-9-]+)((?:\s+[a-zA-Z_:][\w:.-]*(?:="[^"]*")?)*)\s*>/g)) {
    const tag = m[1];
    const comp = getComponent(tag);
    if (!comp) { out.push(`unknown tag ${tag}`); continue; }
    for (const a of m[2].matchAll(/([a-zA-Z_:][\w:.-]*)(?:="([^"]*)")?/g)) {
      const def = comp.attributes.find((x) => x.name === a[1]);
      if (!def) { out.push(`${tag}: unknown attribute ${a[1]}`); continue; }
      if (def.values && a[2] !== undefined && !def.values.includes(a[2])) {
        out.push(`${tag}: ${a[1]}="${a[2]}" not in [${def.values}]`);
      }
    }
  }
  return out;
}

describe('mdx-bridge output matches the component manifest', () => {
  const out = rewriteMdxTags(SAMPLE);

  it('covers every COMPONENT_MAP entry in the sample', () => {
    const all = SAMPLE + FIELDS.length; // FIELDS covers ParamField/ResponseField
    for (const name of Object.keys(COMPONENT_MAP)) {
      if (name === 'ParamField' || name === 'ResponseField') continue;
      expect(all, name).toContain(`<${name}`);
    }
  });

  it('emits only real tags, attributes and allowed values', () => {
    expect(checkTags(out)).toEqual([]);
    expect(checkTags(FIELDS)).toEqual([]);
    expect(out).not.toMatch(/<[A-Z]/);
  });

  it('maps specific attributes correctly', () => {
    expect(out).toContain('<wc-callout type="error" title="Danger">');
    expect(out).toContain('<wc-badge variant="success">');
    expect(out).toContain('<wc-expandable title="More" open>');
    expect(out).toContain('<wc-update version="v1" date="May 2026">');
    expect(out).not.toMatch(/defaultOpen|color=|label="v1"/);
    expect(FIELDS).toContain('in="path" name="id"');
    expect(FIELDS).toContain('in="query" name="q"');
  });

  it('passes the manifest-driven markup checker for attribute/value issues', () => {
    const { issues } = checkMarkup(out + FIELDS);
    const bad = issues.filter((i) => /attribute|value/.test(i.code));
    expect(bad).toEqual([]);
  });
});
