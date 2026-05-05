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
  const importMap = mode === 'dev'
    ? `{"imports":{"lit":"/vendor/lit.js","lit/decorators.js":"/vendor/lit-decorators.js","@lit/reactive-element":"/vendor/reactive-element.js","lit-html":"/vendor/lit-html.js","lit-element/lit-element.js":"/vendor/lit-element.js"}}`
    : `{"imports":{"lit":"https://esm.sh/lit@3","lit/decorators.js":"https://esm.sh/lit@3/decorators","@lit/reactive-element":"https://esm.sh/@lit/reactive-element@2","lit-html":"https://esm.sh/lit-html@3","lit-element/lit-element.js":"https://esm.sh/lit-element@4/lit-element.js","marked":"https://esm.sh/marked@18","dompurify":"https://esm.sh/dompurify@3"}}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <script>
    (function(){
      var s=localStorage.getItem('docslit-theme')||'system';
      var h=document.documentElement;
      function a(m){if(m==='light')h.className='light';else if(m==='dark')h.className='dark';else h.className=window.matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light';}
      a(s);window.__themeMode=s;
      window.matchMedia('(prefers-color-scheme:dark)').addEventListener('change',function(){if((localStorage.getItem('docslit-theme')||'system')==='system')a('system');});
    })();
  </script>
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${siteTitle} — DocsLit</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  ${buildStyles()}
</head>
<body>
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
</nav>
<div class="search-overlay" id="search-overlay" onclick="handleOverlayClick(event)">
  <div class="search-modal" role="dialog" aria-modal="true" aria-label="Search documentation">
    <div class="search-input-wrap">
      <svg class="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg>
      <input class="search-input" id="search-input" type="text" placeholder="Search docs…" autocomplete="off" spellcheck="false" oninput="handleSearchInput(this.value)" onkeydown="handleSearchKey(event)">
      <div class="search-kbd"><kbd>Esc</kbd></div>
    </div>
    <div class="search-results" id="search-results"></div>
    <div class="search-footer">
      <div class="search-hint"><kbd>↑</kbd><kbd>↓</kbd> navigate</div>
      <div class="search-hint"><kbd>↵</kbd> open</div>
      <div class="search-hint"><kbd>Esc</kbd> close</div>
    </div>
  </div>
</div>
<div class="sidebar-overlay" id="sidebar-overlay"></div>

<div class="docs-page">
  <div class="docs-layout">
    <aside class="docs-sidebar" id="docs-sidebar">
      ${sidebarHtml}
    </aside>
    <div class="docs-main-col">
      <div class="docs-nav-top">
        <div class="docs-breadcrumb">${siteTitle} › <span id="docs-breadcrumb-current">Loading…</span></div>
      </div>
      <div class="docs-main">
        <div class="docs-content" id="docs-content">
          <div class="loading-state">Loading…</div>
        </div>
        <div class="docs-toc" id="docs-toc"></div>
      </div>
    </div>
  </div>
</div>

${inlinePages}
${inlineSearch}
${versionScript}
<script type="importmap">${importMap}</script>
<script type="module">
${buildComponents()}
</script>
<script>
${buildTheme()}
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
function _tocScroll(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const navH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) || 60;
  const top = el.getBoundingClientRect().top + window.scrollY - navH - 44 - 16;
  history.pushState(null, '', location.pathname + '#' + id);
  window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
}

function buildToc(container) {
  const toc = document.getElementById('docs-toc');
  if (!toc) return;
  const headings = Array.from(container.querySelectorAll('h2, h3'));
  if (headings.length < 2) { toc.innerHTML = ''; return; }
  toc.innerHTML = '<div class="toc-title">On this page</div>' +
    headings.map(h => {
      const id = h.id || h.textContent.toLowerCase().replace(/[^a-z0-9]+/g,'-');
      h.id = id;
      const indent = h.tagName === 'H3' ? ' style="padding-left:12px"' : '';
      return \`<a class="toc-item" href="#\${id}"\${indent} onclick="_tocScroll(this.getAttribute('href').slice(1));return false;">\${h.textContent}</a>\`;
    }).join('');
}

// ── TABLE WRAPPING ────────────────────────────────────────────────────────
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

window.loadPage = loadPage;
window.activateSidebar = activateSidebar;
window.closeSidebar = closeSidebar;
window.openSidebar = openSidebar;
window.switchVersion = switchVersion;
</script>
</body>
</html>`;
}

export function renderSeoPage({ config, id, meta, html, versionSlug = null }) {
  const siteTitle = config.name || 'DocsLit';
  const pageTitle = meta.title || id;
  const desc = meta.description || meta.desc || '';
  const redirectBase = versionSlug ? `'/${escHtml(versionSlug)}/'` : `location.href.replace(/\\/docs\\/[^/]*$/,'/')`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escHtml(pageTitle)} — ${escHtml(siteTitle)}</title>
${desc ? `<meta name="description" content="${escHtml(desc)}">` : ''}
<style>body{font-family:system-ui,sans-serif;max-width:800px;margin:2rem auto;padding:0 1rem;line-height:1.6}h1,h2,h3{line-height:1.3}pre{background:#f4f4f4;padding:1rem;overflow:auto;border-radius:4px}code{background:#f4f4f4;padding:.1em .3em;border-radius:2px}a{color:#01696f}img{max-width:100%}</style>
<script>var _id=${JSON.stringify(id)};location.replace(${redirectBase}+_id);</script>
</head>
<body>
${html}
</body>
</html>`;
}

function injectPageMeta(meta) {
  const parts = [];
  if (meta.tag) parts.push(`<span>${escHtml(meta.tag)}</span>`);
  if (meta.component) parts.push(`<span>•</span><span>${escHtml(meta.component)}</span>`);
  if (meta.readtime) parts.push(`<span>•</span><span>${escHtml(meta.readtime)}</span>`);
  if (meta.updated) parts.push(`<span>•</span><span>Updated ${escHtml(meta.updated)}</span>`);
  return parts.length ? `<div class="page-meta">${parts.join('')}</div>` : '';
}

function buildSidebarHtml(config, draftIds = []) {
  const draftSet = new Set(draftIds);
  let html = '';
  for (const group of (config.sidebar || [])) {
    const visiblePages = (group.pages || []).filter(p => !draftSet.has(p));
    if (!visiblePages.length) continue;
    html += `<div class="sidebar-section">`;
    html += `<div class="sidebar-group-title">${escHtml(group.group || '')}</div>`;
    for (const page of visiblePages) {
      const label = toLabel(page);
      html += `<a class="sidebar-item" data-page="${escHtml(page)}" href="${escHtml(page)}" onclick="loadPage('${escHtml(page)}',this);if(window.innerWidth<=1024)closeSidebar();return false;">${escHtml(label)}</a>`;
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
  return id.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
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
function _docsBase() {
  var vc = window.__DOCSLIT_VERSIONS__;
  if (vc) return '/' + vc.current + '/';
  const p = window.location.pathname;
  return p.slice(0, p.lastIndexOf('/') + 1);
}
function _pageFromUrl() {
  var vc = window.__DOCSLIT_VERSIONS__;
  if (vc) {
    const p = window.location.pathname;
    const prefix = '/' + vc.current + '/';
    if (p.startsWith(prefix)) return p.slice(prefix.length) || null;
    return null;
  }
  const p = window.location.pathname;
  return p.slice(_docsBase().length) || null;
}

async function loadPage(id, el) {
  activateSidebar(id);
  const target = _docsBase() + id;
  if (location.pathname !== target) history.pushState({page: id}, '', target);
  const crumb = document.getElementById('docs-breadcrumb-current');
  if (crumb) crumb.textContent = _toLabel(id);
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
      if (crumb) crumb.textContent = meta.title;
    }
    content.innerHTML = '';
    if (meta.draft) content.insertAdjacentHTML('beforeend', '<div class="draft-banner" role="status"><span><strong>Draft page</strong> — not visible in production. Remove <code>draft: true</code> from frontmatter to publish.</span></div>');
    const metaBar = _buildMetaBar(meta);
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    const h1 = tmp.querySelector('h1');
    if (h1) { content.appendChild(document.importNode(h1, true)); if (metaBar) content.insertAdjacentHTML('beforeend', metaBar); tmp.querySelector('h1').remove(); }
    else if (metaBar) content.insertAdjacentHTML('beforeend', metaBar);
    content.insertAdjacentHTML('beforeend', tmp.innerHTML);
    _wrapTables(content);
    buildToc(content);
    content.insertAdjacentHTML('beforeend', _buildPrevNext(id));
  } catch(e) {
    content.innerHTML = '<div class="loading-state" style="color:#f87171">Error: ' + e.message + '</div>';
  }
}

function _escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function _buildMetaBar(meta) {
  const parts = [];
  if (meta.tag) parts.push('<span>' + _escHtml(meta.tag) + '</span>');
  if (meta.component) parts.push('<span>•</span><span>' + _escHtml(meta.component) + '</span>');
  if (meta.readtime) parts.push('<span>•</span><span>' + _escHtml(meta.readtime) + '</span>');
  if (meta.updated) parts.push('<span>•</span><span>Updated ' + _escHtml(meta.updated) + '</span>');
  return parts.length ? '<div class="page-meta">' + parts.join('') + '</div>' : '';
}

function _toLabel(id) {
  return id.replace(/-/g, ' ').replace(/\\b\\w/g, c => c.toUpperCase());
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

function _docsBase() {
  var vc = window.__DOCSLIT_VERSIONS__;
  if (vc) return '/' + vc.current + '/';
  const p = window.location.pathname;
  return p.slice(0, p.lastIndexOf('/') + 1);
}
function _pageFromUrl() {
  var vc = window.__DOCSLIT_VERSIONS__;
  if (vc) {
    const p = window.location.pathname;
    const prefix = '/' + vc.current + '/';
    if (p.startsWith(prefix)) return p.slice(prefix.length) || null;
    return null;
  }
  const p = window.location.pathname;
  return p.slice(_docsBase().length) || null;
}

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
    _purify = DOMPurify;
  }
  return { marked: _marked, purify: _purify };
}

async function _fetchPage(id) {
  if (_cache[id] !== undefined) return _cache[id];
  try {
    const res = await fetch(_docsBase() + 'docs/' + id + '.md');
    if (!res.ok) {
      var vc = window.__DOCSLIT_VERSIONS__;
      if (vc && vc.current !== vc.default) {
        const fallback = await fetch('/' + vc.default + '/docs/' + id + '.md');
        if (fallback.ok) { _cache[id] = _parseFrontmatter(await fallback.text()); return _cache[id]; }
      }
      throw new Error('Not found');
    }
    _cache[id] = _parseFrontmatter(await res.text());
  } catch(e) { _cache[id] = null; }
  return _cache[id];
}

async function loadPage(id, el) {
  activateSidebar(id);
  const target = _docsBase() + id;
  if (location.pathname !== target) history.pushState({page: id}, '', target);
  const content = document.getElementById('docs-content');
  content.textContent = 'Loading…';
  const data = await _fetchPage(id);
  if (!data) { content.textContent = 'Page not found: ' + id; return; }
  const { meta, content: mdText } = data;
  const { marked, purify } = await _getMd();
  const safeHtml = purify.sanitize(marked.parse(mdText));
  const logoText = document.querySelector('.nav-logo-text');
  const crumb = document.getElementById('docs-breadcrumb-current');
  if (meta.title) {
    document.title = meta.title + ' — ' + (logoText ? logoText.textContent.trim() : '');
    if (crumb) crumb.textContent = meta.title;
  }
  const parts = [];
  if (meta.tag) parts.push('<span>' + meta.tag + '</span>');
  if (meta.component) parts.push('<span>•</span><span>' + meta.component + '</span>');
  if (meta.readtime) parts.push('<span>•</span><span>' + meta.readtime + '</span>');
  if (meta.updated) parts.push('<span>•</span><span>Updated ' + meta.updated + '</span>');
  const metaBar = parts.length ? '<div class="page-meta">' + parts.join('') + '</div>' : '';
  const tmp = document.createElement('div');
  tmp.innerHTML = safeHtml;
  const h1 = tmp.querySelector('h1');
  content.innerHTML = '';
  if (h1) { content.appendChild(document.importNode(h1,true)); if(metaBar) content.insertAdjacentHTML('beforeend', metaBar); tmp.querySelector('h1').remove(); }
  else if (metaBar) content.insertAdjacentHTML('beforeend', metaBar);
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
});`;
}

function buildOfflineLoader() {
  return `
const _pages = window.__DOCSLIT_PAGES__ || {};

function _docsBase() {
  var vc = window.__DOCSLIT_VERSIONS__;
  if (vc) return '/' + vc.current + '/';
  const p = window.location.pathname;
  return p.slice(0, p.lastIndexOf('/') + 1);
}
function _pageFromUrl() {
  var vc = window.__DOCSLIT_VERSIONS__;
  if (vc) {
    const p = window.location.pathname;
    const prefix = '/' + vc.current + '/';
    if (p.startsWith(prefix)) return p.slice(prefix.length) || null;
    return null;
  }
  const p = window.location.pathname;
  return p.slice(_docsBase().length) || null;
}

async function loadPage(id, el) {
  activateSidebar(id);
  const target = _docsBase() + id;
  if (location.pathname !== target) history.pushState({page: id}, '', target);
  const content = document.getElementById('docs-content');
  const data = _pages[id];
  if (!data) { content.innerHTML = '<div class="loading-state" style="color:#f87171">Page not found: ' + id + '</div>'; return; }
  const { meta, html } = data;
  const logoText = document.querySelector('.nav-logo-text');
  const crumb = document.getElementById('docs-breadcrumb-current');
  if (meta.title) {
    document.title = meta.title + ' — ' + (logoText ? logoText.textContent.trim() : '');
    if (crumb) crumb.textContent = meta.title;
  }
  const parts = [];
  if (meta.tag) parts.push('<span>' + meta.tag + '</span>');
  if (meta.component) parts.push('<span>•</span><span>' + meta.component + '</span>');
  if (meta.readtime) parts.push('<span>•</span><span>' + meta.readtime + '</span>');
  if (meta.updated) parts.push('<span>•</span><span>Updated ' + meta.updated + '</span>');
  const metaBar = parts.length ? '<div class="page-meta">' + parts.join('') + '</div>' : '';
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  const h1 = tmp.querySelector('h1');
  content.innerHTML = '';
  if (meta.draft) content.insertAdjacentHTML('beforeend', '<div class="draft-banner" role="status"><span><strong>Draft page</strong> — not visible in production builds.</span></div>');
  if (h1) { content.appendChild(document.importNode(h1,true)); if(metaBar) content.insertAdjacentHTML('beforeend', metaBar); tmp.querySelector('h1').remove(); }
  else if (metaBar) content.insertAdjacentHTML('beforeend', metaBar);
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
});`;
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
      document: { id: 'id', index: ['title', 'desc', 'body'], store: ['title', 'group', 'desc'] },
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
}

function closeSearch() {
  document.getElementById('search-overlay').classList.remove('open');
  document.body.style.overflow = '';
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
  return '<div class="search-item" data-idx="' + idx + '" data-id="' + _esc(item.id) + '" onclick="selectSearchItem(this)" onmouseenter="_searchActive=' + idx + ';_updateActive()">' +
    '<div class="search-item-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div>' +
    '<div class="search-item-text"><div class="search-item-title">' + _esc(item.title) + '</div>' +
    (item.desc ? '<div class="search-item-desc">' + _esc(item.desc) + '</div>' : '') +
    '</div>' +
    '<span class="search-item-badge">' + _esc(item.group) + '</span>' +
    '</div>';
}

function _renderItemHl(item, idx, query) {
  return '<div class="search-item" data-idx="' + idx + '" data-id="' + _esc(item.id) + '" onclick="selectSearchItem(this)" onmouseenter="_searchActive=' + idx + ';_updateActive()">' +
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
  items.forEach(function(el, i) { el.classList.toggle('active', i === _searchActive); });
  if (items[_searchActive]) items[_searchActive].scrollIntoView({ block: 'nearest' });
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
  padding: 16px 0 80px;
  position: sticky; top: var(--nav-h);
  height: calc(100vh - var(--nav-h));
  overflow-y: auto; align-self: flex-start; z-index: 200;
  scrollbar-width: thin; scrollbar-color: var(--border) transparent;
}
.docs-sidebar::-webkit-scrollbar { width: 4px; }
.docs-sidebar::-webkit-scrollbar-track { background: transparent; }
.docs-sidebar::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
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
.docs-main { flex: 1; display: flex; }

/* CONTENT */
.docs-content { flex: 1; min-width: 0; max-width: 780px; padding: 48px 56px 80px; }

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
.toc-item { font-size: 13px; color: var(--text3); margin-bottom: 6px; transition: color .12s; text-decoration: none; display: block; line-height: 1.4; }
.toc-item:hover { color: var(--text2); }

/* TYPOGRAPHY */
.docs-content h1 { font-size: 34px; font-weight: 800; letter-spacing: -.02em; margin-bottom: 14px; line-height: 1.15; color: var(--text); }
.docs-content h2 { font-size: 22px; font-weight: 700; letter-spacing: -.01em; margin: 40px 0 14px; padding-top: 4px; color: var(--text); }
.docs-content h3 { font-size: 17px; font-weight: 600; margin: 28px 0 10px; color: var(--text); }
.docs-content h4 { font-size: 15px; font-weight: 600; margin: 20px 0 8px; color: var(--text); }
.docs-content p { color: var(--text2); line-height: 1.8; margin-bottom: 16px; }
.docs-content ul, .docs-content ol { color: var(--text2); line-height: 1.9; margin: 0 0 16px 24px; }
.docs-content li { margin-bottom: 4px; }
.docs-content strong { color: var(--text); }
.docs-content code { font-family: var(--font-mono); font-size: .84em; background: var(--surface2); border: 1px solid var(--border); padding: 2px 6px; border-radius: 4px; color: var(--accent-light); word-break: break-word; }
.docs-content pre { background: var(--code-bg); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 20px 24px; overflow-x: auto; margin: 20px 0; -webkit-overflow-scrolling: touch; }
.docs-content pre code { background: none; border: none; padding: 0; color: #e2e8f0; font-size: 13px; line-height: 1.7; word-break: normal; }
.docs-content a { color: var(--accent-light); text-decoration: none; }
.docs-content a:hover { text-decoration: underline; }
.docs-content .table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; border: 1px solid var(--border); border-radius: var(--radius-lg); margin: 20px 0; }
.docs-content table { width: 100%; border-collapse: collapse; font-size: 14px; min-width: 480px; }
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
wc-card, wc-tiles, wc-prompt,
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
  .docs-content { max-width: 100%; }
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
  .docs-content h2 { font-size: 20px; margin: 32px 0 12px; }
  .docs-content h3 { font-size: 16px; }
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
  .docs-content h1 { font-size: 25px; }
  .docs-content h2 { font-size: 18px; margin: 28px 0 10px; }
  .docs-content h3 { font-size: 15px; }
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
</style>`;
}
