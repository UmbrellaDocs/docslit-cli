// Python-Markdown / PyMdown Extensions / Material for MkDocs syntax -> DocsLit Markdown.
//
// MkDocs pages are plain Markdown (never MDX), so they are NOT sent through the remark-mdx
// engine: a stray `<` or `{` is valid here. Conversion is two passes:
//   1. text pass (this file): snippets, admonitions (!!! / ??? / ???+), pymdownx.blocks (///),
//      content tabs (===), definition lists, md_in_html, code fences (title / hl_lines /
//      linenums / mermaid), attribute lists, icons, keys, mark / caret / tilde, abbreviations,
//      arithmatex, mkdocstrings and macros detection;
//   2. link pass: the result is parsed with remark (no MDX) and every link / image / raw HTML
//      src|href is rewritten in place (see rewriteLinks).
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { visit } from 'unist-util-visit';
import { resolveIcon } from '../icons.js';
import { mapShortcodeIcon } from './icon-map.js';

// ─── small helpers ────────────────────────────────────────────────────────────
const indentWidth = (s) => { let w = 0; for (const c of s) { if (c === ' ') w++; else if (c === '\t') w += 4 - (w % 4); else break; } return w; };
const leadOf = (l) => /^[ \t]*/.exec(l)[0];
const isBlank = (l) => !l || !l.trim();
const escAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const titleCase = (s) => String(s).replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
/** Remove `n` columns of leading indentation (tabs count to the next multiple of 4). */
function dedent(l, n) {
  let w = 0; let k = 0;
  while (k < l.length && w < n) {
    if (l[k] === ' ') w++; else if (l[k] === '\t') w += 4 - (w % 4); else break;
    k++;
  }
  return (w > n ? ' '.repeat(w - n) : '') + l.slice(k);
}
const FENCE_OPEN = /^([ \t]*)(`{3,}|~{3,})(.*)$/;

// Material admonition types -> wc-callout types (title keeps the Material label when they differ).
const ADMONITION = {
  note: 'note', seealso: 'note', abstract: 'info', summary: 'info', tldr: 'info', info: 'info', todo: 'info',
  tip: 'tip', hint: 'tip', important: 'tip', success: 'success', check: 'check', done: 'success',
  question: 'info', help: 'info', faq: 'info', warning: 'warning', caution: 'warning', attention: 'warning',
  failure: 'error', fail: 'error', missing: 'error', danger: 'danger', error: 'error', bug: 'error',
  example: 'note', quote: 'note', cite: 'note', settings: 'info', new: 'launch',
};
const BLOCK_ADMONITIONS = new Set([...Object.keys(ADMONITION)]);

const KEY_NAMES = {
  ctrl: 'Ctrl', control: 'Ctrl', alt: 'Alt', option: 'Option', opt: 'Option', shift: 'Shift', cmd: 'Cmd', command: 'Cmd', meta: 'Meta', win: 'Win',
  windows: 'Win', super: 'Super', fn: 'Fn', enter: 'Enter', return: 'Return', esc: 'Esc', escape: 'Esc', tab: 'Tab', space: 'Space', backspace: 'Backspace',
  del: 'Del', delete: 'Delete', ins: 'Ins', insert: 'Insert', home: 'Home', end: 'End', 'page-up': 'Page Up', 'page-down': 'Page Down',
  'arrow-up': '↑', 'arrow-down': '↓', 'arrow-left': '←', 'arrow-right': '→', up: '↑', down: '↓', left: '←', right: '→', 'caps-lock': 'Caps Lock',
  'print-screen': 'Print Screen', plus: '+', minus: '-',
};

// ─── entry ────────────────────────────────────────────────────────────────────
/**
 * Convert one MkDocs page body.
 * opts: { file, lineOffset, report(sev, code, msg, extra), count(from, to), exts:Set, tabsSync:bool,
 *         readSnippet(spec) -> {text}|{codeFile, lines}|{error}, macros:{enabled, vars:Map}, onIconMiss(name) }
 * Returns { body, notes } where notes collects per-page stats for the report.
 */
export function convertPymdown(src, opts) {
  const o = { exts: new Set(), tabsSync: false, report: () => {}, count: () => {}, lineOffset: 0, ...opts };
  const st = { o, tabGroups: 0, codeImports: new Set(), notes: { mkdocstrings: [], macros: [], critic: 0, iconMiss: new Set(), annotations: 0, attrDropped: 0, gridCards: 0, mathRound: false } };
  let lines = src.replace(/\r\n?/g, '\n').split('\n');
  lines = expandSnippets(lines, st, 0);
  lines = fastapiIncludes(lines, st);
  const abbr = collectAbbreviations(lines, st);
  lines = abbr.lines;
  const out = blocks(lines, st, 1);
  let body = out.join('\n');
  body = tidyBlank(inlinePass(body, st, abbr.map));
  return { body, notes: st.notes };
}

// ─── pymdownx.snippets ────────────────────────────────────────────────────────
const SNIP_LINE = /^([ \t]*)(;?)-{1,}8<-{1,}[ \t]+(["'])(.+?)\3[ \t]*$/;
const SNIP_BLOCK = /^([ \t]*)-{1,}8<-{1,}[ \t]*$/;
const SNIP_SECTION = /-{1,}8<-{1,}\s*\[\s*(start|end)\s*:\s*[\w-]+\s*\]/;

function expandSnippets(lines, st, depth) {
  const { o } = st;
  const out = [];
  let fence = null;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const fm = FENCE_OPEN.exec(l);
    if (fm && !fence) {
      // fence holding exactly one snippet line -> code import (file=), keeps a single source
      const one = SNIP_LINE.exec(lines[i + 1] || '');
      const close = lines[i + 2] && new RegExp(`^[ \\t]*${fm[2][0] === '`' ? '`' : '~'}{${fm[2].length},}[ \\t]*$`).test(lines[i + 2]);
      if (one && !one[2] && close && depth === 0) {
        const r = o.readSnippet(one[4], { line: i + 1 + o.lineOffset, code: true });
        if (r && r.codeFile) {
          st.codeImports.add(r.codeFile);
          const meta = fm[3].trim();
          out.push(`${fm[1]}${fm[2]}${meta}${meta ? ' ' : ''}file="${r.codeFile}"${r.lines ? ` lines="${r.lines}"` : ''}`, lines[i + 2]);
          o.count('--8<-- snippet in a code block', 'file= code import');
          i += 2;
          continue;
        }
      }
      fence = fm[2];
      out.push(l);
      continue;
    }
    if (fence && new RegExp(`^[ \\t]*${fence[0] === '`' ? '`' : '~'}{${fence.length},}[ \\t]*$`).test(l)) { fence = null; out.push(l); continue; }
    if (SNIP_SECTION.test(l)) continue; // section markers never render
    let m = SNIP_LINE.exec(l);
    if (m) {
      if (m[2]) { out.push(l.replace(';', '')); continue; } // escaped: ;--8<--
      out.push(...includeSnippet(m[4], m[1], i, st, depth));
      continue;
    }
    if ((m = SNIP_BLOCK.exec(l)) && !fence) {
      let j = i + 1;
      const files = [];
      while (j < lines.length && !SNIP_BLOCK.test(lines[j])) { if (lines[j].trim() && !lines[j].trim().startsWith(';')) files.push(lines[j].trim()); j++; }
      if (j < lines.length) {
        for (const f of files) out.push(...includeSnippet(f.replace(/^["']|["']$/g, ''), m[1], i, st, depth));
        i = j;
        continue;
      }
    }
    out.push(l);
  }
  return out;
}

function includeSnippet(spec, indent, i, st, depth) {
  const { o } = st;
  const line = i + 1 + o.lineOffset;
  if (depth > 8) { o.report('warning', 'mkdocs-snippet-recursion', `Snippet "${spec}" is nested too deeply; not expanded.`, { line }); return []; }
  const r = o.readSnippet(spec, { line });
  if (!r || r.error) {
    o.report('warning', 'mkdocs-snippet-missing', `Snippet "${spec}" could not be included: ${r?.error || 'not found'}.`, { line, action: 'Removed the --8<-- line.', fix: 'Copy the text into the page, or put the file under docs/_reusables and use <wc-include>.' });
    return [];
  }
  o.count('--8<-- snippet', 'inlined');
  const inner = expandSnippets(r.text.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n'), st, depth + 1);
  return inner.map((x) => (x ? indent + x : x));
}

// FastAPI-style `{* ../../docs_src/x.py hl[3,5:7] ln[1:10] *}` code includes (a custom MkDocs hook).
function fastapiIncludes(lines, st) {
  const re = /^([ \t]*)\{\*\s*(\S+)\s*(.*?)\s*\*\}\s*$/;
  return lines.map((l, i) => {
    const m = re.exec(l);
    if (!m) return l;
    const r = st.o.readSnippet(m[2], { line: i + 1 + st.o.lineOffset, code: true, relative: true });
    if (!r || !r.codeFile) {
      st.o.report('warning', 'mkdocs-code-include-missing', `Code include {* ${m[2]} *} could not be resolved.`, { line: i + 1 + st.o.lineOffset, action: 'Left the line as written.', fix: 'Copy the code into a fenced block.' });
      return l;
    }
    st.codeImports.add(r.codeFile);
    const meta = [`file="${r.codeFile}"`];
    const hl = /\bhl\[([^\]]*)\]/.exec(m[3]);
    const ln = /\bln\[([^\]]*)\]/.exec(m[3]);
    if (ln) meta.push(`lines="${ln[1].replace(/:/g, '-').replace(/\s+/g, '')}"`);
    if (hl) meta.push(`{${hl[1].replace(/:/g, '-').replace(/\s+/g, '')}}`);
    const lang = (r.codeFile.split('.').pop() || 'text').replace(/^py$/, 'python');
    st.o.count('{* file *} code include', 'file= code import');
    return `${m[1]}\`\`\`${lang} ${meta.join(' ')}\n${m[1]}\`\`\``;
  }).flatMap((x) => x.split('\n'));
}

// ─── abbreviations (*[HTML]: Hyper Text Markup Language) ──────────────────────
function collectAbbreviations(lines, st) {
  const map = new Map();
  if (!st.o.exts.has('abbr')) return { lines, map };
  const out = [];
  let fence = null;
  for (const l of lines) {
    const f = FENCE_OPEN.exec(l);
    if (f) { if (!fence) fence = f[2]; else if (l.trim().startsWith(fence[0].repeat(fence.length)) && !l.trim().slice(fence.length).trim()) fence = null; }
    const m = !fence && /^\*\[([^\]]+)\]:\s*(.*)$/.exec(l);
    if (m) { map.set(m[1], m[2].trim()); continue; }
    out.push(l);
  }
  if (map.size) st.o.count('*[ABBR]: abbreviation', '<abbr>');
  return { lines: out, map };
}

// ─── block pass ───────────────────────────────────────────────────────────────
/** Lines that belong to an indented body: blank, or indented by at least `w` columns. Trailing blanks are given back. */
function takeIndented(lines, start, w) {
  let j = start;
  while (j < lines.length && (isBlank(lines[j]) || indentWidth(leadOf(lines[j])) >= w)) j++;
  let end = j;
  while (end > start && isBlank(lines[end - 1])) end--;
  return { body: lines.slice(start, end).map((l) => (isBlank(l) ? '' : dedent(l, w))), next: end };
}

function wrap(indent, open, body, close) {
  const inner = body.map((l) => (l ? indent + l : ''));
  while (inner.length && !inner[0]) inner.shift();
  while (inner.length && !inner[inner.length - 1]) inner.pop();
  return [`${indent}${open}`, '', ...inner, '', `${indent}${close}`];
}

const ADMON_RE = /^([ \t]*)(!!!|\?\?\?\+?)[ \t]+([\w-]+(?:[ \t]+[\w-]+)*)?[ \t]*(?:"(.*)"|'(.*)')?[ \t]*$/;
const TAB_RE = /^([ \t]*)===([!+]{0,2})[ \t]+(?:"(.*)"|'(.*)')[ \t]*$/;
const BLOCK_OPEN = /^([ \t]*)(\/{3,})[ \t]*([\w-]+)[ \t]*(?:\|[ \t]*(.*?))?[ \t]*$/;
const BLOCK_CLOSE = /^([ \t]*)(\/{3,})[ \t]*$/;
const MKDOCSTRINGS = /^([ \t]*):::[ \t]+([\w.:-]+)[ \t]*$/;
const MD_HTML_OPEN = /^([ \t]*)<([a-zA-Z][\w-]*)\b([^>]*?)\s+markdown(?:=(?:"[^"]*"|'[^']*'|\w+))?([^>]*)>[ \t]*$/;

function blocks(lines, st, firstLine) {
  const { o } = st;
  const out = [];
  let fence = null;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const lineNo = firstLine + i + o.lineOffset;
    if (fence) {
      if (fence.mermaid) {
        if (fence.close.test(l)) { out.push(`${fence.indent}</wc-mermaid>`); fence = null; } else out.push(l);
        continue;
      }
      out.push(l);
      if (fence.close.test(l)) fence = null;
      continue;
    }
    const fm = FENCE_OPEN.exec(l);
    if (fm && !/`/.test(fm[3]) || (fm && fm[2][0] === '~')) {
      const close = new RegExp(`^[ \\t]*${fm[2][0] === '`' ? '`' : '~'}{${fm[2].length},}[ \\t]*$`);
      const conv = convertFenceInfo(fm[3], st, lineNo);
      if (conv.mermaid) {
        fence = { close, mermaid: true, indent: fm[1] };
        out.push(`${fm[1]}<wc-mermaid>`);
        o.count('```mermaid', 'wc-mermaid');
        continue;
      }
      fence = { close };
      out.push(`${fm[1]}${fm[2]}${conv.info}`);
      continue;
    }

    let m;
    // ── admonitions ──
    if ((m = ADMON_RE.exec(l)) && (m[3] || m[4] !== undefined || m[5] !== undefined)) {
      const indent = m[1];
      const words = (m[3] || 'note').split(/\s+/);
      const kind = words[0].toLowerCase();
      const title = m[4] ?? m[5];
      const { body, next } = takeIndented(lines, i + 1, indentWidth(indent) + 4);
      const inner = blocks(body, st, firstLine + i + 1);
      if (m[2] === '!!!') out.push(...wrap(indent, calloutOpen(kind, title, st, lineNo), inner, '</wc-callout>'));
      else {
        const t = title || titleCase(kind);
        out.push(...accordion(indent, t, m[2] === '???+', inner));
        o.count(m[2] + ' collapsible admonition', 'wc-accordion');
      }
      if (words.slice(1).some((w) => /^inline$|^end$/.test(w))) o.count('!!! inline admonition (floated)', 'wc-callout (not floated)');
      i = next - 1;
      continue;
    }

    // ── content tabs (=== "Tab") and /// tab blocks ──
    if (TAB_RE.test(l) || (BLOCK_OPEN.test(l) && BLOCK_OPEN.exec(l)[3] === 'tab')) {
      const r = takeTabGroup(lines, i, st, firstLine);
      out.push(...r.out);
      i = r.next - 1;
      continue;
    }

    // ── pymdownx.blocks (/// note | Title … ///) ──
    if ((m = BLOCK_OPEN.exec(l))) {
      const blk = takeBlock(lines, i);
      if (blk) {
        out.push(...renderBlock(m, blk, st, firstLine, lineNo));
        i = blk.next - 1;
        continue;
      }
    }

    // ── mkdocstrings (::: package.module) ──
    if ((m = MKDOCSTRINGS.exec(l))) {
      const { next } = takeIndented(lines, i + 1, indentWidth(m[1]) + 4); // options block
      st.notes.mkdocstrings.push({ id: m[2], line: lineNo });
      out.push(...wrap(m[1], `<wc-callout type="warning" title="API reference: ${escAttr(m[2])}">`, [
        `This section was generated from Python docstrings by mkdocstrings (\`::: ${m[2]}\`). DocsLit does not run Python, so it was not rendered.`,
      ], '</wc-callout>'));
      o.count('::: mkdocstrings directive', 'placeholder callout');
      i = next - 1;
      continue;
    }

    // ── md_in_html (<div markdown>) ──
    if ((m = MD_HTML_OPEN.exec(l))) {
      const tag = m[2].toLowerCase();
      const end = findClosingTag(lines, i, tag);
      const attrs = (m[3] + m[4]).replace(/\s+$/, '');
      const isGrid = /class="[^"]*\bgrid\b[^"]*"/.test(attrs);
      const innerLines = end === -1 ? lines.slice(i + 1) : lines.slice(i + 1, end);
      if (isGrid && end !== -1 && tag === 'div' && lines[end].trim() === '</div>') {
        const cards = gridToCards(attrs, innerLines, st, firstLine + i + 1);
        if (cards) {
          out.push(...wrap(m[1], `<wc-tiles cols="${cards.cols}">`, cards.lines, '</wc-tiles>'));
          o.count('<div class="grid cards" markdown>', 'wc-tiles + wc-card');
          i = end;
          continue;
        }
      }
      if (isGrid) { st.notes.gridCards++; o.count('<div class="grid cards" markdown>', 'grid (compat CSS)'); }
      const inner = blocks(innerLines, st, firstLine + i + 1);
      out.push(`${m[1]}<${m[2]}${attrs}>`, '', ...inner, '');
      if (end !== -1) { out.push(lines[end]); i = end; } else i = lines.length;
      continue;
    }

    // ── definition lists ──
    if (o.exts.has('def_list') && !isBlank(l) && isTermLine(l)) {
      const r = takeDefList(lines, i, st, firstLine);
      if (r) { out.push(...r.out); i = r.next - 1; continue; }
    }

    out.push(l);
  }
  if (fence && fence.mermaid) out.push(`${fence.indent}</wc-mermaid>`);
  return out;
}

// ─── md_in_html grids -> wc-tiles / wc-card ───────────────────────────────────
const GRID_ATTRS = /^\s*class\s*=\s*"grid(\s+cards)?"\s*$/;
const GRID_ITEM = /^([-*+]|\d+[.)])([ \t]+)(.*)$/;
const GRID_ICON = ':(material|fontawesome|octicons|simple)-([\\w-]+?):(?:\\{[^}]*\\})?';
const CARD_TITLE = new RegExp(`^((?:${GRID_ICON}[ \\t]*)+)?(?:__(.+?)__|\\*\\*(.+?)\\*\\*)(?:[ \\t]+(\\S.*?))?[ \\t]*$`);
const CARD_ARROW = ':(?:material|fontawesome|octicons)-[\\w-]*(?:arrow|chevron)[\\w-]*:(?:\\{[^}]*\\})?';
const CARD_LINK = new RegExp(`^(?:${CARD_ARROW}[ \\t]*)?\\[(?:${CARD_ARROW}[ \\t]*)?([^\\]]+?)\\]\\(([^)\\s]+)\\)$`);

/**
 * Convert a `<div class="grid cards" markdown>` list, or a `<div class="grid" markdown>` whose children are all
 * `{ .card }` blocks, to wc-tiles + wc-card. Returns { cols, lines } or null (grid kept as a div + compat CSS).
 */
function gridToCards(attrs, inner, st, firstLine) {
  const m = GRID_ATTRS.exec(attrs);
  if (!m) return null;
  let items = gridListItems(inner);
  if (!items) items = gridCardBlocks(inner);
  else if (!m[1]) return null; // a bare list in a plain grid is not a card grid
  if (!items || !items.length) return null;
  const lines = [];
  for (const it of items) { if (lines.length) lines.push(''); lines.push(...gridCard(it, st, firstLine)); }
  // Material fills rows with 3+ cards on wide screens; mirror that when the count divides evenly into 3.
  return { cols: items.length >= 3 && items.length % 3 === 0 ? 3 : 2, lines };
}

/** Split a pure Markdown list into items (each an array of dedented lines), or null if the content is not only a list. */
function gridListItems(inner) {
  const ls = inner.slice();
  while (ls.length && isBlank(ls[0])) ls.shift();
  while (ls.length && isBlank(ls[ls.length - 1])) ls.pop();
  if (!ls.length) return null;
  const base = indentWidth(leadOf(ls[0]));
  const raw = [];
  let fence = null;
  for (const l0 of ls) {
    const l = isBlank(l0) ? '' : dedent(l0, base);
    const f = FENCE_OPEN.exec(l);
    if (f && /^\s/.test(l)) { if (!fence) fence = f[2]; else if (l.trim().startsWith(fence)) fence = null; }
    const im = !fence && GRID_ITEM.exec(l);
    if (im) raw.push({ first: im[3], col: im[1].length + im[2].length, rest: [] });
    else if (!raw.length || (!isBlank(l) && !/^\s/.test(l))) return null;
    else raw[raw.length - 1].rest.push(l);
  }
  return raw.map((r) => {
    const widths = r.rest.filter((x) => !isBlank(x)).map((x) => indentWidth(leadOf(x)));
    const d = widths.length ? Math.min(...widths) : 0;
    return [r.first, ...r.rest.map((x) => (isBlank(x) ? '' : dedent(x, d)))];
  });
}

/** Blank-line separated blocks that each end in `{ .card }`; anything else makes the grid unconvertible. */
function gridCardBlocks(inner) {
  const items = [];
  let cur = [];
  let fence = null;
  const flush = () => {
    if (!cur.length) return true;
    const last = cur[cur.length - 1];
    if (cur.length < 2 || !/^\s*\{\s*\.card\s*\}\s*$/.test(last)) return false;
    items.push(cur.slice(0, -1).map((l) => l.trim() ? l : ''));
    cur = [];
    return true;
  };
  for (const l of inner) {
    const f = FENCE_OPEN.exec(l);
    if (f) { if (!fence) fence = f[2]; else if (l.trim().startsWith(fence)) fence = null; }
    if (!fence && isBlank(l)) { if (!flush()) return null; continue; }
    cur.push(l);
  }
  if (!flush()) return null;
  const base = Math.min(...items.map((it) => indentWidth(leadOf(it[0]))));
  return items.map((it) => it.map((l) => (isBlank(l) ? '' : dedent(l, base))));
}

/** One card: leading icon + bold title, `---` separator, body, trailing single link -> href + cta. */
function gridCard(item, st, firstLine) {
  let body = item.slice();
  while (body.length && isBlank(body[0])) body.shift();
  const attrs = [];
  const tm = CARD_TITLE.exec(body[0] || '');
  if (tm && (body.length === 1 || isBlank(body[1]) || /^-{3}$/.test(body[1].trim()))) {
    const title = (tm[4] ?? tm[5]).trim();
    const im = tm[1] && new RegExp(GRID_ICON).exec(tm[1]);
    attrs.push(['title', title]);
    if (im) {
      const tag = iconTag(im[1], im[2], st, im[0]);
      const nm = /name="([^"]+)"(?: icon-type="(\w+)")?/.exec(tag);
      if (nm) attrs.push(['icon', nm[2] ? `fa-${nm[2]} fa-${nm[1]}` : nm[1]]);
    }
    body.shift();
    const tail = tm[6] ? [tm[6]] : []; // text after the bold title on the same line stays in the body
    while (body.length && isBlank(body[0])) body.shift();
    if (body.length && /^-{3}$/.test(body[0].trim())) body.shift();
    while (body.length && isBlank(body[0])) body.shift();
    if (tail.length) body = [...tail, ...(body.length ? ['', ...body] : [])];
  }
  while (body.length && isBlank(body[body.length - 1])) body.pop();
  let k = body.length - 1;
  while (k >= 0 && !isBlank(body[k])) k--;
  if (body.length && body.length - 1 - k === 1 && (k < 0 || isBlank(body[k]))) {
    const lm = CARD_LINK.exec(body[body.length - 1].trim());
    const rest = body.slice(0, k + 1).join('\n');
    if (lm && !/\]\(|\]\[|<a[\s>]|https?:\/\//.test(rest)) {
      attrs.push(['href', lm[2]], ['cta', lm[1].trim()]);
      body = body.slice(0, k + 1);
      while (body.length && isBlank(body[body.length - 1])) body.pop();
    }
  }
  const open = `<wc-card${attrs.map(([a, v]) => ` ${a}="${escAttr(v)}"`).join('')}>`;
  return wrap('', open, blocks(body, st, firstLine), '</wc-card>');
}

/** A collapsible block: wc-accordion must sit inside a wc-accordion-group. */
function accordion(indent, title, open, inner) {
  const body = wrap(indent, `<wc-accordion title="${escAttr(title)}"${open ? ' open' : ''}>`, inner, '</wc-accordion>');
  return [`${indent}<wc-accordion-group>`, ...body, `${indent}</wc-accordion-group>`];
}

function calloutOpen(kind, title, st, line) {
  const type = ADMONITION[kind] || 'note';
  if (!ADMONITION[kind]) st.o.report('info', 'mkdocs-admonition-type', `Custom admonition type "${kind}" was converted to a "note" callout.`, { line, fix: 'Pick a wc-callout type (info, tip, warning, danger, …) if the colour matters.' });
  let t = title;
  if (t === undefined && type !== kind) t = titleCase(kind);
  st.o.count(`!!! ${ADMONITION[kind] ? kind : 'custom'} admonition`, `wc-callout type="${type}"`);
  return `<wc-callout type="${type}"${t !== undefined && t !== '' ? ` title="${escAttr(t)}"` : ''}>`;
}

// ─── code fence info strings (superfences / highlight) ────────────────────────
function convertFenceInfo(info, st, line) {
  let s = info.trim();
  if (!s) return { info: '' };
  let lang = '';
  const attrs = {};
  const classes = [];
  if (s.startsWith('{')) {
    s = s.replace(/^\{\s*|\s*\}$/g, '');
    for (const t of tokenize(s)) {
      if (t.startsWith('.')) { if (!lang) lang = t.slice(1); else classes.push(t.slice(1)); } else if (t.startsWith('#')) { /* id: dropped */ } else { const kv = splitKv(t); if (kv) attrs[kv[0]] = kv[1]; }
    }
  } else {
    const toks = tokenize(s);
    lang = toks.shift() || '';
    if (/^\{.*\}$/.test(lang)) { lang = ''; }
    for (const t of toks) {
      if (/^\{[\d,\s-]+\}$/.test(t)) { attrs.__hl = t.slice(1, -1); continue; } // DocsLit highlight from a code include
      if (t.startsWith('{') && t.endsWith('}')) { for (const x of tokenize(t.slice(1, -1))) { if (x.startsWith('.')) classes.push(x.slice(1)); else { const kv = splitKv(x); if (kv) attrs[kv[0]] = kv[1]; } } continue; }
      const kv = splitKv(t);
      if (kv) attrs[kv[0]] = kv[1]; else attrs[t] = true;
    }
  }
  if (lang.toLowerCase() === 'mermaid') return { mermaid: true };
  const meta = [];
  if (attrs.file && st.codeImports.has(attrs.file)) meta.push(`file="${attrs.file}"`); // set by snippet / {* *} code imports
  else if (attrs.file && !attrs.title) attrs.title = attrs.file; // a source file= is just a filename label
  if (attrs.file && attrs.lines) meta.push(`lines="${attrs.lines}"`);
  if (attrs.__hl) meta.push(`{${attrs.__hl}}`);
  if (attrs.title) meta.push(`title="${String(attrs.title).replace(/"/g, '&quot;')}"`);
  if (attrs.hl_lines) meta.push(`{${String(attrs.hl_lines).trim().replace(/\s+/g, ',')}}`);
  if (attrs.linenums) {
    meta.push('lines');
    const n = Number(String(attrs.linenums).split(/\s+/)[0]);
    if (n > 1) meta.push(`startLine=${n}`);
  }
  if (classes.includes('no-copy') || attrs.nocopy) meta.push('nocopy');
  if (classes.includes('annotate')) { st.notes.annotations++; st.o.count('code annotations (.annotate)', 'kept as comments + list'); }
  if (attrs.title || attrs.hl_lines || attrs.linenums) st.o.count('code block title / hl_lines / linenums', 'code block meta');
  void line;
  return { info: [lang, ...meta].filter(Boolean).join(' ') };
}

function tokenize(s) {
  const out = [];
  const re = /([\w.#:-]+=(?:"[^"]*"|'[^']*'|\S+)|\{[^}]*\}|"[^"]*"|'[^']*'|\S+)/g;
  let m;
  while ((m = re.exec(s))) out.push(m[1]);
  return out;
}
function splitKv(t) {
  const m = /^([\w.:-]+)=(?:"([^"]*)"|'([^']*)'|(\S+))$/.exec(t);
  return m ? [m[1], m[2] ?? m[3] ?? m[4]] : null;
}

// ─── tabs ─────────────────────────────────────────────────────────────────────
function takeTabGroup(lines, start, st, firstLine) {
  const { o } = st;
  const tabs = [];
  let i = start;
  let indent = null;
  while (i < lines.length) {
    const l = lines[i];
    let m;
    if ((m = TAB_RE.exec(l))) {
      if (indent !== null && m[1] !== indent) break;
      if (tabs.length && m[2].includes('!')) break;
      indent = m[1];
      const { body, next } = takeIndented(lines, i + 1, indentWidth(indent) + 4);
      tabs.push({ ...tabLabel(m[3] ?? m[4], st), selected: m[2].includes('+'), body: blocks(body, st, firstLine + i + 1) });
      o.count('=== content tab', 'wc-tab');
      i = next;
    } else if ((m = BLOCK_OPEN.exec(l)) && m[3] === 'tab') {
      if (indent !== null && m[1] !== indent) break;
      const blk = takeBlock(lines, i);
      if (!blk) break;
      if (tabs.length && /^\s*new\s*:\s*(true|yes|1)\s*$/im.test(blk.options.join('\n'))) break;
      indent = m[1];
      tabs.push({ ...tabLabel(m[4] || 'Tab', st), selected: /^\s*select\s*:\s*(true|yes|1)\s*$/im.test(blk.options.join('\n')), body: blocks(blk.body, st, firstLine + i + 1) });
      o.count('/// tab block', 'wc-tab');
      i = blk.next;
    } else break;
    // allow blank lines between tabs of one group
    let j = i;
    while (j < lines.length && isBlank(lines[j])) j++;
    if (j < lines.length && (TAB_RE.test(lines[j]) || (BLOCK_OPEN.test(lines[j]) && BLOCK_OPEN.exec(lines[j])[3] === 'tab'))) i = j; else break;
  }
  const ind = indent || '';
  const sel = tabs.findIndex((t) => t.selected);
  const attrs = [];
  if (o.tabsSync) attrs.push('sync="mkdocs-tabs"');
  if (sel > 0) attrs.push(`default-tab="${sel}"`);
  const out = [`${ind}<wc-tabs${attrs.length ? ' ' + attrs.join(' ') : ''}>`];
  for (const t of tabs) out.push(...wrap(ind, `<wc-tab label="${escAttr(t.label)}"${t.icon ? ` icon="${t.icon}"` : ''}>`, t.body, '</wc-tab>'));
  out.push(`${ind}</wc-tabs>`);
  return { out, next: i };
}

/** Tab label: a leading icon shortcode becomes the tab icon; Markdown code/emphasis marks are dropped. */
function tabLabel(raw, st) {
  let icon = null;
  let label = String(raw).replace(/:(material|fontawesome|octicons|simple)-([\w-]+?):/g, (m, set, name) => {
    const tag = iconTag(set, name, st, m);
    const n = /name="([^"]+)"/.exec(tag)?.[1];
    if (n && !icon) icon = (/icon-type="(\w+)"/.exec(tag) ? `fa-${/icon-type="(\w+)"/.exec(tag)[1]} fa-${n}` : n);
    return '';
  });
  label = label.replace(/[`*]/g, '').replace(/\s+/g, ' ').trim() || 'Tab';
  return { label, icon };
}

// ─── pymdownx.blocks ──────────────────────────────────────────────────────────
function takeBlock(lines, start) {
  const open = BLOCK_OPEN.exec(lines[start]);
  const slashes = open[2].length;
  const indent = indentWidth(open[1]);
  let i = start + 1;
  const options = [];
  while (i < lines.length && !isBlank(lines[i]) && indentWidth(leadOf(lines[i])) >= indent + 4 && /^\s*[\w-]+\s*:/.test(lines[i])) { options.push(lines[i].trim()); i++; }
  const body = [];
  let depth = 0;
  let fence = null;
  for (; i < lines.length; i++) {
    const l = lines[i];
    const f = FENCE_OPEN.exec(l);
    if (f) { if (!fence) fence = f[2]; else if (l.trim() === fence[0].repeat(l.trim().length) && l.trim().length >= fence.length) fence = null; }
    if (!fence && !f) {
      const o = BLOCK_OPEN.exec(l);
      if (o && o[2].length === slashes) depth++;
      const c = BLOCK_CLOSE.exec(l);
      if (c && c[2].length === slashes) {
        if (depth === 0) return { options, body: body.map((x) => (isBlank(x) ? '' : dedent(x, indent))), next: i + 1 };
        depth--;
      }
    }
    body.push(l);
  }
  return null;
}

function renderBlock(m, blk, st, firstLine, lineNo) {
  const { o } = st;
  const indent = m[1];
  const name = m[3].toLowerCase();
  const title = m[4];
  const opt = (k) => { const r = new RegExp(`^${k}\\s*:\\s*(.*)$`, 'i'); for (const x of blk.options) { const mm = r.exec(x); if (mm) return mm[1].trim().replace(/^["']|["']$/g, ''); } return undefined; };
  const inner = () => blocks(blk.body, st, lineNo + 1 + blk.options.length - o.lineOffset);
  if (BLOCK_ADMONITIONS.has(name) || name === 'admonition') {
    const kind = name === 'admonition' ? (opt('type') || 'note').toLowerCase() : name;
    return wrap(indent, calloutOpen(kind, title === undefined ? undefined : title, st, lineNo), inner(), '</wc-callout>');
  }
  if (name === 'details') {
    o.count('/// details', 'wc-accordion');
    const open = /^(true|yes|1)$/i.test(opt('open') || '');
    return accordion(indent, title || 'Details', open, inner());
  }
  if (name === 'caption' || name === 'figure-caption' || name === 'table-caption') {
    o.count('/// caption', '<figcaption>');
    return wrap(indent, '<figcaption>', inner(), '</figcaption>');
  }
  if (name === 'html') {
    const sel = /^([a-z][\w-]*)?((?:[.#][\w-]+)*)$/i.exec((title || 'div').trim());
    const tag = sel?.[1] || 'div';
    const cls = [...(sel?.[2] || '').matchAll(/\.([\w-]+)/g)].map((x) => x[1]);
    const id = /#([\w-]+)/.exec(sel?.[2] || '')?.[1];
    return wrap(indent, `<${tag}${id ? ` id="${id}"` : ''}${cls.length ? ` class="${cls.join(' ')}"` : ''}>`, inner(), `</${tag}>`);
  }
  if (name === 'define') {
    const r = takeDefList(blk.body, 0, st, lineNo + 1, true);
    return r ? r.out.map((x) => (x ? indent + x : x)) : inner();
  }
  if (name === 'attr') return inner();
  // custom admonition-style blocks registered by the site (e.g. /// version-added | v2.9)
  const label = titleCase(name) + (title ? `: ${title}` : '');
  o.count(`/// ${name} (custom block)`, 'wc-callout type="note"');
  o.report('info', 'mkdocs-block-custom', `Custom block "/// ${name}" was converted to a note callout titled "${label}".`, { line: lineNo, fix: 'Change the callout type if it should stand out differently.' });
  return wrap(indent, `<wc-callout type="${/deprecat|removed/.test(name) ? 'warning' : /added|new/.test(name) ? 'success' : 'note'}" title="${escAttr(label)}">`, inner(), '</wc-callout>');
}

// ─── definition lists ─────────────────────────────────────────────────────────
const DEF_RE = /^:[ \t]{1,3}(\S.*)$/;
function isTermLine(l) { return /^\S/.test(l) && !/^(#{1,6}\s|[-*+]\s|\d+[.)]\s|>|<|\||```|~~~|!!!|\?\?\?|===|\/\/\/|:)/.test(l); }
function takeDefList(lines, start, st, firstLine, fromBlock = false) {
  if (fromBlock) {
    // /// define: plain lines are terms, "- " items are definitions
    const out = ['<dl>'];
    for (const l of lines) {
      const d = /^[-*+]\s+(.*)$/.exec(l);
      if (d) out.push('<dd>', '', d[1], '', '</dd>'); else if (l.trim()) out.push('<dt>', '', l.trim(), '', '</dt>');
    }
    out.push('</dl>');
    st.o.count('/// define', '<dl>');
    return { out, next: lines.length };
  }
  let i = start;
  const items = [];
  while (i < lines.length) {
    const terms = [];
    let j = i;
    while (j < lines.length && !isBlank(lines[j]) && isTermLine(lines[j]) && !DEF_RE.test(lines[j])) { terms.push(lines[j]); j++; }
    let k = j;
    if (k < lines.length && isBlank(lines[k])) k++;
    if (!terms.length || k >= lines.length || !DEF_RE.test(lines[k])) break;
    if (terms.length > 1 && items.length === 0 && j - i > 1) { /* paragraph + term: only the last line is a term */ }
    const defs = [];
    while (k < lines.length && DEF_RE.test(lines[k])) {
      const first = DEF_RE.exec(lines[k])[1];
      const { body, next } = takeIndented(lines, k + 1, 4);
      defs.push(blocks([first, ...body], st, firstLine + k));
      k = next;
      let n = k; while (n < lines.length && isBlank(lines[n])) n++;
      if (n < lines.length && DEF_RE.test(lines[n])) k = n;
    }
    items.push({ terms, defs });
    i = k;
    let n = i; while (n < lines.length && isBlank(lines[n])) n++;
    if (n < lines.length && isTermLine(lines[n])) {
      let p = n; while (p < lines.length && !isBlank(lines[p]) && isTermLine(lines[p])) p++;
      if (p < lines.length && isBlank(lines[p])) p++;
      if (p < lines.length && DEF_RE.test(lines[p])) { i = n; continue; }
    }
    break;
  }
  if (!items.length) return null;
  const out = ['<dl>'];
  for (const it of items) {
    for (const t of it.terms) out.push('<dt>', '', t, '', '</dt>');
    for (const d of it.defs) out.push('<dd>', '', ...d, '', '</dd>');
  }
  out.push('</dl>');
  st.o.count('definition list', '<dl>');
  return { out, next: i };
}

function findClosingTag(lines, start, tag) {
  let depth = 0;
  const open = new RegExp(`<${tag}\\b[^>]*>`, 'gi');
  const close = new RegExp(`</${tag}\\s*>`, 'gi');
  let fence = null;
  for (let i = start; i < lines.length; i++) {
    const l = lines[i];
    const f = FENCE_OPEN.exec(l);
    if (f) { if (!fence) fence = f[2]; else if (l.trim().startsWith(fence)) fence = null; continue; }
    if (fence) continue;
    depth += (l.match(open) || []).filter((x) => !x.endsWith('/>')).length;
    depth -= (l.match(close) || []).length;
    if (i > start && depth <= 0) return /^\s*<\//.test(l) ? i : -1;
  }
  return -1;
}

// ─── inline pass ──────────────────────────────────────────────────────────────
// Applied to every line outside fenced code / raw HTML-only content; inline code spans are protected.
function inlinePass(body, st, abbr) {
  const { o } = st;
  const lines = body.split('\n');
  let fence = null;
  let inMermaid = false;
  let inMath = false;
  for (let n = 0; n < lines.length; n++) {
    let l = lines[n];
    if (/^\s*<wc-mermaid>/.test(l)) { inMermaid = true; continue; }
    if (inMermaid) { if (/^\s*<\/wc-mermaid>/.test(l)) inMermaid = false; continue; }
    const f = FENCE_OPEN.exec(l);
    if (f) { if (!fence) fence = f[2]; else if (l.trim().startsWith(fence[0].repeat(fence.length)) && !l.trim().replace(/[`~]/g, '')) fence = null; continue; }
    if (fence) continue;
    if (/^\s*\$\$/.test(l)) { if (!/^\s*\$\$.*\$\$\s*$/.test(l.trim().length > 2 ? l : '')) inMath = !inMath; continue; }
    if (inMath) { if (/^\s*\\\]\s*$/.test(l)) { lines[n] = l.replace('\\]', '$$$$'); inMath = false; } continue; }
    if (/^\s*<\/?(wc-tabs|wc-tab|wc-callout|wc-accordion|wc-accordion-group|wc-mermaid|dl|dt|dd|figcaption)\b[^>]*>\s*$/.test(l)) continue;
    if (/^ {4,}\S/.test(l) && n > 0 && isBlank(lines[n - 1]) && !/^\s*</.test(l) && !/^\s*([-*+]|\d+[.)])\s/.test(l)) { /* maybe indented code: still convert attr lists conservatively */ }
    if (o.exts.has('pymdownx.arithmatex')) {
      // block math: \[ … \] on its own line(s) -> $$ … $$
      const bm = /^(\s*)\\\[(.*?)(\\\])?\s*$/.exec(l);
      if (bm && (bm[3] || !bm[2].trim())) { lines[n] = `${bm[1]}$$${bm[2]}${bm[3] ? '$$' : ''}`; if (!bm[3]) inMath = true; continue; }
      l = protectCodeSpans(l, (seg) => arithmatexInline(seg, st));
    }
    lines[n] = protectCode(l, (seg) => inlineSegment(seg, st, abbr, n + 1 + o.lineOffset));
  }
  return lines.join('\n');
}

function protectCode(line, fn) {
  // inline math ($…$, $$…$$, \(…\)) is never rewritten
  if (/\$|\\\(/.test(line)) {
    const segs = line.split(/(\$\$[^$]+\$\$|\$[^$\s][^$]*?\$|\\\(.+?\\\))/g);
    if (segs.length > 1) return segs.map((x, k) => (k % 2 ? x : protectCodeSpans(x, fn))).join('');
  }
  return protectCodeSpans(line, fn);
}

function protectCodeSpans(line, fn) {
  // split on inline code spans `...` (any backtick run length) and leave those untouched
  const parts = [];
  let i = 0;
  let last = 0;
  while (i < line.length) {
    if (line[i] === '`') {
      let k = i; while (line[k] === '`') k++;
      const tick = line.slice(i, k);
      const end = line.indexOf(tick, k);
      if (end !== -1 && line[end + tick.length] !== '`') {
        parts.push(fn(line.slice(last, i)), line.slice(i, end + tick.length));
        i = end + tick.length; last = i; continue;
      }
      i = k; continue;
    }
    i++;
  }
  parts.push(fn(line.slice(last)));
  return parts.join('');
}

const ATTR_BODY = String.raw`(?:#[\w.:-]+|\.[\w:-]+|[\w:-]+(?:=(?:"[^"]*"|'[^']*'|[^\s}"']+))?)`;
const ATTR_LIST = new RegExp(String.raw`\{:?[ \t]*(${ATTR_BODY}(?:[ \t]+${ATTR_BODY})*)[ \t]*\}`);

function parseAttrList(s) {
  const r = { classes: [], id: null, kv: {} };
  for (const t of tokenize(s)) {
    if (t.startsWith('.')) r.classes.push(t.slice(1));
    else if (t.startsWith('#')) r.id = t.slice(1);
    else { const kv = splitKv(t); if (kv) r.kv[kv[0]] = kv[1]; else r.kv[t] = true; }
  }
  return r;
}

function inlineSegment(seg, st, abbr, line) {
  const { o } = st;
  if (!seg) return seg;
  let s = seg;

  // macros / Jinja: detected and reported per page (never executed)
  if (/\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}/.test(s)) {
    s = s.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (m, name) => {
      if (!o.macros?.enabled) return m;
      const v = o.macros.resolve(name);
      if (v) { o.count('{{ macro variable }}', '{{VAR}}'); return `{{${v}}}`; }
      return m;
    });
    for (const mm of s.matchAll(/\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}/g)) if (!/^\{\{[A-Z_][A-Z0-9_]*\}\}$/.test(mm[0])) st.notes.macros.push({ text: mm[0], line });
  }
  if (/\{(\+\+|--|~~|==|>>)[\s\S]*?(\+\+|--|~~|==|<<)\}/.test(s)) st.notes.critic++;

  // heading attribute lists: ## Title { #id .class }
  const h = /^(\s*#{1,6}\s+.*?)\s*\{:?\s*([^}]*)\}\s*$/.exec(s);
  if (h && ATTR_LIST.test(`{${h[2]}}`)) {
    const a = parseAttrList(h[2]);
    s = h[1].replace(/\s+#+$/, '') + (a.id ? ` <a id="${escAttr(a.id)}"></a>` : '');
    o.count('heading { #id }', a.id ? 'anchor' : 'dropped');
  }

  // buttons: [Text](url){ .md-button .md-button--primary }
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)\{\s*([^}]*\.md-button\b[^}]*)\}/g, (m, text, url, attrs) => {
    const a = parseAttrList(attrs);
    o.count('{ .md-button }', 'wc-button');
    return `<wc-button label="${escAttr(text.replace(/[*_`]/g, ''))}" href="${escAttr(url)}" variant="${a.classes.includes('md-button--primary') ? 'primary' : 'outline'}"></wc-button>`;
  });

  // images with attributes: ![alt](src){ width="300" align=left loading=lazy }
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)\{\s*([^}]*)\}/g, (m, alt, src, title, attrs) => {
    const a = parseAttrList(attrs);
    const keep = ['width', 'height'].filter((k) => a.kv[k] !== undefined);
    if (!keep.length && !a.classes.length) { st.notes.attrDropped++; return `![${alt}](${src}${title ? ` "${title}"` : ''})`; }
    o.count('image { width= }', '<img>');
    return `<img src="${escAttr(src)}" alt="${escAttr(alt)}"${keep.map((k) => ` ${k}="${escAttr(a.kv[k])}"`).join('')}${a.classes.length ? ` class="${escAttr(a.classes.join(' '))}"` : ''}${title ? ` title="${escAttr(title)}"` : ''} />`;
  });

  // remaining attribute lists after links / emphasis / at end of a block line: dropped
  s = s.replace(new RegExp(String.raw`(\)|\]|\*|>)\{:?[ \t]*${ATTR_BODY}(?:[ \t]+${ATTR_BODY})*[ \t]*\}`, 'g'), (m, pre) => { st.notes.attrDropped++; return pre; });
  if (/^\s*\{:?\s*[.#][^}]*\}\s*$/.test(s)) { if (/\.annotate\b/.test(s)) st.notes.annotations++; st.notes.attrDropped++; return ''; }
  s = s.replace(new RegExp(String.raw`[ \t]+\{:?[ \t]*(?:[.#][\w:-]+)(?:[ \t]+${ATTR_BODY})*[ \t]*\}[ \t]*$`), () => { st.notes.attrDropped++; return ''; });

  // icons and emoji shortcodes: :material-x: :fontawesome-brands-github: :octicons-x-16: :simple-x:
  s = s.replace(/:(material|fontawesome|octicons|simple)-([\w-]+?):(?:\{[^}]*\})?/g, (m, set, name) => iconTag(set, name, st, m));

  // keys: ++ctrl+alt+del++
  if (o.exts.has('pymdownx.keys')) {
    s = s.replace(/\+\+([\w-]+(?:\+[\w-]+)*)\+\+/g, (m, keys) => {
      o.count('++keys++', '<kbd>');
      return keys.split('+').map((k) => `<kbd>${escAttr(KEY_NAMES[k.toLowerCase()] || (k.length === 1 ? k.toUpperCase() : titleCase(k)))}</kbd>`).join('+');
    });
  }
  if (o.exts.has('pymdownx.mark')) s = s.replace(/(^|[^=\w])==(?=\S)([^=\n]*?\S)==(?![=\w])/g, (m, pre, t) => { o.count('==mark==', '<mark>'); return `${pre}<mark>${t}</mark>`; });
  if (o.exts.has('pymdownx.caret')) {
    s = s.replace(/(^|[^^\w])\^\^(?=\S)([^^\n]*?\S)\^\^(?![\^\w])/g, (m, pre, t) => { o.count('^^insert^^', '<ins>'); return `${pre}<ins>${t}</ins>`; });
    s = s.replace(/(^|[^^\w\\])\^(?=[^\s^])((?:\\ |[^\s^])+?)\^(?![\^\w])/g, (m, pre, t) => { o.count('^superscript^', '<sup>'); return `${pre}<sup>${t.replace(/\\ /g, ' ')}</sup>`; });
  }
  if (o.exts.has('pymdownx.tilde')) s = s.replace(/(^|[^~\w\\])~(?=[^\s~])((?:\\ |[^\s~])+?)~(?![~\w])/g, (m, pre, t) => { o.count('~subscript~', '<sub>'); return `${pre}<sub>${t.replace(/\\ /g, ' ')}</sub>`; });


  // abbreviations
  if (abbr && abbr.size && !/^\s*#{1,6}\s/.test(s)) {
    for (const [k, v] of abbr) {
      const re = new RegExp(`(^|[^\\w<>/="-])(${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(?![\\w])`, 'g');
      s = splitOutsideTags(s, (txt) => txt.replace(re, (m, pre, w) => `${pre}<abbr title="${escAttr(v)}">${w}</abbr>`));
    }
  }
  return s;
}

/** arithmatex \( … \) and \[ … \] -> $ … $ and $$ … $$ (DocsLit's KaTeX syntax). */
function arithmatexInline(s, st) {
  return s.replace(/\\\((.+?)\\\)/g, (m, t) => { st.notes.mathRound = true; st.o.count('\\( … \\) math', '$ … $'); return `$${t}$`; });
}

/** Collapse runs of blank lines outside fenced code. */
function tidyBlank(text) {
  const out = [];
  let fence = null;
  let blank = 0;
  for (const l of text.split('\n')) {
    const f = FENCE_OPEN.exec(l);
    if (f) { if (!fence) fence = f[2]; else if (l.trim().startsWith(fence[0].repeat(fence.length)) && !l.trim().replace(/[`~]/g, '')) fence = null; }
    if (!fence && !f && !l.trim()) { if (++blank > 1) continue; } else blank = 0;
    out.push(l);
  }
  return out.join('\n').replace(/^\n+/, '');
}

/** Apply fn to the text outside HTML tags and outside link URLs. */
function splitOutsideTags(s, fn) {
  return s.split(/(<[^>]+>|\]\([^)]*\))/g).map((p, i) => (i % 2 ? p : fn(p))).join('');
}

export function iconTag(set, name, st, raw) {
  const { o } = st;
  const r = mapShortcodeIcon(set, name);
  if (r && resolveIcon(r.type ? `fa-${r.type} fa-${r.name}` : r.name).kind === 'svg') {
    o.count(`:${set}-…: icon`, 'wc-icon');
    return `<wc-icon name="${r.name}"${r.type ? ` icon-type="${r.type}"` : ''}></wc-icon>`;
  }
  st.notes.iconMiss.add(`${set}-${name}`);
  void raw;
  return '';
}

// ─── link pass ────────────────────────────────────────────────────────────────
const linkProcessor = () => unified().use(remarkParse).use(remarkGfm).use(remarkMath);

/**
 * Rewrite every Markdown link/image/definition and raw-HTML src/href in `body`.
 * link(url, {line}) / asset(url, {line}) return the new URL (or the same one).
 */
export function rewriteLinks(body, opts) {
  // Long pages (changelogs) are parsed per heading section: Markdown parsing time grows faster
  // than the page length, and a column-0 ATX heading always closes the blocks before it.
  const lines = body.split('\n');
  if (lines.length < 400) return rewriteLinksChunk(body, opts);
  const chunks = [];
  let start = 0;
  let fence = null;
  for (let i = 0; i < lines.length; i++) {
    const f = FENCE_OPEN.exec(lines[i]);
    if (f) { if (!fence) fence = f[2]; else if (lines[i].trim().startsWith(fence[0].repeat(fence.length)) && !lines[i].trim().replace(/[`~]/g, '')) fence = null; continue; }
    if (!fence && i - start >= 150 && /^#{1,6}\s/.test(lines[i])) { chunks.push([start, i]); start = i; }
  }
  chunks.push([start, lines.length]);
  if (chunks.length === 1) return rewriteLinksChunk(body, opts);
  return chunks.map(([a, b]) => rewriteLinksChunk(lines.slice(a, b).join('\n'), { ...opts, lineOffset: (opts.lineOffset || 0) + a })).join('\n');
}

function rewriteLinksChunk(body, { link, asset, lineOffset = 0 }) {
  let tree;
  try { tree = linkProcessor().parse(body); } catch { return body; }
  const edits = [];
  const lineOf = (node) => (node.position?.start.line || 1) + lineOffset;
  visit(tree, (node) => {
    if (!node.position) return;
    const s = node.position.start.offset;
    const e = node.position.end.offset;
    if (node.type === 'link' || node.type === 'image') {
      const slice = body.slice(s, e);
      const idx = slice.lastIndexOf('](');
      if (idx === -1) return;
      const m = /^\]\(\s*(<[^>]*>|[^\s)]*)/.exec(slice.slice(idx));
      if (!m || !m[1]) return;
      const off = s + idx + m[0].length - m[1].length;
      const raw = m[1].replace(/^<|>$/g, '');
      const next = node.type === 'image' ? asset(raw, { line: lineOf(node) }) : link(raw, { line: lineOf(node) });
      if (next != null && next !== raw) edits.push({ s: off, e: off + m[1].length, text: /\s/.test(next) ? `<${next}>` : next });
    } else if (node.type === 'definition') {
      const slice = body.slice(s, e);
      const m = /^\s*\[[^\]]*\]:\s*(<[^>]*>|\S+)/.exec(slice);
      if (!m) return;
      const off = s + m[0].length - m[1].length;
      const raw = m[1].replace(/^<|>$/g, '');
      const isImg = /\.(png|jpe?g|gif|svg|webp|avif|ico|bmp)(#.*)?$/i.test(raw);
      const next = isImg ? asset(raw, { line: lineOf(node) }) : link(raw, { line: lineOf(node) });
      if (next != null && next !== raw) edits.push({ s: off, e: off + m[1].length, text: next });
    } else if (node.type === 'html') {
      const text = body.slice(s, e);
      for (const mm of text.matchAll(/\b(src|href)=("([^"]*)"|'([^']*)')/g)) {
        const raw = mm[3] ?? mm[4];
        if (!raw) continue;
        const isAsset = mm[1] === 'src' || /\.(png|jpe?g|gif|svg|webp|avif|ico|pdf|mp4|webm)(#.*)?$/i.test(raw);
        const next = isAsset ? asset(raw, { line: lineOf(node), html: true }) : link(raw, { line: lineOf(node), html: true });
        if (next != null && next !== raw) {
          const off = s + mm.index + mm[1].length + 2;
          edits.push({ s: off, e: off + raw.length, text: next.replace(/"/g, '%22') });
        }
      }
    }
  });
  edits.sort((a, b) => a.s - b.s);
  let out = '';
  let pos = 0;
  for (const ed of edits) { if (ed.s < pos) continue; out += body.slice(pos, ed.s) + ed.text; pos = ed.e; }
  return out + body.slice(pos);
}

/** Compat CSS for Material classes that survive the conversion (grid cards). */
export const MATERIAL_COMPAT_CSS = `/* Material for MkDocs compatibility (added by docslit import) */
.grid { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr)); margin: 1em 0; }
.grid.cards > ul, .grid.cards > ol { display: contents; }
.grid.cards > ul > li, .grid.cards > ol > li, .grid > .card { list-style: none; margin: 0; padding: 1rem; border: 1px solid var(--border, rgba(127,127,127,.25)); border-radius: var(--radius, 8px); }
.grid.cards > ul > li > hr, .grid.cards > ol > li > hr { margin: .5rem 0; }
`;
