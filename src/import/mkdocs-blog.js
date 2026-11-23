// Material for MkDocs blog plugin -> real DocsLit pages.
// Material renders the blog index, category and archive pages at build time; DocsLit needs files, so this
// module reads the posts, maps their metadata and produces the listing pages plus the old-URL data.
import fs from 'fs-extra';
import path from 'path';
import { load as yamlLoad } from 'js-yaml';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Material's default slugify (pymdownx.slugs.slugify, lowercase): word characters kept, whitespace/punctuation -> "-". */
export function slugifyBlog(s) {
  return String(s ?? '').normalize('NFKC').toLowerCase().trim()
    .replace(/[^\p{L}\p{N}\p{M}_\s-]/gu, '')
    .replace(/[\s-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Babel-style date pattern (yyyy, yy, MM, M, dd, d; other characters literal). */
export function formatBlogDate(iso, fmt = 'yyyy/MM/dd') {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return String(fmt).replace(/yyyy|yy|MM|M|dd|d/g, (t) => ({ yyyy: y, yy: y.slice(2), MM: m, M: String(Number(m)), dd: d, d: String(Number(d)) }[t]));
}

const longDate = (iso) => { const [y, m, d] = iso.slice(0, 10).split('-'); return `${MONTHS[Number(m) - 1]} ${Number(d)}, ${y}`; };

function toIso(v) {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? '' : v.toISOString().slice(0, 10);
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(v ?? ''));
  return m ? m[1] : '';
}

const esc = (s) => String(s).replace(/([[\]\\])/g, '\\$1').replace(/</g, '&lt;');
const names = (v) => (v == null ? [] : [].concat(v)).map((x) => String(x?.name ?? x)).filter(Boolean);
const isObj = (v) => v && typeof v === 'object' && !(v instanceof Date) && !Array.isArray(v);

function splitFrontmatter(raw) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
  if (!m) return { fm: {}, body: raw };
  let fm = {};
  try { fm = yamlLoad(m[1]) || {}; } catch { /* treated as no metadata */ }
  return { fm: isObj(fm) ? fm : {}, body: raw.slice(m[0].length) };
}

/** Plain-text excerpt: paragraphs only, links and images flattened so the text never breaks DocsLit link checks. */
export function plainExcerpt(md) {
  const paras = [];
  let cur = [];
  let fence = false;
  const flush = () => { if (cur.length) paras.push(cur.join(' ')); cur = []; };
  for (const l of String(md).replace(/\r/g, '').split('\n')) {
    if (/^\s*(```|~~~)/.test(l)) { fence = !fence; flush(); continue; }
    if (fence) continue;
    if (!l.trim()) { flush(); continue; }
    if (/^(#{1,6}\s|!!!|\?\?\?|===|\/\/\/|<|\||\s{2,}\S|\t|[-*+]\s|\d+[.)]\s|>|\[\^|-{3,}$)/.test(l)) { flush(); continue; }
    cur.push(l.trim());
  }
  flush();
  return paras.map((p) => p
    .replace(/\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1')
    .replace(/\[\^[^\]]+\]/g, '')
    .replace(/\{[^}]*\}/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/(^|\s):[\w+-]+:(?=\s|$|[.,;!?])/g, '$1')
    .replace(/[{}]/g, '')
    .replace(/</g, '&lt;')
    .replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n\n');
}

const fill = (tpl, vars) => String(tpl).replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));
const trimSlashes = (s) => String(s).replace(/^\.?\/+|\/+$/g, '');

/**
 * Read the blog's posts and settings. Returns null when no post has a date.
 * `slugOf(src)` gives the DocsLit page slug of a source file.
 */
export function readBlog({ docsDir, configDir, opts, pageFiles, slugOf }) {
  const blogDir = trimSlashes(opts.blog_dir ?? 'blog');
  const prefix = blogDir ? blogDir + '/' : '';
  const postDir = trimSlashes(fill(opts.post_dir ?? '{blog}/posts', { blog: blogDir }));
  const postPrefix = postDir ? postDir + '/' : '';
  const sep = String(opts.post_excerpt_separator ?? '<!-- more -->').trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*');
  const sepRe = new RegExp(sep, 'i');
  const cfg = {
    blogDir, prefix,
    urlFormat: String(opts.post_url_format ?? '{date}/{slug}'),
    dateFormat: String(opts.post_date_format ?? 'yyyy/MM/dd'),
    categories: opts.categories !== false,
    categoriesName: String(opts.categories_name ?? 'Categories'),
    categoriesUrl: String(opts.categories_url_format ?? 'category/{slug}'),
    archive: opts.archive !== false,
    archiveName: String(opts.archive_name ?? 'Archive'),
    archiveUrl: String(opts.archive_url_format ?? 'archive/{date}'),
    archiveDate: String(opts.archive_date_format ?? 'yyyy'),
    perPage: opts.pagination === false ? Infinity : Number(opts.pagination_per_page ?? 10),
  };

  let authors = {};
  const af = fill(opts.authors_file ?? '{blog}/.authors.yml', { blog: blogDir }).replace(/^\/+/, '');
  for (const base of [docsDir, configDir]) {
    try {
      const y = yamlLoad(fs.readFileSync(path.join(base, af), 'utf8')) || {};
      authors = isObj(y.authors) ? y.authors : (isObj(y) ? y : {});
      break;
    } catch { /* next */ }
  }

  const posts = [];
  const undated = [];
  for (const f of pageFiles) {
    if (!f.startsWith(postPrefix) || f === `${prefix}index.md`) continue;
    let raw;
    try { raw = fs.readFileSync(path.join(docsDir, f), 'utf8'); } catch { continue; }
    const { fm, body } = splitFrontmatter(raw);
    const created = toIso(isObj(fm.date) ? (fm.date.created ?? fm.date.updated) : fm.date);
    if (!created) { undated.push(f); continue; }
    const updated = isObj(fm.date) ? toIso(fm.date.updated) : '';
    const h1 = /^#\s+(.+?)\s*#*\s*$/m.exec(body);
    const title = String(fm.title || (h1 ? h1[1].replace(/<[^>]+>/g, '').replace(/[`*_]/g, '').trim() : path.posix.basename(f, '.md')));
    const cats = names(fm.categories);
    const urlPath = fill(cfg.urlFormat, {
      date: formatBlogDate(created, cfg.dateFormat), slug: fm.slug ? String(fm.slug) : slugifyBlog(title),
      file: path.posix.basename(f, '.md'), categories: cats.map(slugifyBlog).join('/'),
    }).replace(/\/+/g, '/').replace(/^\/|\/$/g, '');
    const moreAt = body.search(sepRe);
    const ids = names(fm.authors);
    posts.push({
      src: f, slug: slugOf(f), title, created, updated, draft: fm.draft === true || fm.draft === 'true',
      ids, authors: ids.map((id) => (isObj(authors[id]) && authors[id].name ? String(authors[id].name) : id)),
      categories: cats, urlPath,
      excerpt: moreAt !== -1 ? plainExcerpt(body.slice(0, moreAt)) : plainExcerpt(fm.description ? String(fm.description) : ''),
      pinned: fm.pin === true, links: !!fm.links,
    });
  }
  if (!posts.length) return null;
  const live = posts.filter((p) => !p.draft).sort((a, b) => b.created.localeCompare(a.created) || a.slug.localeCompare(b.slug));

  const catMap = new Map();
  if (cfg.categories) for (const p of live) for (const c of p.categories) {
    const key = slugifyBlog(c);
    if (!key) continue;
    if (!catMap.has(key)) catMap.set(key, { name: c, slug: `${prefix}${fill(cfg.categoriesUrl, { slug: key })}`, posts: [] });
    catMap.get(key).posts.push(p);
  }
  const archMap = new Map();
  if (cfg.archive) for (const p of live) {
    const key = formatBlogDate(p.created, cfg.archiveDate);
    if (!archMap.has(key)) archMap.set(key, { name: key, slug: `${prefix}${fill(cfg.archiveUrl, { date: key })}`, posts: [] });
    archMap.get(key).posts.push(p);
  }
  for (const p of live) p.catPages = p.categories.map((c) => catMap.get(slugifyBlog(c))).filter(Boolean);
  return {
    cfg, posts, live, undated, authors,
    categories: [...catMap.values()].sort((a, b) => a.name.localeCompare(b.name)),
    archive: [...archMap.values()].sort((a, b) => b.name.localeCompare(a.name)),
  };
}

/** Frontmatter DocsLit can use, merged over the converted keys (DocsLit has no author/tags keys, so ids and names stay as plain keys). */
export function postOverride(p) {
  const o = { layout: 'post', date: p.created };
  if (p.updated) o.updated = p.updated;
  if (p.ids.length) o.authors = p.ids;
  if (p.categories.length) o.categories = p.categories;
  return o;
}

function postEntry(p, { showCats }) {
  const bits = [longDate(p.created)];
  if (p.authors.length) bits.push(`by ${p.authors.map(esc).join(', ')}`);
  if (showCats && p.catPages?.length) bits.push('in ' + p.catPages.map((c) => `[${esc(c.name)}](/${c.slug})`).join(', '));
  return [`## [${esc(p.title)}](/${p.slug})`, '', `*${bits.join(' · ')}*`, ...(p.excerpt ? ['', p.excerpt, '', `[Continue reading](/${p.slug})`] : [])].join('\n');
}

export const renderPostList = (posts, opts = {}) => posts.map((p) => postEntry(p, opts)).join('\n\n') + '\n';

const q = (s) => JSON.stringify(String(s));

/** The listing pages: [{ slug, content }] for categories and archive periods. */
export function listingPages(plan) {
  const mk = (title, description, posts, showCats) => `---\ntitle: ${q(title)}\ndescription: ${q(description)}\n---\n\n${renderPostList(posts, { showCats })}`;
  return [
    ...plan.categories.map((c) => ({ slug: c.slug, content: mk(c.name, `Posts in the ${c.name} category.`, c.posts, false) })),
    ...plan.archive.map((a) => ({ slug: a.slug, content: mk(a.name, `Posts from ${a.name}.`, a.posts, true) })),
  ];
}
