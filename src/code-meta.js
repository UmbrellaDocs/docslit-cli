/**
 * Pure helpers for code-block options (no Shiki, no DOM).
 *
 *  - parseCodeMeta(meta)         fence info string (everything after the language) -> options
 *  - parseLineSpec(spec)         "1,3-5" / "[1,3]" / "{2-4, 6}" -> sorted unique line numbers
 *  - formatLineSpec(numbers)     [1,3,4,5] -> "1,3-5"
 *  - applyNotation(code, lang)   Shiki-style `// [!code ++]` comment notation -> clean code + per-line marks
 *  - diffLineMarks(code)         `diff` language: + / - / @@ lines -> marks
 *  - cleanNotationForMarkdown(md) rewrite fences for the generated .md / llms output
 *
 * Mintlify (`{1,3}`, `highlight={1-2,5}`, `focus=2,4`, `lines`, `expandable`, `wrap`, `nocopy`,
 * `icon=`, `title="x"` / bare title words) and Fern (`{2-4, 6}`, `focus={2-4}`, `startLine={6}`,
 * `maxLines=10`, `wordWrap`, `showLineNumbers={false}`, `for="npm"`, `title={"x"}`) meta syntax are
 * both understood, next to DocsLit's own `filename="x" linenumbers="true"`.
 */

const FLAG_WORDS = new Set([
  'lines', 'linenumbers', 'showlinenumbers', 'expandable', 'wrap', 'wordwrap', 'nocopy', 'twoslash', 'annotate',
]);

/** Languages whose grammar has no comment syntax: Shiki would never see a notation comment there. */
const NO_NOTATION_LANGS = new Set(['', 'text', 'txt', 'plain', 'plaintext', 'markdown', 'md', 'mdx', 'diff', 'patch', 'json', 'csv', 'output', 'console']);

export function supportsNotation(lang) {
  return !NO_NOTATION_LANGS.has(String(lang || '').toLowerCase());
}

const stripQuotes = (s) => {
  const t = String(s).trim();
  const m = t.match(/^(["'])([\s\S]*)\1$/);
  return m ? m[2] : t;
};

/** Split a fence meta string into tokens. Understands "..." '...' {...} (balanced) and key=value forms. */
export function tokenizeMeta(meta) {
  const s = String(meta || '');
  const out = [];
  let i = 0;
  const n = s.length;
  const readBalanced = () => {
    let depth = 0;
    let j = i;
    for (; j < n; j++) {
      if (s[j] === '{') depth++;
      else if (s[j] === '}') { depth--; if (depth === 0) { j++; break; } }
    }
    const raw = s.slice(i, j);
    i = j;
    return raw;
  };
  const readQuoted = () => {
    const q = s[i];
    let j = i + 1;
    while (j < n && s[j] !== q) j++;
    const raw = s.slice(i + 1, j);
    i = Math.min(j + 1, n);
    return raw;
  };
  while (i < n) {
    if (/\s/.test(s[i])) { i++; continue; }
    if (s[i] === '{') { out.push({ kind: 'brace', value: readBalanced().slice(1, -1) }); continue; }
    if (s[i] === '"' || s[i] === "'") { out.push({ kind: 'word', value: readQuoted(), quoted: true }); continue; }
    // key[=value] or a bare word
    let j = i;
    while (j < n && !/[\s=]/.test(s[j]) && s[j] !== '{') j++;
    const key = s.slice(i, j);
    if (s[j] === '=' && key) {
      i = j + 1;
      let value = '';
      if (s[i] === '"' || s[i] === "'") value = readQuoted();
      else if (s[i] === '{') {
        value = readBalanced().slice(1, -1).trim();
        value = stripQuotes(value); // {"x"} (JSX string) -> x
      } else {
        let k = i;
        while (k < n && !/\s/.test(s[k])) k++;
        value = s.slice(i, k);
        i = k;
      }
      out.push({ kind: 'kv', key, value });
      continue;
    }
    // bare word: read to whitespace (keeps file names / dots intact)
    let k = i;
    while (k < n && !/\s/.test(s[k]) && s[k] !== '{') k++;
    if (k === i) k = i + 1;
    out.push({ kind: 'word', value: s.slice(i, k) });
    i = k;
  }
  return out;
}

/** "1,3-5", "[1,3,4]", "2-4, 6", "{[1-3, 5]}" -> [1,3,4,5]. Invalid pieces are ignored. */
export function parseLineSpec(spec) {
  const set = new Set();
  const text = String(spec ?? '').replace(/[{}[\]"']/g, '');
  for (const part of text.split(/[\s,]+/)) {
    if (!part) continue;
    const m = part.match(/^(\d+)(?:\s*[-–]\s*(\d+))?$/);
    if (!m) continue;
    const a = Number(m[1]);
    const b = m[2] !== undefined ? Number(m[2]) : a;
    if (a < 1 || b < a || b - a > 10000) continue;
    for (let k = a; k <= b; k++) set.add(k);
  }
  return [...set].sort((x, y) => x - y);
}

/** [1,3,4,5] -> "1,3-5" */
export function formatLineSpec(numbers) {
  const nums = [...new Set(numbers)].sort((a, b) => a - b);
  const parts = [];
  for (let i = 0; i < nums.length;) {
    let j = i;
    while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++;
    parts.push(j > i ? `${nums[i]}${j > i + 1 ? '-' : ','}${nums[j]}` : String(nums[i]));
    i = j + 1;
  }
  return parts.join(',');
}

function toBool(value, dflt = true) {
  if (value === undefined || value === null || value === '') return dflt;
  const v = String(value).trim().toLowerCase();
  if (v === 'false' || v === '0' || v === 'no' || v === 'off' || v === 'null') return false;
  return true;
}

function toInt(value) {
  const n = parseInt(String(value).replace(/[^\d-]/g, ''), 10);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Parse a fence info string (the part after the language) into canonical options:
 *   { filename, icon, highlight[], focus[], linenumbers?, startLine?, wrap, expandable, maxLines?,
 *     nocopy, for, theme, twoslash }
 * `linenumbers` is undefined when the meta does not say (so a site default can apply).
 */
export function parseCodeMeta(meta) {
  const o = { highlight: [], focus: [], wrap: false, expandable: false, nocopy: false, twoslash: false, annotate: false };
  const titleWords = [];
  let explicitTitle;
  for (const t of tokenizeMeta(meta)) {
    if (t.kind === 'brace') {
      // {1,3-5} (Mintlify / Fern / rehype-pretty-code). Anything non-numeric is ignored.
      o.highlight.push(...parseLineSpec(t.value));
      continue;
    }
    if (t.kind === 'word') {
      const low = t.value.toLowerCase();
      if (!t.quoted && FLAG_WORDS.has(low)) {
        if (low === 'lines' || low === 'linenumbers' || low === 'showlinenumbers') o.linenumbers = true;
        else if (low === 'expandable') o.expandable = true;
        else if (low === 'wrap' || low === 'wordwrap') o.wrap = true;
        else if (low === 'nocopy') o.nocopy = true;
        else if (low === 'twoslash') o.twoslash = true;
        else if (low === 'annotate') o.annotate = true;
        continue;
      }
      titleWords.push(t.value);
      continue;
    }
    const key = t.key.toLowerCase().replace(/[-_]/g, '');
    const v = t.value;
    switch (key) {
      case 'title':
      case 'filename':
        explicitTitle = v;
        break;
      case 'icon': o.icon = v; break;
      case 'highlight': case 'hl': o.highlight.push(...parseLineSpec(v)); break;
      case 'focus': o.focus.push(...parseLineSpec(v)); break;
      case 'lines': case 'linenumbers': case 'showlinenumbers': {
        // `lines="10-25"` without file= is a code-import range that never got expanded: ignore it.
        if (v === '' || /^(true|false|0|1|yes|no|on|off|null)$/i.test(v)) o.linenumbers = toBool(v);
        break;
      }
      case 'startline': case 'start': { const n = toInt(v); if (n !== undefined && n >= 1) o.startLine = n; break; }
      case 'maxlines': { const n = toInt(v); if (n !== undefined && n >= 0) o.maxLines = n; break; }
      case 'wrap': case 'wordwrap': o.wrap = toBool(v); break;
      case 'expandable': o.expandable = toBool(v); break;
      case 'nocopy': o.nocopy = toBool(v); break;
      case 'twoslash': o.twoslash = toBool(v); break;
      case 'annotate': o.annotate = toBool(v); break;
      case 'for': if (v) o.for = v; break;
      case 'theme': if (v === 'dark' || v === 'light') o.theme = v; break; // Mintlify's theme={null} is dropped
      default: break; // unknown key=value: ignored (never part of the title)
    }
  }
  o.filename = explicitTitle !== undefined ? explicitTitle : titleWords.join(' ').trim();
  o.highlight = [...new Set(o.highlight)].sort((a, b) => a - b);
  o.focus = [...new Set(o.focus)].sort((a, b) => a - b);
  return o;
}

// ── Shiki-style notation comments ──────────────────────────────────────────────

const NOTE_RE = /(?:\/\/+|\/\*+|<!--|#+|--+|;+|%+|\{\/\*)[ \t]*\[!code[ \t]+(\+\+|--|highlight|focus|error|warning)(?::(\d+))?[ \t]*\][ \t]*(?:\*+\/\}?|-->)?[ \t]*$/;
const NOTE_KIND = { '++': 'add', '--': 'remove', highlight: 'hl', focus: 'focus', error: 'error', warning: 'warning' };

/**
 * Strip `// [!code ++]`-style markers and report which (1-based) cleaned line each applies to.
 * `[!code ++:3]` marks the current line and the next two; a comment-only line is removed and the
 * mark applies to the following line(s). Returns { code, marks: Map<line, Set<kind>> } with
 * kinds add | remove | hl | focus | error | warning.
 */
export function applyNotation(code, lang) {
  const marks = new Map();
  const src = String(code);
  if (!supportsNotation(lang) || !src.includes('[!code')) return { code: src, marks };
  const lines = src.split('\n');
  const out = [];
  const pending = []; // { kind, remaining }
  const mark = (line, kind) => {
    if (!marks.has(line)) marks.set(line, new Set());
    marks.get(line).add(kind);
  };
  for (const raw of lines) {
    const m = raw.match(NOTE_RE);
    let text = raw;
    let own = null;
    let commentOnly = false;
    if (m) {
      const before = raw.slice(0, m.index);
      commentOnly = before.trim() === '';
      text = before.replace(/[ \t]+$/, '');
      own = { kind: NOTE_KIND[m[1]], count: m[2] ? Math.max(1, Number(m[2])) : 1 };
    }
    if (commentOnly) {
      pending.push({ kind: own.kind, remaining: own.count });
      continue; // the marker line itself disappears
    }
    out.push(text);
    const lineNo = out.length;
    for (let p = pending.length - 1; p >= 0; p--) {
      mark(lineNo, pending[p].kind);
      pending[p].remaining--;
      if (pending[p].remaining <= 0) pending.splice(p, 1);
    }
    if (own) {
      mark(lineNo, own.kind);
      if (own.count > 1) pending.push({ kind: own.kind, remaining: own.count - 1 });
    }
  }
  return { code: out.join('\n'), marks };
}

/** `diff` / `patch` language: + / - / @@ line prefixes become add / remove / hunk marks. */
export function diffLineMarks(code) {
  const marks = new Map();
  String(code).split('\n').forEach((line, i) => {
    let kind = null;
    if (/^@@/.test(line)) kind = 'hunk';
    else if (/^(\+\+\+|---)\s/.test(line) || /^(diff |index )/.test(line)) kind = 'meta';
    else if (line.startsWith('+')) kind = 'add';
    else if (line.startsWith('-')) kind = 'remove';
    if (kind) marks.set(i + 1, new Set([kind]));
  });
  return marks;
}

// ── code annotations ────────────────────────────────────────────────────────────

// A marker is `(N)` / `(N)!` (N = 1..99) at the END of a comment: `# (1)`, `// note (2)`, `/* (3) */`,
// `<!-- (4) -->`, `-- (5)`, `; (6)`, `% (7)!`. `!` means "show only the badge" (the comment characters go away).
const ANNOTATION_RE = /(^|[ \t])(\/\/+|\/\*+|<!--|#+|--+|;+|%+)([^\n]*?)(?<![\w)\]])\(([1-9]\d?)\)(!)?([ \t]*(?:\*+\/|-->))?[ \t]*$/;

/**
 * Find the annotation marker on one line of code (plain text).
 * Returns null, or { n, bang, ops } where ops are non-overlapping edits on the plain line, in order:
 * { start, end, marker: true } (the `(N)` / `(N)!` text, replaced by the badge) or { start, end } (deleted:
 * comment characters and the whitespace around them, only for `(N)!`).
 */
export function findAnnotationMarker(line) {
  const text = String(line);
  if (!text.includes('(')) return null;
  const m = text.match(ANNOTATION_RE);
  if (!m) return null;
  const delimStart = m.index + m[1].length;
  const delimEnd = delimStart + m[2].length;
  const mStart = delimEnd + m[3].length;
  const mEnd = mStart + m[4].length + 2 + (m[5] ? 1 : 0);
  const n = Number(m[4]);
  const bang = !!m[5];
  if (!bang) return { n, bang, ops: [{ start: mStart, end: mEnd, marker: true }] };
  const ops = [];
  const inner = m[3];
  const innerStart = delimEnd + (inner.length - inner.trimStart().length);
  ops.push({ start: delimStart, end: inner.trim() ? innerStart : mStart });
  ops.push({ start: mStart, end: mEnd, marker: true });
  if (mEnd < text.length) ops.push({ start: mEnd, end: text.length });
  return { n, bang, ops };
}

// ── generated Markdown / llms output ──────────────────────────────────────────

const FENCE_OPEN_RE = /^([ \t]*)(`{3,}|~{3,})(.*)$/;

/**
 * For the generated `.md` pages (and search / llms output): remove presentation-only notation so an
 * LLM never sees `// [!code highlight]` noise. Highlight / focus / error / warning markers are just
 * stripped. A block that uses `[!code ++]` / `[!code --]` is rewritten as a unified-diff style
 * ```diff fence (`+ ` added, `- ` removed, two spaces unchanged), the only unambiguous plain-text
 * encoding of "this line is new". The fence's title words / filename are kept. Everything else
 * (fence meta, code, prose) is left verbatim.
 */
export function cleanNotationForMarkdown(md) {
  return cleanNotationOnly(cleanAnnotationsForMarkdown(String(md ?? '')));
}

/** In fences flagged `annotate`, `(N)!` markers become plain `(N)` so the text reads as a normal comment + the list below. */
function cleanAnnotationsForMarkdown(text) {
  if (!/\(\d{1,2}\)!/.test(text)) return text;
  const src = text.split('\n');
  const out = [];
  let i = 0;
  while (i < src.length) {
    const open = src[i].match(FENCE_OPEN_RE);
    if (!open) { out.push(src[i]); i++; continue; }
    const [, , fence, info] = open;
    const ch = fence[0];
    if (ch === '`' && info.includes('`')) { out.push(src[i]); i++; continue; }
    const closeRe = new RegExp(`^[ \\t]*${ch === '`' ? '`' : '~'}{${fence.length},}[ \\t]*$`);
    let j = i + 1;
    while (j < src.length && !closeRe.test(src[j])) j++;
    const annotate = parseCodeMeta(info.trim().split(/\s+/).slice(1).join(' ')).annotate;
    out.push(src[i]);
    for (const l of src.slice(i + 1, j)) out.push(annotate ? l.replace(/(\(\d{1,2}\))!(?=[ \t]*(?:\*+\/|-->)?[ \t]*$)/, '$1') : l);
    if (j < src.length) out.push(src[j]);
    i = j < src.length ? j + 1 : src.length;
  }
  return out.join('\n');
}

function cleanNotationOnly(text) {
  if (!text.includes('[!code')) return text;
  const src = text.split('\n');
  const out = [];
  let i = 0;
  while (i < src.length) {
    const open = src[i].match(FENCE_OPEN_RE);
    if (!open) { out.push(src[i]); i++; continue; }
    const [, indent, fence, info] = open;
    const ch = fence[0];
    if (ch === '`' && info.includes('`')) { out.push(src[i]); i++; continue; }
    const closeRe = new RegExp(`^[ \\t]*${ch === '`' ? '`' : '~'}{${fence.length},}[ \\t]*$`);
    let j = i + 1;
    while (j < src.length && !closeRe.test(src[j])) j++;
    const body = src.slice(i + 1, j);
    const hasClose = j < src.length;
    const lang = (info.trim().split(/\s+/)[0] || '').replace(/\{.*$/, '').toLowerCase();
    const bodyText = body.join('\n');
    if (!bodyText.includes('[!code') || !supportsNotation(lang)) {
      out.push(src[i], ...body);
      if (hasClose) out.push(src[j]);
      i = hasClose ? j + 1 : src.length;
      continue;
    }
    const { code, marks } = applyNotation(bodyText, lang);
    const cleaned = code.split('\n');
    const hasDiff = [...marks.values()].some((s) => s.has('add') || s.has('remove'));
    if (hasDiff) {
      const meta = info.trim().split(/\s+/).slice(1).join(' ');
      out.push(`${indent}${fence}diff${meta ? ' ' + meta : ''}`);
      cleaned.forEach((l, k) => {
        const kinds = marks.get(k + 1);
        const sign = kinds?.has('add') ? '+ ' : kinds?.has('remove') ? '- ' : '  ';
        const rest = indent && l.startsWith(indent) ? l.slice(indent.length) : l;
        out.push(rest.trim() === '' && sign === '  ' ? '' : indent + sign + rest);
      });
    } else {
      out.push(src[i], ...cleaned);
    }
    if (hasClose) out.push(src[j]);
    i = hasClose ? j + 1 : src.length;
  }
  return out.join('\n');
}
