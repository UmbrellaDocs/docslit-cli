/**
 * Python API reference renderer (mkdocstrings replacement).
 *
 * Pure module: no fs, no network, no Python. Input is a Griffe JSON dump
 * (`griffe dump <pkg> --full --resolve-aliases`); output is DocsLit Markdown.
 *
 *   loadApi(jsonText | object)                 -> ApiIndex
 *   renderObject(index, id, options, ctx)      -> { markdown, anchors, refs, warnings }
 *
 * ctx (all optional):
 *   pageAnchorPrefix  string prepended to every emitted HTML anchor id (ids returned in `anchors[].id` stay bare)
 *   linkFor(id)       -> url | null. Called for every cross-reference candidate that is not rendered on the
 *                        same page. When provided, null means "leave as plain text"; when absent, resolvable
 *                        names become autorefs tokens `[Name][full.path]` and are listed in `refs`.
 */

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export const DEFAULT_OPTIONS = Object.freeze({
  members: true,
  filters: ['!^_[^_]'],
  show_root_heading: false,
  show_root_toc_entry: true,
  heading_level: 2,
  show_source: false,
  show_signature: true,
  show_signature_annotations: false,
  separate_signature: false,
  members_order: 'source',
  inherited_members: false,
  docstring_section_style: 'table',
  show_if_no_docstring: false,
  show_bases: true,
  group_by_category: true,
});

// mkdocstrings-python options we recognise but do not act on (no warning).
const IGNORED_OPTIONS = new Set([
  'docstring_style', 'docstring_options', 'merge_init_into_class', 'show_category_heading',
  'show_root_full_path', 'show_root_members_full_path', 'show_object_full_path', 'show_submodules',
  'summary', 'heading', 'toc_label', 'show_labels', 'show_docstring_attributes', 'show_docstring_functions',
  'show_docstring_classes', 'show_docstring_modules', 'show_docstring_description',
  'show_docstring_other_parameters', 'show_docstring_parameters', 'show_docstring_raises',
  'show_docstring_receives', 'show_docstring_returns', 'show_docstring_warns', 'show_docstring_yields',
  'show_docstring_examples', 'show_symbol_type_heading', 'show_symbol_type_toc', 'signature_crossrefs',
  'line_length', 'preload_modules', 'allow_inspection', 'force_inspection', 'annotations_path',
  'relative_crossrefs', 'scoped_crossrefs', 'extensions', 'modernize_annotations', 'parameter_headings',
  'backlinks', 'show_inheritance_diagram', 'unwrap_annotated', 'skip_local_inventory', 'find_stubs_package',
  'show_overloads', 'handler',
]);

export function normalizeOptions(input, warnings = []) {
  const o = { ...DEFAULT_OPTIONS };
  const src = input && typeof input === 'object' ? input : {};
  for (const [k, v] of Object.entries(src)) {
    if (k === 'options' && v && typeof v === 'object') continue; // tolerate a stray wrapper
    if (!(k in DEFAULT_OPTIONS)) {
      if (!IGNORED_OPTIONS.has(k)) warnings.push(`Unknown option "${k}" ignored`);
      continue;
    }
    if (v === undefined) continue;
    o[k] = v;
  }
  for (const k of ['show_root_heading', 'show_root_toc_entry', 'show_source', 'show_signature',
    'show_signature_annotations', 'separate_signature', 'show_if_no_docstring', 'show_bases', 'group_by_category']) {
    o[k] = toBool(o[k], DEFAULT_OPTIONS[k]);
  }
  const hl = Number.parseInt(o.heading_level, 10);
  o.heading_level = Number.isFinite(hl) ? Math.min(6, Math.max(1, hl)) : 2;
  if (o.members_order !== 'alphabetical' && o.members_order !== 'source') {
    warnings.push(`Invalid members_order "${o.members_order}", using "source"`);
    o.members_order = 'source';
  }
  o.docstring_section_style = o.docstring_section_style === 'list' ? 'list' : 'table';
  return o;
}

function toBool(v, d) {
  if (typeof v === 'boolean') return v;
  if (v === 'true' || v === 'yes' || v === 1) return true;
  if (v === 'false' || v === 'no' || v === 0) return false;
  return d;
}

// ---------------------------------------------------------------------------
// Index
// ---------------------------------------------------------------------------

/**
 * Parse a Griffe dump and index every object by its full dotted path.
 * Accepts the JSON text or an already-parsed object; the dump root may be
 * `{ pkg: module }` (what `griffe dump` writes) or a single module object.
 * Aliases stay as `kind: "alias"` nodes carrying `target_path`; use the
 * lookups in renderObject to follow them.
 */
export function loadApi(input) {
  let data = input;
  if (typeof input === 'string') {
    try { data = JSON.parse(input); } catch (e) { throw new Error(`Invalid Griffe JSON: ${e.message}`); }
  }
  if (!data || typeof data !== 'object') throw new Error('Invalid Griffe JSON: expected an object');
  const roots = [];
  if (typeof data.kind === 'string') roots.push([data.name, data]);
  else for (const [k, v] of Object.entries(data)) if (v && typeof v === 'object' && typeof v.kind === 'string') roots.push([k, v]);
  if (!roots.length) throw new Error('Invalid Griffe JSON: no package found');

  const index = { nodes: new Map(), roots: [], aliasesByTarget: new Map(), packages: [] };
  for (const [name, raw] of roots) {
    const node = addNode(index, raw, name, null);
    index.roots.push(node);
    index.packages.push(node.path);
  }
  for (const n of index.nodes.values()) {
    if (n.kind === 'alias' && n.raw.target_path) {
      const list = index.aliasesByTarget.get(n.raw.target_path) || [];
      list.push(n.path);
      index.aliasesByTarget.set(n.raw.target_path, list);
    }
  }
  return index;
}

function addNode(index, raw, name, parent) {
  const nm = raw.name || name;
  const path = raw.path || (parent ? `${parent.path}.${nm}` : nm);
  const node = { raw, name: nm, path, kind: raw.kind, parent, members: new Map(), order: 0 };
  index.nodes.set(path, node);
  let members = raw.members;
  if (Array.isArray(members)) members = Object.fromEntries(members.map(m => [m.name, m]));
  if (members && typeof members === 'object') {
    let i = 0;
    for (const [k, v] of Object.entries(members)) {
      if (!v || typeof v !== 'object') continue;
      const child = addNode(index, v, k, node);
      child.order = i++;
      node.members.set(k, child);
    }
  }
  return node;
}

/** Follow alias chains inside the index. Returns { node|null, path } (path = final target path). */
function followAlias(index, node) {
  let cur = node;
  const seen = new Set();
  while (cur && cur.kind === 'alias') {
    if (seen.has(cur.path)) return { node: null, path: cur.raw.target_path || cur.path };
    seen.add(cur.path);
    const tp = cur.raw.target_path;
    const next = tp ? index.nodes.get(tp) : null;
    if (!next) return { node: null, path: tp || cur.path };
    cur = next;
  }
  return { node: cur, path: cur ? cur.path : null };
}

/** Find a node by id, walking through aliases when the id passes through one. */
function lookup(index, id) {
  const direct = index.nodes.get(id);
  if (direct) return { node: direct, display: id };
  const parts = id.split('.');
  for (let i = parts.length - 1; i >= 1; i--) {
    const prefix = index.nodes.get(parts.slice(0, i).join('.'));
    if (!prefix) continue;
    let cur = followAlias(index, prefix).node;
    for (let j = i; j < parts.length && cur; j++) {
      const next = cur.members.get(parts[j]);
      cur = next ? (next.kind === 'alias' ? followAlias(index, next).node : next) : null;
    }
    if (cur) return { node: cur, display: id };
    return null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Name resolution + expressions
// ---------------------------------------------------------------------------

function resolveName(rc, owner, name) {
  const { index } = rc;
  for (let n = owner; n; n = n.parent) {
    if (n.kind !== 'class' && n.kind !== 'module') continue;
    const m = n.members.get(name);
    if (m) return m.kind === 'alias' ? followAlias(index, m).path : m.path;
    if (n.kind === 'module' && n.raw.imports && n.raw.imports[name]) return n.raw.imports[name];
  }
  return null;
}

const SIMPLE_NAME = /^[A-Za-z_][\w]*(\.[A-Za-z_][\w]*)*$/;

function pathFromDotted(rc, owner, text) {
  const parts = text.split('.');
  const head = resolveName(rc, owner, parts[0]);
  if (!head) return null;
  return [head, ...parts.slice(1)].join('.');
}

const SPACED_OPS = new Set(['and', 'or', 'in', 'is', 'not in', 'is not', 'not']);

/** Expression tree -> array of { t: text, path?: canonicalPath } */
function exprParts(rc, owner, e) {
  const out = [];
  const push = (t, path) => { if (t !== '') out.push(path ? { t, path } : { t }); };
  const add = (x) => { for (const p of exprParts(rc, owner, x)) out.push(p); };
  const join = (items, sep) => items.forEach((x, i) => { if (i) push(sep); add(x); });

  if (e === null || e === undefined) return out;
  if (typeof e === 'string') { push(e); return out; }
  if (typeof e === 'number' || typeof e === 'boolean') { push(String(e)); return out; }
  if (Array.isArray(e)) { join(e, ', '); return out; }

  switch (e.cls) {
    case 'ExprName': {
      push(e.name, resolveName(rc, owner, e.name) || undefined);
      break;
    }
    case 'ExprAttribute': {
      const vals = e.values || [];
      const allNames = vals.every(v => v && v.cls === 'ExprName');
      if (allNames && vals.length) {
        const text = vals.map(v => v.name).join('.');
        push(text, pathFromDotted(rc, owner, text) || undefined);
      } else {
        vals.forEach((v, i) => { if (i) push('.'); add(v); });
      }
      break;
    }
    case 'ExprBinOp': add(e.left); push(` ${e.operator} `); add(e.right); break;
    case 'ExprBoolOp': join(e.values || [], ` ${e.operator} `); break;
    case 'ExprUnaryOp': push(SPACED_OPS.has(e.operator) ? `${e.operator} ` : e.operator); add(e.value); break;
    case 'ExprCompare': {
      add(e.left);
      (e.operators || []).forEach((op, i) => { push(` ${op} `); add((e.comparators || [])[i]); });
      break;
    }
    case 'ExprSubscript': {
      add(e.left); push('[');
      if (e.slice && e.slice.cls === 'ExprTuple' && e.slice.implicit) join(e.slice.elements || [], ', ');
      else add(e.slice);
      push(']');
      break;
    }
    case 'ExprTuple': {
      const els = e.elements || [];
      if (e.implicit) { join(els, ', '); break; }
      push('('); join(els, ', '); if (els.length === 1) push(','); push(')');
      break;
    }
    case 'ExprList': push('['); join(e.elements || [], ', '); push(']'); break;
    case 'ExprSet': push('{'); join(e.elements || [], ', '); push('}'); break;
    case 'ExprDict': {
      push('{');
      (e.keys || []).forEach((k, i) => {
        if (i) push(', ');
        if (k === null || k === undefined) { push('**'); add((e.values || [])[i]); }
        else { add(k); push(': '); add((e.values || [])[i]); }
      });
      push('}');
      break;
    }
    case 'ExprCall': add(e.function); push('('); join(e.arguments || [], ', '); push(')'); break;
    case 'ExprKeyword': push(`${e.name}=`); add(e.value); break;
    case 'ExprVarPositional': push('*'); add(e.value); break;
    case 'ExprVarKeyword': push('**'); add(e.value); break;
    case 'ExprConstant': push(String(e.value ?? e.name ?? '')); break;
    case 'ExprIfExp': add(e.body); push(' if '); add(e.test); push(' else '); add(e.orelse); break;
    case 'ExprNamedExpr': add(e.target); push(' := '); add(e.value); break;
    case 'ExprAwait': push('await '); add(e.value); break;
    case 'ExprYield': push('yield'); if (e.value) { push(' '); add(e.value); } break;
    case 'ExprYieldFrom': push('yield from '); add(e.value); break;
    case 'ExprStarred': push('*'); add(e.value); break;
    case 'ExprSlice': {
      if (e.lower) add(e.lower);
      push(':'); if (e.upper) add(e.upper);
      if (e.step) { push(':'); add(e.step); }
      break;
    }
    case 'ExprLambda': {
      push('lambda');
      const ps = (e.parameters || []).map(p => (p && p.name ? p.name : String(p)));
      if (ps.length) push(` ${ps.join(', ')}`);
      push(': '); add(e.body);
      break;
    }
    case 'ExprListComp': push('['); add(e.element); push(' '); join(e.generators || [], ' '); push(']'); break;
    case 'ExprSetComp': push('{'); add(e.element); push(' '); join(e.generators || [], ' '); push('}'); break;
    case 'ExprGeneratorExp':
      if (!e.implicit) push('(');
      add(e.element); push(' '); join(e.generators || [], ' ');
      if (!e.implicit) push(')');
      break;
    case 'ExprDictComp': push('{'); add(e.key); push(': '); add(e.value); push(' '); join(e.generators || [], ' '); push('}'); break;
    case 'ExprComprehension': {
      push(e.is_async ? 'async for ' : 'for '); add(e.target); push(' in '); add(e.iterable);
      for (const c of e.conditions || []) { push(' if '); add(c); }
      break;
    }
    case 'ExprJoinedStr': {
      push('f"');
      for (const v of e.values || []) {
        if (typeof v === 'string') push(v.replace(/^f?(['"])(.*)\1$/s, '$2'));
        else add(v);
      }
      push('"');
      break;
    }
    case 'ExprFormatted': {
      push('{'); add(e.value);
      if (e.conversion && e.conversion > 0) push(`!${String.fromCharCode(e.conversion)}`);
      if (e.format_spec) { push(':'); add(e.format_spec); }
      push('}');
      break;
    }
    default: {
      if (e.name) push(String(e.name));
      else if ('value' in e) add(e.value);
      else rc.warnings.add(`Unsupported expression type "${e.cls}" rendered as "..."`), push('...');
    }
  }
  return out;
}

function partsText(parts) { return parts.map(p => p.t).join(''); }
function exprText(rc, owner, e) { return partsText(exprParts(rc, owner, e)); }

function codeSpan(text) {
  if (!text) return '';
  if (text.includes('`')) return `\`\` ${text} \`\``;
  return `\`${text}\``;
}

/** Decide how a resolved path is linked. Returns Markdown url/ref info or null. */
function linkTarget(rc, path) {
  if (!path) return null;
  const { index } = rc;
  const target = index.nodes.get(path);
  if (!target) return null;
  if (rc.localIds.has(path)) return { local: `#${rc.prefix}${path}` };
  const candidates = [path, ...[...(index.aliasesByTarget.get(path) || [])].sort((a, b) => a.split('.').length - b.split('.').length)];
  if (rc.ctx.linkFor) {
    for (const c of candidates) {
      if (rc.localIds.has(c)) return { local: `#${rc.prefix}${c}` };
      const url = rc.ctx.linkFor(c);
      if (url) return { url };
    }
    return null;
  }
  const last = path.split('.').pop();
  if (last.startsWith('_') && !(last.startsWith('__') && last.endsWith('__'))) return null; // private target
  rc.refs.add(path);
  return { ref: path };
}

/** Parts -> inline Markdown: code spans with links for resolvable names. */
function partsToMd(rc, parts) {
  const out = [];
  let run = '';
  const flush = () => {
    if (!run) return;
    const lead = /^\s+/.exec(run);
    const trail = /\s+$/.exec(run.slice(lead ? lead[0].length : 0));
    const core = run.trim();
    if (lead) out.push(' ');
    if (core) out.push(codeSpan(core));
    if (trail) out.push(' ');
    run = '';
  };
  for (const p of parts) {
    const target = p.path ? linkTarget(rc, p.path) : null;
    if (!target) { run += p.t; continue; }
    flush();
    const text = codeSpan(p.t);
    if (target.local) out.push(`[${text}](${target.local})`);
    else if (target.url) out.push(`[${text}](${target.url})`);
    else out.push(`[${text}][${target.ref}]`);
  }
  flush();
  return out.join('');
}

/** Docstring annotations are an expression, a plain string, or null. */
function annotationMd(rc, owner, ann) {
  if (ann === null || ann === undefined || ann === '') return '';
  if (typeof ann === 'string') {
    if (SIMPLE_NAME.test(ann)) return partsToMd(rc, [{ t: ann, path: pathFromDotted(rc, owner, ann) || undefined }]);
    return codeSpan(ann);
  }
  return partsToMd(rc, exprParts(rc, owner, ann));
}

// ---------------------------------------------------------------------------
// Signatures
// ---------------------------------------------------------------------------

const LINE_LENGTH = 88;
const HIDDEN_DECORATORS = new Set(['property', 'classmethod', 'staticmethod', 'abstractmethod', 'overload',
  'abc.abstractmethod', 'typing.overload', 'cached_property', 'functools.cached_property']);

function formatParams(rc, node, params, opts) {
  const isMethod = node.parent && node.parent.kind === 'class';
  const labels = node.raw.labels || [];
  let list = params.slice();
  if (isMethod && list.length && !labels.includes('staticmethod') && /^(self|cls)$/.test(list[0].name)) list = list.slice(1);

  const out = [];
  const lastPosOnly = list.map(p => p.kind).lastIndexOf('positional-only');
  const hasVarPos = list.some(p => p.kind === 'variadic positional');
  let starEmitted = false;
  list.forEach((p, i) => {
    if (p.kind === 'keyword-only' && !hasVarPos && !starEmitted) { out.push('*'); starEmitted = true; }
    const prefix = p.kind === 'variadic positional' ? '*' : p.kind === 'variadic keyword' ? '**' : '';
    let s = prefix + p.name;
    const ann = opts.show_signature_annotations && p.annotation ? exprText(rc, node, p.annotation) : '';
    const variadic = prefix !== '';
    const def = !variadic && p.default !== null && p.default !== undefined ? exprText(rc, node, p.default) : '';
    if (ann) s += `: ${ann}`;
    if (def) s += ann ? ` = ${def}` : `=${def}`;
    out.push(s);
    if (i === lastPosOnly) out.push('/');
  });
  return out;
}

function wrapSignature(head, params, tail) {
  const oneLine = `${head}(${params.join(', ')})${tail}`;
  if (oneLine.length <= LINE_LENGTH || params.length === 0) return oneLine;
  return `${head}(\n${params.map(p => `    ${p},`).join('\n')}\n)${tail}`;
}

function functionSignature(rc, node, opts, raw = node.raw) {
  const labels = raw.labels || [];
  const kw = labels.includes('async') ? 'async def' : 'def';
  const params = formatParams(rc, node, raw.parameters || [], opts);
  const ret = opts.show_signature_annotations && raw.returns ? ` -> ${exprText(rc, node, raw.returns)}` : '';
  return wrapSignature(`${kw} ${rc.names.get(node.path) || node.name}`, params, ret);
}

function decoratorLines(rc, node) {
  const lines = [];
  for (const d of node.raw.decorators || []) {
    const text = exprText(rc, node, d.value);
    if (HIDDEN_DECORATORS.has(text)) continue;
    lines.push(`@${text}`);
  }
  return lines;
}

function classSignature(rc, node) {
  const bases = (node.raw.bases || []).map(b => exprText(rc, node.parent || node, b));
  const head = `class ${rc.names.get(node.path) || node.name}`;
  if (!bases.length) return head;
  const oneLine = `${head}(${bases.join(', ')})`;
  if (oneLine.length <= LINE_LENGTH) return oneLine;
  return `${head}(\n${bases.map(b => `    ${b},`).join('\n')}\n)`;
}

function attributeSignature(rc, node, opts) {
  const r = node.raw;
  const isProp = (r.labels || []).includes('property');
  const dn = rc.names.get(node.path) || node.name;
  let s = dn;
  if (opts.show_signature_annotations && r.annotation) s += `: ${exprText(rc, node, r.annotation)}`;
  if (!isProp && r.value !== null && r.value !== undefined) {
    const v = exprText(rc, node, r.value);
    if (v && v.length <= 200 && !v.includes('\n')) s += ` = ${v}`;
  }
  return s;
}

function signatureBlock(rc, node, opts) {
  let body = '';
  if (node.kind === 'function') {
    const parts = [];
    const overloads = Array.isArray(node.raw.overloads) ? node.raw.overloads : [];
    for (const o of overloads) parts.push(`@overload\n${functionSignature(rc, node, opts, o)}`);
    const deco = decoratorLines(rc, node);
    parts.push([...deco, functionSignature(rc, node, opts)].join('\n'));
    body = parts.join('\n\n');
  } else if (node.kind === 'class') {
    body = [...decoratorLines(rc, node), classSignature(rc, node)].join('\n');
  } else if (node.kind === 'attribute') {
    body = attributeSignature(rc, node, opts);
    if (body === (rc.names.get(node.path) || node.name)) return '';
  } else return '';
  return `\`\`\`python\n${body}\n\`\`\``;
}

// ---------------------------------------------------------------------------
// Docstrings
// ---------------------------------------------------------------------------

const CALLOUT_TYPES = {
  note: 'note', seealso: 'note', see: 'note',
  warning: 'warning', caution: 'warning', attention: 'warning', deprecated: 'warning', warn: 'warning',
  tip: 'tip', hint: 'tip', important: 'tip',
  danger: 'danger', error: 'danger', bug: 'danger', failure: 'danger', fail: 'danger', missing: 'danger',
  success: 'success', check: 'success', done: 'success',
  info: 'info', abstract: 'info', summary: 'info', tldr: 'info', question: 'info', help: 'info',
  faq: 'info', example: 'info', quote: 'info', cite: 'info', todo: 'info',
};

const SECTION_TITLES = {
  parameters: 'Parameters', 'other parameters': 'Other Parameters', returns: 'Returns', yields: 'Yields',
  receives: 'Receives', raises: 'Raises', warns: 'Warns', attributes: 'Attributes', examples: 'Examples',
  functions: 'Functions', classes: 'Classes', modules: 'Modules', 'type aliases': 'Type Aliases',
  'type parameters': 'Type Parameters',
};

function escapeCell(text) {
  return String(text ?? '')
    .trim()
    // a literal `a | b` code span: the renderer shows the backslash of `\|` inside code, so emit <code> with an entity instead
    .replace(/(`+)(?!`)([^`][\s\S]*?[^`]|[^`])\1(?!`)/g, (m, _t, code) => (code.includes('|')
      ? `<code>${code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\|/g, '&#124;')}</code>` : m))
    .replace(/(?<!\\)\|/g, '\\|')
    .replace(/\s*\n\s*/g, '<br>');
}

function escapeAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function table(headers, rows) {
  const lines = [`| ${headers.join(' | ')} |`, `| ${headers.map(() => '---').join(' | ')} |`];
  for (const r of rows) lines.push(`| ${r.map(escapeCell).join(' | ')} |`);
  return lines.join('\n');
}

function indentContinuation(text, pad = '  ') {
  return String(text).trim().split('\n').map((l, i) => (i ? (l.trim() ? pad + l : '') : l)).join('\n');
}

function sectionTitle(kind) { return SECTION_TITLES[kind] || kind.replace(/\b\w/g, c => c.toUpperCase()); }

function docstringOf(node) {
  const d = node.raw.docstring;
  return d && typeof d === 'object' ? d : null;
}

function hasDocstring(node) {
  const d = docstringOf(node);
  return !!(d && typeof d.value === 'string' && d.value.trim());
}

function signatureParamsFor(node) {
  if (node.kind === 'function') return node.raw.parameters || [];
  if (node.kind === 'class') {
    const init = node.members.get('__init__');
    if (init && init.kind === 'function') return init.raw.parameters || [];
  }
  return [];
}

function defaultMd(rc, node, v) {
  if (v === null || v === undefined || v === '') return '';
  return codeSpan(exprText(rc, node, v));
}

function renderParamSection(rc, node, sec, opts, kind) {
  const items = Array.isArray(sec.value) ? sec.value : [];
  if (!items.length) return '';
  const sig = signatureParamsFor(node);
  const rows = items.map(it => {
    const bare = String(it.name || '').replace(/^\*+/, '');
    const sp = sig.find(p => p.name === bare);
    const variadic = /^\*/.test(it.name || '') || (sp && /^variadic/.test(sp.kind));
    const ann = it.annotation ?? (sp ? sp.annotation : null);
    let def = '';
    if (kind === 'parameters' && !variadic) {
      const v = it.value !== undefined && it.value !== null ? it.value : (sp ? sp.default : null);
      def = defaultMd(rc, node, v);
      if (!def && sp) def = '*required*';
    }
    return { name: it.name, type: annotationMd(rc, node, ann), desc: it.description || '', def, rawDefault: def };
  });
  const withDefault = kind === 'parameters' || kind === 'other parameters';
  if (opts.docstring_section_style === 'list') {
    const lis = rows.map(r => {
      const meta = [];
      if (r.type) meta.push(r.type);
      if (withDefault && r.def && r.def !== '*required*') meta.push(`default: ${r.def}`);
      const m = meta.length ? ` (${meta.join(', ')})` : '';
      return `- ${codeSpan(r.name)}${m}${r.desc.trim() ? ` – ${indentContinuation(r.desc)}` : ''}`;
    });
    return lis.join('\n');
  }
  const anyType = rows.some(r => r.type);
  const headers = ['Name', ...(anyType ? ['Type'] : []), 'Description', ...(withDefault ? ['Default'] : [])];
  return table(headers, rows.map(r => [codeSpan(r.name), ...(anyType ? [r.type] : []), r.desc, ...(withDefault ? [r.def] : [])]));
}

function renderReturnSection(rc, node, sec, opts) {
  let items = Array.isArray(sec.value) ? sec.value : [];
  if (!items.length) return '';
  // Griffe splits an unnamed multi-line "Returns:" body into one item per line; a single (non-tuple) return type is one value
  if (sec.kind === 'returns' && items.length > 1 && node.raw.returns && !isTupleAnnotation(node.raw.returns) && items.every(it => !it.name)) {
    items = [{ ...items[0], description: items.map(it => it.description || '').join('\n') }];
  }
  const fallback = sec.kind === 'returns' && node.raw.returns ? node.raw.returns : null;
  const rows = items.map(it => {
    let name = it.name || '';
    let type = '';
    if (it.annotation) {
      type = annotationMd(rc, node, it.annotation);
      if (name === annotationText(rc, node, it.annotation)) name = '';
    } else if (fallback) {
      type = annotationMd(rc, node, fallback);
      if (name === exprText(rc, node, fallback)) name = '';
    } else if (name) {
      // Griffe leaves "type: description" in the name slot when there is no annotation to attach
      type = annotationMd(rc, node, name);
      name = '';
    }
    return { name, type, desc: it.description || '' };
  });
  if (opts.docstring_section_style === 'list') {
    return rows.map(r => {
      const head = [r.name ? codeSpan(r.name) : '', r.type ? (r.name ? `(${r.type})` : r.type) : ''].filter(Boolean).join(' ');
      return `- ${head}${r.desc.trim() ? `${head ? ' – ' : ''}${indentContinuation(r.desc)}` : ''}`;
    }).join('\n');
  }
  const named = rows.some(r => r.name);
  const headers = [...(named ? ['Name'] : []), 'Type', 'Description'];
  return table(headers, rows.map(r => [...(named ? [r.name ? codeSpan(r.name) : ''] : []), r.type, r.desc]));
}

function isTupleAnnotation(ann) {
  if (!ann || typeof ann !== 'object') return false;
  if (ann.cls === 'ExprTuple') return true;
  const left = ann.cls === 'ExprSubscript' ? ann.left : null;
  return !!(left && /^(tuple|Tuple)$/.test(left.name || ''));
}

function annotationText(rc, node, ann) {
  return typeof ann === 'string' ? ann : exprText(rc, node, ann);
}

function renderRaiseSection(rc, node, sec, opts) {
  const items = Array.isArray(sec.value) ? sec.value : [];
  if (!items.length) return '';
  const rows = items.map(it => ({ type: annotationMd(rc, node, it.annotation), desc: it.description || '' }));
  if (opts.docstring_section_style === 'list') {
    return rows.map(r => `- ${r.type}${r.desc.trim() ? ` – ${indentContinuation(r.desc)}` : ''}`).join('\n');
  }
  return table(['Type', 'Description'], rows.map(r => [r.type, r.desc]));
}

function renderNamedListSection(rc, node, sec, opts) {
  const items = Array.isArray(sec.value) ? sec.value : [];
  if (!items.length) return '';
  const rows = items.map(it => ({ name: it.name || '', desc: it.description || '' }));
  if (opts.docstring_section_style === 'list') {
    return rows.map(r => `- ${codeSpan(r.name)}${r.desc.trim() ? ` – ${indentContinuation(r.desc)}` : ''}`).join('\n');
  }
  return table(['Name', 'Description'], rows.map(r => [codeSpan(r.name), r.desc]));
}

function renderExamples(sec) {
  const items = Array.isArray(sec.value) ? sec.value : [];
  const out = [];
  for (const it of items) {
    const [kind, text] = Array.isArray(it) ? it : ['text', String(it)];
    if (!text || !String(text).trim()) continue;
    if (kind === 'examples') {
      const code = String(text).replace(/\s+$/, '');
      out.push(`\`\`\`${/(^|\n)\s*>>>/.test(code) ? 'pycon' : 'python'}\n${code}\n\`\`\``);
    } else out.push(String(text).trim());
  }
  return out.join('\n\n');
}

function callout(type, title, body) {
  const t = title ? ` title="${escapeAttr(title)}"` : '';
  return `<wc-callout type="${type}"${t}>\n\n${String(body).trim()}\n\n</wc-callout>`;
}

function renderDocstring(rc, node, opts) {
  const d = docstringOf(node);
  if (!d) return '';
  const parsed = Array.isArray(d.parsed) && d.parsed.length ? d.parsed : null;
  if (!parsed) return typeof d.value === 'string' ? d.value.trim() : '';

  const blocks = [];
  for (const sec of parsed) {
    const kind = sec.kind;
    let body = '';
    let label = true;
    switch (kind) {
      case 'text': blocks.push(String(sec.value || '').trim()); continue;
      case 'admonition': {
        const v = sec.value || {};
        const type = CALLOUT_TYPES[String(v.annotation || '').toLowerCase()] || 'info';
        blocks.push(callout(type, sec.title || (v.annotation ? String(v.annotation).replace(/^\w/, c => c.toUpperCase()) : ''), v.description || ''));
        continue;
      }
      case 'deprecated': {
        const v = sec.value || {};
        const title = v.version ? `Deprecated since ${v.version}` : 'Deprecated';
        blocks.push(callout('warning', title, v.description || ''));
        continue;
      }
      case 'parameters':
      case 'other parameters':
      case 'attributes':
        body = renderParamSection(rc, node, sec, opts, kind); break;
      case 'returns': case 'yields': case 'receives':
        body = renderReturnSection(rc, node, sec, opts); break;
      case 'raises': case 'warns':
        body = renderRaiseSection(rc, node, sec, opts); break;
      case 'examples':
        body = renderExamples(sec); break;
      case 'functions': case 'classes': case 'modules': case 'type aliases': case 'type parameters':
        body = renderNamedListSection(rc, node, sec, opts); break;
      default:
        if (typeof sec.value === 'string') { body = sec.value.trim(); label = false; } else {
          rc.warnings.add(`Unsupported docstring section "${kind}" in ${node.path}`);
          continue;
        }
    }
    if (!body) continue;
    blocks.push(label ? `**${sectionTitle(kind)}:**\n\n${body}` : body);
  }
  return blocks.filter(Boolean).join('\n\n');
}

// ---------------------------------------------------------------------------
// Member selection
// ---------------------------------------------------------------------------

function compileFilters(filters, warnings) {
  if (filters === null || filters === false) return [];
  const list = Array.isArray(filters) ? filters : (typeof filters === 'string' ? [filters] : DEFAULT_OPTIONS.filters);
  const out = [];
  for (const f of list) {
    if (typeof f !== 'string') continue;
    const exclude = f.startsWith('!');
    try { out.push({ re: new RegExp(exclude ? f.slice(1) : f), exclude }); }
    catch { warnings.add(`Invalid filter regex "${f}" ignored`); }
  }
  return out;
}

function keepByFilters(name, filters) {
  let keep = null;
  const rules = new Set();
  for (const { re, exclude } of filters) {
    rules.add(exclude);
    if (re.test(name)) keep = !exclude;
  }
  if (keep === null) return !(rules.size === 1 && rules.has(false));
  return keep;
}

function hasDocsDeep(rc, node, seen = new Set()) {
  if (seen.has(node.path)) return false;
  seen.add(node.path);
  if (hasDocstring(node)) return true;
  for (const m of node.members.values()) {
    const t = m.kind === 'alias' ? null : m;
    if (t && hasDocsDeep(rc, t, seen)) return true;
  }
  return false;
}

function exportsOf(node) {
  const ex = node.raw.exports;
  if (!Array.isArray(ex) || !ex.length) return null;
  return new Set(ex.map(x => (typeof x === 'string' ? x : x && (x.name || x.canonical_name)) || '').filter(Boolean));
}

function baseClasses(rc, node) {
  const out = [];
  for (const b of node.raw.bases || []) {
    let expr = b;
    if (expr && expr.cls === 'ExprSubscript') expr = expr.left;
    const parts = exprParts(rc, node.parent || node, expr);
    const p = parts.length === 1 ? parts[0].path : null;
    const target = p ? rc.index.nodes.get(p) : null;
    const resolved = target ? followAlias(rc.index, target).node : null;
    if (resolved && resolved.kind === 'class') out.push(resolved);
  }
  return out;
}

function collectInherited(rc, node, seen = new Set()) {
  const result = new Map();
  for (const base of baseClasses(rc, node)) {
    if (seen.has(base.path)) continue;
    seen.add(base.path);
    for (const [name, m] of base.members) if (!result.has(name) && !node.members.has(name)) result.set(name, m);
    for (const [name, m] of collectInherited(rc, base, seen)) if (!result.has(name) && !node.members.has(name)) result.set(name, m);
  }
  return result;
}

const CATEGORY_ORDER = ['attribute', 'class', 'function', 'module'];

function selectMembers(rc, item, opts) {
  const { index } = rc;
  const node = item.node;
  if (node.kind !== 'module' && node.kind !== 'class') return [];
  if (opts.members === false) return [];
  const entries = [];

  const resolveEntry = (name, m, inherited) => {
    if (m.kind === 'alias') {
      const r = followAlias(index, m);
      if (!r.node) return null;
      return { name, node: r.node, aliased: true, inherited };
    }
    return { name, node: m, aliased: false, inherited };
  };
  const posOf = (m, inherited) => (inherited ? 1e9 + m.order : (m.raw.lineno ?? m.order));

  if (Array.isArray(opts.members)) {
    const inheritedAll = node.kind === 'class' ? collectInherited(rc, node) : new Map();
    for (const name of opts.members) {
      let m = node.members.get(name);
      let inherited = false;
      if (!m && inheritedAll.has(name)) { m = inheritedAll.get(name); inherited = true; }
      if (!m) { rc.warnings.add(`Member "${name}" not found in ${item.path}`); continue; }
      const e = resolveEntry(name, m, inherited);
      if (e) entries.push(e);
    }
    return entries;
  }

  const filters = compileFilters(opts.filters, rc.warnings);
  const exports = node.kind === 'module' ? exportsOf(node) : null;
  const wantInherited = (name) => opts.inherited_members === true
    || (Array.isArray(opts.inherited_members) && opts.inherited_members.includes(name));

  const consider = (name, m, inherited) => {
    if (m.kind === 'module') return;
    if (m.kind === 'alias') {
      if (m.raw.inherited && !wantInherited(name)) return;
      if (node.kind === 'module') {
        const exported = (exports && exports.has(name)) || m.raw.is_exported === true;
        if (!exported) return;
      }
    } else if (node.kind === 'module' && exports && !exports.has(name)) return;
    if (!keepByFilters(name, filters)) return;
    const e = resolveEntry(name, m, inherited || !!m.raw.inherited);
    if (!e) return;
    e.pos = posOf(m, e.inherited);
    if (!opts.show_if_no_docstring && !hasDocsDeep(rc, e.node)) return;
    entries.push(e);
  };

  for (const [name, m] of node.members) consider(name, m, false);
  if (node.kind === 'class' && opts.inherited_members) {
    for (const [name, m] of collectInherited(rc, node)) {
      if (!wantInherited(name) || node.members.has(name)) continue;
      consider(name, m, true);
    }
  }

  const byName = (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  const cmp = opts.members_order === 'alphabetical' ? byName : (a, b) => a.pos - b.pos;
  if (opts.group_by_category) {
    const rank = (e) => { const i = CATEGORY_ORDER.indexOf(e.node.kind); return i < 0 ? 99 : i; };
    return entries.map((e, i) => ({ e, i })).sort((x, y) => rank(x.e) - rank(y.e) || cmp(x.e, y.e) || x.i - y.i).map(x => x.e);
  }
  return entries.map((e, i) => ({ e, i })).sort((x, y) => cmp(x.e, y.e) || x.i - y.i).map(x => x.e);
}

// ---------------------------------------------------------------------------
// Planning + rendering
// ---------------------------------------------------------------------------

function planItem(rc, node, displayPath, opts, depth, isRoot) {
  const item = { node, path: displayPath, canonical: node.path, depth, isRoot, children: [] };
  rc.localIds.add(displayPath);
  rc.localIds.add(node.path);
  if (depth < 6) {
    for (const e of selectMembers(rc, item, isRoot ? opts : { ...opts, members: true })) {
      const childPath = `${displayPath}.${e.name}`;
      if (rc.planned.has(childPath)) continue;
      item.children.push(planItem(rc, e.node, childPath, opts, depth + 1, false));
    }
  }
  rc.planned.add(displayPath);
  return item;
}

const KIND_LABELS_HIDDEN = new Set(['class-attribute', 'instance-attribute', 'module-attribute']);

function headingText(item) {
  return item.isRoot ? item.path : item.path.split('.').pop();
}

function renderItem(rc, item, opts, level, out) {
  const node = item.node;
  const showHeading = !item.isRoot || opts.show_root_heading;
  const lvl = Math.min(6, level);
  const prefix = rc.prefix;
  const title = headingText(item);
  rc.names.set(node.path, item.path.split('.').pop());

  if (showHeading) {
    if (item.canonical !== item.path) out.push(`<a id="${escapeAttr(prefix + item.canonical)}"></a>`);
    out.push(`${'#'.repeat(lvl)} ${title} <a id="${escapeAttr(prefix + item.path)}"></a>`);
    rc.anchors.push({ id: item.path, title, level: lvl, anchor: prefix + item.path });
    if (item.canonical !== item.path) rc.anchors.push({ id: item.canonical, title, level: lvl, anchor: prefix + item.canonical, toc: false });
  } else {
    out.push(`<a id="${escapeAttr(prefix + item.path)}"></a>`);
    if (item.canonical !== item.path) out.push(`<a id="${escapeAttr(prefix + item.canonical)}"></a>`);
    if (opts.show_root_toc_entry) {
      rc.anchors.push({ id: item.path, title, level: lvl, anchor: prefix + item.path });
      if (item.canonical !== item.path) rc.anchors.push({ id: item.canonical, title, level: lvl, anchor: prefix + item.canonical, toc: false });
    } else {
      rc.anchors.push({ id: item.path, title, level: lvl, anchor: prefix + item.path, toc: false });
    }
  }

  const labels = (node.raw.labels || []).filter(l => !KIND_LABELS_HIDDEN.has(l));
  if (showHeading && labels.length) out.push(labels.map(codeSpan).join(' '));

  if (showHeading && node.kind === 'class' && opts.show_bases && (node.raw.bases || []).length) {
    const bases = node.raw.bases.map(b => partsToMd(rc, exprParts(rc, node.parent || node, b)));
    out.push(`**Bases:** ${bases.join(', ')}`);
  }

  if (showHeading && opts.show_signature) {
    const sig = signatureBlock(rc, node, opts);
    if (sig) out.push(sig);
  }

  if (node.kind === 'attribute' && showHeading && node.raw.annotation && !opts.show_signature_annotations) {
    out.push(`**Type:** ${annotationMd(rc, node, node.raw.annotation)}`);
  }

  const doc = renderDocstring(rc, node, opts);
  if (doc) out.push(doc);

  const childLevel = showHeading ? lvl + 1 : lvl;
  for (const child of item.children) renderItem(rc, child, opts, childLevel, out);
}

/**
 * Render one object (module, class, function or attribute) to Markdown.
 * @returns {{ markdown: string, anchors: Array<{id:string,title:string,level:number}>, refs: string[], warnings: string[] }}
 */
export function renderObject(index, id, options = {}, ctx = {}) {
  const warnings = new Set();
  const optWarnings = [];
  const opts = normalizeOptions(options, optWarnings);
  for (const w of optWarnings) warnings.add(w);

  const empty = () => ({ markdown: '', anchors: [], refs: [], warnings: [...warnings] });
  if (!index || !index.nodes) { warnings.add('Invalid API index'); return empty(); }
  const found = lookup(index, String(id || '').trim());
  if (!found) { warnings.add(`Python object "${id}" not found in the API data`); return empty(); }

  let node = found.node;
  if (node.kind === 'alias') {
    const r = followAlias(index, node);
    if (!r.node) {
      warnings.add(`"${id}" is an alias to "${r.path}", which is not part of the API data`);
      return empty();
    }
    node = r.node;
  }

  const rc = {
    index, ctx: ctx || {}, warnings, refs: new Set(), anchors: [], localIds: new Set(), planned: new Set(),
    prefix: (ctx && ctx.pageAnchorPrefix) || '', names: new Map(),
  };
  const root = planItem(rc, node, found.display, opts, 0, true);
  const out = [];
  renderItem(rc, root, opts, opts.heading_level, out);

  return {
    markdown: `${out.filter(s => s !== '').join('\n\n')}\n`,
    anchors: rc.anchors,
    refs: [...rc.refs],
    warnings: [...warnings],
  };
}
