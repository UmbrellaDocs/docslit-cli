/**
 * Project helpers for the authoring MCP server. Everything here is
 * non-printing and non-exiting (unlike config.js loadConfig).
 */
import path from 'path';
import fs from 'fs-extra';
import { parseFrontmatter } from '../frontmatter.js';
import { expandSidebar } from '../auto-sidebar.js';
import { collectPageIds } from '../sidebar.js';
import { ToolError } from './server.js';

const SEGMENT_RE = /^[\p{L}\p{N}_][\p{L}\p{N}_.\- ]*$/u;

export function toPosix(p) {
  return p.split(path.sep).join('/');
}

/**
 * Normalize and validate a page id. Throws ToolError on anything that could
 * escape docs/ or is not a sane page path.
 */
export function normalizePageId(raw) {
  if (typeof raw !== 'string' || !raw.trim()) throw new ToolError('Page id must be a non-empty string, e.g. "guides/setup".');
  let id = raw.trim().replace(/\\/g, '/');
  if (id.includes('\0')) throw new ToolError('Invalid page id.');
  if (/^[a-zA-Z]:/.test(id) || id.startsWith('/') || id.startsWith('~')) {
    throw new ToolError(`Invalid page id "${raw}": must be relative to docs/ (no absolute paths).`);
  }
  id = id.replace(/^(\.\/)+/, '').replace(/^docs\//, '').replace(/\.(md|mdx)$/i, '').replace(/\/+$/, '');
  if (!id) throw new ToolError(`Invalid page id "${raw}".`);
  for (const seg of id.split('/')) {
    if (seg === '..' || seg === '.' || seg === '') throw new ToolError(`Invalid page id "${raw}": path traversal ("..") and empty segments are not allowed.`);
    if (!SEGMENT_RE.test(seg) || seg.endsWith('.') || seg.endsWith(' ')) {
      throw new ToolError(`Invalid page id "${raw}": segment "${seg}" contains unsupported characters (use letters, numbers, "-", "_").`);
    }
  }
  return id;
}

function insideDir(root, target) {
  const rel = path.relative(root, target);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/** Resolve a page id to an existing source file (or null) plus the path it would be created at. */
export async function resolvePage(dir, rawId) {
  const id = normalizePageId(rawId);
  const docsDir = path.join(dir, 'docs');
  const candidates = [`${id}.md`, `${id}.mdx`, `${id}/index.md`, `${id}/index.mdx`].map((c) => path.join(docsDir, c));
  const createPath = path.join(docsDir, `${id}.md`);
  if (!insideDir(docsDir, createPath)) throw new ToolError(`Invalid page id "${rawId}": resolves outside docs/.`);
  let realDocs = docsDir;
  try { realDocs = await fs.realpath(docsDir); } catch { /* docs/ may not exist yet */ }
  for (const abs of candidates) {
    if (!await fs.pathExists(abs)) continue;
    const real = await fs.realpath(abs);
    if (!insideDir(realDocs, real)) throw new ToolError(`Refusing to access "${rawId}": it resolves outside docs/.`);
    return { id, abs, rel: toPosix(path.relative(dir, abs)), exists: true, createPath };
  }
  return { id, abs: null, rel: null, exists: false, createPath };
}

export async function hasProjectConfig(dir) {
  return fs.pathExists(path.join(dir, 'docslit.json'));
}

/** Read docslit.json without exiting. Returns { config, sidebar, error }. */
export async function readProjectConfig(dir) {
  const configPath = path.join(dir, 'docslit.json');
  if (!await fs.pathExists(configPath)) return { config: null, sidebar: [], error: 'docslit.json not found' };
  let config;
  try {
    config = JSON.parse(await fs.readFile(configPath, 'utf8'));
  } catch (e) {
    return { config: null, sidebar: [], error: `docslit.json is not valid JSON: ${e.message}` };
  }
  let sidebar = [];
  try {
    const expanded = await expandSidebar(config, path.join(dir, 'docs'));
    sidebar = Array.isArray(expanded.sidebar) ? expanded.sidebar : [];
  } catch { /* leave empty */ }
  return { config, sidebar, error: null };
}

export async function walkDocs(dir) {
  const docsDir = path.join(dir, 'docs');
  const out = [];
  async function walk(d) {
    let entries;
    try { entries = await fs.readdir(d, { withFileTypes: true }); } catch { return; }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const e of entries) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      const full = path.join(d, e.name);
      if (e.isDirectory()) await walk(full);
      else if (/\.(md|mdx)$/i.test(e.name)) out.push(full);
    }
  }
  await walk(docsDir);
  return out;
}

export function safeFrontmatter(raw) {
  try {
    return { ...parseFrontmatter(raw), error: null };
  } catch (e) {
    return { data: {}, content: raw, error: e.message };
  }
}

function sidebarIdGroups(sidebar) {
  const map = new Map();
  const walk = (pages, group) => {
    for (const item of pages || []) {
      if (typeof item === 'string') map.set(item, group);
      else if (item?.id) map.set(item.id, group);
      else if (item?.pages) walk(item.pages, group);
    }
  };
  for (const g of sidebar) walk(g.pages, g.group || 'Pages');
  return map;
}

/** All pages: sidebar order first, then any source files not in the sidebar. */
export async function listProjectPages(dir) {
  const { sidebar } = await readProjectConfig(dir);
  const groups = sidebarIdGroups(sidebar);
  const files = await walkDocs(dir);
  const byId = new Map();
  for (const abs of files) {
    const rel = toPosix(path.relative(path.join(dir, 'docs'), abs));
    if (rel.split('/').some((s) => s.startsWith('_'))) continue; // _reusables etc.
    const id = rel.replace(/\.(md|mdx)$/i, '');
    const raw = await fs.readFile(abs, 'utf8');
    const { data } = safeFrontmatter(raw);
    byId.set(id, {
      id,
      title: data.title || null,
      description: data.description || data.desc || '',
      file: `docs/${rel}`,
    });
  }
  const pages = [];
  const used = new Set();
  const lookupId = (sid) => (byId.has(sid) ? sid : byId.has(`${sid}/index`) ? `${sid}/index` : null);
  for (const sid of collectPageIds(sidebar.flatMap((g) => g.pages || []))) {
    const fid = lookupId(sid);
    if (!fid || used.has(fid)) continue;
    used.add(fid);
    pages.push({ ...byId.get(fid), group: groups.get(sid) || null, inSidebar: true });
  }
  for (const [id, p] of byId) {
    if (!used.has(id)) pages.push({ ...p, group: null, inSidebar: false });
  }
  return pages;
}

/** Sidebar tree with titles resolved from frontmatter. */
export async function sidebarTree(dir, sidebar) {
  const pages = await listProjectPages(dir);
  const byId = new Map(pages.map((p) => [p.id, p]));
  const titleOf = (sid) => (byId.get(sid) || byId.get(`${sid}/index`))?.title || sid;
  const walk = (items) => (items || []).map((item) => {
    if (typeof item === 'string') return { id: item, title: titleOf(item) };
    if (item?.id) return { id: item.id, title: item.title || titleOf(item.id) };
    if (item?.pages) return { group: item.group || '', pages: walk(item.pages) };
    return null;
  }).filter(Boolean);
  return sidebar.map((g) => ({ group: g.group || 'Pages', pages: walk(g.pages) }));
}

/** Names of custom components in <project>/components (wc-* tags usable in pages). */
export async function customComponentTags(dir) {
  const customDir = path.join(dir, 'components');
  if (!await fs.pathExists(customDir)) return [];
  const entries = await fs.readdir(customDir);
  return entries.map((e) => e.replace(/\.(js|ts|mjs)$/, '')).filter((n) => n.startsWith('wc-'));
}

/** Filter validation issues to those that concern one page file. */
export function issuesForPage(issues, rel, id) {
  const norm = (f) => (f ? f.replace(/\\/g, '/') : f);
  return issues.filter((i) => norm(i.file) === rel
    || (norm(i.file) === 'docslit.json' && id && i.message.includes(`"${id}"`)));
}
