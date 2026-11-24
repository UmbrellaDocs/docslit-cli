// Docusaurus, VitePress and Starlight sources.
//
// These have no navigation file DocsLit can map, so they import like a
// Markdown folder (auto sidebar), but with two things a plain folder lacks:
//
//   1. Content roots read from the tool's config: Docusaurus `docs` / `blog`
//      plugin paths (which may live outside the site folder, e.g. "../docs"),
//      VitePress `srcDir`, Starlight `src/content/docs`. Versioned copies,
//      translations, theme source and build output are not imported.
//   2. A text pass for syntax remark does not know: `:::type[Title]` and
//      `::: type Title` containers, VitePress `::: details` / `::: code-group`,
//      `<script setup>` / `<style>` blocks and `[[toc]]`.

import fs from 'fs-extra';
import path from 'path';

const CONFIG_EXT = ['js', 'ts', 'mjs', 'mts', 'cjs'];

async function firstExisting(dir, names) {
  for (const n of names) if (await fs.pathExists(path.join(dir, n))) return n;
  return null;
}

/** Text of the object literal that follows `key:` (balanced braces), or null. */
export function objectAfter(text, key) {
  const re = new RegExp(`\\b${key}\\s*:\\s*(\\{|false\\b)`, 'g');
  const m = re.exec(text);
  if (!m) return null;
  if (m[1] === 'false') return false;
  let depth = 0;
  for (let i = m.index + m[0].length - 1; i < text.length; i++) {
    const c = text[i];
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return text.slice(m.index + m[0].length - 1, i + 1);
  }
  return null;
}

function stringProp(objText, key) {
  if (!objText) return null;
  const m = new RegExp(`\\b${key}\\s*:\\s*(["'\`])([^"'\`]+)\\1`).exec(objText);
  return m ? m[2] : null;
}

/** Locale keys of a `locales: { root: …, de: …, 'zh-cn': … }` object, minus root. */
export function localeKeys(text) {
  const obj = objectAfter(text, 'locales');
  if (!obj) return [];
  const keys = [];
  let depth = 0;
  const re = /(["']?)([A-Za-z][\w-]*)\1\s*:\s*\{|[{}]/g;
  let m;
  while ((m = re.exec(obj))) {
    if (m[0] === '{') { depth++; continue; }
    if (m[0] === '}') { depth--; continue; }
    if (depth === 1) keys.push(m[2]);
    depth++;
  }
  return keys.filter((k) => k !== 'root');
}

/**
 * Detect a Docusaurus, VitePress or Starlight project in `dir`.
 * Returns { format, why, base, contentDirs: [{ dir, prefix }], publicDir, skipped: [...] } or null.
 * `dir` values are absolute.
 */
export async function detectSsg(dir) {
  // Docusaurus: config at the root or in website/
  for (const sub of ['.', 'website']) {
    const base = path.join(dir, sub);
    const cfg = await firstExisting(base, CONFIG_EXT.map((e) => `docusaurus.config.${e}`));
    if (!cfg) continue;
    const text = await fs.readFile(path.join(base, cfg), 'utf8');
    const docs = objectAfter(text, 'docs');
    const blog = objectAfter(text, 'blog');
    const contentDirs = [];
    if (docs !== false) contentDirs.push({ dir: path.resolve(base, stringProp(docs, 'path') || 'docs'), prefix: '' });
    if (blog !== false) contentDirs.push({ dir: path.resolve(base, stringProp(blog, 'path') || 'blog'), prefix: 'blog' });
    const skipped = [];
    for (const n of ['versioned_docs', 'i18n']) if (await fs.pathExists(path.join(base, n))) skipped.push(path.join(sub, n));
    return { format: 'docusaurus', why: path.posix.join(sub, cfg).replace(/^\.\//, ''), base, contentDirs: await existing(contentDirs), publicDir: path.join(base, 'static'), skipped };
  }
  // VitePress: .vitepress/config.* next to the content (or in docs/)
  for (const sub of ['.', 'docs']) {
    const base = path.join(dir, sub);
    const cfg = await firstExisting(path.join(base, '.vitepress'), CONFIG_EXT.map((e) => `config.${e}`));
    if (!cfg) continue;
    const text = await fs.readFile(path.join(base, '.vitepress', cfg), 'utf8');
    const src = path.resolve(base, /\bsrcDir\s*:\s*(["'`])([^"'`]+)\1/.exec(text)?.[2] || '.');
    const locales = localeKeys(text);
    return {
      format: 'vitepress', why: path.posix.join(sub, '.vitepress', cfg).replace(/^\.\//, ''), base,
      contentDirs: [{ dir: src, prefix: '', exclude: ['public', ...locales] }],
      publicDir: path.join(src, 'public'),
      skipped: locales.map((l) => `${l}/ (translation)`),
    };
  }
  // Starlight: astro.config.* that uses @astrojs/starlight
  for (const sub of ['.', 'docs']) {
    const base = path.join(dir, sub);
    const cfg = await firstExisting(base, CONFIG_EXT.map((e) => `astro.config.${e}`));
    if (!cfg) continue;
    const text = await fs.readFile(path.join(base, cfg), 'utf8');
    if (!/@astrojs\/starlight/.test(text)) continue;
    const content = path.join(base, 'src', 'content', 'docs');
    if (!(await fs.pathExists(content))) continue;
    const locales = localeKeys(text);
    return {
      format: 'starlight', why: path.posix.join(sub, cfg).replace(/^\.\//, ''), base,
      contentDirs: [{ dir: content, prefix: '', exclude: locales }],
      publicDir: path.join(base, 'public'),
      skipped: locales.map((l) => `${l}/ (translation)`),
    };
  }
  return null;
}

async function existing(dirs) {
  const out = [];
  for (const d of dirs) if (await fs.pathExists(d.dir)) out.push(d);
  return out;
}

/** Deepest directory containing every path. */
export function commonRoot(paths) {
  const split = paths.map((p) => path.resolve(p).split(path.sep));
  const first = split[0];
  let n = first.length;
  for (const parts of split.slice(1)) {
    let i = 0;
    while (i < n && i < parts.length && parts[i] === first[i]) i++;
    n = i;
  }
  return first.slice(0, n).join(path.sep) || path.sep;
}

// ─── text pass ────────────────────────────────────────────────────────────────

const CALLOUT = {
  note: 'note', info: 'info', tip: 'tip', important: 'info', success: 'success', check: 'check',
  warning: 'warning', caution: 'warning', danger: 'danger', error: 'error',
};
const FENCE = /^(\s*)(`{3,}|~{3,})/;
const OPEN = /^(\s*)(:{3,})[ \t]*([A-Za-z][\w-]*)(?:\[([^\]]*)\])?(?:\{[^}]*\})?[ \t]*(.*?)\s*$/;
const CLOSE = /^(\s*)(:{3,})\s*$/;

// Vue template syntax inside VitePress Markdown is not MDX: `{{ x }}` and bare
// braces would be parsed as JS expressions, `:prop` / `@event` / `v-if` / `#slot`
// are not JSX attribute names. Braces are escaped (`\{` renders as `{`) and
// Vue-only attributes are removed; inline code spans are left alone.
const VUE_ATTR = /\s(?:[:@#][\w.:-]+|v-[\w.:-]+)(?:\s*=\s*(?:"[^"]*"|'[^']*'))?/g;
function vueLine(line, count) {
  return line.split(/(`+[^`]*`+)/).map((part, i) => {
    if (i % 2) return part; // inline code
    let p = part.replace(/<[A-Za-z][\w.-]*(?:\s[^<>]*)?\/?>/g, (tag) => {
      const t = tag.replace(VUE_ATTR, '');
      if (t !== tag) count('Vue attribute (:prop, @event, v-*)', 'removed');
      // HTML void elements must be self-closed in MDX
      return t.replace(/^<(br|wbr|hr|img|input|source)\b([^>]*?)\s*(?<!\/)>$/i, '<$1$2 />');
    });
    if (/[{}]/.test(p)) {
      if (/\{\{[^}]*\}\}/.test(p)) count('{{ }} Vue interpolation', 'kept as text');
      p = p.replace(/(?<!\\)([{}])/g, '\\$1');
    }
    return p;
  }).join('');
}

function attr(v) {
  return String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/[{}<>]/g, (c) => `&#${c.charCodeAt(0)};`);
}

/**
 * Convert container directives and VitePress-only blocks.
 * opts: { format, count(label, to), report(sev, code, msg, extra) }
 */
export function convertSsgSyntax(src, { format = 'generic', count = () => {}, report = () => {} } = {}) {
  const lines = src.split('\n');
  const out = [];
  const stack = []; // { colons, close }
  let fence = null;
  let skip = null;
  const vite = format === 'vitepress' || format === 'vuepress';
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    if (fence) {
      out.push(line);
      const f = FENCE.exec(line);
      if (f && f[2][0] === fence[0] && f[2].length >= fence.length && line.trim() === f[2]) fence = null;
      continue;
    }
    if (skip) {
      if (line.includes(skip)) skip = null;
      continue;
    }
    const f = FENCE.exec(line);
    if (f) {
      fence = f[2];
      // VitePress code-group tab labels: ```sh [npm] → ```sh title="npm"
      if (stack.some((s) => s.codeGroup)) line = line.replace(/^(\s*(?:`{3,}|~{3,})[\w+-]*)\s+\[([^\]]+)\](.*)$/, (_, a, label, rest) => `${a} title="${label.replace(/"/g, "'")}"${rest}`);
      out.push(line);
      continue;
    }
    if (vite) {
      const blk = /^\s*<(script|style)\b[^>]*>/.exec(line);
      if (blk) {
        count(`<${blk[1]}> block (Vue)`, 'removed');
        if (!line.includes(`</${blk[1]}>`)) skip = `</${blk[1]}>`;
        continue;
      }
      if (line.trim() === '[[toc]]') { count('[[toc]]', 'removed (DocsLit shows an outline)'); continue; }
      line = vueLine(line, count);
    }
    const close = CLOSE.exec(line);
    if (close && stack.length) {
      // close the innermost container this fence length can close
      const s = stack.pop();
      out.push('', `${close[1]}${s.close}`, '');
      continue;
    }
    const open = OPEN.exec(line);
    if (open) {
      const [, indent, colons, rawType, bracket, rest] = open;
      const type = rawType.toLowerCase();
      const title = (bracket ?? rest ?? '').trim();
      if (type === 'code-group') {
        out.push(`${indent}<wc-code-group>`, '');
        stack.push({ colons: colons.length, close: '</wc-code-group>', codeGroup: true });
        count('::: code-group', 'wc-code-group');
      } else if (type === 'details') {
        out.push(`${indent}<wc-accordion title="${attr(title || 'Details')}">`, '');
        stack.push({ colons: colons.length, close: '</wc-accordion>' });
        count('::: details', 'wc-accordion');
      } else {
        const t = CALLOUT[type];
        if (!t) report('info', 'container-type', `Container type ":::${rawType}" has no DocsLit callout type; converted to a "note" callout.`, { line: i + 1, fix: 'Pick a wc-callout type (info, tip, warning, danger, …) if the colour matters.' });
        out.push(`${indent}<wc-callout type="${t || 'note'}"${title ? ` title="${attr(title)}"` : ''}>`, '');
        stack.push({ colons: colons.length, close: '</wc-callout>' });
        count(`:::${t ? type : 'custom'} container`, `wc-callout type="${t || 'note'}"`);
      }
      continue;
    }
    out.push(line);
  }
  if (stack.length) {
    report('warning', 'container-unclosed', `${stack.length} ::: container${stack.length === 1 ? ' was' : 's were'} not closed; closed at the end of the page.`, { fix: 'Check where the container should end.' });
    while (stack.length) out.push('', stack.pop().close);
  }
  return out.join('\n');
}
