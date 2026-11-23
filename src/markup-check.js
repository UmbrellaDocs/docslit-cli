/**
 * Pure `wc-*` markup checker for Markdown snippets.
 *
 * Validates a Markdown string WITHOUT touching the filesystem: unknown
 * `wc-*` tags, unknown attributes, invalid enum values, missing required
 * attributes, wrong parent/child nesting and unclosed/stray tags — all driven
 * by src/component-manifest.js. Fenced code, inline code, HTML comments and
 * frontmatter are ignored. Never prints or throws on bad input.
 *
 *   checkMarkup(markdown, { customTags?, lineOffset? })
 *     -> { ok, issues: [{ level, code, message, line, tag?, attribute?, suggestion?, fix? }],
 *          summary: { errors, warnings }, componentsUsed: { tag: count } }
 */
import { getComponentManifest } from './component-manifest.js';
import { resolveIcon } from './icons.js';

const MANIFEST = new Map(getComponentManifest().map((c) => [c.tag, c]));
const RAW_CONTENT = new Set(['code', 'mermaid', 'asciidoc']);
const GLOBAL_ATTRS = new Set(['id', 'class', 'style', 'slot', 'hidden', 'lang', 'dir', 'tabindex', 'role']);

// Common mistakes: tag -> { wrongAttr: rightAttr }
const ATTR_HINTS = {
  'wc-tab': { title: 'label', name: 'label' },
  'wc-code-tab': { title: 'label', name: 'label' },
  'wc-view-panel': { title: 'label', name: 'label' },
  'wc-accordion': { label: 'title', name: 'title' },
  'wc-step': { label: 'title', name: 'title' },
  'wc-card': { icon_name: 'icon-name', iconname: 'icon-name' },
  'wc-callout': { variant: 'type', kind: 'type' },
  'wc-alert': { variant: 'type', kind: 'type' },
  'wc-code-block': { lang: 'language', file: 'filename', name: 'filename', title: 'filename', lines: 'linenumbers', startline: 'start-line', maxlines: 'max-lines', wordwrap: 'wrap' },
  'wc-field': { optional: 'required' },
  'wc-version': { label: 'name', title: 'name' },
};

/** Levenshtein distance (small strings only). */
export function editDistance(a, b) {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

/** Closest candidate within a sensible distance, or null. */
export function nearest(name, candidates) {
  let best = null;
  let bestD = Infinity;
  const lower = String(name).toLowerCase();
  for (const c of candidates) {
    let d = editDistance(lower, c.toLowerCase());
    if (c.toLowerCase().includes(lower) || lower.includes(c.toLowerCase())) d = Math.min(d, 2);
    if (d < bestD) { bestD = d; best = c; }
  }
  const limit = Math.max(2, Math.floor(lower.length / 3));
  return best !== null && bestD <= limit ? best : null;
}

/** Replace a region with spaces, keeping newlines so line numbers stay stable. */
function blank(s) {
  return s.replace(/[^\n]/g, ' ');
}

/**
 * Blank out fenced code blocks (CommonMark-style): an opening fence of 3+
 * backticks or tildes (any indentation, optional info string; backtick fences
 * may not have backticks in the info string) runs until a closing fence of the
 * same character that is at least as long, has nothing after it and is indented
 * at most 3 columns more than the opener. An
 * unterminated fence runs to the end of the input. Newlines are preserved.
 */
function maskFencedCode(src) {
  const lines = src.split('\n');
  let open = null; // { ch, len, ind }
  const width = (ws) => { let w = 0; for (const c of ws) w += c === '\t' ? 4 - (w % 4) : 1; return w; };
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.replace(/\r$/, '');
    if (open) {
      // a closing fence may be indented at most 3 columns more than its opener (an indented inner ``` is content)
      const close = /^([ \t]*)([`~]{3,})[ \t\r]*$/.exec(line);
      if (close && close[2].length >= open.len && [...close[2]].every((c) => c === open.ch) && width(close[1]) <= open.ind + 3) {
        open = null;
      }
      lines[i] = blank(raw);
      continue;
    }
    const m = /^([ \t]*)(`{3,}|~{3,})(.*)$/.exec(line);
    if (m && !(m[2][0] === '`' && m[3].includes('`'))) {
      open = { ch: m[2][0], len: m[2].length, ind: width(m[1]) };
      lines[i] = blank(raw);
    }
  }
  return lines.join('\n');
}

/** Mask frontmatter, fenced code, HTML comments and inline code. */
export function maskNonMarkup(src) {
  let s = String(src ?? '');
  const fm = s.match(/^﻿?---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/);
  if (fm) s = blank(fm[0]) + s.slice(fm[0].length);
  s = maskFencedCode(s);
  s = s.replace(/<!--[\s\S]*?(?:-->|$)/g, (m) => blank(m));
  // Inline code spans (same line).
  s = s.replace(/(?<!`)(`+)(?!`)[^\n]*?[^`\n]\1(?!`)/g, (m) => blank(m));
  return s;
}

function lineAt(src, idx) {
  let line = 1;
  for (let i = 0; i < idx; i++) if (src.charCodeAt(i) === 10) line++;
  return line;
}

/** Parse the attribute section of a tag starting at `i` (just after the tag name). */
function parseTag(src, i) {
  const attrs = [];
  let selfClose = false;
  const n = src.length;
  while (i < n) {
    while (i < n && /\s/.test(src[i])) i++;
    if (i >= n) return null; // unterminated
    if (src[i] === '>') return { attrs, selfClose, end: i + 1 };
    if (src[i] === '/' && src[i + 1] === '>') return { attrs, selfClose: true, end: i + 2 };
    if (src[i] === '/') { i++; continue; }
    let j = i;
    while (j < n && !/[\s=>]/.test(src[j]) && !(src[j] === '/' && src[j + 1] === '>')) j++;
    const name = src.slice(i, j);
    i = j;
    if (!name) { i++; continue; }
    let value = null;
    let k = i;
    while (k < n && /\s/.test(src[k])) k++;
    if (src[k] === '=') {
      k++;
      while (k < n && /\s/.test(src[k])) k++;
      if (src[k] === '"' || src[k] === "'") {
        const q = src[k];
        const close = src.indexOf(q, k + 1);
        if (close === -1) return null;
        value = src.slice(k + 1, close);
        i = close + 1;
      } else if (src[k] === '{') {
        // JSX-style expression: balance braces
        let depth = 0;
        let m = k;
        for (; m < n; m++) {
          if (src[m] === '{') depth++;
          else if (src[m] === '}' && --depth === 0) { m++; break; }
        }
        value = src.slice(k, m);
        i = m;
      } else {
        let m = k;
        while (m < n && !/[\s>]/.test(src[m])) m++;
        value = src.slice(k, m);
        i = m;
      }
    }
    attrs.push({ name, value, index: j });
  }
  return null;
}

/**
 * @param {string} markdown
 * @param {{ customTags?: Iterable<string>, lineOffset?: number }} [opts]
 */
export function checkMarkup(markdown, { customTags = [], lineOffset = 0 } = {}) {
  const src = maskNonMarkup(markdown);
  const custom = new Set(customTags);
  const issues = [];
  const componentsUsed = {};
  const allTags = [...MANIFEST.keys(), ...custom];
  const add = (level, code, message, idx, extra = {}) => {
    issues.push({ level, code, message, line: lineAt(src, idx) + lineOffset, ...extra });
  };

  const stack = []; // { tag, idx }
  const tagRe = /<(\/?)(wc-[a-zA-Z0-9_-]*)/g;
  let m;
  while ((m = tagRe.exec(src))) {
    const closing = m[1] === '/';
    const tag = m[2].toLowerCase();
    const idx = m.index;
    const afterName = idx + m[0].length;

    if (closing) {
      const gt = src.indexOf('>', afterName);
      tagRe.lastIndex = gt === -1 ? src.length : gt + 1;
      const pos = stack.map((s) => s.tag).lastIndexOf(tag);
      if (pos === -1) {
        add('error', 'unexpected-closing-tag', `Closing </${tag}> has no matching opening tag.`, idx,
          { tag, fix: `Remove </${tag}> or add the missing <${tag}> opening tag.` });
      } else {
        for (let s = stack.length - 1; s > pos; s--) {
          const open = stack[s];
          add('error', 'unclosed-tag', `<${open.tag}> (opened on line ${lineAt(src, open.idx) + lineOffset}) is never closed before </${tag}>.`, open.idx,
            { tag: open.tag, fix: `Add </${open.tag}>.` });
        }
        stack.length = pos;
      }
      continue;
    }

    const parsed = parseTag(src, afterName);
    if (!parsed) {
      add('error', 'malformed-tag', `Malformed <${tag}> tag (missing ">" or unterminated attribute quote).`, idx, { tag });
      tagRe.lastIndex = afterName;
      continue;
    }
    tagRe.lastIndex = parsed.end;
    componentsUsed[tag] = (componentsUsed[tag] || 0) + 1;

    const def = MANIFEST.get(tag);
    if (!def) {
      if (!custom.has(tag)) {
        const near = nearest(tag, allTags);
        add('error', 'unknown-component', `Unknown component <${tag}>.${near ? ` Did you mean <${near}>?` : ''}`, idx, {
          tag, ...(near ? { suggestion: near } : {}),
          fix: near ? `Use <${near}> (see list_components for all built-ins).` : 'Use a built-in wc-* component (list_components) or plain Markdown.',
        });
      }
      if (!parsed.selfClose) stack.push({ tag, idx });
      continue;
    }

    // Attributes
    const known = new Map(def.attributes.map((a) => [a.name, a]));
    const seen = new Set();
    for (const attr of parsed.attrs) {
      const name = attr.name.toLowerCase();
      seen.add(name);
      if (name.startsWith('data-') || name.startsWith('aria-') || GLOBAL_ATTRS.has(name)) continue;
      if (name.startsWith(':') || name.startsWith('@') || name.startsWith('.')) continue;
      if (tag === 'wc-include' && name !== 'src') continue; // snippet props fill {{name}} placeholders
      const spec = known.get(name);
      if (!spec) {
        const hint = ATTR_HINTS[tag]?.[name];
        const near = hint || nearest(name, [...known.keys()]);
        add('warning', 'unknown-attribute', `<${tag}> has no attribute "${attr.name}".${near ? ` Did you mean "${near}"?` : ''}${!near && known.size ? ` Valid attributes: ${[...known.keys()].join(', ')}.` : ''}`, attr.index, {
          tag, attribute: attr.name, ...(near ? { suggestion: near } : {}),
          fix: near ? `Rename "${attr.name}" to "${near}".` : `Remove "${attr.name}"${known.size ? ` or use one of: ${[...known.keys()].join(', ')}` : ''}.`,
        });
        continue;
      }
      if ((name === 'icon' || name === 'icon-name' || name === 'right-icon' || (tag === 'wc-icon' && name === 'name')) && attr.value && !/\{/.test(attr.value)) {
        const iconType = parsed.attrs.find((x) => x.name.toLowerCase() === 'icon-type')?.value || undefined;
        const r = resolveIcon(attr.value, { iconType });
        if (r.kind === 'unknown') {
          add('warning', 'unknown-icon', `<${tag} ${attr.name}="${attr.value}">: unknown icon.${r.suggestion ? ` Did you mean "${r.suggestion}"?` : ''}`, attr.index, {
            tag, attribute: attr.name, ...(r.suggestion ? { suggestion: r.suggestion } : {}),
            fix: r.suggestion ? `Use ${attr.name}="${r.suggestion}".` : 'Use a Lucide or Font Awesome Free icon name, an emoji, an image URL or inline <svg>.',
          });
        }
      }
      if (spec.values && attr.value !== null && !/\{\{|\{/.test(attr.value)) {
        if (!spec.values.includes(attr.value)) {
          const near = nearest(attr.value, spec.values);
          add('warning', 'invalid-attribute-value', `<${tag} ${spec.name}="${attr.value}"> is not valid. Allowed: ${spec.values.join(', ')}.${near ? ` Did you mean "${near}"?` : ''}`, idx, {
            tag, attribute: spec.name, ...(near ? { suggestion: near } : {}),
            fix: near ? `Use ${spec.name}="${near}".` : `Use one of: ${spec.values.join(', ')}.`,
          });
        }
      } else if (spec.values && attr.value === null && spec.type !== 'boolean') {
        add('warning', 'invalid-attribute-value', `<${tag} ${spec.name}> needs a value. Allowed: ${spec.values.join(', ')}.`, idx, { tag, attribute: spec.name, fix: `Use ${spec.name}="${spec.values[0]}" (one of: ${spec.values.join(', ')}).` });
      }
      if (spec.type === 'number' && attr.value !== null && attr.value !== '' && !/\{/.test(attr.value) && Number.isNaN(Number(attr.value))) {
        add('warning', 'invalid-attribute-value', `<${tag} ${spec.name}="${attr.value}"> should be a number.`, idx, { tag, attribute: spec.name, fix: `Use a numeric value for ${spec.name}.` });
      }
    }
    for (const a of def.attributes) {
      if (a.required && !seen.has(a.name)) {
        add('warning', 'missing-required-attribute', `<${tag}> requires the "${a.name}" attribute.`, idx, {
          tag, attribute: a.name, fix: `Add ${a.name}="..." to <${tag}>.`,
        });
      }
    }

    // Nesting: nearest wc-* ancestor
    const parent = stack.length ? stack[stack.length - 1] : null;
    if (def.parents?.length) {
      if (!parent || !def.parents.includes(parent.tag)) {
        // Allow deeper ancestors when the nearest one is a generic container (e.g. wc-callout inside wc-step)
        const ancestorOk = stack.some((s) => def.parents.includes(s.tag)) && parent && !MANIFEST.get(parent.tag)?.children?.length && !(MANIFEST.get(parent.tag)?.content === 'children');
        if (!ancestorOk) {
          add('warning', 'invalid-parent', `<${tag}> must be placed inside ${def.parents.map((p) => `<${p}>`).join(' or ')}${parent ? ` (found inside <${parent.tag}>)` : ''}.`, idx, {
            tag, fix: `Wrap it in ${def.parents.map((p) => `<${p}>`).join(' or ')}.`,
          });
        }
      }
    }
    if (parent) {
      const pdef = MANIFEST.get(parent.tag);
      if (pdef && pdef.content === 'children' && pdef.children?.length && !pdef.children.includes(tag)) {
        add('warning', 'invalid-child', `<${parent.tag}> should only contain ${pdef.children.map((p) => `<${p}>`).join(' or ')}, not <${tag}>.`, idx, {
          tag, fix: `Move <${tag}> out of <${parent.tag}> or wrap it in an allowed child.`,
        });
      }
    }

    if (parsed.selfClose) {
      // Compile-time form, e.g. <wc-var name="X" value="..." /> (handled by the preprocessor).
      const compileTime = def.selfClosingWith && seen.has(def.selfClosingWith);
      if (!def.selfClosing && !compileTime) {
        add('warning', 'self-closing-syntax', `<${tag} ... /> is not valid HTML for custom elements; use <${tag} ...></${tag}>.`, idx, {
          tag, fix: `Write <${tag} ...></${tag}>.`,
        });
      }
      continue;
    }
    if (def.selfClosing) {
      // e.g. <wc-include src="x"> without close: accept (compile-time tag)
      continue;
    }

    if (RAW_CONTENT.has(def.content)) {
      // Everything up to the matching close tag is raw text.
      const closeIdx = src.toLowerCase().indexOf(`</${tag}`, parsed.end);
      if (closeIdx === -1) {
        add('error', 'unclosed-tag', `<${tag}> is never closed.`, idx, { tag, fix: `Add </${tag}>.` });
        tagRe.lastIndex = src.length;
      } else {
        const gt = src.indexOf('>', closeIdx);
        tagRe.lastIndex = gt === -1 ? src.length : gt + 1;
      }
      continue;
    }
    stack.push({ tag, idx });
  }
  for (const open of stack) {
    add('error', 'unclosed-tag', `<${open.tag}> is never closed.`, open.idx, { tag: open.tag, fix: `Add </${open.tag}>.` });
  }

  issues.sort((a, b) => a.line - b.line);
  const errors = issues.filter((i) => i.level === 'error').length;
  const warnings = issues.filter((i) => i.level === 'warning').length;
  return { ok: errors === 0, issues, summary: { errors, warnings }, componentsUsed };
}
