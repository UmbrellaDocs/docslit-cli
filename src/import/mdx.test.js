import { describe, it, expect } from 'vitest';
import { convertBody } from './mdx.js';
import { getComponent } from '../component-manifest.js';
import { checkMarkup } from '../markup-check.js';

function run(src, vendor = 'mintlify', extra = {}) {
  const items = [];
  const counts = [];
  const ctx = {
    vendor, lineOffset: 0, consumed: new Set(),
    report: (sev, code, msg, x) => items.push({ sev, code, msg, ...x }),
    count: (a, b) => counts.push([a, b]),
    link: (u) => u, asset: (u) => u,
    expression: (e) => (e?.type === 'Literal' && typeof e.value === 'string' ? e.value : null),
    includeSnippet: (s, el) => ({ replace: `<wc-include src="${s.replace(/^\/snippets\//, '')}" />` }),
    codeFromSource: (s) => ({ text: '```js file="snippets/x.js"\n```', warnings: [] }),
    ...extra,
  };
  const r = convertBody(src, ctx);
  return { out: r.body, items, counts, ok: r.ok };
}

function tagsProblems(md) {
  const bad = [];
  for (const m of md.matchAll(/<(wc-[a-z0-9-]+)((?:\s+[a-zA-Z_:][\w:.-]*(?:=(?:"[^"]*"|'[^']*'))?)*)\s*\/?>/g)) {
    const comp = getComponent(m[1]);
    if (!comp) { bad.push(`unknown tag ${m[1]}`); continue; }
    for (const a of m[2].matchAll(/([a-zA-Z_:][\w:.-]*)(?:=(?:"([^"]*)"|'([^']*)'))?/g)) {
      if (a[1] === 'id' || a[1] === 'class' || a[1] === 'style') continue;
      const def = comp.attributes.find((x) => x.name === a[1]);
      if (!def) { bad.push(`${m[1]}: unknown attribute ${a[1]}`); continue; }
      const v = a[2] ?? a[3];
      if (def.values && v !== undefined && !def.values.includes(v)) bad.push(`${m[1]}: ${a[1]}="${v}" not in [${def.values}]`);
    }
  }
  return bad;
}

const parseAttrs = (t) => {
  const o = {};
  for (const a of t.matchAll(/([a-zA-Z_:][\w:.-]*)(?:=(?:"([^"]*)"|'([^']*)'))?/g)) o[a[1]] = a[2] ?? a[3] ?? true;
  return o;
};
/** order-insensitive "<wc-x a=b c>" containment (attribute subset) */
function containsTag(out, expected) {
  const m = /^<([a-z][\w-]*)((?:\s+[^<>]*?)?)\/?>$/.exec(expected);
  if (!m || expected.includes('\n')) return false;
  const want = parseAttrs(m[2]);
  const re = new RegExp(`<${m[1]}((?:\\s+[^<>]*?)?)\\s*/?>`, 'g');
  for (const t of out.matchAll(re)) {
    const have = parseAttrs(t[1]);
    if (Object.entries(want).every(([k, v]) => have[k] === v)) return true;
  }
  return false;
}

// [name, vendor, input, must contain[], must not contain[]]
const ROWS = [
  // ── callouts
  ['Note', 'mintlify', '<Note>n</Note>', ['<wc-callout type="note">', '\n\nn\n\n', '</wc-callout>']],
  ['Info', 'mintlify', '<Info>n</Info>', ['<wc-callout type="info">']],
  ['Tip', 'mintlify', '<Tip>n</Tip>', ['<wc-callout type="tip">']],
  ['Warning', 'mintlify', '<Warning>n</Warning>', ['<wc-callout type="warning">']],
  ['Check', 'mintlify', '<Check>n</Check>', ['<wc-callout type="check">']],
  ['Danger', 'mintlify', '<Danger>n</Danger>', ['<wc-callout type="danger">']],
  ['Callout (Mintlify)', 'mintlify', '<Callout icon="star" color="#ff0000" iconType="solid">c</Callout>', ['<wc-callout icon="star" icon-type="solid" color="#ff0000">'], [' type=']],
  ['Callout className', 'mintlify', '<Tip className="x">c</Tip>', ['<wc-callout type="tip">'], ['className']],
  ['Fern Success', 'fern', '<Success>n</Success>', ['type="success"']],
  ['Fern Error', 'fern', '<Error>n</Error>', ['type="error"']],
  ['Fern Launch', 'fern', '<Launch>n</Launch>', ['type="launch"']],
  ['Fern Callout intent', 'fern', '<Callout intent="warning" title="T" icon="skull-crossbones">c</Callout>', ['type="warning"', 'title="T"', 'icon="skull-crossbones"']],
  // ── accordions
  ['AccordionGroup/Accordion', 'mintlify', '<AccordionGroup>\n<Accordion title="Q" description="d" defaultOpen id="q" icon="gear" iconType="solid">A</Accordion>\n</AccordionGroup>', ['<wc-accordion-group>', '<wc-accordion title="Q" description="d" open id="q" icon="fa-solid fa-gear">']],
  ['Lone Accordion is wrapped', 'fern', '<Accordion title="Q">A</Accordion>', ['<wc-accordion-group>', '</wc-accordion-group>']],
  ['Expandable', 'mintlify', '<Expandable title="More" defaultOpen>e</Expandable>', ['<wc-expandable title="More" open>']],
  // ── badge
  ['Badge colors', 'mintlify', '<Badge color="gray">a</Badge> <Badge color="blue">b</Badge> <Badge color="green" shape="pill">c</Badge> <Badge color="yellow" size="xs">d</Badge> <Badge color="orange">e</Badge> <Badge color="red">f</Badge> <Badge color="purple">g</Badge> <Badge color="white">h</Badge> <Badge color="surface">i</Badge>',
    ['variant="neutral"', 'variant="info"', 'variant="success" shape="pill"', 'variant="warning" size="xs"', 'variant="orange"', 'variant="danger"', 'variant="purple"', 'variant="white"', 'variant="surface"']],
  ['Badge destructive', 'mintlify', '<Badge color="white-destructive">a</Badge> <Badge color="surface-destructive">b</Badge> <Badge stroke disabled icon="star">c</Badge>', ['variant="danger" outlined', 'variant="danger" minimal', 'icon="star"', 'outlined', 'disabled']],
  ['Fern Badge intent', 'fern', '<Badge intent="launch" minimal outlined>x</Badge>', ['<wc-badge variant="launch" minimal outlined>']],
  // ── cards
  ['CardGroup/Card', 'mintlify', '<CardGroup cols={3}>\n<Card title="A" icon="rocket" iconType="brands" color="#fff" href="/x.mdx" horizontal img="/a.png" cta="Go" arrow={false} type="tip">b</Card>\n</CardGroup>',
    ['<wc-tiles cols="3">', 'title="A"', 'href="/x.mdx"', 'icon="fa-brands fa-rocket"', 'icon-color="#fff"', 'horizontal', 'img="/a.png"', 'cta="Go"', 'arrow="false"', 'type="tip"']],
  ['CardGroup default cols', 'mintlify', '<CardGroup><Card title="A">b</Card></CardGroup>', ['<wc-tiles cols="2">']],
  ['Fern Card', 'fern', '<Card title="A" icon="brands python" iconSize={6} lightModeColor="#111" darkModeColor="#eee" src="/i.png" imagePosition="left" imageWidth={20} href="/p">b</Card>',
    ['icon="fa-brands fa-python"', 'icon-size="24"', 'icon-color="#111"', 'icon-color-dark="#eee"', 'img="/i.png"', 'img-position="left"']],
  ['Tile', 'mintlify', '<Tile href="/a" title="T" description="D"><img src="/a.png" /></Tile>', ['<wc-tiles cols="2">', '<wc-tile href="/a" title="T" description="D">']],
  ['Columns', 'mintlify', '<Columns cols={2}><Column>one</Column><Column>two</Column></Columns>', ['<wc-columns cols="2">', '<div>']],
  // ── color
  ['Color', 'mintlify', '<Color variant="table">\n<Color.Row title="R">\n<Color.Item name="N" value="#fff" />\n<Color.Item name="M" value={{light: "#fff", dark: "#000"}} />\n</Color.Row>\n</Color>', ['<wc-colors variant="table">', '<wc-color-row title="R">', '<wc-color name="N" value="#fff">', 'light="#fff" dark="#000"']],
  // ── fields
  ['ParamField Mintlify', 'mintlify', '<ParamField path="id" type="string" required default="1" deprecated placeholder="p" pre={["a","b"]} post={["c"]}>d</ParamField>', ['<wc-fields>', '<wc-field name="id" in="path" type="string" required deprecated default="1" placeholder="p" pre="a, b" post="c">']],
  ['ParamField query/body/header', 'mintlify', '<ParamField query="q">x</ParamField>\n<ParamField body="b">x</ParamField>\n<ParamField header="h">x</ParamField>', ['in="query"', 'in="body"', 'in="header"']],
  ['ResponseField', 'mintlify', '<ResponseField name="r" type="n" required>x</ResponseField>', ['<wc-response-fields>', '<wc-field name="r" type="n" required>']],
  ['Fern ParamField', 'fern', '<ParamField path="id" type="string" toc>d</ParamField>', ['<wc-field name="id" type="string">'], ['in="path"']],
  // ── frame
  ['Frame', 'mintlify', '<Frame caption="c" hint="h"><img src="/a.png" noZoom /></Frame>', ['<wc-frame caption="c" hint="h" border>', 'noZoom']],
  ['Fern Frame background', 'fern', '<Frame background="subtle">x</Frame>', ['background="subtle"']],
  ['GitHub.Repo', 'mintlify', '<GitHub.Repo repo="o/r" variant="flat" />', ['<wc-github-repo repo="o/r" variant="flat">']],
  // ── icon / mermaid / panel / prompt
  ['Icon', 'mintlify', 'a <Icon icon="star" iconType="solid" color="#f00" size={24} /> b', ['<wc-icon name="star" icon-type="solid" color="#f00" size="24">']],
  ['Icon src', 'mintlify', '<Icon src="/i.svg" />', ['<wc-icon name="/i.svg">']],
  ['Icon JSX svg', 'mintlify', '<Card title="x" icon={<svg className="a" strokeWidth="2" viewBox="0 0 1 1"><path d="M0 0" /></svg>} />', ['icon=', '<svg class="a" stroke-width="2"'], ['className']],
  ['Fern Icon size', 'fern', '<Icon icon="fa-solid fa-gear" size={5} />', ['size="20"']],
  ['Mermaid component', 'mintlify', '<Mermaid>\ngraph TD; A-->B;\n</Mermaid>', ['<wc-mermaid>']],
  ['Panel', 'mintlify', '<Panel>side</Panel>', ['<wc-aside sticky>']],
  ['Fern Aside', 'fern', '<Aside>side</Aside>', ['<wc-aside sticky>']],
  ['Prompt Mintlify', 'mintlify', '<Prompt description="d" icon="star" actions={["copy","cursor"]}>text</Prompt>', ['<wc-prompt description="d" icon="star" actions="cursor">']],
  ['Prompt Fern objects', 'fern', '<Prompt title="T" actions={[{label: "Go", url: "https://x?q={prompt}"}]} singleLine hidePrompt>x</Prompt>', ['title="T"', 'actions=\'[{"label":"Go","url":"https://x?q={prompt}"}]\'', 'single-line', 'hide-prompt']],
  // ── steps
  ['Steps/Step', 'mintlify', '<Steps titleSize="h3">\n<Step title="A" stepNumber={3} icon="star" id="a" noAnchor titleSize="h2">x</Step>\n</Steps>', ['<wc-steps title-size="h3">', '<wc-step title="A" n="3" title-size="h2" id="a" no-anchor icon="star">'], ['n="1"']],
  // ── tabs
  ['Tabs Mintlify sync default', 'mintlify', '<Tabs>\n<Tab title="A" icon="star" id="a">x</Tab>\n</Tabs>', ['<wc-tabs sync="mintlify">', '<wc-tab label="A" id="a" icon="star">']],
  ['Tabs sync false', 'mintlify', '<Tabs sync={false} defaultTabIndex={1} borderBottom>\n<Tab title="A">x</Tab>\n</Tabs>', ['<wc-tabs default-tab="1" border-bottom>'], ['sync']],
  ['Fern Tabs language', 'fern', '<Tabs>\n<Tab title="Py" language="python">x</Tab>\n</Tabs>', ['sync="fern-language"']],
  ['Fern TabGroup', 'fern', '<TabGroup>\n<Tabs>\n<Tab title="A">x</Tab>\n</Tabs>\n</TabGroup>', ['<wc-tabs>'], ['TabGroup']],
  // ── tooltip
  ['Tooltip Mintlify', 'mintlify', 'a <Tooltip tip="t" headline="h" cta="c" href="/x">hover</Tooltip> b', ['<wc-tooltip tip="t" headline="h" cta="c" href="/x">hover</wc-tooltip>']],
  ['Tooltip Fern', 'fern', '<Tooltip tip="t" side="bottom" sideOffset={4}>x</Tooltip>', ['position="bottom"'], ['sideOffset']],
  // ── tree
  ['Tree', 'mintlify', '<Tree>\n<Tree.Folder name="src" defaultOpen>\n<Tree.File name="a.ts" highlight />\n</Tree.Folder>\n<Tree.Folder name="lib" openable={false} highlight />\n</Tree>', ['<wc-files>', '<wc-dir name="src">', '<wc-file name="a.ts" highlight>', '<wc-dir name="lib" highlight collapsed openable="false">'], ['<wc-dir name="src" collapsed']],
  ['Fern Files', 'fern', '<Files>\n<Folder name="a" href="/h" highlighted comment="# c">\n<File name="b" href="/b" comment="note" />\n</Folder>\n</Files>', ['<wc-dir name="a" highlight href="/h" comment="c" collapsed>', '<wc-file name="b" href="/b" comment="note">']],
  // ── update
  ['Update', 'mintlify', '<Update label="v1" description="d" tags={["a","b"]} rss={{title:"x"}}>u</Update>', ['<wc-update label="v1" description="d" tags="a, b">'], ['rss=']],
  ['Fern Update', 'fern', '<Update label="v1" id="x">u</Update>', ['<wc-update label="v1">']],
  // ── view
  ['View', 'mintlify', '<View title="A" icon="star">a</View>\n<View title="B">b</View>', ['<wc-view sync="views">', '<wc-view-panel label="A" icon="star">', '<wc-view-panel label="B">']],
  // ── visibility
  ['Visibility humans', 'mintlify', '<Visibility for="humans">h</Visibility>', ['<wc-if for="humans">']],
  ['Visibility agents', 'mintlify', '<Visibility for="agents">a</Visibility>', ['<wc-if for="agents">']],
  ['Visibility signed-out', 'mintlify', '<Visibility for="signed-out">s</Visibility>', ['s'], ['wc-if']],
  ['Visibility signed-in dropped', 'mintlify', '<Visibility for="signed-in">s</Visibility>\n\nafter', ['after'], ['signed-in', '\ns\n']],
  // ── mdx
  ['MDX unwrap', 'mintlify', '<MDX>\ntext\n</MDX>', ['text'], ['MDX']],
  // ── fern specific
  ['Anchor text', 'fern', '<Anchor id="data">Data</Anchor>', ['<wc-anchor id="data">']],
  ['Anchor block', 'fern', '<Anchor id="t">\n\n| a |\n|---|\n| b |\n\n</Anchor>', ['<a id="t"></a>', '| a |']],
  ['Button', 'fern', '<Button intent="success" minimal outlined large full rounded mono active disabled icon="star" rightIcon="arrow-right" href="/x" target="_blank">Go</Button>', ['<wc-button variant="success" minimal outlined full rounded mono active disabled icon="star" right-icon="arrow-right" href="/x" target="_blank" size="lg">', '>Go</wc-button>']],
  ['Button text prop', 'fern', '<Button text="Click" href="/x" />', ['>Click</wc-button>']],
  ['Copy', 'fern', '<Copy clipboard="x">shown</Copy>', ['<wc-copy clipboard="x">shown</wc-copy>']],
  ['Download', 'fern', '<Download src="/f.zip" filename="f.zip">Get</Download>', ['<wc-download href="/f.zip" filename="f.zip">Get</wc-download>']],
  ['Indent', 'fern', '<Indent>\nx\n</Indent>', ['<wc-indent>']],
  ['If versions', 'fern', '<If versions={["v1"]} not>x</If>', ['<wc-if version="v1" not>']],
  ['If roles dropped', 'fern', '<If roles={["admin"]}>secret</If>', [], ['secret']],
  ['If loggedIn false unwrap', 'fern', '<If loggedIn={false}>visible</If>', ['visible'], ['wc-if']],
  ['llms-only', 'fern', '<llms-only>a</llms-only>', ['<wc-if for="agents">']],
  ['llms-ignore', 'fern', '<llms-ignore>a</llms-ignore>', ['<wc-if for="humans">']],
  ['StickyTable/SearchableTable', 'fern', '<StickyTable>\n\n| a |\n|---|\n| b |\n\n</StickyTable>\n\n<SearchableTable placeholder="Find">\n\n| a |\n|---|\n| b |\n\n</SearchableTable>', ['<wc-table sticky>', '<wc-table searchable placeholder="Find">']],
  ['ScrollWalkthrough', 'fern', '<ScrollWalkthrough layout="wide" panelHeight={400} dim={false} stickyHeaders>\n<Step title="S" description="D" file={2} focus="1-3" highlight={[1,2]} startLine={5}>x</Step>\n</ScrollWalkthrough>', ['<wc-walkthrough layout="wide" panel-height="400" dim="false">', '<wc-walkthrough-step title="S" description="D" file="2" focus="1-3" highlight="1,2" start-line="5">']],
  ['Versions', 'fern', '<Versions>\n<Version version="v1" title="One">a</Version>\n</Versions>', ['<wc-versions>', '<wc-version name="One">']],
  ['Latex component', 'mintlify', '<Latex>x^2</Latex>', ['$$x^2$$']],
  // ── placeholders for unsupported API snippets
  ['RunnableEndpoint', 'fern', '<RunnableEndpoint endpoint="GET /x" />', ['<wc-callout type="info" title="Runnable endpoint">']],
  ['Schema/Endpoint snippets', 'fern', '<Schema type="X" />\n\n<EndpointRequestSnippet endpoint="GET /x" />\n\n<EndpointResponseSnippet endpoint="GET /x" />', ['title="Schema: see the API reference"', 'Request example', 'Response example']],
  // ── code components
  ['CodeGroup', 'mintlify', '<CodeGroup dropdown>\n\n```js a\n1\n```\n\n```py b\n2\n```\n\n</CodeGroup>', ['<wc-code-group dropdown>', '```js a', '```py b']],
  ['CodeGroup without blank lines keeps fences parseable', 'mintlify', '<CodeGroup>\n```js a\n1\n```\n```py b\n2\n```\n</CodeGroup>', ['<wc-code-group>\n\n```js a', '```\n\n</wc-code-group>']],
  ['RequestExample/ResponseExample', 'mintlify', '<RequestExample dropdown>\n\n```bash curl\nx\n```\n\n</RequestExample>\n\n<ResponseExample>\n\n```json 200\n{}\n```\n\n</ResponseExample>', ['<wc-code-group dropdown>', '<wc-code-group>']],
  ['Fern CodeBlocks unindent', 'fern', '<CodeBlocks>\n    ```js a\n    1\n    ```\n    ```py b\n    2\n    ```\n</CodeBlocks>', ['<wc-code-group>', '\n```js a lines\n1\n```'], ['    ```']],
  ['Fern CodeBlock unwrap', 'fern', '<CodeBlock links={{a: "b"}}>\n```js\nx\n```\n</CodeBlock>', ['```js lines'], ['CodeBlock', 'wc-code']],
  ['Fern Code src local', 'fern', '<Code src="snippets/x.js" lines={[2-4]} title="x.js" />', ['file="snippets/x.js"']],
  // ── fences
  ['Fern fence default line numbers', 'fern', '```python title="main.py"\nx\n```', ['```python title="main.py" lines']],
  ['Fern showLineNumbers false', 'fern', '```ts showLineNumbers={false}\nx\n```', ['```ts'], ['lines', 'showLineNumbers']],
  ['Fern showLineNumbers true', 'fern', '```ts showLineNumbers\nx\n```', ['```ts lines']],
  ['Fern startLine implies lines', 'fern', '```ts startLine={6} maxLines=10\nx\n```', ['startLine={6} maxLines=10 lines']],
  ['Mintlify fence untouched', 'mintlify', '```js title="x.js" {2-3} focus=5 wrap expandable lines\nx\n```', ['```js title="x.js" {2-3} focus=5 wrap expandable lines']],
  ['Mintlify no fence line numbers added', 'mintlify', '```js\nx\n```', ['```js\n'], [' lines']],
  ['nocopy bare', 'mintlify', '```nocopy\nx\n```', ['```text nocopy']],
  ['theme null dropped', 'mintlify', '```js theme={null}\nx\n```', ['```js\n'], ['theme']],
  ['twoslash dropped', 'mintlify', '```ts twoslash\nx\n```', ['```ts\n'], ['twoslash']],
  ['code word marker stripped', 'mintlify', '```js\nfoo() // [!code word:foo]\n```', ['foo()'], ['[!code word']],
  ['fence containing JSX text is untouched', 'mintlify', '```jsx\n<Card title="x">{y}</Card>\n```', ['<Card title="x">{y}</Card>']],
  // ── html/jsx quirks
  ['className/htmlFor/style', 'mintlify', '<div className="a b" style={{backgroundColor: "red", marginTop: 4}}>\n\nx\n\n</div>\n\n<label htmlFor="q">l</label>', ['class="a b"', 'style="background-color: red; margin-top: 4px"', 'for="q"'], ['className', 'htmlFor']],
  ['img light/dark pair', 'mintlify', '<img className="block dark:hidden" src="/l.png" alt="a" />\n<img className="hidden dark:block" src="/d.png" alt="a" />', ['![a](/l.png#dark=/d.png)'], ['<img']],
  ['img noZoom kept', 'mintlify', '<img src="/a.png" alt="a" noZoom />', ['noZoom']],
  ['img actions dropped', 'mintlify', '<img src="/a.png" alt="a" actions actionsPlacement="top" />', ['<img src="/a.png" alt="a" />'], ['actions']],
  ['iframe youtube', 'mintlify', '<iframe src="https://www.youtube.com/embed/x" className="aspect-video" title="V"></iframe>', ['<wc-embed src="https://www.youtube.com/embed/x" title="V" ratio="16/9">']],
  ['iframe height', 'mintlify', '<iframe src="https://example.com/app" height="400"></iframe>', ['height="400"']],
  ['iframe pdf stays', 'mintlify', '<iframe src="/doc.pdf" width="100%" height="600"></iframe>', ['<iframe src="/doc.pdf"']],
  ['video', 'mintlify', '<video src="/c.mp4" poster="/p.png" autoPlay muted loop controls={false} playsInline />', ['<wc-embed src="/c.mp4" poster="/p.png" controls="false" autoplay muted loop>']],
  ['MDX comment removed', 'mintlify', 'a\n\n{/* hidden */}\n\nb', ['a', 'b'], ['hidden', '{/*']],
  ['JSX string escape', 'mintlify', 'x {"{"} y', ['x { y']],
  ['import removed', 'mintlify', "import X from 'react'\n\ntext", ['text'], ['import']],
  ['table untouched', 'mintlify', '| a | b |\n|---|---|\n| 1 | 2 |', ['| a | b |\n|---|---|\n| 1 | 2 |']],
  ['inline math untouched', 'mintlify', 'Value $x^{2}$ and\n\n$$\n\\frac{1}{2}\n$$', ['$x^{2}$', '\\frac{1}{2}']],
];

describe('mdx engine: every mapping row', () => {
  for (const [name, vendor, src, has = [], not = []] of ROWS) {
    it(`${vendor}: ${name}`, () => {
      const { out, ok } = run(src, vendor);
      expect(ok, out).toBe(true);
      for (const h of has) expect(containsTag(out, h) || out.includes(h), `expected ${JSON.stringify(h)} in:\n${out}`).toBe(true);
      for (const n of not) expect(out, `unexpected ${JSON.stringify(n)}`).not.toContain(n);
      expect(tagsProblems(out)).toEqual([]);
    });
  }

  it('emits manifest-valid markup for the whole table', () => {
    const all = ROWS.map((r) => run(r[2], r[1]).out).join('\n\n');
    const { issues } = checkMarkup(all);
    expect(issues.filter((i) => /attribute|value|unknown/.test(i.code) && !/tab-in-tabs|parent/.test(i.code)).map((i) => i.message)).toEqual([]);
  });
});

describe('mdx engine: structure', () => {
  it('keeps blank lines around bodies and indents continuation lines inside lists', () => {
    const { out } = run('- item\n  <Note>inside a list</Note>\n');
    expect(out).toContain('<wc-callout type="note">');
    expect(out).toMatch(/\n {2}inside a list\n/);
  });
  it('handles blockquotes', () => {
    const { out } = run('> <Tip>quoted</Tip>\n');
    expect(out).toContain('> <wc-callout type="tip">');
    expect(out).toContain('> quoted');
  });
  it('dedents indented JSX bodies so they do not become code blocks', () => {
    const { out } = run('<Tabs>\n  <Tab title="A">\n      deep text\n  </Tab>\n</Tabs>');
    expect(out).toMatch(/\n\ndeep text\n\n/);
  });
  it('multi-line props and JSX expression props', () => {
    const { out } = run('<Card\n  title="A"\n  cols={2}\n  href="/a"\n/>');
    expect(out).toContain('<wc-card title="A" href="/a"></wc-card>');
  });
  it('unknown components are never silently dropped', () => {
    const { out, items } = run('<Mystery a="1">inner text</Mystery>');
    expect(out).toContain('Unconverted component: Mystery');
    expect(out).toContain('inner text');
    expect(items.some((i) => i.code === 'unknown-component' && i.sev === 'error')).toBe(true);
  });
  it('reports dropped props with the component name', () => {
    const { items } = run('<Card title="x" zoom="1">b</Card>');
    expect(items.some((i) => i.code === 'component-prop-dropped' && /zoom/.test(i.msg))).toBe(true);
  });
  it('reports line numbers', () => {
    const { items } = run('a\n\nb\n\n<Mystery />');
    expect(items.find((i) => i.code === 'unknown-component').line).toBe(5);
  });
  it('invalid MDX is reported, not thrown', () => {
    const { ok, items } = run('<Note>unclosed');
    expect(ok).toBe(false);
    expect(items[0].code).toBe('mdx-parse-error');
  });
});
