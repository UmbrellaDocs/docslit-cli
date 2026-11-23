// Site-level Python API reference: loads the committed Griffe dumps (api/python/<pkg>.json),
// expands `::: id` directives in pages, resolves mkdocs-autorefs style links ([text][pkg.Obj],
// [pkg.Obj][]) across pages, and writes a Sphinx objects.inv for intersphinx consumers.
//
// State is per process (like the math config): initPythonApi() is called from loadConfig().
import fs from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { load as yamlLoad } from 'js-yaml';
import { loadApi, renderObject } from './index.js';

let state = null; // { packages, indexes: Map, symbols: Map id -> { href, kind }, rendered: Map, fingerprint, options }

const DIRECTIVE = /^([ \t]*):::[ \t]+([A-Za-z_][\w.]*)[ \t]*$/;
const FENCE = /^[ \t]*(`{3,}|~{3,})/;

export function hasPythonApi() { return Boolean(state); }
export function pythonApiFingerprint() { return state ? state.fingerprint : ''; }
export function resetPythonApi() { state = null; }

const pageIdOf = (docsDir, file) => path.relative(docsDir, file).split(path.sep).join('/').replace(/\.md$/i, '');

function walkMd(dir, out = []) {
  let entries = [];
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.name.startsWith('.') || e.name === 'node_modules') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkMd(p, out);
    else if (/\.md$/i.test(e.name)) out.push(p);
  }
  return out;
}

/** Directive occurrences in a Markdown body (outside fenced code): [{ start, end, indent, id, options }]. */
export function findDirectives(body) {
  const lines = String(body).split('\n');
  const found = [];
  let fence = null;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const f = FENCE.exec(l);
    if (f) {
      if (!fence) fence = f[1];
      else if (l.trim().startsWith(fence) && !l.trim().slice(fence.length).trim()) fence = null;
      continue;
    }
    if (fence) continue;
    const m = DIRECTIVE.exec(l);
    if (!m) continue;
    const ind = m[1].length;
    let j = i + 1;
    while (j < lines.length && (lines[j].trim() === '' || /^[ \t]*/.exec(lines[j])[0].length > ind)) j++;
    while (j > i + 1 && lines[j - 1].trim() === '') j--;
    let options = {};
    const block = lines.slice(i + 1, j).map((x) => x.slice(Math.min(ind + 4, /^[ \t]*/.exec(x)[0].length))).join('\n');
    if (block.trim()) {
      try { const y = yamlLoad(block); if (y && typeof y === 'object') options = y.options && typeof y.options === 'object' ? y.options : {}; } catch { /* invalid YAML: defaults */ }
    }
    found.push({ start: i, end: j, indent: m[1], id: m[2], options });
    i = j - 1;
  }
  return found;
}

/**
 * Load api/python/<pkg>.json for every configured package and build the site symbol table by
 * rendering every directive found under docs/. No-op (and state cleared) when python.packages is empty.
 */
export async function initPythonApi(config, cwd) {
  const py = config && config.python;
  const packages = Array.isArray(py?.packages) ? py.packages.map(String) : [];
  if (!packages.length) { state = null; return null; }
  const hash = crypto.createHash('sha1');
  const indexes = new Map();
  const missing = [];
  for (const pkg of packages) {
    const file = path.join(cwd, 'api', 'python', `${pkg}.json`);
    let text;
    try { text = await fs.readFile(file, 'utf8'); } catch { missing.push(pkg); continue; }
    hash.update(pkg).update(text);
    try { indexes.set(pkg, loadApi(text)); } catch (e) { missing.push(pkg); console.warn(`  Warning: api/python/${pkg}.json could not be read: ${e.message}`); }
  }
  const options = py.options && typeof py.options === 'object' ? py.options : {};
  hash.update(JSON.stringify(options));
  state = { packages, indexes, missing, options, symbols: new Map(), rendered: new Map(), fingerprint: hash.digest('hex').slice(0, 16) };

  // symbol table: which page renders which object
  const docsDir = path.join(cwd, 'docs');
  if (existsSync(docsDir)) {
    for (const file of walkMd(docsDir)) {
      let raw;
      try { raw = await fs.readFile(file, 'utf8'); } catch { continue; }
      if (!raw.includes(':::')) continue;
      const pageId = pageIdOf(docsDir, file);
      for (const d of findDirectives(raw)) {
        const r = renderDirective(d);
        if (!r) continue;
        for (const a of r.anchors || []) {
          if (!state.symbols.has(a.id)) state.symbols.set(a.id, { href: `/${pageId}#${a.id}`, kind: kindOf(a.id) });
        }
      }
    }
  }
  return { packages, missing, symbols: state.symbols.size };
}

function indexFor(id) {
  if (!state) return null;
  const root = id.split('.')[0];
  return state.indexes.get(root) || null;
}

function kindOf(id) {
  const idx = indexFor(id);
  let node = idx?.nodes?.get(id);
  for (let hop = 0; node?.kind === 'alias' && node.raw?.target_path && hop < 10; hop++) node = idx.nodes.get(node.raw.target_path) || null; // re-exports
  const kind = node?.kind || null;
  if (kind === 'function' && node.parent?.kind === 'class') return 'method';
  if (kind === 'attribute' && Array.isArray(node.raw?.labels) && node.raw.labels.includes('property')) return 'property';
  return kind;
}

function renderDirective(d) {
  const key = `${d.id}\u0000${JSON.stringify(d.options)}`;
  if (state.rendered.has(key)) return state.rendered.get(key);
  const idx = indexFor(d.id);
  if (!idx) { state.rendered.set(key, null); return null; }
  let r;
  try { r = renderObject(idx, d.id, { ...state.options, ...d.options }, {}); } catch (e) { r = { markdown: '', anchors: [], refs: [], warnings: [String(e.message || e)], error: true }; }
  state.rendered.set(key, r);
  return r;
}

const placeholder = (indent, title, text) => [
  `${indent}<wc-callout type="warning" title="${title.replace(/"/g, '&quot;')}">`, '', `${indent}${text}`, '', `${indent}</wc-callout>`,
].join('\n');

/**
 * Resolve autorefs in Markdown outside code: [text][full.path], [full.path][] and [`full.path`][].
 * Only references to known API objects are rewritten; reference definitions in the page win.
 * `warn` (optional) is called for author-written refs that look like Python paths but resolve nowhere.
 */
export function resolveAutorefs(body, { warn = null } = {}) {
  if (!state || !String(body).includes('][')) return body;
  const text = String(body);
  const defined = new Set([...text.matchAll(/^[ \t]{0,3}\[([^\]]+)\]:\s/gm)].map((m) => m[1].toLowerCase()));
  const lines = text.split('\n');
  let fence = null;
  for (let n = 0; n < lines.length; n++) {
    const l = lines[n];
    const f = FENCE.exec(l);
    if (f) { if (!fence) fence = f[1]; else if (l.trim().startsWith(fence) && !l.trim().slice(fence.length).trim()) fence = null; continue; }
    if (fence || !l.includes('][')) continue;
    // keep inline code spans intact
    lines[n] = l.split(/(`[^`]*`(?!\]))/).map((seg, k) => (k % 2 ? seg : seg.replace(/\[((?:[^\[\]]|`[^`]*`)+)\]\[([^\]]*)\]/g, (m, label, ref) => {
      const id = (ref || label).replace(/`/g, '').trim();
      if (!/^[A-Za-z_][\w]*(\.[A-Za-z_][\w]*)+$/.test(id)) return m;
      if (defined.has((ref || label).toLowerCase())) return m;
      const sym = state.symbols.get(id);
      if (sym) return `[${label}](${sym.href})`;
      if (warn && state.indexes.has(id.split('.')[0])) warn(id, n + 1);
      return label;
    }))).join('');
  }
  return lines.join('\n');
}

/** Expand directives in one page body. warn({ code, message, line }) is optional. */
export function expandPythonApi(body, { warn = null } = {}) {
  if (!state || !String(body).includes(':::')) return resolveAutorefs(body, { warn: warn ? (id, line) => warn({ code: 'api-ref-unresolved', line, message: `Reference [${id}] does not match any rendered Python object.` }) : null });
  // author-written refs first (warn on unresolved), then rendered blocks (silent)
  const authored = resolveAutorefs(body, { warn: warn ? (id, line) => warn({ code: 'api-ref-unresolved', line, message: `Reference [${id}] does not match any rendered Python object.` }) : null });
  const lines = authored.split('\n');
  const ds = findDirectives(authored);
  if (!ds.length) return authored;
  const out = [];
  let pos = 0;
  for (const d of ds) {
    out.push(...lines.slice(pos, d.start));
    const pkg = d.id.split('.')[0];
    let md;
    if (!state.indexes.has(pkg)) {
      md = placeholder(d.indent, `API reference: ${d.id}`, state.packages.includes(pkg)
        ? `The API data for \`${pkg}\` has not been generated yet. Run \`docslit api python ${pkg}\` and commit \`api/python/${pkg}.json\`.`
        : `\`${pkg}\` is not listed in \`python.packages\` in docslit.json. Add it and run \`docslit api python ${pkg}\`.`);
      if (warn) warn({ code: 'api-data-missing', line: d.start + 1, message: `No API data for "${pkg}" (${d.id}).` });
    } else {
      const r = renderDirective(d);
      if (!r || r.error || !r.markdown) {
        md = placeholder(d.indent, `API reference: ${d.id}`, `\`${d.id}\` was not found in api/python/${pkg}.json. Regenerate it with \`docslit api python ${pkg}\`.`);
        if (warn) warn({ code: 'api-object-missing', line: d.start + 1, message: `"${d.id}" was not found in the Python API data.` });
      } else {
        for (const w of r.warnings || []) if (warn) warn({ code: 'api-render', line: d.start + 1, message: `${d.id}: ${w}` });
        md = resolveAutorefs(r.markdown).split('\n').map((x) => (x ? d.indent + x : x)).join('\n');
      }
    }
    out.push('', md, '');
    pos = d.end;
  }
  out.push(...lines.slice(pos));
  return out.join('\n');
}

const ROLE = { module: 'module', class: 'class', function: 'function', method: 'method', attribute: 'attribute', property: 'property' };

/** Write a Sphinx v2 objects.inv into outDir (only when any symbol exists). Returns the number of entries. */
export async function writeObjectsInv(outDir, { project = 'Documentation', version = '' } = {}) {
  if (!state || !state.symbols.size) return 0;
  const rows = [];
  for (const [id, { href, kind }] of [...state.symbols].sort((a, b) => a[0].localeCompare(b[0]))) {
    const role = ROLE[kind] || 'data';
    const [page, anchor] = href.replace(/^\//, '').split('#');
    rows.push(`${id} py:${role} 1 ${page}${anchor ? '#' + anchor : ''} -`);
  }
  const header = `# Sphinx inventory version 2\n# Project: ${project}\n# Version: ${version}\n# The remainder of this file is compressed using zlib.\n`;
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, 'objects.inv'), Buffer.concat([Buffer.from(header), zlib.deflateSync(Buffer.from(rows.join('\n') + '\n'))]));
  return rows.length;
}
