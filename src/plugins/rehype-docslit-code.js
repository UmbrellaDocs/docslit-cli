import { visit, EXIT } from 'unist-util-visit';
import { highlightLines } from '../highlighter.js';
import {
  parseCodeMeta, parseLineSpec, applyNotation, diffLineMarks,
} from '../code-meta.js';

/**
 * remark-rehype stores a fence's info string after the language (`js filename="a.js"
 * linenumbers="true"`) in `code.data.meta`, but rehype-raw rebuilds elements and drops
 * `data`. Run this BEFORE rehype-raw to carry it across as a `data-meta` property.
 */
export function rehypeDocslitCodeMeta() {
  return (tree) => {
    visit(tree, 'element', (node) => {
      if (node.tagName === 'code' && node.data?.meta) {
        node.properties = { ...(node.properties || {}), dataMeta: String(node.data.meta) };
      }
    });
  };
}

const VAR_RE = /\{\{([A-Z_][A-Z0-9_]*)\}\}/g;
const DEFAULT_MAX_LINES = 10; // keep in sync with the runtime (components/code.js)

export const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = (s) => escapeHtml(s).replace(/"/g, '&quot;');

const decodeBasicEntities = (s) => String(s)
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

function dedentBlock(text) {
  const lines = String(text).replace(/\r\n/g, '\n').split('\n');
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  let common = null;
  for (const l of lines) {
    if (!l.trim()) continue;
    const lead = l.match(/^[ \t]*/)[0];
    if (common === null) { common = lead; continue; }
    let i = 0;
    while (i < common.length && i < lead.length && common[i] === lead[i]) i++;
    common = common.slice(0, i);
    if (!common) break;
  }
  return (common ? lines.map((l) => (l.startsWith(common) ? l.slice(common.length) : l.trimStart())) : lines).join('\n');
}

const KIND_CLASS = { hl: 'hl', focus: 'focus', add: 'add', remove: 'remove', hunk: 'hunk', error: 'error', warning: 'warning' };

/**
 * Build the `<wc-code-block>` element for one block of code.
 *
 *   code        code text (no trailing newline)
 *   lang        the language as written ('' when none)
 *   meta        fence info string after the language (parsed with parseCodeMeta)
 *   opts        pre-parsed options (hand-written attribute form); overrides `meta`
 *   passthrough extra attribute string to append (id, class, data-*, ...)
 *
 * Highlighting, line marks (meta + Shiki notation + diff language), `{{VAR}}` spans and plain
 * fallback lines are all baked in at build time, so the page reads correctly before any JS runs.
 * Returns the element HTML.
 */
export function renderCodeBlockParts({ code, lang = '', meta = '', opts, passthrough = '' }) {
  const o = opts || parseCodeMeta(meta);
  const note = applyNotation(String(code), lang);
  const text = note.code;
  const lineCount = text.split('\n').length;

  // line marks: Shiki notation, meta `{1,3}` / highlight= / focus=, and the diff language
  const marks = new Map();
  const addMark = (line, kind) => {
    if (line < 1 || line > lineCount) return;
    if (!marks.has(line)) marks.set(line, new Set());
    marks.get(line).add(kind);
  };
  for (const [line, kinds] of note.marks) for (const k of kinds) addMark(line, k);
  for (const n of o.highlight || []) addMark(n, 'hl');
  for (const n of o.focus || []) addMark(n, 'focus');
  if (/^(diff|patch)$/i.test(lang)) for (const [line, kinds] of diffLineMarks(text)) for (const k of kinds) addMark(line, k);

  // {{VAR}} placeholders: swapped for an identifier-safe token while Shiki runs, then restored as spans
  const varNames = [];
  const withTokens = text.replace(VAR_RE, (_, name) => {
    let idx = varNames.indexOf(name);
    if (idx === -1) { varNames.push(name); idx = varNames.length - 1; }
    return `DLVAR${idx}ZZ`;
  });
  const occurrences = (withTokens.match(/DLVAR\d+ZZ/g) || []).length;
  const restoreVars = (html) => html.replace(/DLVAR(\d+)ZZ/g, (_, i) => {
    const name = varNames[Number(i)];
    return `<span class="dl-var" data-var="${name}">{{${name}}}</span>`;
  });

  const effectiveLang =
    (lang === 'markdown' || lang === 'md' || !lang) && /<wc-/.test(text) ? 'mdx' : lang;
  let lines = null;
  if (effectiveLang && !/^(text|txt|plain|plaintext|output)$/i.test(effectiveLang)) {
    lines = highlightLines(withTokens, effectiveLang);
    if (lines && occurrences && lines.join('').match(/DLVAR\d+ZZ/g)?.length !== occurrences) lines = null; // a token was split: fall back to plain
  }
  if (!lines) lines = withTokens.split('\n').map((l) => `<span class="line">${escapeHtml(l)}</span>`);

  const inner = lines.map((l, i) => {
    const kinds = marks.get(i + 1);
    let line = restoreVars(l);
    if (kinds) {
      const cls = [...kinds].map((k) => KIND_CLASS[k]).filter(Boolean).join(' ');
      if (cls) line = line.replace('<span class="line">', `<span class="line ${cls}">`);
    }
    return line;
  }).join('\n');

  const attrs = [];
  if (lang) attrs.push(`language="${escapeAttr(lang)}"`);
  if (o.filename) attrs.push(`filename="${escapeAttr(o.filename)}"`);
  if (o.icon) attrs.push(`icon="${escapeAttr(o.icon)}"`);
  if (o.linenumbers) attrs.push('linenumbers="true"');
  if (o.startLine && o.startLine > 1) attrs.push(`start-line="${o.startLine}"`);
  if (o.wrap) attrs.push('wrap');
  const collapsible = o.expandable || (o.maxLines && o.maxLines > 0);
  const maxLines = o.maxLines && o.maxLines > 0 ? o.maxLines : DEFAULT_MAX_LINES;
  if (o.expandable) attrs.push('expandable');
  if (o.maxLines && o.maxLines > 0) attrs.push(`max-lines="${o.maxLines}"`);
  if (o.nocopy) attrs.push('nocopy');
  if (o.for) attrs.push(`for="${escapeAttr(o.for)}"`);
  if (o.theme) attrs.push(`theme="${o.theme}"`);
  // Reserve the collapsed height before the component upgrades (see codePreUpgradeCss).
  const ml = collapsible && lineCount > maxLines ? maxLines : 0;
  if (ml) attrs.push(`style="--cb-ml:${ml}"`);
  attrs.push('highlighted');
  const extra = passthrough ? ' ' + passthrough.trim() : '';
  return { html: `<wc-code-block ${attrs.join(' ')}${extra}>${inner}</wc-code-block>`, lines: ml || lineCount };
}

export function renderCodeBlock(args) {
  return renderCodeBlockParts(args).html;
}

// ── hand-written <wc-code-block ...>text</wc-code-block> / <wc-code-tab> ───────────────

function parseAttrString(str = '') {
  const out = [];
  const re = /([:@\w.-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m;
  while ((m = re.exec(str))) out.push({ name: m[1], value: m[2] ?? m[3] ?? m[4] });
  return out;
}

const boolAttr = (a) => a && (a.value === undefined || !/^(false|0|no|off)$/i.test(a.value));

/** Used by unified.js when it restores shielded hand-written blocks. */
export function renderHandWrittenCodeBlock(attrStr, content) {
  const attrs = parseAttrString(attrStr);
  const get = (n) => attrs.find((a) => a.name.toLowerCase() === n);
  if (get('highlighted')) return `<wc-code-block${attrStr}>${content}</wc-code-block>`;
  const code = dedentBlock(decodeBasicEntities(content));
  if (!code.trim()) return `<wc-code-block${attrStr}>${content}</wc-code-block>`;

  const known = new Set(['language', 'lang', 'filename', 'title', 'icon', 'linenumbers', 'lines', 'start-line', 'startline', 'highlight', 'focus', 'wrap', 'wordwrap', 'expandable', 'max-lines', 'maxlines', 'nocopy', 'for', 'theme', 'style']);
  const lang = get('language')?.value || get('lang')?.value || '';
  const opts = {
    filename: get('filename')?.value ?? get('title')?.value ?? '',
    icon: get('icon')?.value,
    highlight: parseLineSpec(get('highlight')?.value),
    focus: parseLineSpec(get('focus')?.value),
    wrap: boolAttr(get('wrap')) || boolAttr(get('wordwrap')),
    expandable: boolAttr(get('expandable')),
    nocopy: boolAttr(get('nocopy')),
    for: get('for')?.value,
    theme: ['dark', 'light'].includes(get('theme')?.value) ? get('theme').value : undefined,
  };
  const ln = get('linenumbers') || get('lines');
  if (ln && (ln.value === undefined || /^(true|false|0|1|yes|no)$/i.test(ln.value))) opts.linenumbers = boolAttr(ln);
  const sl = parseInt(get('start-line')?.value ?? get('startline')?.value, 10);
  if (sl >= 1) opts.startLine = sl;
  const ml = parseInt(get('max-lines')?.value ?? get('maxlines')?.value, 10);
  if (ml >= 0) opts.maxLines = ml;
  const passthrough = attrs
    .filter((a) => !known.has(a.name.toLowerCase()))
    .map((a) => (a.value === undefined ? a.name : `${a.name}="${escapeAttr(a.value)}"`))
    .join(' ');
  return renderCodeBlock({ code, lang, opts, passthrough });
}

function getTextContent(node) {
  if (node.type === 'text') return node.value;
  if (node.children) return node.children.map(getTextContent).join('');
  return '';
}

function classList(node) {
  const c = node.properties?.className;
  return Array.isArray(c) ? c : typeof c === 'string' ? c.split(/\s+/) : [];
}

export default function rehypeDocslitCode() {
  return (tree) => {
    visit(tree, 'element', (node, index, parent) => {
      // <wc-code-group><wc-code-tab label=".." language="..">plain text</wc-code-tab>: build a block inside
      if (node.tagName === 'wc-code-tab' && parent?.tagName === 'wc-code-group') {
        const kids = node.children || [];
        if (kids.length && kids.every((c) => c.type === 'text' || (c.type === 'raw' && !/^\s*</.test(c.value)))) {
          const code = dedentBlock(kids.map((c) => c.value).join(''));
          if (code.trim()) {
            const p = node.properties || {};
            const r = renderCodeBlockParts({
              code,
              lang: String(p.language || ''),
              opts: { filename: '', highlight: [], focus: [], wrap: false, expandable: false, nocopy: false },
            });
            node.children = [{ type: 'raw', value: r.html, data: { cbLines: r.lines } }];
          }
        }
        return;
      }

      if (node.tagName !== 'pre' || !parent) return;

      const codeEl = node.children?.find(
        (c) => c.type === 'element' && c.tagName === 'code',
      );
      if (!codeEl) return;

      // remark-rehype appends a newline to the code text; without stripping it the
      // highlighter emits a phantom empty last line (and line numbers count it).
      const text = getTextContent(codeEl).replace(/\r?\n$/, '');
      const className = classList(codeEl).find(
        (c) => typeof c === 'string' && c.startsWith('language-'),
      );
      let lang = className ? className.slice('language-'.length) : '';
      let meta = codeEl.properties?.dataMeta || codeEl.data?.meta || '';
      // "js{1,3}" with no space before the line spec
      const glued = lang.match(/^([^{]+)(\{.*)$/);
      if (glued) { lang = glued[1]; meta = `${glued[2]} ${meta}`; }

      const r = renderCodeBlockParts({ code: text, lang, meta });
      parent.children[index] = { type: 'raw', value: r.html, data: { cbLines: r.lines } };
    });

    // Give each code group the height of its first panel so the page does not jump on upgrade.
    visit(tree, 'element', (node) => {
      if (node.tagName !== 'wc-code-group') return;
      let n = 0;
      visit(node, 'raw', (r) => {
        if (r.data?.cbLines) { n = r.data.cbLines; return EXIT; }
        return undefined;
      });
      if (n) node.properties = { ...(node.properties || {}), style: `--cb-gn:${n}` };
    });
  };
}
