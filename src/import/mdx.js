// MDX -> DocsLit Markdown conversion engine.
//
// The source is parsed with remark-mdx (a real MDX AST: JSX elements, expressions,
// ESM, code fences). Conversion is done by *splicing the original source*: each
// JSX opening/closing tag, expression, fence info line and link URL is replaced in
// place while all other text (Markdown bodies, tables, lists, spacing) is kept
// byte-for-byte. That keeps diffs reviewable and makes nesting, lists and
// blockquotes safe.

import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkMdx from 'remark-mdx';
import { renderAttrs, readProps, evalEstree, isJsx, isExpr, styleToCss, mdastText } from './jsx.js';
import { resolveSpec, UNKNOWN_BLOCK_HTML, RUN_SPECS, runKeyForNode } from './components.js';
import { convertFence } from './fences.js';
import { getComponent } from '../component-manifest.js';

const GLOBAL_ATTRS = new Set(['id', 'class', 'style', 'slot', 'hidden', 'lang', 'dir', 'tabindex', 'role']);

/** Safety net: every emitted wc-* attribute must exist in the component manifest. */
function sanitizeAgainstManifest(res) {
  if (!res.tag || !res.tag.startsWith('wc-') || !res.attrs) return;
  const comp = getComponent(res.tag);
  if (!comp) return;
  const known = new Set(comp.attributes.map((a) => a.name));
  const attrs = res.attrs;
  if (attrs['icon-type'] && !known.has('icon-type')) {
    if (typeof attrs.icon === 'string' && /^[\w-]+$/.test(attrs.icon)) attrs.icon = `fa-${attrs['icon-type']} fa-${attrs.icon}`;
    delete attrs['icon-type'];
  }
  for (const k of Object.keys(attrs)) {
    if (known.has(k) || GLOBAL_ATTRS.has(k) || k.startsWith('data-') || k.startsWith('aria-')) continue;
    delete attrs[k];
    (res.warnings ||= []).push({ severity: 'warning', code: 'component-prop-dropped', message: `Attribute "${k}" is not supported by <${res.tag}> and was dropped.`, action: `Dropped ${k}.` });
  }
}

const processor = () => unified().use(remarkParse).use(remarkMath).use(remarkGfm).use(remarkMdx);

export function parseMdx(src) {
  const p = processor();
  return p.parse(src);
}

// ─── source helpers ───────────────────────────────────────────────────────────
const lineStart = (src, off) => src.lastIndexOf('\n', off - 1) + 1;
const lineEnd = (src, off) => { const i = src.indexOf('\n', off); return i === -1 ? src.length : i; };
const LEAD_RE = /^[ \t>]*(?:(?:[-*+]|\d+[.)])[ \t]+)*/;
const BLANK_RE = /^[ \t>]*$/;

/** Continuation prefix for new lines created inside the block that contains `off`. */
export function prefixAt(src, off) {
  const ls = lineStart(src, off);
  const lead = LEAD_RE.exec(src.slice(ls, lineEnd(src, off)))[0];
  return lead.replace(/[^\s>]/g, ' ');
}

/** End offset of the JSX opening tag that starts at `s` (JSX-aware scan). */
export function scanTagEnd(src, s) {
  let depth = 0;
  let quote = null;
  for (let i = s + 1; i < src.length; i++) {
    const c = src[i];
    if (quote) { if (c === '\\' && depth > 0) i++; else if (c === quote) quote = null; continue; }
    if (depth > 0) {
      if (c === '"' || c === "'" || c === '`') quote = c;
      else if (c === '{') depth++;
      else if (c === '}') depth--;
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (c === '{') depth = 1;
    else if (c === '>') return i + 1;
  }
  return src.length;
}

class Edits {
  constructor() { this.list = []; this.seq = 0; }
  add(s, e, text) { this.list.push({ s, e, text, seq: this.seq++ }); }
  apply(src) {
    const l = this.list.slice().sort((a, b) => a.s - b.s || a.e - b.e || a.seq - b.seq);
    let out = '';
    let pos = 0;
    for (const ed of l) {
      if (ed.s < pos) continue; // overlapping edit (inside a replaced region): skipped
      out += src.slice(pos, ed.s) + ed.text;
      pos = ed.e;
    }
    return out + src.slice(pos);
  }
}

const isBlankText = (n) => n && n.type === 'text' && !n.value.trim();
const isComment = (n) => n && (n.type === 'mdxFlowExpression' || n.type === 'mdxTextExpression') && /^\s*(\/\*[\s\S]*\*\/\s*)*$/.test(n.value);
const isJsxEl = (n) => n && (n.type === 'mdxJsxFlowElement' || n.type === 'mdxJsxTextElement');

// ─── indentation normalisation ────────────────────────────────────────────────
// MDX has no indented code, so authors indent JSX children freely. Plain Markdown
// would read 4+ spaces as code, so strip the extra indent from block-element bodies.
export function normalizeIndent(src) {
  let tree;
  try { tree = parseMdx(src); } catch { return src; }
  const lines = src.split('\n');
  const strip = new Array(lines.length).fill(0);
  const indentOf = (l) => /^[ \t]*/.exec(lines[l - 1] || '')[0].length;
  const walk = (node, P) => {
    const isEl = node.type === 'mdxJsxFlowElement';
    for (const c of node.children || []) {
      let T = P;
      if (isEl && c.position && node.position && c.position.start.line > node.position.start.line) {
        const d = indentOf(c.position.start.line) - indentOf(node.position.start.line);
        if (d > 0) T = P + d;
        if (T > 0) for (let l = c.position.start.line; l <= c.position.end.line; l++) strip[l - 1] = Math.max(strip[l - 1], T);
      }
      walk(c, T);
    }
  };
  walk(tree, 0);
  if (!strip.some(Boolean)) return src;
  return lines.map((t, i) => {
    if (!strip[i]) return t;
    const lead = /^[ \t]*/.exec(t)[0].length;
    return t.slice(Math.min(strip[i], lead));
  }).join('\n');
}

// ─── main entry ───────────────────────────────────────────────────────────────
/**
 * Convert an MDX/Markdown body.
 * ctx: {
 *   vendor, file, lineOffset, isSnippet,
 *   report(severity, code, message, extra), count(source, target),
 *   link(url, {line, kind}) -> string, asset(url, {line}) -> string,
 *   snippets: Map<localName, {src}>, components: Map<name, {...}>, variables: Map<name, string>,
 *   pageAttributes: object, defer(fn) -> token
 * }
 * Returns { body, ok }.
 */
export function convertBody(srcIn, ctx) {
  let src0 = normalizeIndent(srcIn);
  let tree;
  try { tree = parseMdx(src0); } catch (firstErr) {
    // common non-MDX leftovers: HTML comments; retry once with them blanked (line count preserved)
    const repaired = repairSource(src0);
    if (repaired !== src0) { try { tree = parseMdx(repaired); src0 = repaired; ctx.report('info', 'mdx-repaired', 'HTML comments (<!-- -->) are not valid MDX; they were removed before conversion.', { line: 1 }); } catch { /* fall through to the error */ } }
    if (!tree) tree = firstErr;
  }
  if (tree instanceof Error) { const e = tree; tree = null;
    const line = (e.line || e.place?.line || e.place?.start?.line || 1) + (ctx.lineOffset || 0);
    ctx.report('error', 'mdx-parse-error', `Could not parse MDX: ${e.reason || e.message}`, {
      line, action: 'Converted with the legacy tag rewriter (less reliable).',
      fix: 'Fix the invalid JSX/MDX in the source (unclosed tag, stray < or {), or edit the converted page by hand.',
    });
    return { body: null, ok: false };
  }
  const src = src0;
  const edits = new Edits();
  const state = { src, edits, ctx, tree, usedIds: new Set(), stack: [] };
  walkChildren(tree, tree, state);
  let out = edits.apply(src);
  out = tidyBlankLines(out);
  return { body: out, ok: true };
}

function repairSource(src) {
  const lines = src.split('\n');
  let fence = null;
  const out = [];
  let inComment = false;
  for (const l of lines) {
    const f = /^\s*(`{3,}|~{3,})/.exec(l);
    if (!inComment && f) { if (!fence) fence = f[1]; else if (l.trim().startsWith(fence)) fence = null; out.push(l); continue; }
    if (fence) { out.push(l); continue; }
    let t = l;
    if (inComment) { const e = t.indexOf('-->'); if (e === -1) { out.push(''); continue; } t = t.slice(e + 3); inComment = false; }
    t = t.replace(/<!--[\s\S]*?-->/g, '');
    const st = t.indexOf('<!--');
    if (st !== -1) { t = t.slice(0, st); inComment = true; }
    out.push(t);
  }
  return out.join('\n');
}

/** Collapse runs of blank lines outside fenced code. */
function tidyBlankLines(text) {
  const lines = text.split('\n');
  const out = [];
  let fence = null;
  let blanks = 0;
  for (const l of lines) {
    const m = /^[ \t>]*(`{3,}|~{3,})/.exec(l);
    if (m) {
      if (!fence) fence = m[1][0].repeat(m[1].length);
      else if (m[1][0] === fence[0] && m[1].length >= fence.length && /^[ \t>]*(`{3,}|~{3,})\s*$/.test(l)) fence = null;
    }
    if (!fence && !m && /^[ \t>]*$/.test(l)) {
      blanks++;
      if (blanks > 1) continue;
    } else blanks = 0;
    out.push(l);
  }
  return out.join('\n').replace(/^\n+/, '');
}

// ─── tree walk ────────────────────────────────────────────────────────────────
function walkChildren(parent, root, state) {
  const kids = parent.children || [];
  for (let i = 0; i < kids.length; i++) {
    handleNode(kids[i], parent, i, state);
  }
}

function lineOf(node, state) {
  return (node.position?.start.line || 1) + (state.ctx.lineOffset || 0);
}

function handleNode(node, parent, index, state) {
  const { src, edits, ctx } = state;
  switch (node.type) {
    case 'mdxjsEsm': return handleEsm(node, state);
    case 'mdxFlowExpression':
    case 'mdxTextExpression': return handleExpression(node, parent, state);
    case 'mdxJsxFlowElement':
    case 'mdxJsxTextElement': return handleElement(node, parent, index, state);
    case 'code': return handleCode(node, parent, state);
    case 'link': case 'image': case 'definition': handleUrlNode(node, state); break;
    default: break;
  }
  walkChildren(node, null, state);
}

function handleUrlNode(node, state) {
  const { src, edits, ctx } = state;
  if (!node.url) return;
  const s = node.position.start.offset;
  const e = node.position.end.offset;
  const slice = src.slice(s, e);
  let rel;
  if (node.type === 'definition') {
    const m = /^\s*\[[^\]]*\]:\s*(<[^>]*>|\S+)/.exec(slice);
    if (!m) return;
    rel = { off: m[0].length - m[1].length, text: m[1] };
  } else {
    const idx = slice.lastIndexOf('](');
    if (idx === -1) return; // reference-style or autolink: leave
    const m = /^\]\(\s*(<[^>]*>|[^\s)]*)/.exec(slice.slice(idx));
    if (!m) return;
    const off = idx + m[0].length - m[1].length;
    rel = { off, text: m[1] };
  }
  const raw = rel.text.replace(/^<|>$/g, '');
  const kind = node.type === 'image' ? 'image' : 'link';
  const next = kind === 'image'
    ? ctx.asset(raw, { line: lineOf(node, state) })
    : ctx.link(raw, { line: lineOf(node, state) });
  if (next != null && next !== raw) {
    const wrapped = /\s/.test(next) ? `<${next}>` : next;
    edits.add(s + rel.off, s + rel.off + rel.text.length, wrapped);
  }
}

// ─── ESM ──────────────────────────────────────────────────────────────────────
function handleEsm(node, state) {
  const { src, edits, ctx } = state;
  const est = node.data?.estree;
  if (!est) {
    ctx.report('warning', 'mdx-esm-unparsed', 'Could not analyse an import/export block; removed.', { line: lineOf(node, state) });
  }
  for (const st of est?.body || []) {
    const line = st.loc.start.line + (ctx.lineOffset || 0);
    if (st.type === 'ImportDeclaration') ctx.onImport?.(st, line, src);
    else if (st.type === 'ExportNamedDeclaration' || st.type === 'ExportDefaultDeclaration') ctx.onExport?.(st, line, src);
  }
  edits.add(node.position.start.offset, node.position.end.offset, '');
}

// ─── expressions ──────────────────────────────────────────────────────────────
function handleExpression(node, parent, state) {
  const { edits, ctx, src } = state;
  const s = node.position.start.offset;
  const e = node.position.end.offset;
  const line = lineOf(node, state);
  if (isComment(node) || !node.value.trim()) { edits.add(s, e, ''); return; }
  const expr = node.data?.estree?.body?.[0]?.expression;
  const text = ctx.expression ? ctx.expression(expr, node.value, src, line) : null;
  if (text != null) { edits.add(s, e, text); return; }
  ctx.report('warning', 'jsx-expression-dropped', `JSX expression {${node.value.trim().slice(0, 60)}} cannot run on a static site; removed.`, {
    line, action: 'Removed the expression.', fix: 'Write the intended text or Markdown at this spot.',
  });
  edits.add(s, e, '');
}

// ─── code fences ──────────────────────────────────────────────────────────────
function handleCode(node, parent, state) {
  const { src, edits, ctx } = state;
  const s = node.position.start.offset;
  const e = node.position.end.offset;
  const text = src.slice(s, e);
  const r = convertFence(text, { vendor: ctx.vendor, report: (sev, code, msg, x) => ctx.report(sev, code, msg, { line: lineOf(node, state), ...x }), count: ctx.count });
  if (r !== text) edits.add(s, e, r);
}

// ─── elements ─────────────────────────────────────────────────────────────────
function siblingsOf(parent) { return (parent?.children || []); }

function neighbour(parent, index, dir) {
  const kids = siblingsOf(parent);
  for (let i = index + dir; i >= 0 && i < kids.length; i += dir) {
    const k = kids[i];
    if (isBlankText(k) || isComment(k)) continue;
    return { node: k, index: i };
  }
  return null;
}

function blockish(node, parent, src) {
  if (node.type === 'mdxJsxFlowElement') return true;
  if (parent?.type === 'paragraph') {
    if (parent.children.every((c) => c === node || isBlankText(c) || isJsxEl(c) || isComment(c))) return true;
    // alone on its own line(s) inside a longer paragraph
    const s = node.position.start.offset;
    const e = node.position.end.offset;
    const before = src.slice(lineStart(src, s), s);
    const after = src.slice(e, lineEnd(src, e));
    return !before.replace(LEAD_RE, '').trim() && !after.trim();
  }
  return false;
}

function paragraphWrapped(node, parent) {
  return node.type === 'mdxJsxTextElement' && parent?.type === 'paragraph';
}

function flowEls(node) {
  const out = [];
  for (const c of node.children || []) {
    if (isJsxEl(c)) out.push(c);
    else if (c.type === 'paragraph') for (const g of c.children) if (isJsxEl(g)) out.push(g);
  }
  return out;
}

function makeEl(node, parent, index, state) {
  const { src, ctx } = state;
  const props = readProps(node, src);
  const raw = {};
  for (const a of node.attributes || []) if (a.value && typeof a.value === 'object') raw[a.name] = a.value.value;
  const el = {
    node, parent, index, props, raw, src, ctx,
    name: node.name,
    line: lineOf(node, state),
    block: blockish(node, parent, src),
    children: node.children || [],
    childEls: flowEls(node),
    parentName: state.stack[state.stack.length - 1] || null,
    ancestors: state.stack.slice(),
    text: () => mdastText(node),
    childSource: () => (node.children?.length ? src.slice(node.children[0].position.start.offset, node.children[node.children.length - 1].position.end.offset).trim() : ''),
    prop: (n) => props[n],
    str: (n) => (typeof props[n] === 'string' ? props[n] : (typeof props[n] === 'number' ? String(props[n]) : undefined)),
    flag: (n) => props[n] === true || (isExpr(props[n]) ? false : props[n] === 'true'),
    neighbour: (dir) => neighbour(parent, index, dir),
  };
  return el;
}

function handleElement(node, parent, index, state) {
  const { src, edits, ctx } = state;
  const s = node.position.start.offset;
  const e = node.position.end.offset;
  const el = makeEl(node, parent, index, state);
  const name = node.name;

  // JSX fragment <>…</>
  if (name == null) {
    const oe = scanTagEnd(src, s);
    edits.add(s, oe, '');
    const cs = src.lastIndexOf('</', e);
    if (cs >= oe) edits.add(cs, e, '');
    walkChildren(node, null, state);
    return;
  }

  const res = resolveSpec(el, ctx);
  sanitizeAgainstManifest(res);
  const oe = scanTagEnd(src, s);
  const selfClosing = src[oe - 2] === '/';
  const cs = selfClosing ? -1 : src.lastIndexOf('</', e);
  const hasKids = (node.children || []).length > 0;

  const warnList = res.warnings || [];
  for (const w of warnList) ctx.report(w.severity || 'warning', w.code || 'component-prop-dropped', w.message, { line: el.line, component: name, action: w.action, fix: w.fix });
  if (res.count !== false) ctx.count(name, res.tag || (res.unwrap ? '(unwrapped)' : res.replace != null ? '(replaced)' : res.drop ? '(removed)' : name));

  // Whole-element replacement (children included)
  if (res.replace != null || res.drop) {
    let text = res.drop ? '' : res.replace;
    if (res.block !== false && el.block && text) {
      text = beforeGap(src, s) + text + afterGap(src, e, s);
    }
    // for block-ish elements wrapped in a paragraph this stays valid markdown
    edits.add(s, e, text);
    // children are inside the replaced range: don't walk (their edits would be skipped anyway)
    return;
  }

  // Children first (their edits are disjoint from ours).
  state.stack.push(name);
  walkChildren(node, null, state);
  state.stack.pop();

  const prefix = prefixAt(src, s);
  const asBlock = res.block !== false && el.block && !res.inline;

  let openText;
  let closeText;
  if (res.unwrap) { openText = ''; closeText = ''; }
  else {
    const tag = res.tag;
    const attrs = renderAttrs(res.attrs || {});
    openText = `<${tag}${attrs}>`;
    closeText = `</${tag}>`;
    if (res.voidTag) { openText = `<${tag}${attrs}${res.selfClose === false ? '' : ' /'}>`; closeText = ''; }
  }
  if (res.before) openText = res.before + openText;
  if (res.after) closeText += res.after;
  let runOpen = '';
  let runClose = '';
  if (res.run && RUN_SPECS[res.run]) {
    const pn = el.parentName;
    const prev = el.neighbour(-1);
    const next = el.neighbour(1);
    if (!(prev && runKeyForNode(prev.node, pn) === res.run)) runOpen = RUN_SPECS[res.run].open + '\n\n' + prefix;
    if (!(next && runKeyForNode(next.node, pn) === res.run)) runClose = '\n\n' + prefix + RUN_SPECS[res.run].close;
  }

  if (selfClosing || !hasKids) {
    let full = runOpen + openText + (res.body != null ? res.body : '') + closeText + runClose;
    if (res.unwrap) full = (res.before || '') + (res.body || '');
    if (asBlock && full) full = beforeGap(src, s) + full + afterGap(src, e, s);
    edits.add(s, e, full);
    return;
  }

  let open = openText;
  let close = closeText;
  if (asBlock && !res.unwrap) {
    const first = node.children[0].position.start.offset;
    const last = node.children[node.children.length - 1].position.end.offset;
    open = beforeGap(src, s) + runOpen + open + (res.outerOnly ? '' : gapAfterOpen(src, oe, first, prefix));
    close = (res.outerOnly ? '' : gapBeforeClose(src, last, cs, prefix)) + close + runClose + afterGap(src, e, s);
  } else { open = runOpen + open; close = close + runClose; }
  edits.add(s, oe, open);
  edits.add(cs, e, close);
  if (res.bodyEdit) res.bodyEdit(edits, node, src);
}


// ─── blank-line helpers ───────────────────────────────────────────────────────
function beforeGap(src, s) {
  const ls = lineStart(src, s);
  const lead = src.slice(ls, s);
  const m = LEAD_RE.exec(lead)[0];
  const prefix = prefixAt(src, s);
  if (lead.length > m.length) return '\n\n' + prefix; // text precedes the element on its line
  if (/(?:[-*+]|\d+[.)])[ \t]+$/.test(m)) return '';  // element opens a list item
  if (ls === 0) return '';
  const prev = src.slice(lineStart(src, ls - 1), ls - 1);
  if (BLANK_RE.test(prev)) return '';
  return '\u0001'; // marker: a blank line is hoisted above this line when applying
}

function afterGap(src, e) {
  const le = lineEnd(src, e);
  const rest = src.slice(e, le);
  const prefix = prefixAt(src, e);
  if (rest.trim()) return '\n\n' + prefix;
  if (le >= src.length) return '';
  const nextEnd = lineEnd(src, le + 1);
  const next = src.slice(le + 1, nextEnd);
  if (BLANK_RE.test(next)) return '';
  return '\n' + prefix.replace(/[ \t]+$/, '');
}

function gapAfterOpen(src, oe, first, prefix) {
  const between = src.slice(oe, first);
  if (/\n[ \t>]*\n/.test(between)) return '';
  if (between.includes('\n')) return '\n' + prefix.replace(/[ \t]+$/, '');
  return '\n\n' + prefix;
}

function gapBeforeClose(src, last, cs, prefix) {
  const between = src.slice(last, cs);
  if (/\n[ \t>]*\n/.test(between)) return '';
  if (between.includes('\n')) return '\n' + prefix.replace(/[ \t]+$/, '');
  return '\n\n' + prefix;
}

// The '\u0001' marker means "blank line before this line". Resolve it by rewriting
// the edit text: the marker moves to the start of the line.
const origApply = Edits.prototype.apply;
Edits.prototype.apply = function applyWithMarkers(src) {
  const out = origApply.call(this, src);
  if (!out.includes('\u0001')) return out;
  // each marker sits at the element start; hoist a blank line before the line it is on
  return out.split('\n').map((line) => {
    if (!line.includes('\u0001')) return line;
    const lead = /^[ \t>]*/.exec(line)[0];
    return `${lead.replace(/[ \t]+$/, '')}\n${line.replace(/\u0001/g, '')}`;
  }).join('\n');
};

export { UNKNOWN_BLOCK_HTML, isJsx, isExpr, evalEstree, styleToCss };
