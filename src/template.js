import { buildComponents } from './components/index.js';

export function renderShell({ config, mode = 'dev', port = 3000, out = 'dist', pagesData = null, offline = false, draftPageIds = [], versionConfig = null, currentVersion = null, searchIndex = null }) {
  const sidebarHtml = buildSidebarHtml(config, draftPageIds);
  const siteTitle = config.name || 'DocsLit';
  const wsScript = mode === 'dev' ? buildWsScript(port) : '';
  const loaderScript = mode === 'dev' ? buildDevLoader() : (offline ? buildOfflineLoader() : buildStaticLoader());
  const inlinePages = offline && pagesData
    ? `<script>window.__DOCSLIT_PAGES__ = ${JSON.stringify(pagesData)};</script>`
    : '';
  const inlineSearch = offline && searchIndex
    ? `<script>window.__DOCSLIT_SEARCH_INDEX__ = ${JSON.stringify(searchIndex)};</script>`
    : '';
  const versionScript = versionConfig
    ? `<script>window.__DOCSLIT_VERSIONS__ = ${JSON.stringify({ current: currentVersion, default: versionConfig.default, list: versionConfig.list })};</script>`
    : '';
  const versionSelectorHtml = versionConfig ? buildVersionSelector(versionConfig, currentVersion) : '';
  const importMap = buildImportMap(mode);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  ${buildThemeInit()}
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${siteTitle} — DocsLit</title>
  ${buildFontLinks()}
  ${buildStyles()}
</head>
<body>
${buildNavHtml(siteTitle, versionSelectorHtml)}
${buildSearchOverlayHtml()}
<div class="sidebar-overlay" id="sidebar-overlay"></div>

${buildMainLayoutHtml(sidebarHtml, siteTitle, '<div class="loading-state">Loading…</div>', 'Loading…')}

${inlinePages}
${inlineSearch}
${versionScript}
<script type="importmap">${importMap}</script>
<script type="module">
${buildComponents()}
</script>
<script>
${buildAppScript(mode, loaderScript, wsScript)}
</script>
</body>
</html>`;
}

export function renderPage({ config, id, meta, html, draftPageIds = [], versionConfig = null, currentVersion = null }) {
  const sidebarHtml = buildSidebarHtml(config, draftPageIds, id);
  const siteTitle = config.name || 'DocsLit';
  const versionSelectorHtml = versionConfig ? buildVersionSelector(versionConfig, currentVersion) : '';
  const importMap = buildImportMap('static');
  const versionScript = versionConfig
    ? `<script>window.__DOCSLIT_VERSIONS__ = ${JSON.stringify({ current: currentVersion, default: versionConfig.default, list: versionConfig.list })};</script>`
    : '';

  const pageTitle = meta.title || toLabel(id);
  const desc = meta.description || meta.desc || '';
  const baseUrl = (config.url || '').replace(/\/$/, '');
  const versionPrefix = currentVersion ? `/${currentVersion}` : '';
  const canonicalUrl = baseUrl ? `${baseUrl}${versionPrefix}/${id}` : '';

  let seoTags = '';
  if (desc) seoTags += `\n  <meta name="description" content="${escHtml(desc)}">`;
  if (canonicalUrl) {
    seoTags += `\n  <link rel="canonical" href="${escHtml(canonicalUrl)}">`;
    seoTags += `\n  <meta property="og:url" content="${escHtml(canonicalUrl)}">`;
  }
  seoTags += `\n  <meta property="og:type" content="article">`;
  seoTags += `\n  <meta property="og:title" content="${escHtml(pageTitle)}">`;
  seoTags += `\n  <meta property="og:site_name" content="${escHtml(siteTitle)}">`;
  if (desc) seoTags += `\n  <meta property="og:description" content="${escHtml(desc)}">`;
  seoTags += `\n  <meta name="twitter:card" content="summary">`;
  seoTags += `\n  <meta name="twitter:title" content="${escHtml(pageTitle)}">`;
  if (desc) seoTags += `\n  <meta name="twitter:description" content="${escHtml(desc)}">`;

  const jsonLd = { '@context': 'https://schema.org', '@type': 'TechArticle', headline: pageTitle, name: pageTitle, isPartOf: { '@type': 'WebSite', name: siteTitle } };
  if (desc) jsonLd.description = desc;
  if (canonicalUrl) jsonLd.url = canonicalUrl;
  if (baseUrl) jsonLd.isPartOf.url = baseUrl;

  const depth = id.split('/').length - 1;
  const assetPrefix = '../'.repeat(depth);

  const groupName = (config.sidebar || []).find(g => (g.pages || []).includes(id))?.group || '';
  const breadcrumbText = groupName ? `${escHtml(groupName)} › ${escHtml(pageTitle)}` : escHtml(pageTitle);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  ${buildThemeInit()}
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escHtml(pageTitle)} — ${escHtml(siteTitle)}</title>${seoTags}
  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
  ${buildFontLinks()}
  <link rel="stylesheet" href="${assetPrefix}docslit.css">
</head>
<body>
${buildNavHtml(siteTitle, versionSelectorHtml)}
${buildSearchOverlayHtml()}
<div class="sidebar-overlay" id="sidebar-overlay"></div>

${buildMainLayoutHtml(sidebarHtml, siteTitle, html.replace(/<\/h1>/, '</h1>' + injectPageMeta(meta, id)), breadcrumbText)}

${versionScript}
<script>window.__DOCSLIT_PAGE_ID__ = ${JSON.stringify(id)};</script>
<script type="importmap">${importMap}</script>
<script type="module" src="${assetPrefix}docslit.js"></script>
<script src="${assetPrefix}docslit-app.js"></script>
</body>
</html>`;
}

export function buildStylesFile() {
  const raw = buildStyles();
  return raw.replace(/^<style>\n?/, '').replace(/<\/style>$/, '');
}

export function buildComponentsFile(mode = 'static') {
  return buildComponents();
}

export function buildAppFile(mode = 'static') {
  const loaderScript = mode === 'dev' ? buildDevLoader() : buildStaticLoader();
  const wsScript = mode === 'dev' ? buildWsScript(3000) : '';
  return buildAppScript(mode, loaderScript, wsScript);
}

function buildImportMap(mode) {
  return mode === 'dev'
    ? `{"imports":{"lit":"/vendor/lit.js","lit/decorators.js":"/vendor/lit-decorators.js","@lit/reactive-element":"/vendor/reactive-element.js","lit-html":"/vendor/lit-html.js","lit-element/lit-element.js":"/vendor/lit-element.js"}}`
    : `{"imports":{"lit":"https://esm.sh/lit@3","lit/decorators.js":"https://esm.sh/lit@3/decorators","@lit/reactive-element":"https://esm.sh/@lit/reactive-element@2","lit-html":"https://esm.sh/lit-html@3","lit-element/lit-element.js":"https://esm.sh/lit-element@4/lit-element.js","marked":"https://esm.sh/marked@18","dompurify":"https://esm.sh/dompurify@3"}}`;
}

function buildThemeInit() {
  return `<script>
    (function(){
      var s=localStorage.getItem('docslit-theme')||'system';
      var h=document.documentElement;
      function a(m){if(m==='light')h.className='light';else if(m==='dark')h.className='dark';else h.className=window.matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light';}
      a(s);window.__themeMode=s;
      window.matchMedia('(prefers-color-scheme:dark)').addEventListener('change',function(){if((localStorage.getItem('docslit-theme')||'system')==='system')a('system');});
    })();
  </script>`;
}

function buildFontLinks() {
  return `<link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">`;
}

function buildNavHtml(siteTitle, versionSelectorHtml) {
  return `<a class="skip-link" href="#docs-content">Skip to content</a>
<nav class="nav">
  <div class="nav-left">
    <button class="nav-menu-btn" id="nav-menu-btn" aria-label="Open navigation" aria-expanded="false">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
    </button>
    <a class="nav-logo" href="/">
      <div class="nav-logo-icon">${siteTitle.slice(0,2).toUpperCase()}</div>
      <span class="nav-logo-text">${siteTitle}</span>
    </a>
  </div>
  <div class="nav-links">
    <button class="search-trigger" onclick="openSearch()" id="search-trigger" title="Search (⌘K)">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg>
      <span class="search-trigger-text">Search…</span>
      <span class="search-trigger-kbd"><kbd>⌘</kbd><kbd>K</kbd></span>
    </button>
    ${versionSelectorHtml}
    <button class="theme-btn" id="theme-btn" onclick="toggleTheme()"></button>
  </div>
</nav>`;
}

function buildSearchOverlayHtml() {
  return `<div class="search-overlay" id="search-overlay" onclick="handleOverlayClick(event)">
  <div class="search-modal" role="dialog" aria-modal="true" aria-label="Search documentation">
    <div class="search-input-wrap">
      <svg class="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg>
      <input class="search-input" id="search-input" type="text" placeholder="Search docs…" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="true" aria-controls="search-results" aria-activedescendant="" oninput="handleSearchInput(this.value)" onkeydown="handleSearchKey(event)">
      <div class="search-kbd"><kbd>Esc</kbd></div>
    </div>
    <div class="search-results" id="search-results" role="listbox" aria-label="Search results"></div>
    <div class="search-footer">
      <div class="search-hint"><kbd>↑</kbd><kbd>↓</kbd> navigate</div>
      <div class="search-hint"><kbd>↵</kbd> open</div>
      <div class="search-hint"><kbd>Esc</kbd> close</div>
    </div>
  </div>
</div>`;
}

function buildMainLayoutHtml(sidebarHtml, siteTitle, contentHtml, breadcrumbText) {
  return `<div class="docs-page">
  <div class="docs-layout">
    <aside class="docs-sidebar" id="docs-sidebar">
      <div class="sidebar-filter-wrap">
        <svg class="sidebar-filter-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg>
        <input class="sidebar-filter" id="sidebar-filter" type="text" placeholder="Filter pages…" autocomplete="off" spellcheck="false" oninput="_filterSidebar(this.value)" onkeydown="_filterKey(event)">
        <button class="sidebar-filter-clear" id="sidebar-filter-clear" onclick="_clearSidebarFilter()" aria-label="Clear filter">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>
      <nav class="sidebar-scroll" id="sidebar-scroll" aria-label="Documentation pages">
      ${sidebarHtml}
      </nav>
    </aside>
    <div class="docs-main-col">
      <div class="docs-nav-top">
        <div class="docs-breadcrumb">${siteTitle} › <span id="docs-breadcrumb-current">${breadcrumbText}</span></div>
      </div>
      <div class="docs-main">
        <main class="docs-content" id="docs-content" role="main">
          ${contentHtml}
        </main>
        <div class="docs-toc" id="docs-toc"></div>
      </div>
    </div>
  </div>
</div>`;
}

function buildAppScript(mode, loaderScript, wsScript) {
  return `${buildTheme()}
${loaderScript}
${buildSearchScript(mode)}
${wsScript}

// ── SIDEBAR ACTIVATION ────────────────────────────────────────────────────
function activateSidebar(id) {
  document.querySelectorAll('.sidebar-item').forEach(el => el.classList.remove('active'));
  const el = document.querySelector(\`.sidebar-item[data-page="\${id}"]\`);
  if (el) {
    el.classList.add('active');
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

// ── TOC ───────────────────────────────────────────────────────────────────
let _tocObserver = null;
let _tocClickGuardUntil = 0;

function _setActiveToc(id) {
  const toc = document.getElementById('docs-toc');
  if (!toc) return;
  toc.querySelectorAll('.toc-item').forEach(a => {
    a.classList.toggle('active', a.dataset.tocTarget === id);
  });
}

function _tocScroll(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const navH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) || 60;
  const top = el.getBoundingClientRect().top + window.scrollY - navH - 44 - 16;
  history.pushState(null, '', location.pathname + '#' + id);
  // Mark active immediately so the user sees their click land before the
  // scroll arrives; ignore observer callbacks for a beat so smooth-scrolling
  // doesn't briefly reassign through intermediate headings.
  _setActiveToc(id);
  _tocClickGuardUntil = Date.now() + 700;
  window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
}

function buildToc(container) {
  const toc = document.getElementById('docs-toc');
  if (!toc) return;

  if (_tocObserver) { _tocObserver.disconnect(); _tocObserver = null; }
  while (toc.firstChild) toc.removeChild(toc.firstChild);

  const headings = Array.from(container.querySelectorAll('h2, h3'));
  if (headings.length < 2) return;

  const title = document.createElement('div');
  title.className = 'toc-title';
  title.textContent = 'On this page';
  toc.appendChild(title);

  const list = document.createElement('ul');
  list.className = 'toc-list';
  for (const h of headings) {
    const id = h.id || h.textContent.toLowerCase().replace(/[^a-z0-9]+/g,'-');
    h.id = id;
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.className = 'toc-item' + (h.tagName === 'H3' ? ' toc-item-sub' : '');
    a.dataset.tocTarget = id;
    a.href = '#' + id;
    a.textContent = h.textContent;
    a.addEventListener('click', (e) => { e.preventDefault(); _tocScroll(id); });
    li.appendChild(a);
    list.appendChild(li);
  }
  toc.appendChild(list);

  // Track the topmost heading whose top has crossed the active line (just
  // below the sticky nav). Picks the lowest heading still "above the line",
  // which is the section the user is currently reading.
  const navH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) || 60;
  const activeLineY = navH + 60;
  const compute = () => {
    if (Date.now() < _tocClickGuardUntil) return;
    let current = headings[0];
    for (const h of headings) {
      if (h.getBoundingClientRect().top - activeLineY < 1) current = h;
      else break;
    }
    if (current) _setActiveToc(current.id);
  };
  _tocObserver = new IntersectionObserver(compute, {
    rootMargin: \`-\${activeLineY}px 0px -70% 0px\`,
    threshold: [0, 1],
  });
  headings.forEach(h => _tocObserver.observe(h));

  // Seed: matching hash → that heading; otherwise the first one.
  const hashId = decodeURIComponent(location.hash.slice(1));
  const seed = (hashId && headings.find(h => h.id === hashId)) || headings[0];
  _setActiveToc(seed.id);
}

// ── TABLE WRAPPING ────────────────────────────────────────────────────────
function _show404(id) {
  var content = document.getElementById('docs-content');
  var crumb = document.getElementById('docs-breadcrumb-current');
  if (crumb) crumb.textContent = 'Page not found';
  document.title = 'Page not found';
  var toc = document.getElementById('docs-toc');
  if (toc) toc.innerHTML = '';
  content.innerHTML =
    '<div class="not-found">' +
    '<div class="not-found-code">404</div>' +
    '<h1 class="not-found-title">Page not found</h1>' +
    '<p class="not-found-desc">The page' + (id ? ' <code>' + id + '</code>' : '') + ' doesn\\u2019t exist or may have been moved.</p>' +
    '<div class="not-found-actions">' +
    '<a class="not-found-btn" href="#" onclick="var f=document.querySelector(\\'.sidebar-item\\');if(f)loadPage(f.dataset.page,f);return false;">Go to first page</a>' +
    '<button class="not-found-btn not-found-btn-alt" onclick="openSearch()">Search docs</button>' +
    '</div></div>';
}

function _wrapTables(container) {
  container.querySelectorAll('table').forEach(function(t) {
    if (!t.parentElement || t.parentElement.classList.contains('table-wrap')) return;
    const w = document.createElement('div');
    w.className = 'table-wrap';
    t.parentNode.insertBefore(w, t);
    w.appendChild(t);
  });
}

// ── PREV / NEXT NAVIGATION ────────────────────────────────────────────────
function _buildPrevNext(id) {
  const all = Array.from(document.querySelectorAll('.sidebar-item'));
  const idx = all.findIndex(function(el){ return el.dataset.page === id; });
  const prev = idx > 0 ? all[idx-1] : null;
  const next = idx < all.length-1 ? all[idx+1] : null;
  if (!prev && !next) return '';
  let h = '<nav class="page-nav">';
  if (prev) {
    const pid = prev.dataset.page;
    const ptxt = prev.textContent.trim();
    h += '<a class="page-nav-btn" href="' + pid + '" onclick="loadPage(\\'' + pid + '\\',this);if(window.innerWidth<=1024)closeSidebar();return false;"><span class="page-nav-label">← Previous</span><span class="page-nav-title">' + ptxt + '</span></a>';
  } else { h += '<span></span>'; }
  if (next) {
    const nid = next.dataset.page;
    const ntxt = next.textContent.trim();
    h += '<a class="page-nav-btn next" href="' + nid + '" onclick="loadPage(\\'' + nid + '\\',this);if(window.innerWidth<=1024)closeSidebar();return false;"><span class="page-nav-label">Next →</span><span class="page-nav-title">' + ntxt + '</span></a>';
  } else { h += '<span></span>'; }
  h += '</nav>';
  return h;
}

// ── MOBILE SIDEBAR TOGGLE ─────────────────────────────────────────────────
function openSidebar() {
  document.getElementById('docs-sidebar').classList.add('open');
  document.getElementById('sidebar-overlay').classList.add('open');
  document.getElementById('nav-menu-btn').setAttribute('aria-expanded','true');
  document.body.style.overflow = 'hidden';
}
function closeSidebar() {
  document.getElementById('docs-sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('open');
  document.getElementById('nav-menu-btn').setAttribute('aria-expanded','false');
  document.body.style.overflow = '';
}
(function(){
  var btn = document.getElementById('nav-menu-btn');
  var overlay = document.getElementById('sidebar-overlay');
  if (btn) btn.addEventListener('click', function() {
    document.getElementById('docs-sidebar').classList.contains('open') ? closeSidebar() : openSidebar();
  });
  if (overlay) overlay.addEventListener('click', closeSidebar);
  document.addEventListener('keydown', function(e) { if (e.key === 'Escape') closeSidebar(); });
})();

function switchVersion(v) {
  var vc = window.__DOCSLIT_VERSIONS__;
  if (!vc) return;
  var pageId = _pageFromUrl() || 'introduction';
  window.location.href = '/' + v + '/' + pageId;
}

// ── SIDEBAR FILTER ───────────────────────────────────────────────────────
var _filterIdx = -1;

function _getVisibleItems() {
  return Array.from(document.querySelectorAll('.sidebar-item')).filter(function(el) {
    return el.style.display !== 'none' && el.offsetParent !== null;
  });
}

function _updateFilterActive() {
  var items = _getVisibleItems();
  items.forEach(function(el, i) {
    el.classList.toggle('filter-focus', i === _filterIdx);
  });
  if (_filterIdx >= 0 && items[_filterIdx]) {
    items[_filterIdx].scrollIntoView({ block: 'nearest' });
  }
}

function _filterSidebar(query) {
  var clearBtn = document.getElementById('sidebar-filter-clear');
  clearBtn.classList.toggle('visible', query.length > 0);

  var scroll = document.getElementById('sidebar-scroll');
  var q = query.trim().toLowerCase();

  scroll.querySelectorAll('.sidebar-item').forEach(function(item) {
    if (!item.dataset.label) item.dataset.label = item.textContent;
  });

  var noResults = scroll.querySelector('.sidebar-no-results');
  if (noResults) noResults.remove();

  _filterIdx = -1;

  if (!q) {
    scroll.querySelectorAll('.sidebar-item').forEach(function(item) {
      item.innerHTML = _escFilter(item.dataset.label);
      item.style.display = '';
      item.classList.remove('filter-focus');
    });
    scroll.querySelectorAll('.sidebar-section').forEach(function(s) { s.style.display = ''; });
    scroll.querySelectorAll('.sidebar-group-title').forEach(function(g) { g.style.display = ''; });
    return;
  }

  var anyVisible = false;
  scroll.querySelectorAll('.sidebar-section').forEach(function(section) {
    var items = section.querySelectorAll('.sidebar-item');
    var groupVisible = false;

    items.forEach(function(item) {
      item.classList.remove('filter-focus');
      var text = item.dataset.label;
      var lower = text.toLowerCase();
      var idx = lower.indexOf(q);
      if (idx >= 0) {
        item.innerHTML = _escFilter(text.slice(0, idx))
          + '<mark class="filter-hl">' + _escFilter(text.slice(idx, idx + q.length)) + '</mark>'
          + _escFilter(text.slice(idx + q.length));
        item.style.display = '';
        groupVisible = true;
        anyVisible = true;
      } else {
        item.style.display = 'none';
      }
    });

    section.style.display = groupVisible ? '' : 'none';
    var gt = section.querySelector('.sidebar-group-title');
    if (gt) gt.style.display = groupVisible ? '' : 'none';
  });

  if (!anyVisible) {
    var msg = document.createElement('div');
    msg.className = 'sidebar-no-results';
    msg.textContent = 'No pages match \\u201c' + query.trim() + '\\u201d';
    scroll.appendChild(msg);
  }
}

function _filterKey(e) {
  var items = _getVisibleItems();
  if (!items.length) return;
  var input = document.getElementById('sidebar-filter');

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    _filterIdx = Math.min(_filterIdx + 1, items.length - 1);
    _updateFilterActive();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (_filterIdx <= 0) { _filterIdx = -1; _updateFilterActive(); return; }
    _filterIdx--;
    _updateFilterActive();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (_filterIdx >= 0 && items[_filterIdx]) {
      var id = items[_filterIdx].dataset.page;
      input.value = '';
      _filterSidebar('');
      loadPage(id, items[_filterIdx]);
      if (window.innerWidth <= 1024) closeSidebar();
    } else if (items.length === 1) {
      var id = items[0].dataset.page;
      input.value = '';
      _filterSidebar('');
      loadPage(id, items[0]);
      if (window.innerWidth <= 1024) closeSidebar();
    }
  } else if (e.key === 'Escape') {
    if (input.value) {
      e.preventDefault();
      e.stopPropagation();
      input.value = '';
      _filterSidebar('');
    }
  }
}

function _clearSidebarFilter() {
  var input = document.getElementById('sidebar-filter');
  input.value = '';
  input.focus();
  _filterSidebar('');
}

function _escFilter(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function _docsBase() {
  var vc = window.__DOCSLIT_VERSIONS__;
  if (vc) return '/' + vc.current + '/';
  return '/';
}
function _pageFromUrl() {
  var vc = window.__DOCSLIT_VERSIONS__;
  var p = window.location.pathname.replace(/\\.html$/, '');
  if (vc) {
    var prefix = '/' + vc.current + '/';
    if (p.startsWith(prefix)) return p.slice(prefix.length) || null;
    return null;
  }
  return p.slice(1) || null;
}
function _escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function _toLabel(id) {
  var name = id.indexOf('/') !== -1 ? id.split('/').pop() : id;
  return name.replace(/-/g, ' ').replace(/\\b\\w/g, c => c.toUpperCase());
}
function _groupFor(id) {
  var el = document.querySelector('.sidebar-item[data-page="' + id + '"]');
  if (!el) return '';
  var section = el.closest('.sidebar-section');
  if (!section) return '';
  var title = section.querySelector('.sidebar-group-title');
  return title ? title.textContent.trim() : '';
}
function _setBreadcrumb(id, title) {
  var crumb = document.getElementById('docs-breadcrumb-current');
  if (!crumb) return;
  var group = _groupFor(id);
  crumb.textContent = group ? group + ' \\u203A ' + title : title;
}
function _mdButtons(id) {
  return '<span class="meta-sep">|</span>' +
    '<button class="meta-btn" onclick="copyMd()" title="Copy page as Markdown"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg> Copy as Markdown</button>' +
    '<span class="meta-sep">|</span>' +
    '<button class="meta-btn" onclick="viewMd()" title="View page as Markdown"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/><polyline points="13 2 13 9 20 9"/></svg> View as Markdown</button>';
}
function _buildMetaBar(meta, id) {
  const parts = [];
  if (meta.tag) parts.push('<span>' + _escHtml(meta.tag) + '</span>');
  if (meta.component) parts.push('<span>\\u2022</span><span>' + _escHtml(meta.component) + '</span>');
  if (meta.readtime) parts.push('<span>\\u2022</span><span>' + _escHtml(meta.readtime) + '</span>');
  if (meta.updated) parts.push('<span>\\u2022</span><span>Updated ' + _escHtml(meta.updated) + '</span>');
  parts.push(_mdButtons(id));
  return '<div class="page-meta">' + parts.join('') + '</div>';
}

async function copyMd() {
  try {
    var id = window.__DOCSLIT_CURRENT_PAGE__ || window.__DOCSLIT_PAGE_ID__ || '';
    if (!id) return;
    var res = await fetch(_docsBase() + id + '.md');
    if (!res.ok) throw new Error('Not found');
    var text = await res.text();
    await navigator.clipboard.writeText(text);
    var btn = document.querySelector('.meta-btn');
    if (btn) { var orig = btn.innerHTML; btn.innerHTML = btn.innerHTML.replace('Copy as Markdown', 'Copied!'); setTimeout(function() { btn.innerHTML = orig; }, 2000); }
  } catch(e) { console.error('Copy failed', e); }
}

window.loadPage = loadPage;
window.activateSidebar = activateSidebar;
window.closeSidebar = closeSidebar;
window.openSidebar = openSidebar;
window.switchVersion = switchVersion;
function viewMd() {
  var id = window.__DOCSLIT_CURRENT_PAGE__ || window.__DOCSLIT_PAGE_ID__ || '';
  if (id) window.open(_docsBase() + id + '.md', '_blank');
}
window.copyMd = copyMd;
window.viewMd = viewMd;
window._filterSidebar = _filterSidebar;
window._filterKey = _filterKey;
window._clearSidebarFilter = _clearSidebarFilter;`;
}


function mdButtons(id) {
  return `<span class="meta-sep">|</span><button class="meta-btn" onclick="copyMd()" title="Copy page as Markdown"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg> Copy as Markdown</button><span class="meta-sep">|</span><button class="meta-btn" onclick="viewMd()" title="View page as Markdown"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/><polyline points="13 2 13 9 20 9"/></svg> View as Markdown</button>`;
}

function injectPageMeta(meta, id) {
  const parts = [];
  if (meta.tag) parts.push(`<span>${escHtml(meta.tag)}</span>`);
  if (meta.component) parts.push(`<span>•</span><span>${escHtml(meta.component)}</span>`);
  if (meta.readtime) parts.push(`<span>•</span><span>${escHtml(meta.readtime)}</span>`);
  if (meta.updated) parts.push(`<span>•</span><span>Updated ${escHtml(meta.updated)}</span>`);
  parts.push(mdButtons(id));
  return `<div class="page-meta">${parts.join('')}</div>`;
}

function buildSidebarHtml(config, draftIds = [], activePageId = null) {
  const draftSet = new Set(draftIds);
  let html = '';
  for (const group of (config.sidebar || [])) {
    const visiblePages = (group.pages || []).filter(p => !draftSet.has(p));
    if (!visiblePages.length) continue;
    html += `<div class="sidebar-section">`;
    html += `<div class="sidebar-group-title">${escHtml(group.group || '')}</div>`;
    for (const page of visiblePages) {
      const label = toLabel(page);
      const activeClass = page === activePageId ? ' active' : '';
      html += `<a class="sidebar-item${activeClass}" data-page="${escHtml(page)}" href="${escHtml(page)}" onclick="loadPage('${escHtml(page)}',this);if(window.innerWidth<=1024)closeSidebar();return false;">${escHtml(label)}</a>`;
    }
    html += `</div>`;
  }
  return html;
}

function buildVersionSelector(versionConfig, currentVersion) {
  const options = versionConfig.list.map(v => {
    const label = v.tag ? `${escHtml(v.version)} (${escHtml(v.tag)})` : escHtml(v.version);
    const selected = v.version === currentVersion ? ' selected' : '';
    return `<option value="${escHtml(v.version)}"${selected}>${label}</option>`;
  }).join('');
  return `<select class="version-select" id="version-select" onchange="switchVersion(this.value)" aria-label="Documentation version">${options}</select>`;
}

function toLabel(id) {
  const name = id.includes('/') ? id.split('/').pop() : id;
  return name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function buildWsScript(port) {
  return `
(function(){
  const ws = new WebSocket('ws://localhost:${port}');
  ws.addEventListener('message', e => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'reload') window.location.reload();
  });
  ws.addEventListener('close', () => setTimeout(() => window.location.reload(), 1500));
})();`;
}

function buildDevLoader() {
  return `
async function loadPage(id, el) {
  window.__DOCSLIT_CURRENT_PAGE__ = id;
  activateSidebar(id);
  const target = _docsBase() + id;
  if (location.pathname !== target) history.pushState({page: id}, '', target);
  _setBreadcrumb(id, _toLabel(id));
  const content = document.getElementById('docs-content');
  content.innerHTML = '<div class="loading-state">Loading…</div>';
  try {
    var vc = window.__DOCSLIT_VERSIONS__;
    const apiPath = vc ? '/api/page/' + vc.current + '/' + id : '/api/page/' + id;
    const res = await fetch(apiPath);
    if (!res.ok) throw new Error(res.statusText);
    const { meta, html } = await res.json();
    const logoText = document.querySelector('.nav-logo-text');
    if (meta.title) {
      document.title = meta.title + ' — ' + (logoText ? logoText.textContent.trim() : '');
      _setBreadcrumb(id, meta.title);
    }
    content.innerHTML = '';
    if (meta.draft) content.insertAdjacentHTML('beforeend', '<div class="draft-banner" role="status"><span><strong>Draft page</strong> — not visible in production. Remove <code>draft: true</code> from frontmatter to publish.</span></div>');
    const metaBar = _buildMetaBar(meta, id);
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    const h1 = tmp.querySelector('h1');
    if (h1) { content.appendChild(document.importNode(h1, true)); content.insertAdjacentHTML('beforeend', metaBar); tmp.querySelector('h1').remove(); }
    else { content.insertAdjacentHTML('beforeend', metaBar); }
    content.insertAdjacentHTML('beforeend', tmp.innerHTML);
    _wrapTables(content);
    buildToc(content);
    content.insertAdjacentHTML('beforeend', _buildPrevNext(id));
  } catch(e) {
    _show404(id);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  _updateThemeBtn();
  const fromPath = _pageFromUrl();
  const fromHash = location.hash.slice(1);
  const firstEl = document.querySelector('.sidebar-item');
  const firstId = fromPath || fromHash || (firstEl && firstEl.dataset.page) || 'introduction';
  history.replaceState({page: firstId}, '', _docsBase() + firstId);
  loadPage(firstId, document.querySelector(\`.sidebar-item[data-page="\${firstId}"]\`));
});

window.addEventListener('popstate', () => {
  const id = _pageFromUrl() || document.querySelector('.sidebar-item')?.dataset.page || 'introduction';
  loadPage(id, document.querySelector(\`.sidebar-item[data-page="\${id}"]\`));
});`;
}

function buildStaticLoader() {
  return `
const _cache = {};
let _marked, _purify;

function _parseFrontmatter(text) {
  const m = text.match(/^---\\n([\\s\\S]*?)\\n---\\n?([\\s\\S]*)$/);
  if (!m) return { meta: {}, content: text };
  const meta = {};
  m[1].split('\\n').forEach(line => {
    const i = line.indexOf(':');
    if (i < 0) return;
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
    if (k) meta[k] = v;
  });
  return { meta, content: m[2] };
}

async function _getMd() {
  if (!_marked) {
    const [{ marked }, { default: DOMPurify }] = await Promise.all([import('marked'), import('dompurify')]);
    _marked = marked;
    var _origSanitize = DOMPurify.sanitize.bind(DOMPurify);
    DOMPurify.sanitize = function(dirty, opts) {
      return _origSanitize(dirty, Object.assign({
        CUSTOM_ELEMENT_HANDLING: { tagNameCheck: /^wc-/, attributeNameCheck: /.*/, allowCustomizedBuiltInElements: false }
      }, opts || {}));
    };
    _purify = DOMPurify;
  }
  return { marked: _marked, purify: _purify };
}

async function _fetchPage(id) {
  if (_cache[id] !== undefined) return _cache[id];
  try {
    const res = await fetch(_docsBase() + id + '.md');
    if (!res.ok) {
      var vc = window.__DOCSLIT_VERSIONS__;
      if (vc && vc.current !== vc.default) {
        const fallback = await fetch('/' + vc.default + '/' + id + '.md');
        if (fallback.ok) { _cache[id] = _parseFrontmatter(await fallback.text()); return _cache[id]; }
      }
      throw new Error('Not found');
    }
    _cache[id] = _parseFrontmatter(await res.text());
  } catch(e) { _cache[id] = null; }
  return _cache[id];
}

async function loadPage(id, el) {
  window.__DOCSLIT_CURRENT_PAGE__ = id;
  activateSidebar(id);
  const target = _docsBase() + id;
  if (location.pathname !== target) history.pushState({page: id}, '', target);
  const content = document.getElementById('docs-content');
  content.textContent = 'Loading…';
  const data = await _fetchPage(id);
  if (!data) { _show404(id); return; }
  const { meta, content: mdText } = data;
  const { marked, purify } = await _getMd();
  const safeHtml = purify.sanitize(marked.parse(mdText));
  const logoText = document.querySelector('.nav-logo-text');
  if (meta.title) {
    document.title = meta.title + ' — ' + (logoText ? logoText.textContent.trim() : '');
    _setBreadcrumb(id, meta.title);
  }
  const metaBar = _buildMetaBar(meta, id);
  const tmp = document.createElement('div');
  tmp.innerHTML = safeHtml;
  const h1 = tmp.querySelector('h1');
  content.innerHTML = '';
  if (h1) { content.appendChild(document.importNode(h1,true)); content.insertAdjacentHTML('beforeend', metaBar); tmp.querySelector('h1').remove(); }
  else { content.insertAdjacentHTML('beforeend', metaBar); }
  content.insertAdjacentHTML('beforeend', tmp.innerHTML);
  _wrapTables(content);
  buildToc(content);
  content.insertAdjacentHTML('beforeend', _buildPrevNext(id));
}

window.addEventListener('DOMContentLoaded', () => {
  _updateThemeBtn();
  var preRenderedId = window.__DOCSLIT_PAGE_ID__;
  if (preRenderedId) {
    window.__DOCSLIT_CURRENT_PAGE__ = preRenderedId;
    activateSidebar(preRenderedId);
    var content = document.getElementById('docs-content');
    _wrapTables(content);
    buildToc(content);
    content.insertAdjacentHTML('beforeend', _buildPrevNext(preRenderedId));
    history.replaceState({page: preRenderedId}, '', location.pathname);
  } else {
    const fromPath = _pageFromUrl();
    const fromHash = location.hash.slice(1);
    const firstEl = document.querySelector('.sidebar-item');
    const firstId = fromPath || fromHash || (firstEl && firstEl.dataset.page) || 'introduction';
    history.replaceState({page: firstId}, '', _docsBase() + firstId);
    loadPage(firstId, document.querySelector(\`.sidebar-item[data-page="\${firstId}"]\`));
  }
});

window.addEventListener('popstate', () => {
  const id = _pageFromUrl() || document.querySelector('.sidebar-item')?.dataset.page || 'introduction';
  loadPage(id, document.querySelector(\`.sidebar-item[data-page="\${id}"]\`));
});`;
}

function buildOfflineLoader() {
  return `
const _pages = window.__DOCSLIT_PAGES__ || {};

async function loadPage(id, el) {
  window.__DOCSLIT_CURRENT_PAGE__ = id;
  activateSidebar(id);
  const target = _docsBase() + id;
  if (location.pathname !== target) history.pushState({page: id}, '', target);
  const content = document.getElementById('docs-content');
  const data = _pages[id];
  if (!data) { _show404(id); return; }
  const { meta, html } = data;
  const logoText = document.querySelector('.nav-logo-text');
  if (meta.title) {
    document.title = meta.title + ' — ' + (logoText ? logoText.textContent.trim() : '');
    _setBreadcrumb(id, meta.title);
  }
  const metaBar = _buildMetaBar(meta, id);
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  const h1 = tmp.querySelector('h1');
  content.innerHTML = '';
  if (meta.draft) content.insertAdjacentHTML('beforeend', '<div class="draft-banner" role="status"><span><strong>Draft page</strong> — not visible in production builds.</span></div>');
  if (h1) { content.appendChild(document.importNode(h1,true)); content.insertAdjacentHTML('beforeend', metaBar); tmp.querySelector('h1').remove(); }
  else { content.insertAdjacentHTML('beforeend', metaBar); }
  content.insertAdjacentHTML('beforeend', tmp.innerHTML);
  _wrapTables(content);
  buildToc(content);
  content.insertAdjacentHTML('beforeend', _buildPrevNext(id));
}

window.addEventListener('DOMContentLoaded', () => {
  _updateThemeBtn();
  const fromPath = _pageFromUrl();
  const fromHash = location.hash.slice(1);
  const firstEl = document.querySelector('.sidebar-item');
  const firstId = fromPath || fromHash || (firstEl && firstEl.dataset.page) || 'introduction';
  history.replaceState({page: firstId}, '', _docsBase() + firstId);
  loadPage(firstId, document.querySelector(\`.sidebar-item[data-page="\${firstId}"]\`));
});

window.addEventListener('popstate', () => {
  const id = _pageFromUrl() || document.querySelector('.sidebar-item')?.dataset.page || 'introduction';
  loadPage(id, document.querySelector(\`.sidebar-item[data-page="\${id}"]\`));
});

// ── Scrollbar reveal ─────────────────────────────────────────────────────────────────────
// Show the scrollbar thumb only while the user is actively scrolling or
// hovering near the right edge. Keeps the page visually clean during SPA
// page swaps where macOS would otherwise fade its overlay scrollbar in/out.
(function() {
  let _scrollbarHideTimer = null;
  function _showScrollbar() {
    document.documentElement.classList.add('scrolling');
    if (_scrollbarHideTimer) clearTimeout(_scrollbarHideTimer);
    _scrollbarHideTimer = setTimeout(() => {
      document.documentElement.classList.remove('scrolling');
    }, 1200);
  }
  window.addEventListener('scroll', _showScrollbar, { passive: true });
  window.addEventListener('mousemove', (e) => {
    if (e.clientX > window.innerWidth - 24) _showScrollbar();
  }, { passive: true });
})();`;
}

function buildSearchScript(mode) {
  const fetchUrl = mode === 'dev'
    ? `(() => { var vc = window.__DOCSLIT_VERSIONS__; return vc ? '/api/search-index/' + vc.current : '/api/search-index'; })()`
    : `(() => { var vc = window.__DOCSLIT_VERSIONS__; var base = vc ? '/' + vc.current + '/' : '/'; return base + 'search-index.json'; })()`;

  return `
var _searchIndex = null;
var _searchFlex = null;
var _searchActive = -1;
var _searchReady = false;

async function _loadSearchIndex() {
  if (_searchReady) return;
  _searchReady = true;
  try {
    if (window.__DOCSLIT_SEARCH_INDEX__) {
      _searchIndex = window.__DOCSLIT_SEARCH_INDEX__;
    } else {
      var url = ${fetchUrl};
      var res = await fetch(url);
      _searchIndex = await res.json();
    }
    var { default: FlexSearch } = await import('https://esm.sh/flexsearch@0.7.43/dist/flexsearch.bundle.module.min.js');
    _searchFlex = new FlexSearch.Document({
      document: { id: 'id', index: ['title', 'desc', 'body'], store: ['id', 'title', 'group', 'desc'] },
      tokenize: 'forward',
      resolution: 9,
    });
    for (var doc of _searchIndex) _searchFlex.add(doc);
  } catch(e) { console.error('Search index load failed:', e); }
}

function openSearch() {
  _loadSearchIndex();
  var overlay = document.getElementById('search-overlay');
  overlay.classList.add('open');
  var input = document.getElementById('search-input');
  input.value = '';
  input.focus();
  _searchActive = -1;
  _renderDefaultResults();
  document.body.style.overflow = 'hidden';
  overlay.addEventListener('keydown', _trapFocus);
}

function closeSearch() {
  var overlay = document.getElementById('search-overlay');
  overlay.classList.remove('open');
  overlay.removeEventListener('keydown', _trapFocus);
  document.body.style.overflow = '';
  var trigger = document.getElementById('search-trigger');
  if (trigger) trigger.focus();
}

function _trapFocus(e) {
  if (e.key !== 'Tab') return;
  var modal = document.querySelector('.search-modal');
  var focusable = modal.querySelectorAll('input, button, [tabindex]:not([tabindex="-1"])');
  if (!focusable.length) return;
  var first = focusable[0];
  var last = focusable[focusable.length - 1];
  if (e.shiftKey) {
    if (document.activeElement === first) { e.preventDefault(); last.focus(); }
  } else {
    if (document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
}

function handleOverlayClick(e) {
  if (e.target === e.currentTarget) closeSearch();
}

function _renderDefaultResults() {
  var container = document.getElementById('search-results');
  if (!_searchIndex || !_searchIndex.length) {
    container.innerHTML = '<div class="search-empty">Loading index…</div>';
    return;
  }
  var items = _searchIndex.slice(0, 8);
  var html = '<div class="search-group-title">Quick Access</div>';
  items.forEach(function(item, i) {
    html += _renderItem(item, i);
  });
  container.innerHTML = html;
  _searchActive = 0;
  _updateActive();
}

function _renderItem(item, idx) {
  return '<div class="search-item" id="search-opt-' + idx + '" role="option" data-idx="' + idx + '" data-id="' + _esc(item.id) + '" onclick="selectSearchItem(this)" onmouseenter="_searchActive=' + idx + ';_updateActive()">' +
    '<div class="search-item-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div>' +
    '<div class="search-item-text"><div class="search-item-title">' + _esc(item.title) + '</div>' +
    (item.desc ? '<div class="search-item-desc">' + _esc(item.desc) + '</div>' : '') +
    '</div>' +
    '<span class="search-item-badge">' + _esc(item.group) + '</span>' +
    '</div>';
}

function _renderItemHl(item, idx, query) {
  return '<div class="search-item" id="search-opt-' + idx + '" role="option" data-idx="' + idx + '" data-id="' + _esc(item.id) + '" onclick="selectSearchItem(this)" onmouseenter="_searchActive=' + idx + ';_updateActive()">' +
    '<div class="search-item-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div>' +
    '<div class="search-item-text"><div class="search-item-title">' + _highlight(item.title, query) + '</div>' +
    (item.desc ? '<div class="search-item-desc">' + _highlight(item.desc, query) + '</div>' : '') +
    '</div>' +
    '<span class="search-item-badge">' + _esc(item.group) + '</span>' +
    '</div>';
}

function _esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function _highlight(text, query) {
  if (!query) return _esc(text);
  var safe = _esc(text);
  var q = query.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&');
  return safe.replace(new RegExp('(' + q + ')', 'gi'), '<mark class="hl">$1</mark>');
}

function handleSearchInput(value) {
  var container = document.getElementById('search-results');
  var q = value.trim();
  if (!q) { _renderDefaultResults(); return; }
  if (!_searchFlex) { container.innerHTML = '<div class="search-empty">Loading…</div>'; return; }

  var raw = _searchFlex.search(q, { limit: 20, enrich: true });
  var seen = {};
  var results = [];
  for (var field of raw) {
    for (var entry of (field.result || [])) {
      if (!seen[entry.id]) {
        seen[entry.id] = true;
        results.push(entry.doc);
      }
    }
  }

  if (!results.length) {
    container.innerHTML = '<div class="search-empty">No results for "<strong>' + _esc(q) + '</strong>"</div>';
    _searchActive = -1;
    return;
  }

  var groups = {};
  results.forEach(function(r) {
    var g = r.group || 'Pages';
    if (!groups[g]) groups[g] = [];
    groups[g].push(r);
  });

  var html = '';
  var idx = 0;
  for (var g in groups) {
    html += '<div class="search-group-title">' + _esc(g) + '</div>';
    groups[g].forEach(function(item) {
      html += _renderItemHl(item, idx, q);
      idx++;
    });
  }
  container.innerHTML = html;
  _searchActive = 0;
  _updateActive();
}

function handleSearchKey(e) {
  var items = document.querySelectorAll('.search-item');
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    _searchActive = Math.min(_searchActive + 1, items.length - 1);
    _updateActive();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    _searchActive = Math.max(_searchActive - 1, 0);
    _updateActive();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (items[_searchActive]) selectSearchItem(items[_searchActive]);
  } else if (e.key === 'Escape') {
    closeSearch();
  }
}

function _updateActive() {
  var items = document.querySelectorAll('.search-item');
  items.forEach(function(el, i) { el.classList.toggle('active', i === _searchActive); el.setAttribute('aria-selected', i === _searchActive ? 'true' : 'false'); });
  var input = document.getElementById('search-input');
  if (items[_searchActive]) {
    items[_searchActive].scrollIntoView({ block: 'nearest' });
    if (input) input.setAttribute('aria-activedescendant', items[_searchActive].id);
  } else {
    if (input) input.setAttribute('aria-activedescendant', '');
  }
}

function selectSearchItem(el) {
  var id = el.dataset.id;
  closeSearch();
  loadPage(id);
}

document.addEventListener('keydown', function(e) {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();
    var overlay = document.getElementById('search-overlay');
    if (overlay.classList.contains('open')) closeSearch();
    else openSearch();
  }
});

(function() {
  var isMac = navigator.platform.indexOf('Mac') > -1 || navigator.userAgent.indexOf('Mac') > -1;
  if (!isMac) {
    document.querySelectorAll('.search-trigger-kbd kbd:first-child').forEach(function(k) { k.textContent = 'Ctrl'; });
  }
})();

window.openSearch = openSearch;
window.closeSearch = closeSearch;
window.handleOverlayClick = handleOverlayClick;
window.handleSearchInput = handleSearchInput;
window.handleSearchKey = handleSearchKey;
window.selectSearchItem = selectSearchItem;
`;
}

function buildTheme() {
  return `
const _THEME_CYCLE = ['system','light','dark'];
const _THEME_ICONS = {
  system: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
  light:  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>',
  dark:   '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>'
};

function _updateThemeBtn() {
  const mode = window.__themeMode || 'system';
  const btn = document.getElementById('theme-btn');
  if (btn) btn.innerHTML = _THEME_ICONS[mode];
}

function toggleTheme() {
  const cur = window.__themeMode || 'system';
  const next = _THEME_CYCLE[(_THEME_CYCLE.indexOf(cur) + 1) % _THEME_CYCLE.length];
  window.__themeMode = next;
  localStorage.setItem('docslit-theme', next);
  const h = document.documentElement;
  if (next === 'light') h.className = 'light';
  else if (next === 'dark') h.className = 'dark';
  else h.className = window.matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light';
  _updateThemeBtn();
}`;
}

function buildStyles() {
  return `<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg: #0a0a0a; --surface: #111; --surface2: #1a1a1a; --surface3: #222;
  --border: #2a2a2a; --border2: #3a3a3a;
  --text: #f0f0f0; --text2: #a0a0a0; --text3: #666;
  --accent: #01696f; --accent-light: #4f98a3;
  --accent-dim: rgba(1,105,111,.15); --accent-dim2: rgba(1,105,111,.25);
  --sidebar-bg: #0f0f0f; --code-bg: #161616;
  --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
  --radius: 8px; --radius-lg: 12px;
  --nav-h: 60px; --sidebar-w: 264px;
}
html.light {
  --bg: #ffffff; --surface: #f8f8f8; --surface2: #f0f0f0; --surface3: #e8e8e8;
  --border: #e2e2e2; --border2: #d0d0d0;
  --text: #0f0f0f; --text2: #555; --text3: #999;
  --accent-light: #015e63;
  --accent-dim: rgba(1,105,111,.08); --accent-dim2: rgba(1,105,111,.15);
  --sidebar-bg: #f5f5f5; --code-bg: #1e1e1e;
}
html {
  /* Reserve the scrollbar gutter at all times so SPA page swaps don't flash:
     during the brief moment loadPage() clears innerHTML, the page would
     otherwise become non-scrollable, the browser drops the scrollbar, the
     viewport widens, and everything reflows — then snaps back when the new
     content lands. scrollbar-gutter holds the slot. */
  scrollbar-gutter: stable;
  /* Firefox: hide the thumb by default; .scrolling reveals it. */
  scrollbar-color: transparent transparent;
  scrollbar-width: thin;
}
html.scrolling {
  scrollbar-color: var(--border) transparent;
}
/* Webkit/Blink: render a real (layout-occupying) scrollbar with a transparent
   thumb so the macOS overlay scrollbar never kicks in to fade in/out during
   navigation. The thumb only appears when the user scrolls or moves the mouse
   to the right edge — see the JS shim further down. */
html::-webkit-scrollbar { width: 10px; }
html::-webkit-scrollbar-track { background: transparent; }
html::-webkit-scrollbar-thumb {
  background: transparent;
  border-radius: 5px;
  border: 2px solid transparent;
  background-clip: padding-box;
  transition: background-color .25s;
}
html.scrolling::-webkit-scrollbar-thumb { background-color: var(--border); }
html.scrolling::-webkit-scrollbar-thumb:hover { background-color: var(--text3); }
@media (prefers-reduced-motion: reduce) {
  html::-webkit-scrollbar-thumb { transition: none; }
}
html, body {
  font-family: var(--font-sans);
  background: var(--bg); color: var(--text);
  min-height: 100vh; line-height: 1.6;
  transition: background .2s, color .2s;
}

/* NAV */
.nav {
  position: fixed; top: 0; left: 0; right: 0; z-index: 300;
  height: var(--nav-h);
  background: rgba(10,10,10,.92);
  backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--border);
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 20px 0 12px;
  transition: background .2s;
}
html.light .nav { background: rgba(255,255,255,.93); }
.nav-left { display: flex; align-items: center; gap: 4px; min-width: 0; }
.nav-logo {
  display: flex; align-items: center; gap: 9px;
  font-weight: 700; font-size: 16px;
  color: var(--text); text-decoration: none; min-width: 0;
}
.nav-logo-icon {
  width: 30px; height: 30px; flex-shrink: 0;
  background: linear-gradient(135deg, var(--accent), var(--accent-light));
  border-radius: 7px;
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 800; color: #fff;
}
.nav-logo-text { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.nav-links { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
.nav-menu-btn {
  display: none;
  width: 36px; height: 36px; padding: 0;
  background: transparent; border: none;
  border-radius: var(--radius);
  cursor: pointer; align-items: center; justify-content: center;
  color: var(--text2); transition: background .15s; flex-shrink: 0;
}
.nav-menu-btn:hover { background: var(--surface2); }
.theme-btn {
  width: 34px; height: 34px;
  background: var(--surface2); border: 1px solid var(--border);
  border-radius: var(--radius);
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  color: var(--text2); transition: all .15s;
}
.theme-btn:hover { background: var(--surface3); }
.version-select {
  height: 34px; padding: 0 28px 0 10px;
  background: var(--surface2); border: 1px solid var(--border);
  border-radius: var(--radius); color: var(--text2);
  font-family: var(--font-sans); font-size: 13px; font-weight: 500;
  cursor: pointer; appearance: none; -webkit-appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23666' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat; background-position: right 10px center;
  transition: all .15s;
}
.version-select:hover { background-color: var(--surface3); border-color: var(--border2); }
.version-select:focus { outline: none; border-color: var(--accent); }

/* OVERLAY */
.sidebar-overlay {
  display: none;
  position: fixed; inset: var(--nav-h) 0 0 0;
  background: rgba(0,0,0,.6);
  z-index: 199;
  backdrop-filter: blur(2px); -webkit-backdrop-filter: blur(2px);
  cursor: pointer;
}
.sidebar-overlay.open { display: block; }

/* LAYOUT */
.docs-page { padding-top: var(--nav-h); min-height: 100vh; }
.docs-layout {
  display: flex; max-width: 1560px; margin: 0 auto;
  min-height: calc(100vh - var(--nav-h));
}

/* SIDEBAR */
.docs-sidebar {
  width: var(--sidebar-w); flex-shrink: 0;
  background: var(--sidebar-bg);
  border-right: 1px solid var(--border);
  padding: 0;
  position: sticky; top: var(--nav-h);
  height: calc(100vh - var(--nav-h));
  display: flex; flex-direction: column;
  align-self: flex-start; z-index: 200;
}
.sidebar-scroll {
  scrollbar-width: thin; scrollbar-color: var(--border) transparent;
}
.sidebar-scroll::-webkit-scrollbar { width: 4px; }
.sidebar-scroll::-webkit-scrollbar-track { background: transparent; }
.sidebar-scroll::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
/* SIDEBAR FILTER */
.sidebar-filter-wrap {
  position: sticky; top: 0; z-index: 10;
  padding: 12px 14px 10px;
  background: var(--sidebar-bg);
  display: flex; align-items: center; gap: 8px;
  border-bottom: 1px solid var(--border);
}
.sidebar-filter-icon { flex-shrink: 0; color: var(--text3); }
.sidebar-filter {
  flex: 1; min-width: 0; border: none; outline: none;
  background: transparent; font-family: var(--font-sans);
  font-size: 13px; color: var(--text); padding: 0;
}
.sidebar-filter::placeholder { color: var(--text3); }
.sidebar-filter-clear {
  display: none; width: 20px; height: 20px; padding: 0;
  background: var(--surface2); border: 1px solid var(--border);
  border-radius: 4px; cursor: pointer;
  align-items: center; justify-content: center;
  color: var(--text3); transition: all .12s; flex-shrink: 0;
}
.sidebar-filter-clear.visible { display: flex; }
.sidebar-filter-clear:hover { background: var(--surface3); color: var(--text2); }
.sidebar-scroll { overflow-y: auto; flex: 1; padding: 4px 0 80px; }
.sidebar-item mark.filter-hl {
  background: rgba(234,179,8,.25); color: inherit;
  border-radius: 2px; padding: 0 1px;
}
html.light .sidebar-item mark.filter-hl { background: rgba(202,138,4,.2); }
.sidebar-item.active mark.filter-hl { background: rgba(234,179,8,.35); }
html.light .sidebar-item.active mark.filter-hl { background: rgba(202,138,4,.3); }
.sidebar-item.filter-focus { background: var(--surface2, #1a1a1a); color: var(--text, #f0f0f0); }
html.light .sidebar-item.filter-focus { background: var(--surface3, #e8e8e8); }
.sidebar-no-results {
  padding: 16px 18px; font-size: 13px; color: var(--text3); text-align: center;
}

.sidebar-section { margin-bottom: 2px; }
.sidebar-group-title {
  padding: 18px 18px 5px;
  font-size: 11px; font-weight: 700;
  text-transform: uppercase; letter-spacing: .1em; color: var(--text3);
}
.sidebar-section:first-child .sidebar-group-title { padding-top: 10px; }
.sidebar-item {
  display: block; padding: 7px 18px 7px 20px;
  font-size: 14px; color: var(--text2);
  cursor: pointer; transition: all .12s;
  text-decoration: none; border-left: 2px solid transparent; line-height: 1.4;
}
.sidebar-item:hover { color: var(--text); background: var(--surface2); }
.sidebar-item.active {
  color: var(--accent-light); border-left-color: var(--accent);
  background: var(--accent-dim); font-weight: 500;
}

/* MAIN COLUMN */
.docs-main-col { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.docs-nav-top {
  position: sticky; top: var(--nav-h); height: 44px;
  background: var(--bg); border-bottom: 1px solid var(--border);
  display: flex; align-items: center; padding: 0 52px; z-index: 40;
}
.docs-breadcrumb { font-size: 13px; color: var(--text3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.docs-breadcrumb span { color: var(--text2); }
.docs-main { flex: 1; display: flex; justify-content: center; }

/* CONTENT */
.docs-content { flex: 0 1 780px; min-width: 0; max-width: 780px; padding: 48px 56px 80px; }

/* TOC */
.docs-toc {
  width: 216px; flex-shrink: 0;
  padding: 48px 24px 48px 16px;
  position: sticky; top: calc(var(--nav-h) + 44px);
  align-self: flex-start;
  max-height: calc(100vh - var(--nav-h) - 44px);
  overflow-y: auto; scrollbar-width: none;
}
.docs-toc::-webkit-scrollbar { display: none; }
.toc-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .1em; color: var(--text3); margin-bottom: 10px; }
.toc-list {
  list-style: none; margin: 0; padding: 0;
  border-left: 1px solid var(--border);
}
.toc-list li { margin: 0; padding: 0; }
.toc-item {
  position: relative;
  display: block;
  font-size: 13px; line-height: 1.4;
  color: var(--text3);
  text-decoration: none;
  padding: 4px 0 4px 14px;
  margin-left: -1px; /* align the active accent with the static line */
  border-left: 2px solid transparent;
  transition: color .12s, border-color .12s, font-weight .12s;
}
.toc-item-sub { padding-left: 26px; }
.toc-item:hover { color: var(--text2); }
.toc-item.active {
  color: var(--accent-light);
  border-left-color: var(--accent);
  font-weight: 600;
}
@media (prefers-reduced-motion: reduce) {
  .toc-item { transition: none; }
}

/* TYPOGRAPHY */
.docs-content h1 { font-size: 32px; font-weight: 800; letter-spacing: -.02em; margin-bottom: 14px; line-height: 1.15; color: var(--text); }
.docs-content h2 { font-size: 24px; font-weight: 700; letter-spacing: -.01em; margin: 40px 0 14px; padding-top: 4px; color: var(--text); }
.docs-content h3 { font-size: 19px; font-weight: 600; margin: 28px 0 10px; color: var(--text); }
.docs-content h4 { font-size: 16px; font-weight: 600; margin: 20px 0 8px; color: var(--text); }
.docs-content p { color: var(--text2); line-height: 1.8; margin-bottom: 16px; }
.docs-content ul, .docs-content ol { color: var(--text2); line-height: 1.9; margin: 0 0 16px 24px; }
.docs-content li { margin-bottom: 4px; }
.docs-content strong { color: var(--text); }
.docs-content code { font-family: var(--font-mono); font-size: .875em; background: var(--surface2); border: 1px solid var(--border); padding: 2px 6px; border-radius: 4px; color: var(--accent-light); word-break: break-word; }
.docs-content pre { background: var(--code-bg); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 20px 24px; overflow-x: auto; margin: 20px 0; -webkit-overflow-scrolling: touch; }
.docs-content pre code { background: none; border: none; padding: 0; color: #e2e8f0; font-size: 14px; line-height: 1.7; word-break: normal; }
.docs-content a { color: var(--accent-light); text-decoration: none; }
.docs-content a:hover { text-decoration: underline; }
.docs-content .table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; border: 1px solid var(--border); border-radius: var(--radius-lg); margin: 20px 0; }
.docs-content table { width: 100%; border-collapse: collapse; font-size: 15px; min-width: 480px; }
.docs-content .table-wrap table { margin: 0; min-width: unset; }
.docs-content th { text-align: left; padding: 10px 14px; background: var(--surface); border-bottom: 1px solid var(--border); font-weight: 600; color: var(--text2); white-space: nowrap; }
.docs-content td { padding: 10px 14px; border-bottom: 1px solid var(--border); color: var(--text2); vertical-align: top; line-height: 1.6; }
.docs-content tr:last-child td { border-bottom: none; }
.docs-content tr:hover td { background: rgba(255,255,255,.015); }
html.light .docs-content tr:hover td { background: rgba(0,0,0,.015); }
.docs-content blockquote { border-left: 3px solid var(--accent); padding: 12px 20px; background: var(--surface); border-radius: 0 8px 8px 0; margin: 16px 0; color: var(--text2); }
.docs-content hr { border: none; border-top: 1px solid var(--border); margin: 28px 0; }
.docs-content img { max-width: 100%; height: auto; border-radius: var(--radius); display: block; }

/* LIGHT-DOM WC-* LAYOUT — applied before Lit upgrades elements, independent of shadow DOM.
   Prevents inline-display flash and guarantees consistent block spacing. */
wc-callout, wc-alert, wc-banner, wc-update,
wc-card, wc-prompt,
wc-fields, wc-response-fields, wc-color, wc-table, wc-schema, wc-mermaid,
wc-endpoint, wc-runnable-endpoint,
wc-steps, wc-tabs, wc-view,
wc-files, wc-tree, wc-download,
wc-code-block, wc-code-group,
wc-columns, wc-frame, wc-panel, wc-expandable, wc-accordion, wc-aside,
wc-anchor, wc-indent, wc-visibility, wc-versions, wc-page-meta {
  display: block;
  margin-bottom: 20px;
}

/* PAGE META */
.page-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; padding: 0 0 24px; font-size: 13px; color: var(--text3); border-bottom: 1px solid var(--border); margin-bottom: 28px; }
.meta-sep { color: var(--border); font-size: 14px; user-select: none; }
.meta-btn { display: inline-flex; align-items: center; gap: 5px; background: none; border: none; padding: 0; font-family: var(--font-sans); font-size: 13px; color: var(--text3); cursor: pointer; text-decoration: none; transition: color .15s; }
.meta-btn:hover { color: var(--accent-light); }
.meta-btn svg { flex-shrink: 0; }

/* PREV / NEXT */
.page-nav { display: flex; justify-content: space-between; gap: 12px; margin: 56px 0 0; padding-top: 24px; border-top: 1px solid var(--border); }
.page-nav-btn { display: flex; flex-direction: column; gap: 4px; padding: 14px 18px; border: 1px solid var(--border); border-radius: var(--radius-lg); text-decoration: none; transition: all .15s; min-width: 0; flex: 1; max-width: 48%; background: transparent; }
.page-nav-btn:hover { border-color: var(--border2); background: var(--surface); }
.page-nav-btn.next { text-align: right; }
.page-nav-label { font-size: 11px; color: var(--text3); font-weight: 600; text-transform: uppercase; letter-spacing: .06em; }
.page-nav-title { font-size: 14px; color: var(--text); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* STATES */
.loading-state { color: var(--text3); font-size: 15px; padding: 48px 0; }
.draft-banner { display: flex; align-items: flex-start; gap: 10px; padding: 14px 18px; margin-bottom: 28px; border-radius: 10px; border: 1px solid rgba(245,158,11,.35); background: rgba(245,158,11,.08); font-size: 14px; color: #fbbf24; line-height: 1.55; }
.draft-banner strong { font-weight: 700; }
.draft-banner code { font-family: var(--font-mono); font-size: .82em; background: rgba(245,158,11,.15); border: 1px solid rgba(245,158,11,.25); padding: 1px 5px; border-radius: 4px; color: #fcd34d; }

/* SEARCH TRIGGER */
.search-trigger {
  display: flex; align-items: center; gap: 8px;
  height: 34px; padding: 0 10px;
  background: var(--surface2); border: 1px solid var(--border);
  border-radius: var(--radius); color: var(--text3);
  font-family: var(--font-sans); font-size: 13px;
  cursor: pointer; transition: all .15s; white-space: nowrap;
}
.search-trigger:hover { background: var(--surface3); border-color: var(--border2); color: var(--text2); }
.search-trigger svg { flex-shrink: 0; }
.search-trigger-kbd { display: flex; gap: 3px; margin-left: 4px; }
.search-trigger-kbd kbd {
  font-family: var(--font-sans); font-size: 11px; font-weight: 500;
  background: var(--surface3); border: 1px solid var(--border);
  border-radius: 4px; padding: 1px 5px; color: var(--text3); line-height: 1.4;
}

/* SEARCH OVERLAY */
.search-overlay {
  display: none; position: fixed; inset: 0; z-index: 500;
  background: rgba(0,0,0,.55);
  backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px);
  justify-content: center; align-items: flex-start; padding-top: 100px;
}
.search-overlay.open { display: flex; }
.search-modal {
  width: 100%; max-width: 600px;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius-lg); box-shadow: 0 20px 60px rgba(0,0,0,.4);
  overflow: hidden; display: flex; flex-direction: column;
  animation: searchIn .15s ease-out;
}
@keyframes searchIn { from { opacity: 0; transform: scale(.97) translateY(-8px); } }
.search-input-wrap {
  display: flex; align-items: center; gap: 10px;
  padding: 14px 18px; border-bottom: 1px solid var(--border);
}
.search-icon { flex-shrink: 0; color: var(--text3); }
.search-input {
  flex: 1; border: none; outline: none; background: transparent;
  font-family: var(--font-sans); font-size: 15px; color: var(--text);
}
.search-input::placeholder { color: var(--text3); }
.search-kbd kbd {
  font-family: var(--font-sans); font-size: 11px; font-weight: 500;
  background: var(--surface3); border: 1px solid var(--border);
  border-radius: 4px; padding: 2px 6px; color: var(--text3);
}
.search-results {
  max-height: 440px; overflow-y: auto;
  scrollbar-width: thin; scrollbar-color: var(--border) transparent;
}
.search-results::-webkit-scrollbar { width: 4px; }
.search-results::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
.search-group-title {
  padding: 10px 18px 4px; font-size: 11px; font-weight: 700;
  text-transform: uppercase; letter-spacing: .08em; color: var(--text3);
}
.search-item {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 18px; cursor: pointer; transition: background .1s;
}
.search-item:hover, .search-item.active { background: var(--accent-dim); }
.search-item-icon {
  width: 28px; height: 28px; flex-shrink: 0;
  background: var(--surface2); border: 1px solid var(--border);
  border-radius: 6px; display: flex; align-items: center; justify-content: center;
  color: var(--text3);
}
.search-item.active .search-item-icon { background: var(--accent-dim2); border-color: var(--accent); color: var(--accent-light); }
.search-item-text { flex: 1; min-width: 0; }
.search-item-title { font-size: 14px; font-weight: 500; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.search-item-desc { font-size: 12px; color: var(--text3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 1px; }
.search-item-badge {
  font-size: 11px; color: var(--text3); background: var(--surface2);
  border: 1px solid var(--border); border-radius: 4px; padding: 2px 7px;
  white-space: nowrap; flex-shrink: 0;
}
.search-empty { padding: 32px 18px; text-align: center; color: var(--text3); font-size: 14px; }
.search-footer {
  display: flex; gap: 16px; padding: 10px 18px;
  border-top: 1px solid var(--border); font-size: 12px; color: var(--text3);
}
.search-hint { display: flex; align-items: center; gap: 4px; }
.search-hint kbd {
  font-family: var(--font-sans); font-size: 11px; font-weight: 500;
  background: var(--surface3); border: 1px solid var(--border);
  border-radius: 3px; padding: 1px 5px; line-height: 1.4;
}
mark.hl { background: var(--accent-dim2); color: var(--accent-light); border-radius: 2px; padding: 0 1px; }

/* RESPONSIVE */
@media(max-width:1280px) {
  .docs-toc { display: none; }
  /* No TOC means content can grow naturally — restore flex grow + full width. */
  .docs-content { flex: 1 1 auto; max-width: 100%; }
}
@media(max-width:1100px) {
  .docs-content { padding: 40px 44px 72px; }
}
@media(max-width:1024px) {
  .nav-menu-btn { display: flex; }
  .docs-sidebar {
    position: fixed; top: var(--nav-h); left: 0; bottom: 0; height: auto;
    transform: translateX(-100%);
    transition: transform .25s cubic-bezier(.4,0,.2,1), box-shadow .25s;
    width: min(var(--sidebar-w), 85vw); box-shadow: none;
  }
  .docs-sidebar.open { transform: translateX(0); box-shadow: 8px 0 40px rgba(0,0,0,.5); }
  .docs-nav-top { padding: 0 28px; }
  .docs-content { padding: 36px 36px 64px; max-width: 100%; }
}
@media(max-width:768px) {
  .docs-content { padding: 28px 28px 56px; }
  .docs-content h1 { font-size: 28px; }
  .docs-content h2 { font-size: 22px; margin: 32px 0 12px; }
  .docs-content h3 { font-size: 18px; }
  .docs-nav-top { padding: 0 20px; }
}
@media(max-width:640px) {
  :root { --nav-h: 56px; }
  .nav { padding: 0 14px 0 8px; }
  .nav-logo-text { display: none; }
  .search-trigger-text, .search-trigger-kbd { display: none; }
  .search-trigger { padding: 0 8px; }
  .search-modal { margin: 0 12px; }
  .search-overlay { padding-top: 60px; }
  .docs-content { padding: 24px 20px 48px; }
  .docs-content h1 { font-size: 24px; }
  .docs-content h2 { font-size: 20px; margin: 28px 0 10px; }
  .docs-content h3 { font-size: 17px; }
  .docs-content pre { padding: 14px 16px; }
  .docs-nav-top { height: 40px; padding: 0 16px; }
  .docs-breadcrumb { font-size: 12px; }
  .page-nav { flex-direction: column; }
  .page-nav-btn, .page-nav-btn.next { max-width: 100%; text-align: left; }
  .page-meta { gap: 8px; font-size: 12px; padding-bottom: 20px; margin-bottom: 20px; }
}
@media(max-width:400px) {
  .docs-content { padding: 20px 16px 40px; }
  .docs-content h1 { font-size: 22px; }
}

/* SKIP LINK */
.skip-link {
  position: fixed; top: -100px; left: 16px; z-index: 9999;
  padding: 8px 16px; background: var(--accent); color: #fff;
  font-family: var(--font-sans); font-size: 14px; font-weight: 600;
  border-radius: 0 0 var(--radius) var(--radius);
  text-decoration: none; transition: top .15s;
}
.skip-link:focus { top: 0; outline: none; }

/* FOCUS INDICATORS */
*:focus-visible {
  outline: 2px solid var(--accent); outline-offset: 2px;
  border-radius: 4px;
}
.sidebar-item:focus-visible { outline-offset: -2px; }
.search-input:focus-visible { outline: none; }
.theme-btn:focus-visible, .nav-menu-btn:focus-visible,
.search-trigger:focus-visible, .version-select:focus-visible {
  outline: 2px solid var(--accent); outline-offset: 2px;
}

/* LINKS — underline for distinguishability */
.docs-content a { text-decoration: underline; text-decoration-color: var(--accent-dim2); text-underline-offset: 2px; }
.docs-content a:hover { text-decoration-color: var(--accent-light); }

/* REDUCED MOTION */
@media(prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important; }
  .search-modal { animation: none; }
  .docs-sidebar { transition: none; }
}

/* HIGH CONTRAST */
@media(prefers-contrast: more) {
  :root { --border: #555; --border2: #777; --text2: #ccc; --text3: #aaa; }
  html.light { --border: #999; --border2: #777; --text2: #333; --text3: #555; }
}
.not-found { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 80px 24px 40px; }
.not-found-code { font-size: 96px; font-weight: 800; letter-spacing: -4px; color: var(--border2, #333); font-family: 'Inter', sans-serif; line-height: 1; margin-bottom: 8px; }
.not-found-title { font-size: 24px; font-weight: 700; color: var(--text, #f0f0f0); margin: 0 0 12px; font-family: 'Inter', sans-serif; }
.not-found-desc { font-size: 15px; color: var(--text2, #a0a0a0); margin: 0 0 32px; line-height: 1.6; font-family: 'Inter', sans-serif; }
.not-found-desc code { background: var(--surface2, #1a1a1a); padding: 2px 7px; border-radius: 4px; font-size: 13px; }
.not-found-actions { display: flex; gap: 12px; }
.not-found-btn { display: inline-flex; align-items: center; padding: 10px 20px; border-radius: 8px; font-family: 'Inter', sans-serif; font-size: 14px; font-weight: 500; text-decoration: none; cursor: pointer; background: #01696f; color: #fff; border: none; }
.not-found-btn:hover { background: #017f86; }
.not-found-btn-alt { background: var(--surface2, #1a1a1a); color: var(--text, #f0f0f0); border: 1px solid var(--border, #2a2a2a); }
.not-found-btn-alt:hover { background: var(--surface3, #222); }
@media(max-width: 640px) { .not-found-code { font-size: 64px; } .not-found-title { font-size: 20px; } .not-found-actions { flex-direction: column; } }
</style>`;
}
