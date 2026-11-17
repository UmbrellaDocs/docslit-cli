// Frontmatter conversion (Mintlify / Fern / GitBook) onto the keys in schema/frontmatter.schema.json.
const MODE_MAP = { wide: 'wide', custom: 'full', frame: 'frame', center: 'center', default: null, standard: null };
const FERN_LAYOUT = { guide: 'guide', overview: 'overview', reference: 'reference', page: 'page', custom: 'custom' };
const AVAIL = new Set(['beta', 'alpha', 'preview', 'pre-release', 'in-development', 'new', 'deprecated', 'legacy', 'stable', 'generally-available']);

const bool = (v) => v === true || v === 'true';

export function convertFrontmatter(data, vendor, { report = () => {}, isSnippet = false } = {}) {
  const fm = {};
  const d = { ...(data || {}) };
  const take = (...keys) => { for (const k of keys) { if (d[k] !== undefined) { const v = d[k]; delete d[k]; return v; } } return undefined; };
  const dropped = [];
  const str = (v) => (v == null ? undefined : String(v));

  const title = str(take('title'));
  if (title) fm.title = title;
  const description = str(take('description', 'desc'));
  if (description) fm.description = description;
  const sidebarTitle = str(take('sidebarTitle', 'sidebar-title', 'sidebar_title'));
  if (sidebarTitle) fm.sidebar_title = sidebarTitle;

  // icon (+ Mintlify iconType)
  const icon = take('icon');
  const iconType = take('iconType');
  if (typeof icon === 'string' && icon) {
    fm.icon = /^[\w-]+$/.test(icon) && (iconType === 'brands' || iconType === 'regular') ? `fa-${iconType} fa-${icon}` : icon;
  }

  const tag = take('tag');
  if (tag != null) fm.badge = String(tag); // frontmatter `tag` keeps its page-header meaning in DocsLit; Mintlify's is a sidebar badge

  const mode = take('mode');
  const layout = take('layout');
  if (mode !== undefined) {
    const m = MODE_MAP[String(mode).toLowerCase()];
    if (m) fm.layout = m;
    else if (m === undefined) dropped.push('mode');
  }
  if (layout !== undefined && vendor !== 'mintlify') {
    const l = FERN_LAYOUT[String(layout).toLowerCase()];
    if (l) fm.layout = l; else dropped.push('layout');
  }

  for (const [from, to] of [['hidden', 'hidden'], ['noindex', 'noindex'], ['deprecated', 'deprecated']]) {
    const v = take(from); if (v !== undefined) fm[to] = bool(v);
  }
  const searchable = take('searchable'); if (searchable !== undefined) fm.searchable = bool(searchable);
  if (vendor === 'mintlify') {
    const hfp = take('hideFooterPagination'); if (hfp !== undefined && bool(hfp)) fm.hide_nav = true;
  }
  const contextual = take('contextual'); if (contextual !== undefined) fm.contextual = contextual;

  // Fern keys
  const subtitle = str(take('subtitle')); if (subtitle) fm.subtitle = subtitle;
  const headline = str(take('headline')); if (headline) fm.headline = headline;
  const eyebrow = str(take('eyebrow')); if (eyebrow) fm.eyebrow = eyebrow;
  const hideToc = take('hide-toc', 'hide_toc'); if (hideToc !== undefined) fm.hide_toc = bool(hideToc);
  const maxToc = take('max-toc-depth', 'toc_depth'); if (maxToc !== undefined && Number.isInteger(Number(maxToc))) fm.toc_depth = Math.min(6, Math.max(2, Number(maxToc)));
  const hideNav = take('hide-nav-links', 'hide_nav'); if (hideNav !== undefined) fm.hide_nav = bool(hideNav);
  const hideFb = take('hide-feedback', 'hide_feedback'); if (hideFb !== undefined) fm.hide_feedback = bool(hideFb);
  const hideAct = take('hide-page-actions', 'hide_actions'); if (hideAct !== undefined) fm.hide_actions = bool(hideAct);
  const avail = take('availability');
  if (avail !== undefined) { const a = String(avail); if (AVAIL.has(a)) fm.availability = a; else dropped.push('availability'); }
  const updated = take('last-updated', 'updated'); if (updated !== undefined) fm.updated = String(updated).slice(0, 10);

  // GitBook
  const readtime = take('readtime'); if (readtime !== undefined) fm.readtime = String(readtime);
  const order = take('sidebar_position', 'order'); if (order !== undefined && Number.isFinite(Number(order))) fm.sidebar_position = Number(order);
  const draft = take('draft'); if (draft !== undefined) fm.draft = bool(draft);
  const redirect = take('redirect'); if (typeof redirect === 'string') fm.redirect = redirect;
  const attributes = take('attributes'); if (attributes && typeof attributes === 'object') fm.attributes = attributes;
  const slug = take('slug'); if (slug !== undefined) fm.__slug = String(slug);
  const openapi = take('openapi'); if (openapi !== undefined) fm.__openapi = String(openapi);
  const api = take('api'); if (api !== undefined) fm.__api = String(api);
  const url = take('url', 'href'); if (url !== undefined) fm.__url = String(url);

  // known no-equivalent keys: summarised, never silent
  const IGNORE = [/^og:/, /^twitter:/, /^image$/, /^canonical/, /^keywords$/, /^edit-this-page-url$/, /^seo/, /^version$/, /^public$/, /^boost$/, /^rss$/, /^groups$/, /^related$/, /^audience$/, /^breadcrumb/, /^max-toc/, /^position$/, /^skip-slug$/, /^logo$/, /^hide-/];
  for (const k of Object.keys(d)) {
    if (IGNORE.some((r) => r.test(k)) || true) dropped.push(k);
  }
  if (dropped.length && !isSnippet) report('info', 'frontmatter-dropped', `Frontmatter keys without a DocsLit equivalent were dropped: ${[...new Set(dropped)].join(', ')}.`, { action: 'Dropped them.', fix: 'Add the information to the page body or site config if it matters (SEO tags: use "head" in docslit.json).' });

  return { fm, title };
}
