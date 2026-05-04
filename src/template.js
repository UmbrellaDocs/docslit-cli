export function renderShell({ config, mode = 'dev', port = 3000, out = 'dist', pagesData = null, offline = false, draftPageIds = [] }) {
  const sidebarHtml = buildSidebarHtml(config, draftPageIds);
  const siteTitle = config.name || 'DocsLit';
  const wsScript = mode === 'dev' ? buildWsScript(port) : '';
  const loaderScript = mode === 'dev' ? buildDevLoader() : (offline ? buildOfflineLoader() : buildStaticLoader());
  const inlinePages = offline && pagesData
    ? `<script>window.__DOCSLIT_PAGES__ = ${JSON.stringify(pagesData)};</script>`
    : '';

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
  <a class="nav-logo" href="/">
    <div class="nav-logo-icon">${siteTitle.slice(0,2).toUpperCase()}</div>
    ${siteTitle}
  </a>
  <div class="nav-links">
    <button class="theme-btn" id="theme-btn" onclick="toggleTheme()"></button>
  </div>
</nav>

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
<!-- Lit 3.x + marked via CDN -->
<script type="importmap">{"imports":{"lit":"https://cdn.jsdelivr.net/npm/lit@3.2.1/+esm","lit/decorators.js":"https://cdn.jsdelivr.net/npm/lit@3.2.1/decorators.js/+esm","@lit/reactive-element":"https://cdn.jsdelivr.net/npm/@lit/reactive-element@2.1.0/+esm","lit-html":"https://cdn.jsdelivr.net/npm/lit-html@3.2.1/+esm","lit-element/lit-element.js":"https://cdn.jsdelivr.net/npm/lit-element@4.1.1/lit-element.js/+esm"}}</script>
<script src="https://cdn.jsdelivr.net/npm/marked@12.0.0/marked.min.js"></script>
<script type="module">
${buildComponents()}
</script>
<script>
${buildTheme()}
${loaderScript}
${wsScript}

// ── SIDEBAR ACTIVATION ────────────────────────────────────────────────────
function activateSidebar(id) {
  document.querySelectorAll('.sidebar-item').forEach(el => el.classList.remove('active'));
  const el = document.querySelector(\`.sidebar-item[data-page="\${id}"]\`);
  if (el) el.classList.add('active');
}

// ── TOC ───────────────────────────────────────────────────────────────────
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
      return \`<a class="toc-item" href="#\${id}"\${indent}>\${h.textContent}</a>\`;
    }).join('');
}

window.loadPage = loadPage;
window.activateSidebar = activateSidebar;
</script>
</body>
</html>`;
}

export function renderStaticPage({ config, id, meta, html }) {
  const siteTitle = config.name || 'DocsLit';
  const pageTitle = meta.title || id;
  return renderShell({ config, mode: 'static' }).replace(
    '<div class="loading-state">Loading…</div>',
    injectPageMeta(meta) + html
  ).replace(
    `<title>${siteTitle} — DocsLit</title>`,
    `<title>${pageTitle} — ${siteTitle}</title>`
  );
}

function injectPageMeta(meta) {
  const parts = [];
  if (meta.tag) parts.push(`<span>${meta.tag}</span>`);
  if (meta.component) parts.push(`<span>•</span><span>${meta.component}</span>`);
  if (meta.readtime) parts.push(`<span>•</span><span>${meta.readtime}</span>`);
  if (meta.updated) parts.push(`<span>•</span><span>Updated ${meta.updated}</span>`);
  return parts.length ? `<div class="page-meta">${parts.join('')}</div>` : '';
}

// draftIds: string[] — pages with draft:true are hidden from the sidebar in production builds.
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
      html += `<a class="sidebar-item" data-page="${escHtml(page)}" href="${escHtml(page)}" onclick="loadPage('${escHtml(page)}',this);return false;">${escHtml(label)}</a>`;
    }
    html += `</div>`;
  }
  return html;
}

function toLabel(id) {
  return id.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function buildWsScript(port) {
  return `
// Hot reload via WebSocket
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
// Dev mode — fetch pages from the API server
function _docsBase() {
  const p = window.location.pathname;
  return p.slice(0, p.lastIndexOf('/') + 1);
}
function _pageFromUrl() {
  const p = window.location.pathname;
  return p.slice(_docsBase().length) || null;
}

async function loadPage(id, el) {
  activateSidebar(id);
  const target = _docsBase() + id;
  if (location.pathname !== target) history.pushState({page: id}, '', target);
  document.getElementById('docs-breadcrumb-current').textContent = toLabel(id);
  const content = document.getElementById('docs-content');
  content.innerHTML = '<div class="loading-state">Loading…</div>';
  try {
    const res = await fetch('/api/page/' + id);
    if (!res.ok) throw new Error(res.statusText);
    const { meta, html } = await res.json();
    if (meta.title) {
      document.title = meta.title + ' — ' + document.querySelector('.nav-logo').textContent.trim();
      document.getElementById('docs-breadcrumb-current').textContent = meta.title;
    }
    const metaBar = buildMetaBar(meta);
    content.innerHTML = '';
    if (meta.draft) content.insertAdjacentHTML('beforeend', '<div class="draft-banner" role="status"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0"><path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg><span><strong>Draft page</strong> — not visible in production builds. Remove <code>draft: true</code> from the frontmatter to publish.</span></div>');
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    const h1 = tmp.querySelector('h1');
    if (h1) { content.appendChild(document.importNode(h1, true)); if (metaBar) content.insertAdjacentHTML('beforeend', metaBar); tmp.querySelector('h1').remove(); }
    else if (metaBar) content.insertAdjacentHTML('beforeend', metaBar);
    content.insertAdjacentHTML('beforeend', tmp.innerHTML);
    buildToc(content);
  } catch(e) {
    content.innerHTML = '<div class="loading-state" style="color:#f87171">Error: ' + e.message + '</div>';
  }
}

function buildMetaBar(meta) {
  const parts = [];
  if (meta.tag) parts.push('<span>' + meta.tag + '</span>');
  if (meta.component) parts.push('<span>•</span><span>' + meta.component + '</span>');
  if (meta.readtime) parts.push('<span>•</span><span>' + meta.readtime + '</span>');
  if (meta.updated) parts.push('<span>•</span><span>Updated ' + meta.updated + '</span>');
  return parts.length ? '<div class="page-meta">' + parts.join('') + '</div>' : '';
}

function toLabel(id) {
  return id.replace(/-/g, ' ').replace(/\\b\\w/g, c => c.toUpperCase());
}

// Load first page on startup
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
// Static mode — pages fetched from pages.json at runtime
let _pages = {};

function _docsBase() {
  const p = window.location.pathname;
  return p.slice(0, p.lastIndexOf('/') + 1);
}
function _pageFromUrl() {
  const p = window.location.pathname;
  return p.slice(_docsBase().length) || null;
}

async function _loadPages() {
  try {
    const res = await fetch(_docsBase() + 'pages.json');
    _pages = await res.json();
  } catch(e) { _pages = {}; }
}

async function loadPage(id, el) {
  if (!Object.keys(_pages).length) await _loadPages();
  activateSidebar(id);
  const target = _docsBase() + id;
  if (location.pathname !== target) history.pushState({page: id}, '', target);
  const content = document.getElementById('docs-content');
  const data = _pages[id];
  if (!data) { content.innerHTML = '<div class="loading-state" style="color:#f87171">Page not found: ' + id + '</div>'; return; }
  const { meta, html } = data;
  if (meta.title) {
    document.title = meta.title + ' — ' + document.querySelector('.nav-logo').textContent.trim();
    document.getElementById('docs-breadcrumb-current').textContent = meta.title;
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
  if (meta.draft) content.insertAdjacentHTML('beforeend', '<div class="draft-banner" role="status"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0"><path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg><span><strong>Draft page</strong> — not visible in production builds. Remove <code>draft: true</code> from the frontmatter to publish.</span></div>');
  if (h1) { content.appendChild(document.importNode(h1,true)); if(metaBar) content.insertAdjacentHTML('beforeend', metaBar); tmp.querySelector('h1').remove(); }
  else if (metaBar) content.insertAdjacentHTML('beforeend', metaBar);
  content.insertAdjacentHTML('beforeend', tmp.innerHTML);
  buildToc(content);
}

function toLabel(id) {
  return id.replace(/-/g,' ').replace(/\\b\\w/g,c=>c.toUpperCase());
}

window.addEventListener('DOMContentLoaded', async () => {
  _updateThemeBtn();
  await _loadPages();
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
// Offline mode — all pages inlined at build time in window.__DOCSLIT_PAGES__
const _pages = window.__DOCSLIT_PAGES__ || {};

function _docsBase() {
  const p = window.location.pathname;
  return p.slice(0, p.lastIndexOf('/') + 1);
}
function _pageFromUrl() {
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
  if (meta.title) {
    document.title = meta.title + ' — ' + document.querySelector('.nav-logo').textContent.trim();
    document.getElementById('docs-breadcrumb-current').textContent = meta.title;
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
  if (meta.draft) content.insertAdjacentHTML('beforeend', '<div class="draft-banner" role="status"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0"><path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg><span><strong>Draft page</strong> — not visible in production builds. Remove <code>draft: true</code> from the frontmatter to publish.</span></div>');
  if (h1) { content.appendChild(document.importNode(h1,true)); if(metaBar) content.insertAdjacentHTML('beforeend', metaBar); tmp.querySelector('h1').remove(); }
  else if (metaBar) content.insertAdjacentHTML('beforeend', metaBar);
  content.insertAdjacentHTML('beforeend', tmp.innerHTML);
  buildToc(content);
}

function toLabel(id) {
  return id.replace(/-/g,' ').replace(/\\b\\w/g,c=>c.toUpperCase());
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
  --bg:#0a0a0a;--surface:#111;--surface2:#1a1a1a;--surface3:#222;
  --border:#2a2a2a;--border2:#333;--text:#f0f0f0;--text2:#a0a0a0;--text3:#666;
  --accent:#01696f;--accent-light:#4f98a3;--accent-dim:rgba(1,105,111,.15);--accent-dim2:rgba(1,105,111,.25);
  --sidebar-bg:#0f0f0f;--code-bg:#161616;
  --font-sans:'Inter',-apple-system,sans-serif;--font-mono:'JetBrains Mono','Fira Code',monospace;
  --radius:8px;--radius-lg:12px;
}
html.light {
  --bg:#fff;--surface:#f8f8f8;--surface2:#f0f0f0;--surface3:#e8e8e8;
  --border:#e0e0e0;--border2:#d0d0d0;--text:#0f0f0f;--text2:#555;--text3:#999;
  --accent:#01696f;--accent-light:#015e63;--accent-dim:rgba(1,105,111,.08);--accent-dim2:rgba(1,105,111,.15);
  --sidebar-bg:#f4f4f4;--code-bg:#1e1e1e;
}
html,body{font-family:var(--font-sans);background:var(--bg);color:var(--text);min-height:100vh;line-height:1.6;transition:background .2s,color .2s;}
.nav{position:fixed;top:0;left:0;right:0;z-index:100;height:60px;background:rgba(10,10,10,.88);backdrop-filter:blur(12px);border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;padding:0 24px;transition:background .2s;}
html.light .nav{background:rgba(255,255,255,.92);}
.nav-logo{display:flex;align-items:center;gap:10px;font-weight:700;font-size:18px;cursor:pointer;color:var(--text);text-decoration:none;}
.nav-logo-icon{width:32px;height:32px;background:linear-gradient(135deg,var(--accent),var(--accent-light));border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:800;color:#fff;}
.nav-links{display:flex;align-items:center;gap:8px;}
.theme-btn{width:36px;height:36px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;color:var(--text2);transition:all .15s;}
.theme-btn:hover{background:var(--surface3);}
.docs-page{padding-top:60px;min-height:calc(100vh - 60px);}
.docs-layout{display:flex;max-width:1480px;margin:0 auto;min-height:calc(100vh - 60px);}
.docs-sidebar{width:260px;flex-shrink:0;background:var(--sidebar-bg);border-right:1px solid var(--border);padding:24px 0 80px;position:sticky;top:60px;height:calc(100vh - 60px);overflow-y:auto;align-self:flex-start;z-index:50;}
.sidebar-section{margin-bottom:8px;}
.sidebar-group-title{padding:8px 20px 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--text3);}
.sidebar-item{display:block;padding:7px 20px;font-size:14px;color:var(--text2);cursor:pointer;border-radius:0;transition:all .12s;text-decoration:none;border-left:2px solid transparent;}
.sidebar-item:hover{color:var(--text);background:var(--surface2);}
.sidebar-item.active{color:var(--accent-light);border-left-color:var(--accent);background:var(--accent-dim);font-weight:500;}
.docs-main-col{flex:1;min-width:0;display:flex;flex-direction:column;}
.docs-nav-top{position:sticky;top:60px;height:50px;background:var(--bg);border-bottom:1px solid var(--border);display:flex;align-items:center;padding:0 56px;z-index:40;}
.docs-breadcrumb{font-size:13px;color:var(--text3);}
.docs-breadcrumb span{color:var(--text2);}
.docs-main{flex:1;display:flex;}
.docs-content{flex:1;max-width:780px;padding:48px 56px 80px;min-width:0;}
.docs-toc{width:200px;flex-shrink:0;padding:48px 32px;position:sticky;top:110px;align-self:flex-start;max-height:calc(100vh - 120px);overflow-y:auto;}
.toc-title{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--text3);margin-bottom:12px;}
.toc-item{font-size:13px;color:var(--text3);margin-bottom:6px;cursor:pointer;transition:color .15s;text-decoration:none;display:block;}
.toc-item:hover{color:var(--text);}
.page-meta{display:flex;flex-wrap:wrap;align-items:center;gap:16px;padding:0 0 28px;font-size:13px;color:var(--text3);border-bottom:1px solid var(--border);margin-bottom:28px;}
.docs-content h1{font-size:36px;font-weight:800;letter-spacing:-.02em;margin-bottom:16px;line-height:1.15;}
.docs-content h2{font-size:24px;font-weight:700;letter-spacing:-.01em;margin:40px 0 16px;padding-top:8px;}
.docs-content h3{font-size:18px;font-weight:600;margin:28px 0 12px;}
.docs-content p{color:var(--text2);line-height:1.8;margin-bottom:16px;}
.docs-content ul,.docs-content ol{color:var(--text2);line-height:1.9;margin:0 0 16px 24px;}
.docs-content code{font-family:var(--font-mono);font-size:.85em;background:var(--surface2);border:1px solid var(--border);padding:2px 6px;border-radius:4px;color:var(--accent-light);}
.docs-content pre{background:var(--code-bg);border:1px solid var(--border);border-radius:var(--radius-lg);padding:20px 24px;overflow-x:auto;margin:20px 0;}
.docs-content pre code{background:none;border:none;padding:0;color:#e2e8f0;font-size:13px;line-height:1.7;}
.docs-content a{color:var(--accent-light);text-decoration:none;}
.docs-content a:hover{text-decoration:underline;}
.docs-content table{width:100%;border-collapse:collapse;margin:20px 0;font-size:14px;}
.docs-content th{text-align:left;padding:10px 14px;background:var(--surface);border:1px solid var(--border);font-weight:600;color:var(--text2);}
.docs-content td{padding:10px 14px;border:1px solid var(--border);color:var(--text2);}
.docs-content blockquote{border-left:3px solid var(--accent);padding:12px 20px;background:var(--surface);border-radius:0 8px 8px 0;margin:16px 0;color:var(--text2);}
.loading-state{color:var(--text3);font-size:15px;padding:40px 0;}
.draft-banner{display:flex;align-items:flex-start;gap:10px;padding:14px 18px;margin-bottom:28px;border-radius:10px;border:1px solid rgba(245,158,11,.35);background:rgba(245,158,11,.08);font-size:14px;color:#fbbf24;line-height:1.55;}
.draft-banner strong{font-weight:700;}
.draft-banner code{font-family:var(--font-mono);font-size:.82em;background:rgba(245,158,11,.15);border:1px solid rgba(245,158,11,.25);padding:1px 5px;border-radius:4px;color:#fcd34d;}
@media(max-width:900px){.docs-sidebar{display:none;}.docs-nav-top,.docs-content{padding-left:24px;padding-right:24px;}}
@media(max-width:1200px){.docs-toc{display:none;}}
</style>`;
}

function buildComponents() {
  return `
import { LitElement, html, css, nothing } from 'lit';

// ── WC-BUTTON ──────────────────────────────────────────────────────────────
class WcButton extends LitElement {
  static properties = { label:{type:String}, variant:{type:String}, href:{type:String} };
  static styles = css\`
    :host{display:inline-block}
    a,button{display:inline-flex;align-items:center;gap:8px;padding:10px 20px;border-radius:8px;font-family:'Inter',sans-serif;font-size:14px;font-weight:600;cursor:pointer;border:none;text-decoration:none;transition:all .15s;}
    .primary{background:#01696f;color:#fff;} .primary:hover{background:#4f98a3;}
    .outline{background:transparent;color:#f0f0f0;border:1px solid #333;} .outline:hover{background:#1a1a1a;}
    .ghost{background:transparent;color:#a0a0a0;} .ghost:hover{color:#f0f0f0;}
    @media(max-width:640px){a,button{padding:8px 16px;font-size:13px;gap:6px;}}
  \`;
  render(){const v=this.variant||'primary';return this.href?html\`<a href="\${this.href}" class="\${v}">\${this.label||html\`<slot></slot>\`}</a>\`:html\`<button class="\${v}">\${this.label||html\`<slot></slot>\`}</button>\`;}
}
customElements.define('wc-button',WcButton);

// ── WC-CALLOUT ─────────────────────────────────────────────────────────────
class WcCallout extends LitElement {
  static properties = { type:{type:String}, title:{type:String} };
  static styles = css\`
    :host{display:block;margin:16px 0;min-width:0}
    .wrap{display:flex;gap:14px;padding:16px 20px;border-radius:10px;border:1px solid;min-width:0}
    .info{background:rgba(59,130,246,.1);border-color:rgba(59,130,246,.3);color:#93c5fd}
    .warning{background:rgba(245,158,11,.1);border-color:rgba(245,158,11,.3);color:#fcd34d}
    .error{background:rgba(239,68,68,.1);border-color:rgba(239,68,68,.3);color:#f87171}
    .success{background:rgba(16,185,129,.1);border-color:rgba(16,185,129,.3);color:#34d399}
    .tip{background:rgba(1,105,111,.1);border-color:rgba(1,105,111,.3);color:#4f98a3}
    .body{flex:1;font-family:'Inter',sans-serif;font-size:14px;line-height:1.7;min-width:0;overflow:hidden}
    .title{font-weight:700;margin-bottom:4px}
    slot{color:#a0a0a0}
    ::slotted(*){max-width:100%;overflow-x:auto}
    @media(max-width:640px){.wrap{gap:10px;padding:12px 16px;}.body{font-size:13px;}}
  \`;
  render(){const t=this.type||'info';return html\`<div class="wrap \${t}">\${this.title?html\`<div class="body"><div class="title">\${this.title}</div><slot></slot></div>\`:html\`<div class="body"><slot></slot></div>\`}</div>\`;}
}
customElements.define('wc-callout',WcCallout);
customElements.define('wc-alert',class extends WcCallout{});

// ── WC-BADGE ───────────────────────────────────────────────────────────────
class WcBadge extends LitElement {
  static properties = { variant:{type:String}, label:{type:String} };
  static styles = css\`
    :host{display:inline-block}
    span{display:inline-flex;align-items:center;padding:2px 10px;border-radius:100px;font-family:'Inter',sans-serif;font-size:12px;font-weight:600;border:1px solid;white-space:nowrap;}
    .default{background:rgba(1,105,111,.15);color:#4f98a3;border-color:rgba(1,105,111,.3)}
    .success{background:rgba(16,185,129,.15);color:#34d399;border-color:rgba(16,185,129,.3)}
    .warning{background:rgba(245,158,11,.15);color:#fbbf24;border-color:rgba(245,158,11,.3)}
    .danger{background:rgba(239,68,68,.15);color:#f87171;border-color:rgba(239,68,68,.3)}
    .info{background:rgba(59,130,246,.15);color:#60a5fa;border-color:rgba(59,130,246,.3)}
    @media(max-width:640px){span{font-size:11px;padding:1px 8px;}}
  \`;
  render(){return html\`<span class="\${this.variant||'default'}">\${this.label||html\`<slot></slot>\`}</span>\`;}
}
customElements.define('wc-badge',WcBadge);

// ── WC-CODE-BLOCK ──────────────────────────────────────────────────────────
class WcCodeBlock extends LitElement {
  static properties = { language:{type:String}, filename:{type:String} };
  static styles = css\`
    :host{display:block;margin:16px 0;width:100%;box-sizing:border-box;max-width:100%}
    .wrap{background:#161616;border:1px solid #2a2a2a;border-radius:10px;overflow:hidden;width:100%;box-sizing:border-box}
    .header{display:flex;align-items:center;justify-content:space-between;padding:10px 16px;background:#111;border-bottom:1px solid #2a2a2a;gap:8px;flex-wrap:wrap;width:100%;box-sizing:border-box}
    .filename{font-family:'JetBrains Mono',monospace;font-size:12px;color:#666;word-break:break-all;flex:1;min-width:0}
    .lang{font-size:11px;color:#444;font-family:'JetBrains Mono',monospace;white-space:nowrap;flex-shrink:0}
    pre{margin:0;padding:20px;overflow-x:auto;-webkit-overflow-scrolling:touch;font-family:'JetBrains Mono',monospace;font-size:13px;line-height:1.7;color:#e2e8f0;width:100%;box-sizing:border-box;max-width:100%}
    @media(max-width:640px){.header{padding:8px 12px;}.filename{font-size:11px;}.lang{font-size:10px;}pre{padding:10px 8px;font-size:12px;line-height:1.6;}}
  \`;
  render(){return html\`<div class="wrap">\${(this.filename||this.language)?html\`<div class="header"><span class="filename">\${this.filename||''}</span><span class="lang">\${this.language||''}</span></div>\`:nothing}<pre><slot></slot></pre></div>\`;}
}
customElements.define('wc-code-block',WcCodeBlock);

// ── WC-CARD ────────────────────────────────────────────────────────────────
class WcCard extends LitElement {
  static properties = { title:{type:String}, href:{type:String} };
  static styles = css\`
    :host{display:block}
    .card{display:block;background:#111;border:1px solid #2a2a2a;border-radius:12px;padding:24px;text-decoration:none;color:inherit;transition:all .2s}
    .card:hover{border-color:#444;transform:translateY(-2px)}
    .title{font-family:'Inter',sans-serif;font-size:16px;font-weight:700;color:#f0f0f0;margin-bottom:8px}
    .body{font-size:14px;color:#a0a0a0;line-height:1.6}
    @media(max-width:640px){.card{padding:16px;}.title{font-size:15px;}.body{font-size:13px;}}
  \`;
  render(){return html\`<a class="card" href="\${this.href||'#'}">\${this.title?html\`<div class="title">\${this.title}</div>\`:nothing}<div class="body"><slot></slot></div></a>\`;}
}
customElements.define('wc-card',WcCard);

// ── WC-TABS ────────────────────────────────────────────────────────────────
class WcTabs extends LitElement {
  static properties = { _active:{type:Number,state:true} };
  static styles = css\`
    :host{display:block;margin:16px 0;min-width:0}
    .tabbar{display:flex;border-bottom:1px solid #2a2a2a;gap:0;margin-bottom:20px;overflow-x:auto;-webkit-overflow-scrolling:touch;min-width:0}
    button{background:none;border:none;border-bottom:2px solid transparent;padding:10px 18px;font-family:'Inter',sans-serif;font-size:14px;font-weight:500;color:#666;cursor:pointer;margin-bottom:-1px;transition:all .15s;white-space:nowrap;flex-shrink:0}
    button.active{color:#4f98a3;border-bottom-color:#01696f}
    button:hover{color:#a0a0a0}
    .panel{display:none;min-width:0;overflow:hidden} .panel.active{display:block}
    ::slotted(*){max-width:100%;overflow-x:auto}
    @media(max-width:640px){button{padding:8px 12px;font-size:12px;margin-bottom:0;border-bottom-width:3px;}}
  \`;
  constructor(){super();this._active=0;}
  render(){
    const tabs=Array.from(this.querySelectorAll('wc-tab'));
    return html\`<div class="tabbar">\${tabs.map((t,i)=>html\`<button class="\${i===this._active?'active':''}" @click=\${()=>this._active=i}>\${t.label||'Tab '+(i+1)}</button>\`)}</div>\${tabs.map((t,i)=>html\`<div class="panel \${i===this._active?'active':''}">\${t.innerHTML}</div>\`)}\`;
  }
}
customElements.define('wc-tabs',WcTabs);
class WcTab extends LitElement { static properties={label:{type:String}}; static styles=css\`:host{display:none}\`; render(){return html\`<slot></slot>\`;} }
customElements.define('wc-tab',WcTab);

// ── WC-ACCORDION ───────────────────────────────────────────────────────────
class WcAccordion extends LitElement {
  static properties = { title:{type:String}, _open:{type:Boolean,state:true} };
  static styles = css\`
    :host{display:block;margin:8px 0;min-width:0}
    .wrap{border:1px solid #2a2a2a;border-radius:10px;overflow:hidden;min-width:0}
    .hdr{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;background:#161616;cursor:pointer;user-select:none;font-family:'Inter',sans-serif;font-size:15px;font-weight:600;color:#e2e8f0;gap:12px;min-width:0}
    .body{padding:16px 18px;background:#111;font-family:'Inter',sans-serif;font-size:14px;color:#a0a0a0;line-height:1.7;min-width:0;overflow:hidden}
    .chevron{transition:transform .2s;color:#666;font-size:12px;flex-shrink:0}
    .chevron.open{transform:rotate(180deg)}
    ::slotted(*){max-width:100%;overflow-x:auto}
    @media(max-width:640px){.hdr{padding:12px 14px;font-size:14px;}.body{padding:12px 14px;font-size:13px;}}
  \`;
  render(){return html\`<div class="wrap"><div class="hdr" @click=\${()=>this._open=!this._open}><span>\${this.title}</span><span class="chevron \${this._open?'open':''}">▼</span></div>\${this._open?html\`<div class="body"><slot></slot></div>\`:nothing}</div>\`;}
}
customElements.define('wc-accordion',WcAccordion);

// ── WC-STEPS / WC-STEP ────────────────────────────────────────────────────
class WcSteps extends LitElement { static styles=css\`:host{display:block;margin:16px 0;counter-reset:wc-step}\`; render(){return html\`<slot></slot>\`;} }
customElements.define('wc-steps',WcSteps);
class WcStep extends LitElement {
  static properties={title:{type:String},n:{type:Number}};
  static styles=css\`
    :host{display:block;padding-left:52px;position:relative;margin-bottom:24px;width:100%;box-sizing:border-box}
    .num{position:absolute;left:0;top:2px;width:32px;height:32px;border-radius:50%;background:#01696f;color:#fff;font-family:'Inter',sans-serif;font-size:14px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;counter-increment:wc-step}
    .title{font-family:'Inter',sans-serif;font-size:16px;font-weight:700;color:#e2e8f0;margin-bottom:6px;word-break:break-word}
    .body{font-family:'Inter',sans-serif;font-size:14px;color:#a0a0a0;line-height:1.7;width:100%;box-sizing:border-box;display:block;overflow:hidden;overflow-x:auto;-webkit-overflow-scrolling:touch}
    ::slotted(*){max-width:100% !important}
    ::slotted(pre){display:block !important;width:100% !important;box-sizing:border-box !important}
    ::slotted(div){width:100% !important;box-sizing:border-box !important}
    @media(max-width:640px){:host{padding-left:44px;margin-bottom:18px}.num{width:28px;height:28px;font-size:12px;top:1px;}.title{font-size:14px;margin-bottom:4px;color:#f5f5f5;font-weight:800;}.body{font-size:13px;}}
  \`;
  render(){
    let num=this.n;
    if(num===undefined){const parent=this.parentElement;if(parent){const siblings=Array.from(parent.children).filter(el=>el.tagName==='WC-STEP');num=siblings.indexOf(this)+1;}}
    return html\`<div class="num">\${num||''}</div>\${this.title?html\`<div class="title">\${this.title}</div>\`:nothing}<div class="body"><slot></slot></div>\`;
  }
}
customElements.define('wc-step',WcStep);

// ── WC-PAGE-META ──────────────────────────────────────────────────────────
class WcPageMeta extends LitElement {
  static properties={tag:{type:String},component:{type:String},readtime:{type:String},lastmod:{type:String,attribute:'updated'}};
  static styles=css\`
    :host{display:block}
    .meta{display:flex;flex-wrap:wrap;align-items:center;gap:16px;padding:0 0 28px;font-family:'Inter',sans-serif;font-size:13px;border-bottom:1px solid #2a2a2a;margin-bottom:28px;color:#666}
    .sep{color:#444;user-select:none}
    @media(max-width:640px){.meta{gap:8px;font-size:12px;padding:0 0 20px;margin-bottom:20px;}}
  \`;
  render(){
    const p=[];
    if(this.tag)p.push(html\`<span>\${this.tag}</span>\`);
    if(this.component){p.push(html\`<span class="sep">•</span>\`);p.push(html\`<span>\${this.component}</span>\`);}
    if(this.readtime){p.push(html\`<span class="sep">•</span>\`);p.push(html\`<span>\${this.readtime}</span>\`);}
    if(this.lastmod){p.push(html\`<span class="sep">•</span>\`);p.push(html\`<span>Updated \${this.lastmod}</span>\`);}
    return p.length?html\`<div class="meta">\${p}</div>\`:html\`\`;
  }
}
customElements.define('wc-page-meta',WcPageMeta);

console.log('✅ DocsLit: 9 core web components registered');
`;
}
