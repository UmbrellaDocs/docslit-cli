/**
 * Code import from source files.
 *
 *   ```js file="examples/server.js" lines="10-25"
 *   ```
 *   ```file="examples/server.js" region="routes"
 *   ```
 *
 * Paths resolve relative to the project root (dir containing docslit.json) and
 * must stay inside it. Used by preprocess (build/dev) and validate.
 */
import path from 'path';
import fs from 'fs-extra';

const FENCE_OPEN_RE = /^([ \t]*)(`{3,}|~{3,})(.*)$/;
const IMPORT_KEYS = new Set(['file', 'lines', 'region']);
const ATTR_RE = /([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

const EXT_LANG = {
  js: 'js', mjs: 'js', cjs: 'js', jsx: 'jsx', ts: 'ts', mts: 'ts', cts: 'ts', tsx: 'tsx',
  py: 'python', rb: 'ruby', rs: 'rust', go: 'go', java: 'java', kt: 'kotlin', cs: 'csharp',
  sh: 'bash', bash: 'bash', zsh: 'bash', yml: 'yaml', yaml: 'yaml', json: 'json', md: 'markdown',
  html: 'html', css: 'css', php: 'php', swift: 'swift', c: 'c', h: 'c', cpp: 'cpp', hpp: 'cpp',
  sql: 'sql', toml: 'toml', xml: 'xml', ps1: 'powershell', dockerfile: 'dockerfile',
};

/** Cheap check used by the preprocess fast path. */
export const CODE_IMPORT_DETECT_RE = /(?:`{3,}|~{3,})(?:[^\n]*[ \t])?file\s*=\s*["']/;

function inferLang(filePath) {
  const base = path.basename(filePath).toLowerCase();
  if (base === 'dockerfile') return 'dockerfile';
  const ext = path.extname(base).slice(1);
  return EXT_LANG[ext] || ext || '';
}

function parseInfo(info) {
  const attrs = {};
  let m;
  ATTR_RE.lastIndex = 0;
  while ((m = ATTR_RE.exec(info)) !== null) attrs[m[1]] = m[2] ?? m[3] ?? '';
  const stripped = info.replace(ATTR_RE, (m, k) => (IMPORT_KEYS.has(k) ? ' ' : m)).trim();
  const first = stripped.split(/\s+/)[0] || '';
  const lang = first && !first.includes('=') ? first : '';
  const extra = stripped.slice(first.length).trim();
  return { attrs, lang, extra };
}

const MARK_PREFIX = '(?:\\/\\/+|\\/\\*+|<!--|#+|--+|;+|%+|\')';
function regionStartRe(name) {
  const n = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^\\s*${MARK_PREFIX}\\s*#?region\\s+${n}\\s*(?:\\*\\/|-->)?\\s*$`);
}
const ANY_START_RE = new RegExp(`^\\s*${MARK_PREFIX}\\s*#?region\\s+\\S`);
const ANY_END_RE = new RegExp(`^\\s*${MARK_PREFIX}\\s*#?endregion\\b`);

function isMarker(line) {
  return ANY_START_RE.test(line) || ANY_END_RE.test(line);
}

function parseRanges(spec, total) {
  const ranges = [];
  for (const part of String(spec).split(',')) {
    const p = part.trim();
    const m = p.match(/^(\d*)\s*-\s*(\d*)$/) || p.match(/^(\d+)$/);
    if (!m || (m.length === 3 && !m[1] && !m[2])) return { error: `Invalid lines "${spec}" (use "10-25", "10", "10-" or "1-3,8-9")` };
    const start = m[1] ? Number(m[1]) : 1;
    const end = m.length === 2 ? start : (m[2] ? Number(m[2]) : total);
    if (start < 1 || end < start || start > total || end > total) {
      return { error: `Line range ${p} is out of range (file has ${total} line${total === 1 ? '' : 's'})` };
    }
    ranges.push([start, end]);
  }
  return { ranges };
}

function dedent(lines) {
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
  if (!common) return lines;
  return lines.map((l) => (l.startsWith(common) ? l.slice(common.length) : l.trimStart()));
}

/**
 * Extract code from file text per { lines, region } attrs.
 * Returns { code } or { error }.
 */
export function extractCode(text, { lines: linesSpec, region } = {}) {
  const all = String(text).replace(/\r\n/g, '\n').split('\n');
  if (all.length && all[all.length - 1] === '') all.pop();
  let selected = all;

  if (linesSpec && region) return { error: 'Use either "lines" or "region", not both' };

  if (region) {
    const startRe = regionStartRe(region);
    const startIdx = all.findIndex((l) => startRe.test(l));
    if (startIdx === -1) return { error: `Region "${region}" not found` };
    let depth = 1;
    let endIdx = -1;
    for (let i = startIdx + 1; i < all.length; i++) {
      if (ANY_START_RE.test(all[i])) depth++;
      else if (ANY_END_RE.test(all[i])) {
        depth--;
        if (depth === 0) { endIdx = i; break; }
      }
    }
    if (endIdx === -1) return { error: `Region "${region}" has no matching endregion marker` };
    selected = all.slice(startIdx + 1, endIdx);
  } else if (linesSpec) {
    const { ranges, error } = parseRanges(linesSpec, all.length);
    if (error) return { error };
    selected = ranges.flatMap(([s, e]) => all.slice(s - 1, e));
  }

  selected = dedent(selected.filter((l) => !isMarker(l)));
  while (selected.length && !selected[0].trim()) selected.shift();
  while (selected.length && !selected[selected.length - 1].trim()) selected.pop();
  return { code: selected.join('\n') };
}

function validateRelPath(rel) {
  const normalized = String(rel || '').replace(/\\/g, '/').trim().replace(/^\/+/, '');
  if (!normalized) return { error: 'Code import "file" is empty' };
  if (normalized.includes('\0')) return { error: 'Code import path is invalid' };
  const parts = path.posix.normalize(normalized).split('/');
  if (parts.includes('..')) return { error: `Code import "${rel}" resolves outside the project root` };
  if (parts.some((p) => p === '.git' || p === 'node_modules' || p.startsWith('.env'))) {
    return { error: `Code import "${rel}" targets a protected path` };
  }
  return { rel: parts.join('/') };
}

/**
 * Expand every top-level fenced block that carries file="..." in its info string.
 * Fences nested inside other fences are left alone.
 */
export async function expandCodeImports(content, {
  projectRoot,
  pagePath = null,
  readFile = (p) => fs.readFile(p, 'utf8'),
  pathExists = (p) => fs.pathExists(p),
  strictFsSafety = true,
} = {}) {
  const result = { content, errors: [], dependencies: [] };
  if (!CODE_IMPORT_DETECT_RE.test(content || '')) return result;

  const root = path.resolve(projectRoot || process.cwd());
  const src = String(content).split('\n');
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
    const block = src.slice(i, Math.min(j + 1, src.length));
    const hasClose = j < src.length;
    const { attrs, lang, extra } = parseInfo(info);
    if (attrs.file === undefined) {
      out.push(...block);
      i = j + 1;
      continue;
    }

    const lineNo = i + 1;
    const fail = (message) => {
      result.errors.push({ file: pagePath, line: lineNo, message });
      out.push(...block);
    };

    const checked = validateRelPath(attrs.file);
    if (checked.error) { fail(checked.error); i = j + 1; continue; }
    const abs = path.resolve(root, checked.rel);
    if (!abs.startsWith(root + path.sep)) { fail(`Code import "${attrs.file}" resolves outside the project root`); i = j + 1; continue; }
    if (!await pathExists(abs)) { fail(`Code import file not found: ${checked.rel}`); i = j + 1; continue; }
    if (strictFsSafety) {
      try {
        const [real, rootReal] = await Promise.all([fs.realpath(abs), fs.realpath(root)]);
        if (!real.startsWith(rootReal + path.sep)) { fail(`Code import "${attrs.file}" escapes the project root via symlink`); i = j + 1; continue; }
        if (!(await fs.stat(real)).isFile()) { fail(`Code import "${attrs.file}" is not a file`); i = j + 1; continue; }
      } catch (e) {
        fail(`Code import file not readable: ${checked.rel}`); i = j + 1; continue;
      }
    }

    result.dependencies.push(abs);
    let text;
    try { text = await readFile(abs); } catch { fail(`Code import file not found: ${checked.rel}`); i = j + 1; continue; }

    const extracted = extractCode(text, { lines: attrs.lines, region: attrs.region });
    if (extracted.error) { fail(`${extracted.error} in ${checked.rel}`); i = j + 1; continue; }

    // Lengthen the fence if the code itself contains a fence-like line.
    let fenceLen = fence.length;
    const runRe = new RegExp(`^[ \\t]*(${ch === '`' ? '`' : '~'}{3,})`);
    for (const l of extracted.code.split('\n')) {
      const m = l.match(runRe);
      if (m && m[1].length >= fenceLen) fenceLen = m[1].length + 1;
    }
    const newFence = ch.repeat(fenceLen);
    const newLang = lang || inferLang(checked.rel);
    const newInfo = [newLang, extra].filter(Boolean).join(' ');
    const body = extracted.code ? extracted.code.split('\n').map((l) => (l ? indent + l : l)) : [];
    out.push(`${indent}${newFence}${newInfo}`, ...body, `${indent}${newFence}`);
    i = hasClose ? j + 1 : src.length;
  }

  result.content = out.join('\n');
  return result;
}
