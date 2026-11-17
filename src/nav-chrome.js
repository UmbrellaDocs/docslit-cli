/**
 * Navigation chrome: the markup, CSS and browser runtime for tabs, the sidebar
 * (icons, badges, links, nested groups, hidden pages), anchors, navbar links/dropdowns,
 * the contextual page menu and page-level layout switches.
 *
 * template.js composes the page shell from these pieces. DOM regions (class names):
 *
 *   .nav                       fixed top bar (logo, navbar links, search, switchers, CTA)
 *   .nav-tabs-bar              fixed tab row under the top bar (tabs placement "header")
 *   .docs-sidebar              left column
 *     .sidebar-tabs            tab list (placement "sidebar", and in the mobile drawer)
 *     .sidebar-filter-wrap     "Filter pages…" input
 *     .sidebar-anchors         pinned links (global + per tab)
 *     .sidebar-scroll          scrolling region
 *       .sidebar-pane[data-tab]  one per tab (only the active one is visible)
 *         .sidebar-section / .sidebar-subgroup / .sidebar-item / .sidebar-link
 *   .docs-main-col             breadcrumb bar + content + TOC
 *   .docs-page[data-layout][data-tab][data-hide-toc][data-hide-nav][data-toc-depth]
 *                              page-level layout switches (set by frontmatter)
 *
 * Every colour, size and radius used here is a CSS custom property declared in the single
 * `:root` block at the top of NAV_CHROME_CSS (light-mode overrides under `html.light`).
 */

import { renderIcon } from './nav-icons.js';
import { toLabel } from './sidebar.js';
import {
  hasTabs, tabIdForPage, tabLabel, tabLandingId, badgesFor, pageNavMeta, resolvePageOptions,
  pageNavInfo, isLinkItem, isGroupItem, resolveSiteLayout, collectHiddenIds, isExternalHref,
} from './navigation.js';
import { withBasePath, normalizeBasePath } from './site-config.js';

export function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const EXT_ARROW = '<svg class="nav-ext-arrow" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17L17 7M8 7h9v9"/></svg>';
const CHEVRON = '<svg class="nav-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>';

// ─── State ────────────────────────────────────────────────────────────────────

/** A virtual "API Reference" tab for OpenAPI pages when the site uses tabs. */
export function withApiTab(config, hasSpec) {
  if (!hasSpec || !hasTabs(config) || config.tabs.some((t) => t.openapi)) return config;
  const tab = { id: 'api-reference', label: 'API Reference', icon: 'code', openapi: true, anchors: [], sidebar: [] };
  return { ...config, tabs: [...config.tabs, tab] };
}

/**
 * Everything the shell needs to know about navigation for one render.
 *   hrefPrefix  "/base/fr/1.0" (static) — page URLs are `${hrefPrefix}/${id}`
 */
export function buildNavState({
  config, activePageId = null, locale = null, basePath = '', hrefPrefix = '', offline = false,
  navMeta = null, hiddenIds = null, knownIds = null, activeMeta = null,
}) {
  const tabsOn = hasTabs(config);
  const layout = resolveSiteLayout(config).values;
  const hidden = new Set(hiddenIds || []);
  for (const id of collectHiddenIds(config.sidebar)) hidden.add(id);
  if (navMeta) for (const [id, m] of Object.entries(navMeta)) if (m?.hidden) hidden.add(id);
  const tabs = tabsOn ? config.tabs : [];
  const activeTabId = tabsOn
    ? (activePageId ? tabIdForPage(config, activePageId, activeMeta) : null)
    : null;
  const firstContentTab = tabs.find((t) => !t.href && !t.hidden) || tabs.find((t) => !t.href) || null;
  const shownTabId = activeTabId || firstContentTab?.id || null;
  return {
    config, tabs, tabsOn, layout, hidden, locale, basePath, offline, hrefPrefix,
    navMeta: navMeta || {}, knownIds: knownIds || null,
    placement: tabsOn ? (layout.tabsPlacement || 'header') : null,
    activeTabId, shownTabId, activePageId,
    hrefFor(id) { return offline ? `#${id}` : `${hrefPrefix}/${id}`; },
  };
}

/** Classes for <body> that depend on navigation settings. */
export function bodyClassesFor(nav) {
  const c = [];
  if (nav.tabsOn) c.push(nav.placement === 'sidebar' ? 'has-tabs-sidebar' : 'has-tabs-header');
  return c;
}

/** `data-*` attributes for <div class="docs-page"> derived from a page's resolved options. */
export function docsPageAttrs(info, nav) {
  const a = [];
  a.push(`data-layout="${esc(info.layout || 'guide')}"`);
  if (info.hideToc) a.push('data-hide-toc="true"');
  if (info.hideNav) a.push('data-hide-nav="true"');
  if (info.hideActions) a.push('data-hide-actions="true"');
  a.push(`data-toc-depth="${esc(info.tocDepth || 3)}"`);
  const tab = info.tab || nav?.shownTabId;
  if (tab) a.push(`data-tab="${esc(tab)}"`);
  return a.join(' ');
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

function tabLinkHtml(tab, nav, cls, hiddenIds) {
  const label = esc(tabLabel(tab, nav.locale));
  const icon = tab.icon ? renderIcon(tab.icon, { size: 16, className: `${cls}-icon nav-icon`, resolveSrc: (s) => (s.startsWith('/') ? withBasePath(nav.basePath, s) : s) }) : '';
  const badge = tab.tag ? `<span class="nav-badge" data-kind="tag">${esc(tab.tag)}</span>` : '';
  if (tab.href) {
    const external = tab.external;
    const target = tab.target || (external ? '_blank' : '');
    const href = external ? tab.href : withBasePath(nav.basePath, tab.href);
    const rel = target === '_blank' ? ' rel="noopener noreferrer"' : '';
    return `<a class="${cls} ${cls}-external" href="${esc(href)}"${target ? ` target="${esc(target)}"` : ''}${rel} data-tab-link="${esc(tab.id)}">${icon}<span class="${cls}-label">${label}</span>${badge}${external ? EXT_ARROW : ''}</a>`;
  }
  const landing = tabLandingId(tab, hiddenIds);
  const active = nav.shownTabId === tab.id && (nav.activeTabId === tab.id);
  const href = landing ? nav.hrefFor(landing) : '#';
  const attrs = `data-tab="${esc(tab.id)}"${landing ? ` data-nav-page="${esc(landing)}"` : ''}`;
  return `<a class="${cls}${active ? ' active' : ''}" href="${esc(href)}" ${attrs}${active ? ' aria-current="page"' : ''}>${icon}<span class="${cls}-label">${label}</span>${badge}</a>`;
}

/** The tab row under the top bar (tabs placement "header"). Hidden on small screens. */
export function renderTabsBar(nav) {
  if (!nav.tabsOn || nav.placement !== 'header') return '';
  const items = nav.tabs.filter((t) => !t.hidden).map((t) => `<li>${tabLinkHtml(t, nav, 'nav-tab', nav.hidden)}</li>`).join('');
  if (!items) return '';
  const v = nav.layout;
  return `<div class="nav-tabs-bar" id="nav-tabs-bar" data-style="${esc(v.tabsStyle || 'underline')}"${v.tabsStyle ? ' data-style-set' : ''} data-align="${esc(v.tabsAlign || 'left')}"><nav class="nav-tabs" aria-label="Sections"><ul class="nav-tabs-list">${items}</ul></nav></div>`;
}

/** Tabs inside the sidebar: always for placement "sidebar", and as the mobile drawer list for "header". */
export function renderSidebarTabs(nav) {
  if (!nav.tabsOn) return '';
  const items = nav.tabs.filter((t) => !t.hidden).map((t) => tabLinkHtml(t, nav, 'sidebar-tab', nav.hidden)).join('');
  if (!items) return '';
  return `<nav class="sidebar-tabs" data-placement="${nav.placement === 'sidebar' ? 'sidebar' : 'drawer'}" data-style="${esc(nav.layout.tabsStyle || 'underline')}" aria-label="Sections">${items}</nav>`;
}

// ─── Anchors ──────────────────────────────────────────────────────────────────

function anchorHtml(a, nav) {
  const icon = a.icon ? `<span class="sidebar-anchor-icon">${renderIcon(a.icon, { size: 16, className: 'nav-icon' })}</span>` : '';
  const badge = a.tag ? `<span class="nav-badge" data-kind="tag">${esc(a.tag)}</span>` : '';
  const pageId = pageIdFromHref(a.href, nav);
  if (pageId) {
    return `<a class="sidebar-anchor" href="${esc(nav.hrefFor(pageId))}" data-nav-page="${esc(pageId)}">${icon}<span class="sidebar-anchor-label">${esc(a.label)}</span>${badge}</a>`;
  }
  const external = a.external;
  const href = external ? a.href : withBasePath(nav.basePath, a.href);
  return `<a class="sidebar-anchor" href="${esc(href)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${icon}<span class="sidebar-anchor-label">${esc(a.label)}</span>${badge}${external ? EXT_ARROW : ''}</a>`;
}

/** An href that names a known page ("/changelog", "guides/setup.html") -> its id, else null. */
export function pageIdFromHref(href, nav) {
  if (!nav.knownIds || isExternalHref(href)) return null;
  const id = String(href).replace(/^\.?\/+/, '').replace(/[?#].*$/, '').replace(/\.html$/, '').replace(/\/+$/, '');
  return id && nav.knownIds.has(id) ? id : null;
}

/** Pinned links above the page tree: global `anchors` plus the active tab's own. */
export function renderAnchors(nav) {
  const global = nav.config.anchors || [];
  const out = [];
  if (global.length) out.push({ scope: '', list: global });
  for (const tab of nav.tabs) {
    if (!tab.href && tab.anchors?.length) out.push({ scope: tab.id, list: tab.anchors });
  }
  if (!out.length) return '';
  return out.map(({ scope, list }) => {
    const hide = scope && scope !== nav.shownTabId ? ' hidden' : '';
    return `<nav class="sidebar-anchors"${scope ? ` data-tab="${esc(scope)}"` : ''}${hide} aria-label="${scope ? 'Section links' : 'Quick links'}">${list.map((a) => anchorHtml(a, nav)).join('')}</nav>`;
  }).join('');
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function badgesHtml(spec, cls = 'sidebar-badge') {
  return badgesFor(spec).map((b) => `<span class="${cls}" data-kind="${esc(b.kind)}">${esc(b.label)}</span>`).join('');
}

/**
 * The page tree. Without tabs this is exactly the classic flat list of groups; with tabs each
 * tab becomes a `.sidebar-pane` (only the active one visible), so tab switches in the SPA are
 * a visibility toggle with no refetching.
 */
export function buildSidebarHtml(config, draftIds = [], activePageId = null, excludePrefix = null, offline = false, titleMap = null, nav = null) {
  const draftSet = new Set(draftIds);
  const hiddenSet = nav?.hidden || new Set();
  const navMeta = nav?.navMeta || {};
  const hrefFor = (id) => (nav && !offline ? nav.hrefFor(id) : id);
  const isExcluded = (id) => draftSet.has(id) || hiddenSet.has(id) || (excludePrefix && id.startsWith(excludePrefix));
  const sidebarClick = (id) => (offline ? '' : ` onclick="loadPage('${esc(id)}',this);if(window.innerWidth<=1024)closeSidebar();return false;"`);
  const iconOf = (name) => (name ? renderIcon(name, { size: 16, className: 'nav-icon', resolveSrc: (s) => (s.startsWith('/') ? withBasePath(nav?.basePath || '', s) : s) }) : '');

  function containsPage(pages, id) {
    if (!id) return false;
    return (pages || []).some((p) => (typeof p === 'string' ? p === id : p && (p.id === id || (p.group !== undefined && containsPage(p.pages, id)))));
  }
  function isVisibleEntry(p, inheritedHidden) {
    if (typeof p === 'string') return !isExcluded(p) && !inheritedHidden;
    if (p && p.id) return !isExcluded(p.id) && p.hidden !== true && !inheritedHidden;
    if (p && Array.isArray(p.pages)) return p.hidden !== true && !inheritedHidden;
    return true;
  }
  function pageItem(item, tabLabelText) {
    const id = typeof item === 'string' ? item : item.id;
    const obj = typeof item === 'object' ? item : {};
    const meta = navMeta[id] || {};
    const label = obj.title || (titleMap && titleMap[id]) || toLabel(id);
    const active = id === activePageId ? ' active' : '';
    const icon = iconOf(obj.icon || meta.icon);
    const badges = badgesHtml({ tag: obj.tag ?? meta.tag, availability: obj.availability ?? meta.availability, deprecated: obj.deprecated === true || meta.deprecated === true });
    const deprecated = obj.deprecated === true || meta.deprecated === true || /^deprecated$/i.test(obj.availability || meta.availability || '');
    const href = esc(hrefFor(id));
    if (obj.method) {
      return `<a class="sidebar-item api-nav-item${active}" data-page="${esc(id)}" href="${href}"${sidebarClick(id)}><span class="api-nav-label">${esc(label)}</span><span class="method-badge ${esc(String(obj.method).toLowerCase())}">${esc(obj.method)}</span></a>`;
    }
    if (!icon && !badges && !deprecated) {
      return `<a class="sidebar-item${active}" data-page="${esc(id)}" href="${href}"${sidebarClick(id)}>${esc(label)}</a>`;
    }
    return `<a class="sidebar-item sidebar-item-rich${active}${deprecated ? ' is-deprecated' : ''}" data-page="${esc(id)}" href="${href}"${sidebarClick(id)}>${icon ? `<span class="sidebar-item-icon">${icon}</span>` : ''}<span class="sidebar-item-label">${esc(label)}</span>${badges}</a>`;
  }
  function linkItem(item) {
    const icon = iconOf(item.icon);
    const external = item.external;
    const href = external ? item.href : withBasePath(nav?.basePath || '', item.href);
    const target = item.target || (external ? '_blank' : '');
    const rel = target === '_blank' ? ' rel="noopener noreferrer"' : '';
    return `<a class="sidebar-link" href="${esc(href)}"${target ? ` target="${esc(target)}"` : ''}${rel}>${icon ? `<span class="sidebar-item-icon">${icon}</span>` : ''}<span class="sidebar-item-label">${esc(item.title || item.href)}</span>${badgesHtml({ tag: item.tag })}${external ? EXT_ARROW : ''}</a>`;
  }
  /** Group title content: optional icon + label + badges; the root page makes the label a link. */
  function titleInner(group, rootItem) {
    const text = String(group.group || '');
    const icon = iconOf(group.icon);
    const badges = badgesHtml({ tag: group.tag, availability: group.availability });
    if (rootItem) {
      const id = rootItem.id;
      const active = id === activePageId ? ' active' : '';
      return `${icon ? `<span class="sidebar-item-icon">${icon}</span>` : ''}<a class="sidebar-item sidebar-group-root${active}" data-page="${esc(id)}" href="${esc(hrefFor(id))}"${sidebarClick(id)}>${esc(text)}</a>${badges}`;
    }
    if (!icon && !badges) return esc(text);
    return `${icon ? `<span class="sidebar-item-icon">${icon}</span>` : ''}<span class="sidebar-group-label">${esc(text)}</span>${badges}`;
  }
  function rootOf(pages) {
    const r = (pages || []).find((p) => p && typeof p === 'object' && p.root === true && p.id && !isExcluded(p.id));
    return r || null;
  }

  function renderPages(pages, keyPath, depth, inheritedHidden) {
    let out = '';
    for (const item of pages) {
      if (item && typeof item === 'object' && item.root === true && item.id) continue; // rendered as the group title
      if (isLinkItem(item)) { out += linkItem(item); continue; }
      if (isGroupItem(item) && item.group !== undefined) {
        const hiddenHere = inheritedHidden || item.hidden === true;
        const subPages = (item.pages || []).filter((p) => isVisibleEntry(p, hiddenHere));
        if (!subPages.length) continue;
        const root = rootOf(subPages);
        const key = keyPath.concat(item.group).join(' / ');
        const depthAttr = ` data-depth="${depth}"`;
        if (typeof item.collapsed === 'boolean') {
          const open = !item.collapsed || containsPage(subPages, activePageId);
          out += `<details class="sidebar-subgroup sidebar-details"${depthAttr} data-sb-key="${esc(key)}"${open ? ' open' : ''}>`;
          out += `<summary class="sidebar-subgroup-title">${titleInner(item, root)}</summary>`;
          out += renderPages(subPages, keyPath.concat(item.group), depth + 1, hiddenHere);
          out += '</details>';
          continue;
        }
        out += `<div class="sidebar-subgroup"${depthAttr}>`;
        out += `<div class="sidebar-subgroup-title">${titleInner(item, root)}</div>`;
        out += renderPages(subPages, keyPath.concat(item.group), depth + 1, hiddenHere);
        out += '</div>';
      } else if (typeof item === 'string' || (item && item.id)) {
        const id = typeof item === 'string' ? item : item.id;
        if (isExcluded(id) || inheritedHidden || (typeof item === 'object' && item.hidden === true)) continue;
        out += pageItem(item);
      }
    }
    return out;
  }

  function renderGroups(groups, keyRoot) {
    let html = '';
    for (const group of groups || []) {
      const hiddenHere = group.hidden === true;
      const visiblePages = (group.pages || []).filter((p) => isVisibleEntry(p, hiddenHere));
      if (!visiblePages.length) continue;
      const name = group.group || '';
      const root = rootOf(visiblePages);
      const keyPath = keyRoot ? [keyRoot, name] : [name];
      const key = keyPath.join(' / ');
      const hasTitle = name !== '' || group.icon || group.tag;
      const body = renderPages(visiblePages, keyPath, 2, hiddenHere);
      if (typeof group.collapsed === 'boolean' && hasTitle) {
        const open = !group.collapsed || containsPage(visiblePages, activePageId);
        html += `<div class="sidebar-section"><details class="sidebar-details" data-sb-key="${esc(key)}"${open ? ' open' : ''}>`;
        html += `<summary class="sidebar-group-title">${titleInner(group, root)}</summary>`;
        html += body;
        html += '</details></div>';
        continue;
      }
      html += '<div class="sidebar-section">';
      if (hasTitle) html += `<div class="sidebar-group-title">${titleInner(group, root)}</div>`;
      html += body;
      html += '</div>';
    }
    return html;
  }

  if (!nav?.tabsOn) {
    // Classic flat sidebar. Keys are the group paths exactly as before.
    let html = '';
    for (const group of config.sidebar || []) html += renderGroups([group], '');
    return html;
  }
  let html = '';
  for (const tab of nav.tabs) {
    if (tab.href) continue;
    const body = tab.openapi && nav.apiSidebarHtml ? nav.apiSidebarHtml : renderGroups(tab.sidebar, tab.id);
    const hide = tab.id === nav.shownTabId ? '' : ' hidden';
    html += `<div class="sidebar-pane" data-tab="${esc(tab.id)}" role="group" aria-label="${esc(tabLabel(tab, nav.locale))}"${hide}>${body}</div>`;
  }
  return html;
}

// ─── Page header extras (eyebrow, subtitle, availability badges) ─────────────

/**
 * Markup injected around the page <h1>: `before` goes in front of it (eyebrow), `after` right
 * behind it (availability badges + subtitle), ahead of the meta bar.
 */
export function pageHeaderHtml(config, id, meta = {}) {
  const o = resolvePageOptions(config, meta);
  const nm = pageNavMeta(meta);
  let before = '';
  let after = '';
  if (o.eyebrow) before = `<div class="page-eyebrow">${esc(o.eyebrow)}</div>`;
  const badges = badgesFor({ availability: nm.availability, deprecated: nm.deprecated });
  if (badges.length) after += `<div class="page-badges">${badges.map((b) => `<span class="page-badge" data-kind="${esc(b.kind)}">${esc(b.label)}</span>`).join('')}</div>`;
  if (o.subtitle) after += `<p class="page-subtitle">${esc(o.subtitle)}</p>`;
  return { before, after };
}

/** What the client needs to know about a page (dev API / offline page data). */
export function pageClientInfo(config, id, meta = {}) {
  const info = pageNavInfo(config, id, meta);
  const { before, after } = pageHeaderHtml(config, id, meta);
  if (before) info.before = before;
  if (after) info.after = after;
  return info;
}

// ─── CSS ──────────────────────────────────────────────────────────────────────

/** Design tokens for the navigation chrome. Emitted before the theme CSS so themes can override them. */
export const NAV_TOKENS_CSS = `
/* ═══ NAVIGATION CHROME — TOKENS (declared once; every nav rule reads them) ═══ */
:root {
  /* layout */
  --page-w: 1560px;
  --content-text-w: 668px;
  --content-pad-x: 56px;
  --content-w: calc(var(--content-text-w) + 2 * var(--content-pad-x));
  --content-wide-w: calc(var(--content-text-w) * 1.6 + 2 * var(--content-pad-x));
  --content-align: center;
  --toc-w: 216px;
  --tabs-bar-h: 44px;
  --tabs-h: 0px;
  --breadcrumb-h: 44px;
  /* sidebar rhythm */
  --sidebar-pad-x: 18px;
  --sidebar-item-pad-y: 7px;
  --sidebar-indent: 14px;
  --sidebar-icon-size: 16px;
  --sidebar-gap: 8px;
  /* chrome controls */
  --control-h: 34px;
  --control-radius: var(--radius);
  --tab-gap: 2px;
  --tab-pad-x: 12px;
  --tab-radius: 8px;
  --tab-font-size: 14px;
  --tab-color: var(--text2);
  --tab-color-hover: var(--text);
  --tab-color-active: var(--text);
  --tab-indicator: var(--accent);
  --tab-pill-bg: var(--accent-dim);
  --tab-pill-fg: var(--accent-light);
  --tabs-bar-bg: var(--nav-bg);
  --dropdown-bg: var(--surface);
  --dropdown-border: var(--border);
  --dropdown-shadow: 0 8px 24px rgba(0,0,0,.35);
  --dropdown-radius: var(--radius);
  --btn-filled-bg: var(--accent);
  --btn-filled-fg: var(--on-accent);
  --btn-filled-hover-bg: var(--accent-light);
  --btn-outlined-border: var(--border2);
  --anchor-icon-bg: var(--surface2);
  --anchor-icon-fg: var(--text3);
  --subtitle-color: var(--text2);
  --eyebrow-color: var(--accent-light);
  /* badges: [background, foreground] per kind */
  --badge-radius: 999px;
  --badge-font-size: 10px;
  --badge-tag-bg: var(--surface2);      --badge-tag-fg: var(--text2);      --badge-tag-border: var(--border);
  --badge-new-bg: var(--accent-dim2);   --badge-new-fg: var(--accent-light); --badge-new-border: transparent;
  --badge-beta-bg: rgba(245,158,11,.14); --badge-beta-fg: #fbbf24;         --badge-beta-border: transparent;
  --badge-dev-bg: rgba(59,130,246,.14);  --badge-dev-fg: #60a5fa;          --badge-dev-border: transparent;
  --badge-deprecated-bg: rgba(239,68,68,.12); --badge-deprecated-fg: #f87171; --badge-deprecated-border: transparent;
}
html.light {
  --dropdown-shadow: 0 8px 24px rgba(0,0,0,.12);
  --btn-filled-hover-bg: var(--accent-light);
  --badge-beta-fg: #92400e;  --badge-beta-bg: rgba(217,119,6,.12);
  --badge-dev-fg: #1d4ed8;   --badge-dev-bg: rgba(37,99,235,.1);
  --badge-deprecated-fg: #b91c1c; --badge-deprecated-bg: rgba(220,38,38,.09);
}
body.has-tabs-header { --tabs-h: var(--tabs-bar-h); }
:root, body { --chrome-h: calc(var(--nav-h) + var(--tabs-h) + var(--announcement-h)); }
`;

/** Rules for the navigation chrome (read the tokens above). */
export const NAV_RULES_CSS = `
/* ═══ NAVIGATION CHROME — RULES ═══ */
/* ── icons ─────────────────────────────────────────────────────────────── */
.nav-icon { flex-shrink: 0; vertical-align: middle; }
.nav-icon-img { object-fit: contain; border-radius: 3px; }
wc-icon.nav-icon:not(:defined) { display: inline-block; }
.nav-ext-arrow { flex-shrink: 0; opacity: .55; }
.nav-chevron { flex-shrink: 0; opacity: .7; transition: transform .15s; }

/* ── badges ────────────────────────────────────────────────────────────── */
.nav-badge, .sidebar-badge, .page-badge {
  display: inline-flex; align-items: center; flex-shrink: 0;
  font-family: var(--font-sans); font-size: var(--badge-font-size); font-weight: 600; line-height: 1;
  letter-spacing: .02em; text-transform: none;
  padding: 3px 7px; border-radius: var(--badge-radius);
  background: var(--badge-tag-bg); color: var(--badge-tag-fg); border: 1px solid var(--badge-tag-border);
  white-space: nowrap;
}
:is(.nav-badge, .sidebar-badge, .page-badge)[data-kind="new"] { background: var(--badge-new-bg); color: var(--badge-new-fg); border-color: var(--badge-new-border); }
:is(.nav-badge, .sidebar-badge, .page-badge)[data-kind="beta"] { background: var(--badge-beta-bg); color: var(--badge-beta-fg); border-color: var(--badge-beta-border); }
:is(.nav-badge, .sidebar-badge, .page-badge)[data-kind="dev"] { background: var(--badge-dev-bg); color: var(--badge-dev-fg); border-color: var(--badge-dev-border); }
:is(.nav-badge, .sidebar-badge, .page-badge)[data-kind="deprecated"] { background: var(--badge-deprecated-bg); color: var(--badge-deprecated-fg); border-color: var(--badge-deprecated-border); }
.sidebar-badge { margin-left: auto; }
.page-badges { display: flex; flex-wrap: wrap; gap: 8px; margin: -8px 0 16px; }
.page-badge { font-size: 12px; padding: 4px 10px; }
.page-eyebrow { font-size: 13px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--eyebrow-color); margin: 0 0 10px; }
.page-subtitle { font-size: 1.125rem; line-height: 1.55; color: var(--subtitle-color); margin: -8px 0 20px; max-width: 62ch; text-wrap: pretty; }
.docs-content .page-subtitle { margin-bottom: 20px; }

/* ── header tabs ───────────────────────────────────────────────────────── */
.nav-tabs-bar {
  position: fixed; top: calc(var(--announcement-h) + var(--nav-h)); left: 0; right: 0; z-index: 290;
  height: var(--tabs-bar-h);
  background: var(--tabs-bar-bg);
  backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--border);
  padding: 0 20px 0 var(--tabs-pad-x, 0px);
  display: flex; align-items: stretch;
  transition: background .2s;
}
.nav-tabs { flex: 1; min-width: 0; display: flex; }
.nav-tabs-list {
  list-style: none; display: flex; align-items: stretch; gap: var(--tab-gap);
  overflow-x: auto; scrollbar-width: none; margin: 0; padding: 0; flex: 1; min-width: 0;
}
.nav-tabs-list::-webkit-scrollbar { display: none; }
.nav-tabs-list li { display: flex; flex-shrink: 0; }
.nav-tabs-bar[data-align="center"] .nav-tabs-list { justify-content: center; }
.nav-tab {
  position: relative; display: inline-flex; align-items: center; gap: 8px;
  padding: 0 var(--tab-pad-x); height: 100%;
  font-family: var(--font-sans); font-size: var(--tab-font-size); font-weight: 500; line-height: 1;
  color: var(--tab-color); text-decoration: none; white-space: nowrap;
  transition: color .15s, background .15s;
}
.nav-tab .nav-icon { opacity: .75; transition: opacity .15s; }
.nav-tab:hover { color: var(--tab-color-hover); }
.nav-tab:hover .nav-icon { opacity: 1; }
.nav-tab.active { color: var(--tab-color-active); }
.nav-tab.active .nav-icon { opacity: 1; color: var(--accent-light); }
.nav-tab::after {
  content: ''; position: absolute; left: var(--tab-pad-x); right: var(--tab-pad-x); bottom: -1px; height: 2px;
  border-radius: 2px 2px 0 0; background: var(--tab-indicator); opacity: 0; transform: scaleX(.6);
  transition: opacity .15s, transform .15s;
}
.nav-tab.active::after { opacity: 1; transform: scaleX(1); }
.nav-tab:focus-visible { outline: var(--focus-w, 2px) solid var(--focus-color, var(--accent)); outline-offset: -3px; border-radius: var(--tab-radius); }
.nav-tabs-bar[data-style="pill"] .nav-tabs-list { align-items: center; gap: 4px; }
.nav-tabs-bar[data-style="pill"] .nav-tab { height: calc(var(--tabs-bar-h) - 14px); border-radius: var(--tab-radius); }
.nav-tabs-bar[data-style="pill"] .nav-tab::after { display: none; }
.nav-tabs-bar[data-style="pill"] .nav-tab:hover { background: var(--surface2); }
.nav-tabs-bar[data-style="pill"] .nav-tab.active { background: var(--tab-pill-bg); color: var(--tab-pill-fg); }

/* ── sidebar: tabs (sidebar placement + mobile drawer) ─────────────────── */
.sidebar-tabs { flex-shrink: 0; display: flex; flex-direction: column; gap: 2px; padding: 12px 10px 10px; border-bottom: 1px solid var(--border); }
.sidebar-tabs[data-placement="drawer"] { display: none; }
.sidebar-tab {
  display: flex; align-items: center; gap: 10px; padding: 7px 10px; border-radius: var(--tab-radius);
  font-size: 14px; font-weight: 500; line-height: 1.3; color: var(--text2); text-decoration: none;
  transition: background .12s, color .12s;
}
.sidebar-tab .nav-icon { padding: 5px; box-sizing: content-box; width: 16px; height: 16px; border-radius: 7px; background: var(--anchor-icon-bg); color: var(--anchor-icon-fg); transition: background .12s, color .12s; }
.sidebar-tab:hover { background: var(--surface2); color: var(--text); }
.sidebar-tab.active { background: var(--accent-dim); color: var(--accent-light); }
.sidebar-tab.active .nav-icon { background: var(--accent-dim2); color: var(--accent-light); }
.sidebar-tab-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sidebar-tab:focus-visible { outline: var(--focus-w, 2px) solid var(--focus-color, var(--accent)); outline-offset: -2px; }

/* ── sidebar: anchors ──────────────────────────────────────────────────── */
.sidebar-anchors { flex-shrink: 0; display: flex; flex-direction: column; gap: 1px; padding: 8px 10px; border-bottom: 1px solid var(--border); }
.sidebar-anchors[hidden] { display: none; }
.sidebar-anchor {
  display: flex; align-items: center; gap: 10px; padding: 6px 8px; border-radius: var(--tab-radius);
  font-size: 13.5px; font-weight: 500; color: var(--text2); text-decoration: none; transition: background .12s, color .12s;
}
.sidebar-anchor-icon { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 7px; background: var(--anchor-icon-bg); color: var(--anchor-icon-fg); flex-shrink: 0; transition: background .12s, color .12s; }
.sidebar-anchor-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sidebar-anchor:hover { background: var(--surface2); color: var(--text); }
.sidebar-anchor:hover .sidebar-anchor-icon { background: var(--accent-dim); color: var(--accent-light); }
.sidebar-anchor:focus-visible { outline: var(--focus-w, 2px) solid var(--focus-color, var(--accent)); outline-offset: -2px; }

/* ── sidebar: panes, rich items, links, nested groups ──────────────────── */
.sidebar-pane[hidden] { display: none; }
.sidebar-item-rich, .sidebar-link { display: flex; align-items: center; gap: var(--sidebar-gap); }
.sidebar-item-icon { display: inline-flex; flex-shrink: 0; color: var(--text3); transition: color .12s; }
.sidebar-item-rich:hover .sidebar-item-icon, .sidebar-link:hover .sidebar-item-icon { color: var(--text2); }
.sidebar-item-rich.active .sidebar-item-icon { color: var(--accent-light); }
.sidebar-item-label { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.sidebar-item-rich .sidebar-item-label { flex: 1 1 auto; }
.sidebar-item-rich.is-deprecated .sidebar-item-label { text-decoration: line-through; text-decoration-thickness: 1px; }
.sidebar-link {
  padding: var(--sidebar-item-pad-y) var(--sidebar-pad-x) var(--sidebar-item-pad-y) var(--sb-item-pl);
  margin: 0 var(--sb-item-mx); border-radius: var(--sb-item-radius);
  font-size: var(--sidebar-fs); color: var(--text2); text-decoration: none; line-height: var(--sb-item-lh); border-left: var(--sb-bar-w) solid transparent;
  transition: color .12s, background .12s;
}
.sidebar-link:hover { color: var(--text); background: var(--sb-hover-bg); }
.sidebar-link:focus-visible { outline: var(--focus-w, 2px) solid var(--focus-color, var(--accent)); outline-offset: -2px; }
.sidebar-link .nav-ext-arrow { margin-left: auto; }
.sidebar-link .sidebar-badge + .nav-ext-arrow { margin-left: 4px; }
.sidebar-group-title .sidebar-item-icon, .sidebar-subgroup-title .sidebar-item-icon { margin-right: var(--sidebar-gap); }
.sidebar-group-title:has(> .sidebar-item-icon), .sidebar-group-title:has(> .sidebar-group-label), .sidebar-group-title:has(> .sidebar-group-root),
.sidebar-subgroup-title:has(> .sidebar-item-icon), .sidebar-subgroup-title:has(> .sidebar-group-label), .sidebar-subgroup-title:has(> .sidebar-group-root) { display: flex; align-items: center; }
.sidebar-group-label { flex: 1; min-width: 0; }
.sidebar-group-title .sidebar-badge, .sidebar-subgroup-title .sidebar-badge { margin-left: 8px; }
summary.sidebar-group-title .sidebar-badge, summary.sidebar-subgroup-title .sidebar-badge { margin-left: auto; margin-right: 0; }
summary.sidebar-group-title:has(> .sidebar-badge)::after, summary.sidebar-subgroup-title:has(> .sidebar-badge)::after { margin-left: 8px; }
.sidebar-group-root, .sidebar-group-root.sidebar-item {
  display: inline; margin: 0; padding: 0; border: 0; border-radius: 0; background: none; font: inherit; line-height: inherit; letter-spacing: inherit; text-transform: inherit; color: inherit; flex: 1; min-width: 0;
}
.sidebar-group-root:hover, .sidebar-group-root.sidebar-item:hover { background: none; color: var(--text); }
.sidebar-group-root.active, .sidebar-group-root.sidebar-item.active { background: none; color: var(--accent-light); font-weight: 700; }
.sidebar-subgroup .sidebar-group-root { text-transform: none; letter-spacing: 0; }

.sidebar-subgroup { margin: 2px 0 4px calc(var(--sidebar-pad-x) + 2px); border-left: 1px solid var(--border); }
.sidebar-subgroup > .sidebar-subgroup-title, .sidebar-subgroup > summary.sidebar-subgroup-title { padding-left: var(--sidebar-indent); padding-right: var(--sidebar-pad-x); }
.sidebar-subgroup > .sidebar-item, .sidebar-subgroup > .sidebar-link { margin-left: -1px; padding-left: var(--sidebar-indent); }
.sidebar-subgroup > .sidebar-item.active { border-left-color: var(--accent); }
.sidebar-subgroup > .sidebar-subgroup { margin-left: calc(var(--sidebar-indent) - 2px); }

/* ── navbar: links, dropdowns, buttons, GitHub ─────────────────────────── */
.nav-primary-links { display: flex; align-items: center; gap: var(--nav-gap, 6px); }
.nav-ext-link { display: inline-flex; align-items: center; gap: 6px; line-height: 1.2; white-space: nowrap; transition: color .15s, background .15s; }
.nav-ext-link:focus-visible { outline: var(--focus-w, 2px) solid var(--focus-color, var(--accent)); outline-offset: 1px; }
.nav-dropdown { position: relative; display: inline-flex; }
.nav-dropdown-btn { background: none; border: 0; cursor: pointer; font-family: inherit; }
.nav-dropdown[data-open] .nav-chevron { transform: rotate(180deg); }
.nav-dropdown-menu {
  display: none; position: absolute; top: 100%; left: 0; min-width: 220px; margin-top: 6px; padding: 6px; z-index: 400;
  background: var(--dropdown-bg); border: 1px solid var(--dropdown-border); border-radius: var(--dropdown-radius); box-shadow: var(--dropdown-shadow);
}
.nav-dropdown-menu::before { content: ''; position: absolute; left: 0; right: 0; top: -8px; height: 8px; }
.nav-dropdown[data-open] .nav-dropdown-menu { display: block; }
@media (hover: hover) { .nav-dropdown:not([data-suppress]):hover .nav-dropdown-menu { display: block; } .nav-dropdown:not([data-suppress]):hover .nav-chevron { transform: rotate(180deg); } }
.nav-dropdown-item {
  display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 6px;
  font-size: 13px; font-weight: 500; color: var(--text2); text-decoration: none; white-space: nowrap;
}
.nav-dropdown-item:hover, .nav-dropdown-item:focus-visible { background: var(--surface2); color: var(--text); outline: none; }
.nav-dropdown-item .nav-icon { color: var(--text3); }
.nav-cta { display: flex; align-items: center; gap: 8px; margin-left: 6px; }
.nav-btn {
  display: inline-flex; align-items: center; gap: 6px; height: var(--control-h); padding: 0 14px;
  border-radius: var(--control-radius); font-family: var(--font-sans); font-size: 13px; font-weight: 600; line-height: 1;
  text-decoration: none; white-space: nowrap; border: 1px solid transparent; transition: background .15s, border-color .15s, color .15s;
}
.nav-btn-rounded { border-radius: 999px; }
.nav-btn-filled { background: var(--btn-filled-bg); color: var(--btn-filled-fg); }
.nav-btn-filled:hover { background: var(--btn-filled-hover-bg); }
.nav-btn-outlined { color: var(--text); border-color: var(--btn-outlined-border); background: transparent; }
.nav-btn-outlined:hover { background: var(--surface2); }
.nav-btn:focus-visible { outline: var(--focus-w, 2px) solid var(--focus-color, var(--accent)); outline-offset: 2px; }
.nav-github { gap: 7px; }
.nav-github-stars {
  display: inline-flex; align-items: center; gap: 3px; min-width: 3.4ch; justify-content: center;
  font-size: 12px; font-weight: 600; font-variant-numeric: tabular-nums; color: var(--text3);
  padding: 2px 7px; border: 1px solid var(--border); border-radius: 999px; opacity: 0; transition: opacity .2s;
}
.nav-github-stars[data-ready] { opacity: 1; }
.nav-github-stars[data-failed] { display: none; }
.nav-social-link { display: inline-flex; align-items: center; justify-content: center; width: var(--control-h); height: var(--control-h); border-radius: var(--control-radius); color: var(--text2); }
.nav-social-link:hover { background: var(--surface2); color: var(--text); }

/* mobile drawer extras (navbar links + CTA) */
.sidebar-mobile-extras { display: none; flex-shrink: 0; padding: 10px 14px 12px; border-bottom: 1px solid var(--border); gap: 6px; flex-wrap: wrap; }
.sidebar-mobile-extras .nav-ext-link { color: var(--text2); font-size: 13px; padding: 6px 10px; border: 1px solid var(--border); border-radius: 999px; }
.sidebar-mobile-extras .nav-btn { height: 32px; }

/* ── footer socials ────────────────────────────────────────────────────── */
.site-footer-socials { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; }
.site-footer-social { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: var(--radius); color: var(--text2); text-decoration: none; transition: color .15s, background .15s; }
.site-footer-social:hover { color: var(--text); background: var(--surface2); }
.site-footer-social:focus-visible { outline: var(--focus-w, 2px) solid var(--focus-color, var(--accent)); outline-offset: 2px; }

/* ── logo variants ─────────────────────────────────────────────────────── */
.nav-logo-dark { display: none; }
html:not(.light) .nav-logo[data-logo-variants] .nav-logo-light { display: none; }
html:not(.light) .nav-logo[data-logo-variants] .nav-logo-dark { display: block; }
.nav-logo[data-logo-wordmark] .nav-logo-icon { border-radius: 0; width: auto; height: var(--logo-h, 28px); max-width: 200px; object-fit: contain; }

/* ── page-level layouts (frontmatter layout/mode, hide_toc, hide_nav) ──── */
.docs-page[data-hide-toc="true"] .docs-toc { display: none; }
.docs-page[data-layout="overview"] .docs-content { flex-basis: var(--content-wide-w); max-width: var(--content-wide-w); }
.docs-page[data-layout="wide"] .docs-content { flex: 1 1 auto; max-width: var(--content-wide-w); }
.docs-page[data-layout="frame"] .docs-content { flex: 1 1 auto; max-width: none; }
.docs-page:is([data-layout="center"], [data-layout="full"]) .docs-sidebar { display: none; }
.docs-page[data-layout="full"] .docs-content { flex: 1 1 auto; max-width: none; }
.docs-page[data-layout="full"] :is(.docs-nav-top, .page-meta, .page-nav, .docs-feedback, .page-edit) { display: none; }
.docs-page[data-hide-nav="true"] .page-nav { display: none; }
.docs-page[data-hide-actions="true"] :is(.copy-page-menu, .toc-actions, .page-meta .meta-sep) { display: none; }

@media (max-width: 1100px) { :root { --content-pad-x: 44px; } }
@media (max-width: 1024px) {
  :root { --content-pad-x: 36px; }
  body.has-tabs-header { --tabs-h: 0px; }
  .nav-tabs-bar { display: none; }
  .sidebar-tabs[data-placement="drawer"] { display: flex; }
  .sidebar-mobile-extras { display: flex; }
  .nav-primary-links, .nav-cta, .nav-links > .nav-ext-link, .nav-links > .nav-github { display: none; }
  .docs-page:is([data-layout="center"], [data-layout="full"]) .docs-sidebar { display: flex; }
}
@media (max-width: 768px) { :root { --content-pad-x: 28px; } }
@media (max-width: 640px) { :root { --content-pad-x: 20px; } }
@media (max-width: 400px) { :root { --content-pad-x: 16px; } }
@media (prefers-reduced-motion: reduce) {
  .nav-tab, .nav-tab::after, .nav-chevron, .sidebar-tab, .sidebar-anchor { transition: none; }
}
@media print { .nav-tabs-bar, .sidebar-tabs, .sidebar-anchors, .nav-cta { display: none !important; } }
`;

// ─── Browser runtime ──────────────────────────────────────────────────────────

/**
 * Client-side navigation behaviour, embedded in the app script (all modes: static, versioned,
 * locale, offline, dev). Uses delegated listeners only (no inline handlers), so it works under
 * the offline CSP-safe event model as well.
 */
export const NAV_RUNTIME_JS = String.raw`
// ── NAVIGATION RUNTIME: tabs, panes, dropdowns, page layout, GitHub stars ─
function _docsPageEl() { return document.querySelector('.docs-page'); }
function _chromeH() {
  var h = 0;
  var els = document.querySelectorAll('.nav, .nav-tabs-bar, .announcement-banner');
  for (var i = 0; i < els.length; i++) {
    var cs = getComputedStyle(els[i]);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    var r = els[i].getBoundingClientRect();
    if (r.bottom > h && r.top < 200) h = r.bottom;
  }
  return h || 60;
}
function _navSetTab(tabId) {
  if (!tabId) return;
  var page = _docsPageEl();
  var prev = page ? page.getAttribute('data-tab') : null;
  if (prev !== tabId) {
    // Clear a sidebar filter while the old pane is still the visible one, so nothing stays hidden in it.
    var f = document.getElementById('sidebar-filter');
    if (f && f.value) { f.value = ''; if (typeof _filterSidebar === 'function') _filterSidebar(''); }
  }
  document.querySelectorAll('.sidebar-pane').forEach(function(p) { p.hidden = p.getAttribute('data-tab') !== tabId; });
  document.querySelectorAll('.sidebar-anchors[data-tab]').forEach(function(a) { a.hidden = a.getAttribute('data-tab') !== tabId; });
  document.querySelectorAll('a.nav-tab[data-tab], a.sidebar-tab[data-tab]').forEach(function(a) {
    var on = a.getAttribute('data-tab') === tabId;
    a.classList.toggle('active', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  if (page) page.setAttribute('data-tab', tabId);
  if (prev !== tabId) {
    var sc = document.getElementById('sidebar-scroll');
    if (sc) sc.scrollTop = 0;
  }
}
function _pageInfoFromDoc(doc) {
  var p = doc && doc.querySelector ? doc.querySelector('.docs-page') : null;
  if (!p) return null;
  return {
    layout: p.getAttribute('data-layout') || 'guide',
    hideToc: p.getAttribute('data-hide-toc') === 'true',
    hideNav: p.getAttribute('data-hide-nav') === 'true',
    hideActions: p.getAttribute('data-hide-actions') === 'true',
    tocDepth: parseInt(p.getAttribute('data-toc-depth') || '3', 10) || 3,
    tab: p.getAttribute('data-tab') || ''
  };
}
// Apply a page's layout switches ({ layout, hideToc, hideNav, hideActions, tocDepth, tab }).
function _applyPageInfo(info) {
  var page = _docsPageEl();
  if (!page) return;
  var i = info || {};
  page.setAttribute('data-layout', i.layout || 'guide');
  if (i.hideToc) page.setAttribute('data-hide-toc', 'true'); else page.removeAttribute('data-hide-toc');
  if (i.hideNav) page.setAttribute('data-hide-nav', 'true'); else page.removeAttribute('data-hide-nav');
  if (i.hideActions) page.setAttribute('data-hide-actions', 'true'); else page.removeAttribute('data-hide-actions');
  page.setAttribute('data-toc-depth', String(i.tocDepth || 3));
  if (i.tab) _navSetTab(i.tab);
  // dev server only: static builds bake <meta name="robots"> into each page's own HTML
  if (typeof i.noindex === 'boolean') {
    var rb = document.head.querySelector('meta[name="robots"]');
    if (i.noindex && !rb) { rb = document.createElement('meta'); rb.name = 'robots'; document.head.appendChild(rb); }
    if (rb) { if (i.noindex) rb.setAttribute('content', 'noindex'); else rb.remove(); }
  }
}
function _tabIdOfPageEl(el) {
  var pane = el && el.closest ? el.closest('.sidebar-pane') : null;
  return pane ? pane.getAttribute('data-tab') : '';
}
function _tabLabelFor(id) {
  var el = document.querySelector('.sidebar-item[data-page="' + id + '"]');
  var tab = _tabIdOfPageEl(el);
  if (!tab) { var p = _docsPageEl(); tab = p ? p.getAttribute('data-tab') : ''; }
  if (!tab || !document.querySelector('.sidebar-pane')) return '';
  var l = document.querySelector('a.nav-tab[data-tab="' + tab + '"] .nav-tab-label, a.sidebar-tab[data-tab="' + tab + '"] .sidebar-tab-label');
  return l ? l.textContent.trim() : '';
}
function _navDropdown(dd, open) {
  if (!dd) return;
  var btn = dd.querySelector('.nav-dropdown-btn');
  if (open) { dd.setAttribute('data-open', ''); dd.removeAttribute('data-suppress'); }
  else { dd.removeAttribute('data-open'); dd.setAttribute('data-suppress', ''); }
  if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
}
function _navCloseDropdowns(except) {
  document.querySelectorAll('.nav-dropdown[data-open]').forEach(function(d) { if (d !== except) _navDropdown(d, false); });
}
function _fmtStars(n) {
  if (n >= 10000) return Math.round(n / 1000) + 'k';
  if (n >= 1000) return (Math.round(n / 100) / 10) + 'k';
  return String(n);
}
function _navGithubStars() {
  document.querySelectorAll('.nav-github[data-repo]').forEach(function(el) {
    var chip = el.querySelector('.nav-github-stars');
    if (!chip) return;
    var repo = el.getAttribute('data-repo');
    var key = 'docslit-gh-stars:' + repo;
    var cached = null;
    try { cached = JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) {}
    var show = function(n) { chip.querySelector('.nav-github-count').textContent = _fmtStars(n); chip.setAttribute('data-ready', ''); };
    var fail = function() { chip.setAttribute('data-failed', ''); };
    if (cached && typeof cached.n === 'number') { show(cached.n); if (Date.now() - cached.t < 3600000) return; }
    if (_OFFLINE || !window.fetch) { if (!cached) fail(); return; }
    fetch('https://api.github.com/repos/' + repo, { headers: { Accept: 'application/vnd.github+json' } })
      .then(function(r) { return r.ok ? r.json() : Promise.reject(new Error('status')); })
      .then(function(j) {
        if (j && typeof j.stargazers_count === 'number') {
          try { localStorage.setItem(key, JSON.stringify({ n: j.stargazers_count, t: Date.now() })); } catch (e) {}
          show(j.stargazers_count);
        } else if (!cached) fail();
      })
      .catch(function() { if (!cached) fail(); });
  });
}
document.addEventListener('click', function(e) {
  var t = e.target;
  if (!t || !t.closest) return;
  var a = t.closest('a[data-nav-page]');
  if (a && !e.defaultPrevented && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
    e.preventDefault();
    _navCloseDropdowns(null);
    loadPage(a.getAttribute('data-nav-page'));
    if (window.innerWidth <= 1024) closeSidebar();
    return;
  }
  var btn = t.closest('.nav-dropdown-btn');
  if (btn) {
    var dd = btn.closest('.nav-dropdown');
    var open = !dd.hasAttribute('data-open');
    _navCloseDropdowns(dd);
    _navDropdown(dd, open);
    return;
  }
  if (!t.closest('.nav-dropdown')) _navCloseDropdowns(null);
  var tog = t.closest('.copy-page-toggle');
  if (tog) { e.__dlKeepMenus = true; toggleCopyMenu(e); return; }
  var act = t.closest('.copy-page-menu [data-action]');
  if (act) {
    var k = act.getAttribute('data-action');
    if (k === 'copy') copyMd(); else if (k === 'view') viewMd(); else if (k === 'mcp') copyMcpCommand();
    if (act.classList.contains('copy-page-item')) closeCopyMenu();
  }
});
document.addEventListener('mouseout', function(e) {
  var dd = e.target && e.target.closest ? e.target.closest('.nav-dropdown') : null;
  if (dd && !dd.contains(e.relatedTarget)) dd.removeAttribute('data-suppress');
});
document.addEventListener('keydown', function(e) {
  var t = e.target;
  if (!t || !t.closest) return;
  if (e.key === 'Escape') {
    var open = document.querySelector('.nav-dropdown[data-open]');
    if (open) { var b = open.querySelector('.nav-dropdown-btn'); _navCloseDropdowns(null); if (b && open.contains(t)) b.focus(); }
    return;
  }
  var dd = t.closest('.nav-dropdown');
  if (dd && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
    e.preventDefault();
    _navDropdown(dd, true);
    var items = Array.prototype.slice.call(dd.querySelectorAll('.nav-dropdown-item'));
    var i = items.indexOf(document.activeElement);
    var next = e.key === 'ArrowDown' ? (i + 1) % items.length : (i <= 0 ? items.length - 1 : i - 1);
    if (items[next]) items[next].focus();
    return;
  }
  var tab = t.closest('a.nav-tab, a.nav-tab-external');
  if (tab && (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End')) {
    var tabs = Array.prototype.slice.call(tab.closest('.nav-tabs-list').querySelectorAll('a'));
    var idx = tabs.indexOf(tab);
    var to = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : e.key === 'ArrowRight' ? Math.min(idx + 1, tabs.length - 1) : Math.max(idx - 1, 0);
    e.preventDefault();
    if (tabs[to]) tabs[to].focus();
  }
});
_navGithubStars();
`;
