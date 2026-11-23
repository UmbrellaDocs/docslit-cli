import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadApi, renderObject, normalizeOptions } from './index.js';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'test-fixtures', 'api-python');
const read = (f) => fs.readFileSync(path.join(FIX, f), 'utf8');
const shapes = loadApi(read('shapes.json'));

const N = (name, member = null) => ({ cls: 'ExprName', name, member });

/** Tiny hand-written module so expression/signature rendering can be asserted exactly. */
function mini(members, extra = {}) {
  return loadApi({ m: { kind: 'module', name: 'm', path: 'm', members, ...extra } });
}
function fn(name, parameters, returns = null, extra = {}) {
  return { kind: 'function', name, parameters, returns, docstring: { value: 'Doc.' }, ...extra };
}
function param(name, kind = 'positional or keyword', annotation = null, def = null) {
  return { name, kind, annotation, default: def };
}
const R = (idx, id, o = {}, c) => renderObject(idx, id, { show_root_heading: true, ...o }, c);
const sig = (md) => /```python\n([\s\S]*?)\n```/.exec(md)[1];

describe('loadApi', () => {
  it('accepts JSON text, objects, and indexes by path (raw dumps get paths from nesting)', () => {
    const raw = loadApi(read('shapes-raw.json'));
    expect(raw.nodes.has('shapes._core.Shape.area')).toBe(true);
    expect(loadApi(JSON.parse(read('shapes.json'))).nodes.get('shapes.Shape').kind).toBe('alias');
    expect(raw.packages).toEqual(['shapes']);
  });
  it('rejects garbage', () => {
    expect(() => loadApi('{nope')).toThrow(/Invalid Griffe JSON/);
    expect(() => loadApi({})).toThrow(/no package/);
  });
});

describe('expressions', () => {
  const render = (annotation, opts = {}) => {
    const idx = mini({ f: fn('f', [param('x', 'positional or keyword', annotation)]) });
    return R(idx, 'm.f', { show_signature_annotations: true, ...opts }).markdown;
  };
  it('renders subscripts, unions, tuples, lists, calls and constants as source text', () => {
    const cases = [
      [{ cls: 'ExprSubscript', left: N('dict'), slice: { cls: 'ExprTuple', implicit: true, elements: [N('str'), N('int')] } }, 'dict[str, int]'],
      [{ cls: 'ExprBinOp', left: N('int'), operator: '|', right: 'None' }, 'int | None'],
      [{ cls: 'ExprSubscript', left: N('Callable'), slice: { cls: 'ExprTuple', implicit: true, elements: [{ cls: 'ExprList', elements: [N('int')] }, 'None'] } }, 'Callable[[int], None]'],
      [{ cls: 'ExprTuple', implicit: false, elements: ['1'] }, '(1,)'],
      [{ cls: 'ExprCall', function: N('field'), arguments: [{ cls: 'ExprKeyword', name: 'default', value: '3', function: N('field') }] }, 'field(default=3)'],
      [{ cls: 'ExprAttribute', values: [N('os'), N('PathLike')] }, 'os.PathLike'],
      [{ cls: 'ExprBoolOp', operator: 'and', values: ['a', 'b'] }, 'a and b'],
      [{ cls: 'ExprUnaryOp', operator: 'not', value: 'x' }, 'not x'],
      [{ cls: 'ExprUnaryOp', operator: '-', value: '1' }, '-1'],
      [{ cls: 'ExprDict', keys: ["'a'", null], values: ['1', N('rest')] }, "{'a': 1, **rest}"],
      [{ cls: 'ExprIfExp', body: 'a', test: 'c', orelse: 'b' }, 'a if c else b'],
    ];
    for (const [expr, text] of cases) expect(sig(render(expr))).toContain(`x: ${text}`);
  });
  it('unknown expression classes degrade with a warning, not a throw', () => {
    const idx = mini({ f: fn('f', [param('x', 'positional or keyword', { cls: 'ExprWeird' })]) });
    const r = R(idx, 'm.f', { show_signature_annotations: true });
    expect(r.warnings.join()).toMatch(/ExprWeird/);
    expect(r.markdown).toContain('x: ...');
  });
  it('links names that resolve in the index: same page as #anchor, otherwise an autorefs token', () => {
    const idx = mini({
      Foo: { kind: 'class', name: 'Foo', docstring: { value: 'Foo.' }, members: {}, bases: [] },
      g: fn('g', [param('a', 'positional or keyword', N('Foo'))], null, {
        docstring: { value: 'G.', parsed: [{ kind: 'text', value: 'G.' }, { kind: 'parameters', value: [{ name: 'a', annotation: N('Foo'), description: 'The foo.' }] }] },
      }),
    });
    const tok = R(idx, 'm.g');
    expect(tok.markdown).toContain('[`Foo`][m.Foo]');
    expect(tok.refs).toEqual(['m.Foo']);
    const viaCtx = R(idx, 'm.g', {}, { linkFor: (id) => (id === 'm.Foo' ? '/api/foo/#m.Foo' : null) });
    expect(viaCtx.markdown).toContain('[`Foo`](/api/foo/#m.Foo)');
    expect(viaCtx.refs).toEqual([]);
    const plain = R(idx, 'm.g', {}, { linkFor: () => null });
    expect(plain.markdown).toContain('| `a` | `Foo` |');
    const onPage = R(idx, 'm', { show_root_heading: true });
    expect(onPage.markdown).toContain('[`Foo`](#m.Foo)');
  });
  it('does not link builtins/typing or private targets', () => {
    const idx = mini({ _Priv: { kind: 'class', name: '_Priv', members: {}, docstring: { value: 'p' } }, g: fn('g', [param('a', 'positional or keyword', N('_Priv')), param('b', 'positional or keyword', N('str'))]) });
    expect(R(idx, 'm.g', { show_signature_annotations: true }).refs).toEqual([]);
  });
});

describe('signatures', () => {
  it('formats kinds: positional-only /, keyword-only *, *args, **kwargs, defaults', () => {
    const idx = mini({
      f: fn('f', [
        param('a', 'positional-only'), param('b', 'positional-only', null, '1'),
        param('c', 'positional or keyword', null, "'x'"),
        param('rest', 'variadic positional'), param('d', 'keyword-only', null, 'None'), param('kw', 'variadic keyword'),
      ]),
      g: fn('g', [param('a'), param('k', 'keyword-only', N('int'), '3'), param('o', 'keyword-only')], N('int')),
    });
    expect(sig(R(idx, 'm.f').markdown)).toBe("def f(a, b=1, /, c='x', *rest, d=None, **kw)");
    expect(sig(R(idx, 'm.g').markdown)).toBe('def g(a, *, k=3, o)');
    expect(sig(R(idx, 'm.g', { show_signature_annotations: true }).markdown)).toBe('def g(a, *, k: int = 3, o) -> int');
  });
  it('drops self/cls of methods and the / that only covered them', () => {
    const idx = mini({ C: { kind: 'class', name: 'C', docstring: { value: 'C.' }, bases: [], members: {
      m: fn('m', [param('self', 'positional-only'), param('x')]),
      s: fn('s', [param('x')], null, { labels: ['staticmethod'] }),
    } } });
    const md = R(idx, 'm.C', { members: ['m', 's'] }).markdown;
    expect(md).toContain('def m(x)');
    expect(md).toContain('def s(x)');
  });
  it('wraps long signatures one parameter per line, black style', () => {
    const md = R(shapes, 'shapes.scale').markdown;
    expect(sig(md)).toBe('def scale(\n    shape,\n    factor=2.0,\n    *,\n    in_place=False,\n    options=None,\n    another_long_argument=(1, 2, 3),\n)');
  });
  it('class signature shows bases; decorators, async and overloads', () => {
    expect(sig(R(shapes, 'shapes.Circle').markdown)).toBe('class Circle(Shape)');
    expect(sig(R(shapes, 'shapes.Point').markdown)).toBe('@dataclass\nclass Point');
    const idx = mini({ f: fn('f', [param('x')], null, { labels: ['async'], decorators: [{ value: { cls: 'ExprCall', function: N('retry'), arguments: ['3'] } }, { value: N('property') }],
      overloads: [fn('f', [param('x', 'positional or keyword', N('int'))], N('int'), { labels: ['async'] })] }) });
    expect(sig(R(idx, 'm.f', { show_signature_annotations: true }).markdown)).toBe('@overload\nasync def f(x: int) -> int\n\n@retry(3)\nasync def f(x)');
  });
  it('attributes show value, property labels, and a Type line', () => {
    const md = R(shapes, 'shapes.Shape', { members: ['sides', 'label'] }).markdown;
    expect(md).toContain('sides = 0');
    expect(md).toMatch(/`property`/);
    expect(md).toContain('**Type:** `str`');
  });
  it('show_signature=false hides the block', () => {
    expect(R(shapes, 'shapes.scale', { show_signature: false }).markdown).not.toContain('```python');
  });
});

describe('docstring sections', () => {
  const md = renderObject(shapes, 'shapes', { members: ['Shape', 'Circle', 'scale', 'area'], show_root_heading: true }).markdown;
  it('parameters table with type, description, default; escapes pipes', () => {
    expect(md).toContain('| Name | Type | Description | Default |');
    expect(md).toContain('| `color` | [`Color`][shapes._core.Color] | The color \\| with a pipe. | `Color.RED` |');
    expect(md).toContain('| `**extra` | `Any` | Extra options. |');
  });
  it('falls back to signature types and *required*', () => {
    expect(md).toContain('| `shape` | [`Shape`](#shapes._core.Shape) | The shape. | *required* |');
    expect(md).toContain('| `in_place` | `bool` | Mutate in place. | `False` |');
  });
  it('other parameters, returns, yields, raises, warns', () => {
    const full = renderObject(shapes, 'shapes.Circle', { members: ['grow'], show_signature_annotations: true }).markdown;
    expect(md).toContain('**Other Parameters:**');
    expect(md).toContain('| Type | Description |\n| --- | --- |\n| [`Shape`](#shapes._core.Shape) | The scaled shape. |');
    expect(full).toContain('**Yields:**');
    expect(full).toContain('| `UserWarning` | When factor is huge. |');
    expect(md).toContain('**Raises:**');
    expect(md).toContain('| `ValueError` | If the name is empty. |');
  });
  it('google "Type: description" returns without annotation use the type text', () => {
    expect(md).toContain('| `float` | The area. |');
  });
  it('merges the per-line items Griffe makes of one unnamed multi-line return, but not for tuple returns', () => {
    const items = ['first line', 'second line'].map((description) => ({ annotation: N('int'), description, name: '' }));
    const doc = { value: 'x', parsed: [{ kind: 'text', value: 'x' }, { kind: 'returns', value: items }] };
    const one = mini({ f: fn('f', [], N('int'), { docstring: doc }) });
    expect(renderObject(one, 'm.f').markdown).toContain('| `int` | first line<br>second line |');
    const tup = { cls: 'ExprSubscript', left: N('tuple'), slice: { cls: 'ExprTuple', elements: [N('int'), N('int')] } };
    const two = mini({ f: fn('f', [], tup, { docstring: doc }) });
    const md2 = renderObject(two, 'm.f').markdown;
    expect(md2).toContain('first line |');
    expect(md2).toContain('second line |');
  });
  it('examples become pycon blocks around prose', () => {
    expect(md).toContain('**Examples:**\n\nBasic usage:\n\n```pycon\n>>> Shape("a").area()\n0.0\n```\n\nAnother one.');
  });
  it('admonitions and deprecated become wc-callout with blank lines around the body', () => {
    expect(md).toContain('<wc-callout type="note" title="Note">\n\nSubclass it, don\'t instantiate it.\n\n</wc-callout>');
    expect(md).toContain('<wc-callout type="warning" title="Careful!">');
    expect(md).toContain('<wc-callout type="tip" title="Tip">');
    expect(md).toContain('<wc-callout type="warning" title="Deprecated">');
    const dep = mini({ f: fn('f', [], null, { docstring: { value: 'x', parsed: [{ kind: 'deprecated', value: { version: '2.0', description: 'Use g.' } }] } }) });
    expect(renderObject(dep, 'm.f').markdown).toContain('<wc-callout type="warning" title="Deprecated since 2.0">\n\nUse g.\n\n</wc-callout>');
  });
  it('attributes section is a Name | Type | Description table', () => {
    expect(md).toContain('| Name | Type | Description |\n| --- | --- | --- |\n| `name` | `str` | Shape name. |');
  });
  it('list style', () => {
    const l = renderObject(shapes, 'shapes.scale', { docstring_section_style: 'list' }).markdown;
    expect(l).toContain('- `factor` (`float`, default: `2.0`) – The factor.');
    expect(l).not.toContain('| Name |');
  });
  it('numpy and sphinx dumps render', () => {
    const np = renderObject(loadApi(read('numpy.json')), 'numpy_pkg.Stats.mean', { show_root_heading: true }).markdown;
    expect(np).toContain('| `axis` | `int` | Axis to use. | `None` |');
    expect(np).toContain('| `weights` | `array_like` | Weights \\| pipes. | `None` |');
    expect(np).toContain('```pycon\n>>> Stats().mean()\n1.0\n```');
    const sp = renderObject(loadApi(read('sphinx.json')), 'sphinx_pkg.f').markdown;
    expect(sp).toContain('| `a` | `int` | First arg. | *required* |');
    expect(sp).toContain('| `int` | The sum. |');
  });
  it('multi-line descriptions collapse to <br> inside table cells', () => {
    const idx = mini({ f: fn('f', [param('a')], null, { docstring: { value: 'x', parsed: [{ kind: 'parameters', value: [{ name: 'a', annotation: null, description: 'Line one\nline | two' }] }] } }) });
    expect(renderObject(idx, 'm.f').markdown).toContain('| `a` | Line one<br>line \\| two | *required* |');
  });
});

describe('options', () => {
  const heads = (md) => md.split('\n').filter(l => /^#{1,6} /.test(l));
  it('heading levels: root at heading_level, +1 per nesting; hidden root keeps members at heading_level', () => {
    const shown = renderObject(shapes, 'shapes.Shape', { show_root_heading: true, heading_level: 3 });
    expect(heads(shown.markdown)[0]).toBe('### shapes.Shape <a id="shapes.Shape"></a>');
    expect(heads(shown.markdown)[1]).toMatch(/^#### /);
    const hidden = renderObject(shapes, 'shapes.Shape', { heading_level: 2 });
    expect(heads(hidden.markdown).every(h => h.startsWith('## '))).toBe(true);
    expect(hidden.markdown).toContain('<a id="shapes.Shape"></a>');
    expect(renderObject(shapes, 'shapes.Shape', { show_root_heading: true, heading_level: 6 }).markdown).toMatch(/^###### /m);
  });
  it('every heading carries the full-path anchor; anchors list matches', () => {
    const r = renderObject(shapes, 'shapes.Shape', { show_root_heading: true });
    expect(r.markdown).toContain('#### area <a id="shapes.Shape.area"></a>'.replace('####', '###'));
    const ids = r.anchors.map(a => a.id);
    expect(ids).toContain('shapes.Shape');
    expect(ids).toContain('shapes.Shape.area');
    expect(r.anchors.find(a => a.id === 'shapes.Shape.area')).toMatchObject({ title: 'area', level: 3 });
    expect(r.anchors.find(a => a.id === 'shapes._core.Shape').toc).toBe(false);
  });
  it('pageAnchorPrefix prefixes html ids and local links but not anchors[].id', () => {
    const r = renderObject(shapes, 'shapes.Shape', { show_root_heading: true }, { pageAnchorPrefix: 'p-' });
    expect(r.markdown).toContain('<a id="p-shapes.Shape.area"></a>');
    expect(r.anchors.find(a => a.id === 'shapes.Shape.area')).toMatchObject({ anchor: 'p-shapes.Shape.area' });
  });
  it('members: list (explicit order, bypasses filters), false', () => {
    const r = renderObject(shapes, 'shapes.Shape', { members: ['kinds', '_hidden', 'area'], show_root_heading: true });
    expect(r.anchors.map(a => a.id).filter(i => !i.includes('_core'))).toEqual(['shapes.Shape', 'shapes.Shape.kinds', 'shapes.Shape._hidden', 'shapes.Shape.area']);
    expect(renderObject(shapes, 'shapes.Shape', { members: false, show_root_heading: true }).anchors.filter(a => a.toc !== false)).toHaveLength(1);
    const missing = renderObject(shapes, 'shapes.Shape', { members: ['nope'] });
    expect(missing.warnings.join()).toMatch(/"nope" not found/);
  });
  it('default filters hide _private but keep documented dunders; show_if_no_docstring', () => {
    const base = renderObject(shapes, 'shapes.Shape', { show_root_heading: true }).anchors.map(a => a.id);
    expect(base).toContain('shapes.Shape.__init__');
    expect(base).not.toContain('shapes.Shape._hidden');
    expect(base).not.toContain('shapes.Shape.__repr__');
    expect(base).not.toContain('shapes.Shape.undocumented');
    const all = renderObject(shapes, 'shapes.Shape', { show_if_no_docstring: true, filters: [] }).anchors.map(a => a.id);
    expect(all).toContain('shapes.Shape.undocumented');
    expect(all).toContain('shapes.Shape._hidden');
  });
  it('custom filters: include-only and negation', () => {
    const only = renderObject(shapes, 'shapes.Shape', { filters: ['^ar'], show_if_no_docstring: true }).anchors.map(a => a.id);
    expect(only.filter(i => !i.includes('_core'))).toEqual(['shapes.Shape', 'shapes.Shape.area']);
    const neg = renderObject(shapes, 'shapes.Shape', { filters: ['!^area$', '!^_'] }).anchors.map(a => a.id);
    expect(neg).not.toContain('shapes.Shape.area');
    expect(neg).toContain('shapes.Shape.kinds');
    expect(renderObject(shapes, 'shapes.Shape', { filters: ['('] }).warnings.join()).toMatch(/Invalid filter/);
  });
  it('members_order alphabetical vs source; group_by_category', () => {
    const ids = (o) => renderObject(shapes, 'shapes.Shape', o).anchors.filter(a => a.toc !== false).map(a => a.title);
    const grouped = ids({ group_by_category: true }).slice(1);
    expect(grouped.slice(0, 2)).toEqual(['sides', 'label']); // attributes first
    expect(ids({ group_by_category: false, members_order: 'source' }).slice(1)).toEqual(['sides', '__init__', 'label', 'unit', 'kinds', 'area']);
    expect(ids({ group_by_category: false, members_order: 'alphabetical' }).slice(1)).toEqual(['__init__', 'area', 'kinds', 'label', 'sides', 'unit']);
  });
  it('inherited_members pulls members from bases found in the index', () => {
    const own = renderObject(shapes, 'shapes.Circle', {}).anchors.map(a => a.id);
    expect(own).not.toContain('shapes.Circle.unit');
    const inh = renderObject(shapes, 'shapes.Circle', { inherited_members: true });
    expect(inh.anchors.map(a => a.id)).toEqual(expect.arrayContaining(['shapes.Circle.unit', 'shapes.Circle.kinds', 'shapes.Circle.area', 'shapes.Circle.grow']));
    expect(inh.anchors.filter(a => a.id === 'shapes.Circle.area')).toHaveLength(1);
    const some = renderObject(shapes, 'shapes.Circle', { inherited_members: ['unit'] }).anchors.map(a => a.id);
    expect(some).toContain('shapes.Circle.unit');
    expect(some).not.toContain('shapes.Circle.kinds');
  });
  it('show_bases=false', () => {
    expect(renderObject(shapes, 'shapes.Circle', { show_root_heading: true }).markdown).toContain('**Bases:**');
    expect(renderObject(shapes, 'shapes.Circle', { show_root_heading: true, show_bases: false }).markdown).not.toContain('**Bases:**');
  });
  it('unknown options warn; known-but-unsupported mkdocstrings options are silent', () => {
    const w = [];
    normalizeOptions({ bogus: 1, docstring_style: 'google', heading_level: '4', members_order: 'x' }, w);
    expect(w.join('|')).toMatch(/Unknown option "bogus"/);
    expect(w.join('|')).toMatch(/members_order/);
    expect(w.join('|')).not.toMatch(/docstring_style/);
    expect(renderObject(shapes, 'shapes.scale', { bogus: true }).warnings).toEqual(['Unknown option "bogus" ignored']);
  });
});

describe('aliases and lookup', () => {
  it('module render includes exported re-exports under the public name, with canonical anchor too', () => {
    const r = renderObject(shapes, 'shapes', { show_root_heading: true });
    const ids = r.anchors.map(a => a.id);
    expect(ids).toEqual(expect.arrayContaining(['shapes.Shape', 'shapes._core.Shape', 'shapes.scale', 'shapes.VERSION', 'shapes.helper_alias']));
    expect(r.markdown).toContain('### helper_alias <a id="shapes.helper_alias"></a>');
    expect(r.markdown).toContain('def helper_alias(x=1)');
    expect(ids).not.toContain('shapes._core'); // submodules are not auto-rendered
  });
  it('resolves an id through an alias and a canonical id alike', () => {
    expect(renderObject(shapes, 'shapes.Shape.area').markdown).toContain('Compute area.');
    expect(renderObject(shapes, 'shapes._core.Shape.area').markdown).toContain('Compute area.');
    expect(renderObject(shapes, 'shapes.Shape', { show_root_heading: true }).anchors[0].id).toBe('shapes.Shape');
  });
  it('unknown id -> warning and empty output; dangling alias -> warning', () => {
    const r = renderObject(shapes, 'shapes.Nope');
    expect(r).toEqual({ markdown: '', anchors: [], refs: [], warnings: ['Python object "shapes.Nope" not found in the API data'] });
    const dangling = mini({ X: { kind: 'alias', name: 'X', target_path: 'other.X' } });
    expect(renderObject(dangling, 'm.X').warnings[0]).toMatch(/alias to "other.X"/);
  });
  it('alias cycles do not hang', () => {
    const idx = mini({ A: { kind: 'alias', name: 'A', target_path: 'm.B' }, B: { kind: 'alias', name: 'B', target_path: 'm.A' } });
    expect(renderObject(idx, 'm.A').warnings).toHaveLength(1);
  });
});

describe('raw docstring fallback', () => {
  const raw = loadApi(read('shapes-raw.json'));
  it('renders unparsed docstrings as Markdown text, with signature and headings intact', () => {
    const md = renderObject(raw, 'shapes._core.Shape.area', { show_root_heading: true }).markdown;
    expect(md).toContain('Compute area.');
    expect(md).toContain('Returns:\n    The area.'); // raw, nothing parsed by us
    expect(md).not.toContain('| Type | Description |');
    expect(sig(md)).toBe('def area()');
  });
  it('paths are derived from nesting when the dump has none', () => {
    const r = renderObject(raw, 'shapes._core.Shape', { show_root_heading: true });
    expect(r.anchors.map(a => a.id)).toContain('shapes._core.Shape.area');
  });
});

describe('httpx.Client (trimmed real dump)', () => {
  const httpx = loadApi(read('httpx-trimmed.json'));
  it('renders without throwing, with expected headings, anchors and bases', () => {
    const r = renderObject(httpx, 'httpx.Client', { show_root_heading: true, members_order: 'source' });
    expect(r.warnings).toEqual([]);
    expect(r.markdown).toContain('## httpx.Client <a id="httpx.Client"></a>');
    for (const m of ['request', 'get', 'post', 'send', 'close']) expect(r.markdown).toContain(`### ${m} <a id="httpx.Client.${m}"></a>`);
    expect(r.markdown).toContain('class Client(BaseClient)');
    expect(r.markdown).toContain('[`BaseClient`][httpx._client.BaseClient]');
    expect(r.refs).toContain('httpx._client.BaseClient');
    expect(r.anchors.length).toBeGreaterThan(10);
  });
  it('full annotations and inherited members work on the real shape', () => {
    const r = renderObject(httpx, 'httpx.Client', { show_root_heading: true, show_signature_annotations: true, inherited_members: true, members: ['get', 'build_request'] });
    expect(r.markdown).toContain('def get(');
    expect(r.markdown).toContain('url: URL | str');
    expect(r.markdown).toContain('### build_request <a id="httpx.Client.build_request"></a>');
  });
});
