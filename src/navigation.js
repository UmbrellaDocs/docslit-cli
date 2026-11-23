/**
 * Navigation model: top-level tabs, anchors, sidebar item metadata (icons, badges,
 * links, hidden pages), page layout options and site layout settings.
 *
 * Everything here is pure (no I/O, no DOM) so it can be unit-tested and shared by the
 * build, the dev server, the validator and the MCP server.
 *
 * Shapes (see schema/docslit.schema.json):
 *
 *   "tabs": [
 *     { "tab": "Guides", "icon": "book-open", "sidebar": [ ...groups... ] },
 *     { "tab": "Reference", "path": "reference", "sidebar": "auto" },
 *     { "tab": "Blog", "href": "https://example.com/blog" }
 *   ]
 *
 * When `tabs` is set, `config.sidebar` is derived: the concatenation of every tab's
 * groups. All code that walks `config.sidebar` (page lists, search index, llms.txt,
 * sitemap, validate, ...) therefore keeps working and sees every tab.
 */

// ─── Small helpers ────────────────────────────────────────────────────────────

import { themeLayoutDefaults } from './themes.js';

export function slugify(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function str(v) {
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number') return String(v);
  return '';
}

export function isExternalHref(href) {
  return /^(https?:)?\/\//i.test(String(href || '')) || /^(mailto|tel):/i.test(String(href || ''));
}

/** Normalise a docs path ("/guides/" -> "guides"); '' for root/invalid. */
export function normalizeDir(dir) {
  const d = String(dir ?? '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  if (!d || d === '.' || d.split('/').includes('..')) return '';
  return d;
}

// ─── Sidebar item normalisation ───────────────────────────────────────────────

/** A sidebar entry that points at a URL instead of a page: { title|label, href }. */
export function isLinkItem(item) {
  return isObject(item) && !item.id && !Array.isArray(item.pages) && item.group === undefined
    && typeof item.href === 'string' && item.href.trim() !== '';
}

export function isGroupItem(item) {
  return isObject(item) && !item.id && (item.group !== undefined || Array.isArray(item.pages));
}

/**
 * Normalise one sidebar entry (recursively). Accepts the established shapes plus:
 *   - page objects:  { id, title|label, icon, tag|badge, availability, deprecated, hidden }
 *   - link objects:  { href, title|label, icon, tag, external }
 *   - groups:        { group, pages, icon, tag, availability, collapsed|expanded, root, hidden }
 * `expanded` (Mintlify) is the inverse of `collapsed`; `collapsed: "open-by-default"` (Fern)
 * is a collapsible group that starts open. `root` makes the group title a link to a page.
 */
export function normalizeSidebarItem(item) {
  if (typeof item === 'string') return item;
  if (!isObject(item)) return item;
  const out = { ...item };
  if (out.badge !== undefined) {
    if (out.tag === undefined) out.tag = out.badge;
    delete out.badge;
  }
  if (isLinkItem(item) || (item.id && !Array.isArray(item.pages))) {
    if (out.label !== undefined) {
      if (out.title === undefined) out.title = out.label;
      delete out.label;
    }
    if (isLinkItem(item)) {
      out.href = String(item.href).trim();
      out.external = item.external ?? isExternalHref(out.href);
    }
    return out;
  }
  if (isGroupItem(item)) {
    if (out.group === undefined && typeof out.label === 'string') out.group = out.label;
    delete out.label;
    if (out.collapsed === 'open-by-default') out.collapsed = false;
    if (typeof out.collapsed !== 'boolean') delete out.collapsed;
    if (typeof item.expanded === 'boolean' && typeof out.collapsed !== 'boolean') out.collapsed = !item.expanded;
    delete out.expanded;
    if (Array.isArray(out.pages)) {
      let pages = out.pages.map(normalizeSidebarItem);
      const root = str(out.root);
      delete out.root;
      if (root) {
        const idx = pages.findIndex((p) => p === root || (isObject(p) && p.id === root));
        const rootItem = idx >= 0 && typeof pages[idx] !== 'string' ? { ...pages[idx] } : { id: root };
        rootItem.root = true;
        if (idx >= 0) pages = pages.filter((_, i) => i !== idx);
        pages = [rootItem, ...pages];
      }
      out.pages = pages;
    }
    return out;
  }
  return out;
}

/** Normalise a sidebar array. Loose (non-group) entries are wrapped in an unnamed group. */
export function normalizeSidebarGroups(items) {
  if (!Array.isArray(items)) return [];
  const groups = [];
  let loose = null;
  for (const raw of items) {
    const item = normalizeSidebarItem(raw);
    if (isGroupItem(item)) {
      loose = null;
      groups.push(item);
    } else if (item !== undefined && item !== null) {
      if (!loose) { loose = { group: '', pages: [] }; groups.push(loose); }
      loose.pages.push(item);
    }
  }
  return groups;
}

/** Page ids of a pages array in sidebar order (page objects, group root pages, nested groups). */
export function collectIds(pages, out = []) {
  for (const item of pages || []) {
    if (typeof item === 'string') out.push(item);
    else if (isObject(item)) {
      if (item.id) out.push(item.id);
      else if (Array.isArray(item.pages) || typeof item.root === 'string') {
        // a group's `root` page is part of the site even when its pages do not repeat it
        const listed = Array.isArray(item.pages) ? item.pages : [];
        if (typeof item.root === 'string' && item.root && !listed.some((p) => p === item.root || (isObject(p) && p.id === item.root))) out.push(item.root);
        collectIds(listed, out);
      }
    }
  }
  return out;
}

/** Ids of pages marked hidden in the sidebar config (own flag or an ancestor group's). */
export function collectHiddenIds(sidebar) {
  const hidden = new Set();
  const walk = (pages, inherited) => {
    for (const item of pages || []) {
      if (!isObject(item)) continue;
      if (item.id) { if (inherited || item.hidden === true) hidden.add(item.id); }
      else if (Array.isArray(item.pages)) walk(item.pages, inherited || item.hidden === true);
    }
  };
  for (const g of sidebar || []) {
    if (isObject(g) && Array.isArray(g.pages)) walk(g.pages, g.hidden === true);
  }
  return hidden;
}

// ─── Anchors ──────────────────────────────────────────────────────────────────

/** Anchors: pinned links at the top of the sidebar. [{ label, href, icon, tag, external }] */
export function normalizeAnchors(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const a of raw) {
    if (!isObject(a)) continue;
    const label = str(a.label) || str(a.anchor) || str(a.title) || str(a.text);
    const href = str(a.href) || str(a.url);
    if (!label || !href) continue;
    const entry = { label, href, external: a.external ?? isExternalHref(href) };
    if (a.icon) entry.icon = String(a.icon);
    if (a.tag || a.badge) entry.tag = String(a.tag || a.badge);
    if (a.description) entry.description = String(a.description);
    out.push(entry);
  }
  return out;
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

/**
 * Normalise `config.tabs`. Returns [] when absent/invalid. Each tab:
 *   { id, label, icon?, tag?, href?, external?, target?, hidden?, path?, landing?, openapi?,
 *     i18n?, anchors, sidebar: groups[] }
 * `sidebar` must already be expanded (autogenerate resolved) — see auto-sidebar.js.
 */
export function normalizeTabs(raw, { warn = () => {} } = {}) {
  if (!Array.isArray(raw)) return [];
  const used = new Set();
  const tabs = [];
  raw.forEach((t, i) => {
    if (!isObject(t)) { warn(`tabs[${i}] must be an object — ignored`); return; }
    const label = str(t.tab) || str(t.label) || str(t.title) || str(t.name);
    if (!label) { warn(`tabs[${i}] is missing a "tab" name — ignored`); return; }
    let id = slugify(t.id || label) || `tab-${i + 1}`;
    for (let n = 2; used.has(id); n++) id = `${slugify(t.id || label) || 'tab'}-${n}`;
    used.add(id);
    const tab = { id, label };
    if (t.icon) tab.icon = String(t.icon);
    if (t.tag || t.badge) tab.tag = String(t.tag || t.badge);
    if (t.hidden === true) tab.hidden = true;
    if (isObject(t.i18n)) tab.i18n = t.i18n;
    const href = str(t.href) || str(t.url);
    if (href) {
      tab.href = href;
      tab.external = t.external ?? isExternalHref(href);
      if (typeof t.target === 'string') tab.target = t.target;
      tab.sidebar = [];
      tab.anchors = [];
    } else {
      const dir = normalizeDir(t.path);
      if (dir) tab.path = dir;
      if (t.landing) tab.landing = String(t.landing);
      if (t.openapi === true) tab.openapi = true;
      tab.anchors = normalizeAnchors(t.anchors);
      tab.sidebar = normalizeSidebarGroups(Array.isArray(t.sidebar) ? t.sidebar : []);
    }
    tabs.push(tab);
  });
  return tabs;
}

export function hasTabs(config) {
  return Array.isArray(config?.tabs) && config.tabs.length > 0;
}

/** Tabs that own pages (not external-link tabs). */
export function contentTabs(config) {
  return (config?.tabs || []).filter((t) => !t.href);
}

/**
 * Apply tab navigation to a config: normalise `tabs` and derive the flat `sidebar`.
 * Configs without tabs are returned untouched (same object).
 */
export function applyNavigation(config, { warn = () => {} } = {}) {
  if (!config || !Array.isArray(config.tabs) || !config.tabs.length) return config;
  const tabs = normalizeTabs(config.tabs, { warn });
  if (!tabs.length) {
    const { tabs: _drop, ...rest } = config;
    return rest;
  }
  const sidebar = tabs.flatMap((t) => (t.href ? [] : t.sidebar));
  return { ...config, tabs, sidebar };
}

const _tabMapCache = new WeakMap();

/** Map of page id -> tab id for every page listed in a tab's sidebar (hidden pages included). */
export function buildPageTabMap(tabs) {
  if (!Array.isArray(tabs)) return new Map();
  const cached = _tabMapCache.get(tabs);
  if (cached) return cached;
  const map = new Map();
  for (const tab of tabs) {
    if (tab.href) continue;
    for (const g of tab.sidebar || []) {
      for (const id of collectIds([g])) if (!map.has(id)) map.set(id, tab.id);
    }
  }
  _tabMapCache.set(tabs, map);
  return map;
}

/**
 * Which tab does a page belong to? Order: the tab whose sidebar lists it; frontmatter
 * `tab` (id or label); the tab with the longest matching `path` prefix; OpenAPI pages
 * (`api/…`) -> the OpenAPI tab. Returns the tab id or null.
 */
export function tabIdForPage(config, id, meta = null) {
  const tabs = config?.tabs;
  if (!Array.isArray(tabs) || !tabs.length || !id) return null;
  const listed = buildPageTabMap(tabs).get(id);
  if (listed) return listed;
  const want = str(meta?.tab);
  if (want) {
    const w = slugify(want);
    const hit = tabs.find((t) => !t.href && (t.id === w || slugify(t.label) === w));
    if (hit) return hit.id;
  }
  let best = null;
  for (const t of tabs) {
    if (t.href || !t.path) continue;
    if ((id === t.path || id.startsWith(t.path + '/')) && (!best || t.path.length > best.path.length)) best = t;
  }
  if (best) return best.id;
  if (id.startsWith('api/')) {
    const api = tabs.find((t) => t.openapi);
    if (api) return api.id;
  }
  return null;
}

export function tabById(config, tabId) {
  return (config?.tabs || []).find((t) => t.id === tabId) || null;
}

export function tabLabel(tab, locale = null) {
  if (!tab) return '';
  if (locale && isObject(tab.i18n) && typeof tab.i18n[locale] === 'string' && tab.i18n[locale].trim()) return tab.i18n[locale].trim();
  return tab.label;
}

/** First visible page of a tab: its `landing` page, else the first non-hidden listed page. */
export function tabLandingId(tab, hiddenIds = new Set()) {
  if (!tab || tab.href) return null;
  if (tab.landing) return tab.landing;
  for (const g of tab.sidebar || []) {
    for (const id of collectIds([g])) if (!hiddenIds.has(id)) return id;
  }
  for (const g of tab.sidebar || []) {
    const ids = collectIds([g]);
    if (ids.length) return ids[0];
  }
  return null;
}

// ─── Walking the sidebar with context ─────────────────────────────────────────

/**
 * Flat, ordered list of every page entry with its context:
 *   [{ id, tab, tabLabel, group, groupPath, item, hidden }]
 * Works for both tabbed and plain configs (tab is null without tabs).
 */
export function walkPages(config, { hiddenIds = null } = {}) {
  const out = [];
  const tabs = hasTabs(config) ? config.tabs.filter((t) => !t.href) : [{ id: null, label: null, sidebar: config?.sidebar || [] }];
  const extraHidden = hiddenIds || new Set();
  for (const tab of tabs) {
    (tab.sidebar || []).forEach((g, gi) => {
      const walk = (pages, path, inheritedHidden) => {
        for (const item of pages || []) {
          if (typeof item === 'string') {
            out.push({ id: item, tab: tab.id, tabLabel: tab.label, group: path[0] || g.group || '', groupIndex: gi, groupPath: path, item, hidden: inheritedHidden || extraHidden.has(item) });
          } else if (isObject(item)) {
            if (item.id) {
              out.push({ id: item.id, tab: tab.id, tabLabel: tab.label, group: path[0] || g.group || '', groupIndex: gi, groupPath: path, item, hidden: inheritedHidden || item.hidden === true || extraHidden.has(item.id) });
            } else if (Array.isArray(item.pages)) {
              walk(item.pages, [...path, item.group || ''], inheritedHidden || item.hidden === true);
            }
          }
        }
      };
      walk(g.pages || [], [g.group || ''], g.hidden === true);
    });
  }
  return out;
}

// ─── Badges (tags / availability / deprecated) ────────────────────────────────

const AVAILABILITY = {
  beta: { label: 'Beta', kind: 'beta' },
  alpha: { label: 'Alpha', kind: 'beta' },
  preview: { label: 'Preview', kind: 'beta' },
  experimental: { label: 'Experimental', kind: 'beta' },
  'pre-release': { label: 'Pre-release', kind: 'beta' },
  prerelease: { label: 'Pre-release', kind: 'beta' },
  'in-development': { label: 'In development', kind: 'dev' },
  development: { label: 'In development', kind: 'dev' },
  new: { label: 'New', kind: 'new' },
  deprecated: { label: 'Deprecated', kind: 'deprecated' },
  legacy: { label: 'Legacy', kind: 'deprecated' },
  // default/"no badge" states
  stable: null,
  'generally-available': null,
  ga: null,
};

export const AVAILABILITY_VALUES = Object.keys(AVAILABILITY);

/** Normalise an availability value to { label, kind } or null (no badge). */
export function availabilityBadge(value) {
  const key = String(value ?? '').trim().toLowerCase().replace(/[\s_]+/g, '-');
  if (!key) return null;
  if (Object.prototype.hasOwnProperty.call(AVAILABILITY, key)) return AVAILABILITY[key];
  return { label: String(value).trim(), kind: 'tag' };
}

/**
 * Badges for a sidebar entry / page header: availability (or `deprecated: true`) first, then
 * the free-text tag. Each: { label, kind } with kind in new|beta|dev|deprecated|tag.
 */
export function badgesFor({ tag, availability, deprecated } = {}) {
  const out = [];
  const av = deprecated === true ? AVAILABILITY.deprecated : availabilityBadge(availability);
  if (av) out.push(av);
  const t = str(tag);
  if (t) {
    const lower = t.toLowerCase();
    const known = lower === 'new' ? 'new' : (lower === 'beta' || lower === 'alpha' || lower === 'preview') ? 'beta' : lower === 'deprecated' ? 'deprecated' : 'tag';
    if (!av || av.label.toLowerCase() !== lower) out.push({ label: t, kind: known });
  }
  return out;
}

/** Navigation-relevant frontmatter for one page, merged over its sidebar item. */
export function pageNavMeta(meta = {}, item = null) {
  const it = isObject(item) ? item : {};
  const pick = (k) => (meta[k] !== undefined && meta[k] !== null && meta[k] !== '' ? meta[k] : it[k]);
  const out = {};
  const icon = pick('icon');
  if (icon) out.icon = String(icon);
  // Frontmatter `tag` stays the page-header category label; the sidebar badge is `badge`.
  const tag = meta.badge ?? it.tag ?? it.badge;
  if (tag) out.tag = String(tag);
  const availability = pick('availability');
  if (availability) out.availability = String(availability);
  if (pick('deprecated') === true) out.deprecated = true;
  if (isHiddenMeta(meta) || it.hidden === true) out.hidden = true;
  return out;
}

// ─── Page-level layout & visibility (frontmatter) ─────────────────────────────

/** Frontmatter keys read by the navigation/layout layer (snake_case canonical form). */
export const NAV_FRONTMATTER_KEYS = [
  'layout', 'mode', 'hide_toc', 'toc', 'toc_depth', 'max_toc_depth', 'hide_nav', 'hide_nav_links',
  'hide_footer_pagination', 'hide_feedback', 'hide_actions', 'hide_page_actions', 'subtitle', 'eyebrow',
  'headline', 'tab', 'hidden', 'noindex', 'no_index', 'nofollow', 'searchable', 'availability',
  'deprecated', 'url', 'contextual', 'sidebar_title', 'tag', 'badge', 'icon',
];

const _normKey = (k) => String(k).toLowerCase().replace(/[-_\s]/g, '');
const NAV_KEY_SET = new Set(NAV_FRONTMATTER_KEYS.map(_normKey));

/** Does this frontmatter key belong to the navigation layer (any casing: hide-toc, hideToc, hide_toc)? */
export function isNavFrontmatterKey(key) {
  return NAV_KEY_SET.has(_normKey(key));
}

/** Frontmatter value by any key casing; first match among the given canonical names. */
export function fmGet(meta, ...names) {
  if (!isObject(meta)) return undefined;
  const wanted = new Set(names.map(_normKey));
  for (const k of Object.keys(meta)) {
    if (wanted.has(_normKey(k)) && meta[k] !== undefined && meta[k] !== null) return meta[k];
  }
  return undefined;
}

const truthy = (v) => v === true || v === 'true';

export function isHiddenMeta(meta) {
  return truthy(fmGet(meta, 'hidden'));
}

export function isNoindexMeta(meta) {
  return truthy(fmGet(meta, 'noindex', 'no_index')) || isHiddenMeta(meta);
}

export function isSearchableMeta(meta) {
  return fmGet(meta, 'searchable') !== false && !isNoindexMeta(meta);
}

/** Canonical page layouts. Aliases from Mintlify (`mode`) and Fern (`layout`) resolve here. */
export const PAGE_LAYOUTS = ['guide', 'overview', 'wide', 'center', 'frame', 'full', 'api'];
const LAYOUT_ALIASES = {
  default: 'guide', guide: 'guide', overview: 'overview',
  wide: 'wide', reference: 'wide',
  center: 'center', centre: 'center', page: 'center',
  frame: 'frame',
  full: 'full', custom: 'full', landing: 'full',
  api: 'api',
  // feed layouts (src/feeds.js): rendered as a normal guide page and included in the RSS/Atom feeds
  changelog: 'guide', blog: 'guide', post: 'guide',
};

export function resolveLayoutName(value) {
  const key = String(value ?? '').trim().toLowerCase();
  return LAYOUT_ALIASES[key] || null;
}

/**
 * Resolve every page-level layout/visibility option, merging frontmatter over site-level
 * `layout` settings. Pure; used server-side (data attributes) and by the dev/offline JSON.
 */
export function resolvePageOptions(config, meta = {}) {
  const site = resolveSiteLayout(config).values;
  const requested = fmGet(meta, 'layout', 'mode');
  const layout = resolveLayoutName(requested) || 'guide';
  const tocFlag = fmGet(meta, 'toc');
  const hideToc = truthy(fmGet(meta, 'hide_toc')) || tocFlag === false
    || layout === 'wide' || layout === 'center' || layout === 'frame' || layout === 'full' || layout === 'api';
  const depthRaw = Number(fmGet(meta, 'toc_depth', 'max_toc_depth'));
  const tocDepth = Number.isFinite(depthRaw) && depthRaw >= 2 && depthRaw <= 6 ? Math.floor(depthRaw) : (site.tocDepth || 3);
  const hideNav = truthy(fmGet(meta, 'hide_nav', 'hide_nav_links', 'hide_footer_pagination')) || site.hideNav === true || layout === 'full';
  const feedbackMeta = fmGet(meta, 'feedback');
  const hideFeedback = feedbackMeta === false || truthy(fmGet(meta, 'hide_feedback')) || site.hideFeedback === true;
  const ctxMeta = fmGet(meta, 'contextual');
  const hideActions = truthy(fmGet(meta, 'hide_actions', 'hide_page_actions')) || ctxMeta === false
    || (isObject(ctxMeta) && Array.isArray(ctxMeta.options) && ctxMeta.options.length === 0);
  const subtitle = str(fmGet(meta, 'subtitle')) || (site.showDescription ? str(meta.description || meta.desc) : '');
  return {
    layout,
    requestedLayout: requested ? String(requested) : null,
    hideToc,
    tocDepth,
    hideNav,
    hideFeedback,
    hideActions,
    subtitle,
    eyebrow: str(fmGet(meta, 'eyebrow')),
    hidden: isHiddenMeta(meta),
    noindex: isNoindexMeta(meta),
    searchable: isSearchableMeta(meta),
    headline: str(fmGet(meta, 'headline')),
  };
}

/** The slim, serialisable subset the client runtime needs for a page. */
export function pageNavInfo(config, id, meta = {}) {
  const o = resolvePageOptions(config, meta);
  const info = { layout: o.layout, hideToc: o.hideToc, tocDepth: o.tocDepth, hideNav: o.hideNav, hideFeedback: o.hideFeedback, hideActions: o.hideActions };
  const tab = tabIdForPage(config, id, meta);
  if (tab) info.tab = tab;
  if (o.subtitle) info.subtitle = o.subtitle;
  if (o.eyebrow) info.eyebrow = o.eyebrow;
  return info;
}

// ─── Site-level layout ────────────────────────────────────────────────────────

const LENGTH_RE = /^\d+(\.\d+)?(px|rem|em|%|vw|ch)$/;

/** number -> "Npx"; "44rem" kept; anything else -> null. */
export function normalizeLength(v) {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return `${v}px`;
  if (typeof v === 'string' && LENGTH_RE.test(v.trim())) return v.trim();
  return null;
}

/**
 * Normalise `config.layout`. Returns { values, issues } where values only contains valid keys.
 *   contentWidth   text column width (default 668px)
 *   pageWidth      max width of sidebar+content+TOC; "full" for edge to edge (default 1560px)
 *   sidebarWidth   (default 264px)       tocWidth (default 216px)
 *   headerHeight   top bar (default 60px)
 *   tabsPlacement  "header" | "sidebar"  tabsStyle "underline" | "pill"  tabsAlign "left" | "center"
 *   tocDepth       heading levels in the TOC, 2-4 (default 3 = h2+h3)
 *   hideNav / hideFeedback / showDescription / contentAlignment ("center" | "left")
 */
export function resolveSiteLayout(config) {
  const raw = { ...themeLayoutDefaults(config), ...(isObject(config?.layout) ? config.layout : {}) };
  const values = {};
  const issues = [];
  const len = (key) => {
    if (raw[key] === undefined) return;
    const v = key === 'pageWidth' && raw[key] === 'full' ? '100%' : normalizeLength(raw[key]);
    if (v) values[key] = v;
    else issues.push(`layout.${key} must be a number (px) or a CSS length like "44rem" — ignored`);
  };
  ['contentWidth', 'pageWidth', 'sidebarWidth', 'tocWidth', 'headerHeight'].forEach(len);
  const oneOf = (key, allowed, aliases = {}) => {
    if (raw[key] === undefined) return;
    const v = aliases[raw[key]] || raw[key];
    if (allowed.includes(v)) values[key] = v;
    else issues.push(`layout.${key} must be one of ${allowed.map((a) => `"${a}"`).join(', ')} — ignored`);
  };
  oneOf('tabsPlacement', ['header', 'sidebar']);
  oneOf('tabsStyle', ['underline', 'pill'], { default: 'underline', bubble: 'pill' });
  oneOf('tabsAlign', ['left', 'center']);
  oneOf('contentAlignment', ['center', 'left']);
  if (raw.tocDepth !== undefined) {
    const n = Number(raw.tocDepth);
    if (Number.isInteger(n) && n >= 2 && n <= 4) values.tocDepth = n;
    else issues.push('layout.tocDepth must be 2, 3 or 4 — ignored');
  }
  for (const key of ['hideNav', 'hideFeedback', 'showDescription']) {
    if (raw[key] === undefined) continue;
    if (typeof raw[key] === 'boolean') values[key] = raw[key];
    else issues.push(`layout.${key} must be true or false — ignored`);
  }
  return { values, issues };
}

/** `:root{…}` overrides for the site layout settings. Every value is validated (no injection). */
export function buildLayoutCss(config) {
  const v = resolveSiteLayout(config).values;
  const decl = [];
  if (v.contentWidth) decl.push(`--content-text-w:${v.contentWidth}`);
  if (v.pageWidth) decl.push(`--page-w:${v.pageWidth}`);
  if (v.sidebarWidth) decl.push(`--sidebar-w:${v.sidebarWidth}`);
  if (v.tocWidth) decl.push(`--toc-w:${v.tocWidth}`);
  if (v.headerHeight) decl.push(`--nav-h:${v.headerHeight}`);
  if (v.contentAlignment === 'left') decl.push('--content-align:flex-start');
  return decl.length ? `:root{${decl.join(';')}}` : '';
}

export function tabsPlacement(config) {
  if (!hasTabs(config)) return null;
  return resolveSiteLayout(config).values.tabsPlacement || 'header';
}

// ─── Navbar & footer ──────────────────────────────────────────────────────────

const NAVBAR_TYPES = {
  link: 'link', minimal: 'link', text: 'link',
  button: 'filled', filled: 'filled', primary: 'filled',
  outlined: 'outlined', outline: 'outlined',
  github: 'github', discord: 'discord', dropdown: 'dropdown', menu: 'dropdown',
};

/** Normalise one navbar link/button/dropdown entry. Returns null when unusable. */
export function normalizeNavbarLink(raw) {
  if (!isObject(raw)) return null;
  const type = NAVBAR_TYPES[String(raw.type || 'link').toLowerCase()] || 'link';
  const href = str(raw.href) || str(raw.value) || str(raw.url);
  const label = str(raw.label) || str(raw.text) || str(raw.title);
  const link = { type, label, href };
  if (raw.icon) link.icon = String(raw.icon);
  if (raw.rightIcon) link.rightIcon = String(raw.rightIcon);
  if (raw.rounded === true) link.rounded = true;
  if (typeof raw.target === 'string') link.target = raw.target;
  link.external = raw.external ?? isExternalHref(href);
  if (type === 'dropdown') {
    link.links = (Array.isArray(raw.links) ? raw.links : (Array.isArray(raw.items) ? raw.items : []))
      .map((l) => normalizeNavbarLink({ ...l, type: 'link' }))
      .filter((l) => l && l.href && l.label);
    if (!link.label || !link.links.length) return null;
    return link;
  }
  if (type === 'github') {
    const m = /github\.com\/([^/\s]+)\/([^/\s#?]+)/i.exec(href);
    if (!m) return label && href ? { ...link, type: 'link' } : null;
    link.repo = `${m[1]}/${m[2].replace(/\.git$/, '')}`;
    link.label = label || link.repo.split('/')[1];
    link.stars = raw.stars !== false;
    return link;
  }
  if (!href || (!label && type !== 'discord')) return null;
  if (type === 'discord' && !label) link.label = 'Discord';
  return link;
}

/**
 * Normalise `config.navbar` -> { links: [...], primary: link|null }.
 * `primary` is the CTA (Mintlify navbar.primary); filled/outlined entries in `links`
 * (Fern navbar-links) render as buttons in place, after the text links.
 */
export function normalizeNavbar(navbar) {
  const out = { links: [], primary: null };
  if (!isObject(navbar)) return out;
  for (const raw of Array.isArray(navbar.links) ? navbar.links : []) {
    const l = normalizeNavbarLink(raw);
    if (l) out.links.push(l);
  }
  if (isObject(navbar.primary)) {
    const p = normalizeNavbarLink({ type: 'button', ...navbar.primary });
    if (p) out.primary = p;
  }
  return out;
}

/** Footer social platforms (Mintlify footer.socials / Fern footer-links). Ordered, deduplicated. */
export const SOCIAL_PLATFORMS = {
  github: { label: 'GitHub', icon: 'github' },
  x: { label: 'X', icon: 'x-twitter' },
  twitter: { label: 'X', icon: 'x-twitter' },
  'x-twitter': { label: 'X', icon: 'x-twitter' },
  discord: { label: 'Discord', icon: 'discord' },
  slack: { label: 'Slack', icon: 'slack' },
  linkedin: { label: 'LinkedIn', icon: 'linkedin' },
  youtube: { label: 'YouTube', icon: 'youtube' },
  facebook: { label: 'Facebook', icon: 'facebook' },
  instagram: { label: 'Instagram', icon: 'instagram' },
  reddit: { label: 'Reddit', icon: 'reddit' },
  twitch: { label: 'Twitch', icon: 'twitch' },
  mastodon: { label: 'Mastodon', icon: 'mastodon' },
  bluesky: { label: 'Bluesky', icon: 'bluesky' },
  threads: { label: 'Threads', icon: 'threads' },
  telegram: { label: 'Telegram', icon: 'telegram' },
  whatsapp: { label: 'WhatsApp', icon: 'whatsapp' },
  medium: { label: 'Medium', icon: 'medium' },
  dev: { label: 'DEV', icon: 'dev' },
  'hacker-news': { label: 'Hacker News', icon: 'hacker-news' },
  hackernews: { label: 'Hacker News', icon: 'hacker-news' },
  'stack-overflow': { label: 'Stack Overflow', icon: 'stack-overflow' },
  gitlab: { label: 'GitLab', icon: 'gitlab' },
  npm: { label: 'npm', icon: 'npm' },
  website: { label: 'Website', icon: 'globe' },
  'earth-americas': { label: 'Website', icon: 'globe' },
  rss: { label: 'RSS', icon: 'rss' },
  podcast: { label: 'Podcast', icon: 'rss' },
  email: { label: 'Email', icon: 'mail' },
};

/** `footer.socials` object -> [{ key, label, icon, href }] in declaration order. */
export function normalizeSocials(socials) {
  if (!isObject(socials)) return [];
  const out = [];
  const seen = new Set();
  for (const [key, value] of Object.entries(socials)) {
    const href = str(value);
    if (!href) continue;
    const meta = SOCIAL_PLATFORMS[key.toLowerCase()];
    const icon = meta?.icon || key;
    const label = meta?.label || key.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    if (seen.has(icon + href)) continue;
    seen.add(icon + href);
    out.push({ key, label, icon, href: /^[a-z][a-z0-9+.-]*:/i.test(href) ? href : `https://${href.replace(/^\/+/, '')}` });
  }
  return out;
}

/** `logo` may be a string or { light, dark, href, text, height }. */
export function normalizeLogo(logo) {
  if (!logo) return null;
  if (typeof logo === 'string') return { light: logo, dark: logo, single: true };
  if (!isObject(logo)) return null;
  const light = str(logo.light) || str(logo.dark);
  const dark = str(logo.dark) || str(logo.light);
  if (!light && !dark) return logo.href || logo.text ? { light: '', dark: '', single: true, href: str(logo.href), text: str(logo.text) } : null;
  const out = { light, dark, single: light === dark };
  if (logo.href) out.href = str(logo.href);
  if (logo.text) out.text = str(logo.text);
  if (typeof logo.height === 'number' && logo.height > 0 && logo.height <= 120) out.height = logo.height;
  return out;
}

// ─── Contextual page menu ─────────────────────────────────────────────────────

export const CONTEXTUAL_BUILTINS = ['copy', 'view-markdown', 'chatgpt', 'claude', 'perplexity', 'mcp'];
const CONTEXTUAL_ALIASES = {
  copy: 'copy', 'copy-page': 'copy',
  view: 'view-markdown', 'view-markdown': 'view-markdown', 'view-as-markdown': 'view-markdown', markdown: 'view-markdown',
  chatgpt: 'chatgpt', claude: 'claude', perplexity: 'perplexity',
  mcp: 'mcp', 'add-mcp': 'mcp',
};
export const DEFAULT_CONTEXTUAL = ['copy', 'chatgpt', 'claude', 'mcp'];

/**
 * Normalise the contextual page menu: `contextual: ["copy","chatgpt", {title, href}]` or
 * `{ options: [...] }`, `false` to disable. Returns an array of option descriptors
 * ({ id } for built-ins, { id:"custom", title, description, icon, href } for custom ones).
 * Unknown strings are dropped (reported via `issues`).
 */
export function normalizeContextual(value) {
  const issues = [];
  if (value === false) return { options: [], issues };
  let list = value;
  if (isObject(value)) list = value.options;
  if (!Array.isArray(list)) return { options: DEFAULT_CONTEXTUAL.map((id) => ({ id })), issues };
  const options = [];
  const seen = new Set();
  for (const o of list) {
    if (typeof o === 'string') {
      const id = CONTEXTUAL_ALIASES[o.trim().toLowerCase()];
      if (!id) { issues.push(`Unknown contextual option "${o}"`); continue; }
      if (!seen.has(id)) { seen.add(id); options.push({ id }); }
    } else if (isObject(o)) {
      const title = str(o.title) || str(o.label);
      const href = typeof o.href === 'string' ? o.href.trim() : '';
      if (!title || !href) { issues.push('Custom contextual options need a "title" and an "href"'); continue; }
      const entry = { id: 'custom', title, href };
      if (o.description) entry.description = String(o.description);
      if (o.icon) entry.icon = String(o.icon);
      options.push(entry);
    }
  }
  return { options, issues };
}

/** Resolve the effective contextual options for a page (page frontmatter overrides site config). */
export function contextualFor(config, meta = {}) {
  const page = fmGet(meta, 'contextual');
  if (page !== undefined) return normalizeContextual(page).options;
  if (truthy(fmGet(meta, 'hide_actions', 'hide_page_actions'))) return [];
  return normalizeContextual(config?.contextual).options;
}
