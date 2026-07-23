import { createRequire } from 'node:module';
import { buildComponents } from './components/index.js';
import { findGroupForPage, toLabel } from './sidebar.js';
import { getAnnouncement, hashAnnouncementMessage } from './config.js';
import { renderMarkdown } from './unified.js';
import { resolveSiteThemeSync, buildThemeCss, buildHtmlTag } from './themes.js';
import { buildAgentDirectiveHtml } from './agent-docs.js';
import {
  normalizeBasePath,
  withBasePath,
  buildAnalyticsSnippet,
  buildCustomHead,
  buildNavbarLinksHtml,
  buildFooterHtml,
  faviconLinks,
} from './site-config.js';
import { buildLocaleSwitcherHtml, buildHreflangTags, getI18nConfig } from './i18n.js';

const require = createRequire(import.meta.url);

// ── Minification helpers ──────────────────────────────────────────────────
// Used by build.js (default on) but bypassed by tests and dev mode so the
// served output stays readable for debugging. esbuild is loaded lazily via
// createRequire so dev/npx installs without esbuild still work; transformSync
// keeps these calls synchronous so renderShell/renderPage don't need to go async.
function _getEsbuild() {
  return require('esbuild');
}

export function isEsbuildAvailable() {
  try {
    _getEsbuild();
    return true;
  } catch {
    return false;
  }
}

function _minifyJS(code) {
  try {
    const esbuild = _getEsbuild();
    return esbuild.transformSync(code, { loader: 'js', minify: true, legalComments: 'none' }).code;
  } catch { return code; }
}
function _minifyCSS(code) {
  try {
    const esbuild = _getEsbuild();
    return esbuild.transformSync(code, { loader: 'css', minify: true }).code;
  } catch { return code; }
}

export async function renderShell({ config, siteTheme = null, mode = 'dev', port = 3000, out = 'dist', pagesData = null, offline = false, draftPageIds = [], versionConfig = null, currentVersion = null, searchIndex = null, minify = false, specData = null, apiMeta = null, vendorData = null, pdfManifest = null, locale = null, titleMap = null }) {
  const siteTitle = config.name || 'DocsLit';
  const basePath = normalizeBasePath(config.basePath);
  const logoSrc = config.logo
    ? withBasePath(basePath, config.logo.startsWith('/') ? config.logo : '/' + config.logo)
    : withBasePath(basePath, '/favicon-32x32.png');
  const isHybrid = specData && (config.sidebar || []).length > 0;
  const i18n = getI18nConfig(config);
  const currentLocale = locale || i18n.defaultLocale;
  const chrome = buildSiteChrome(config, { basePath, offline, locale: currentLocale, pageId: '' });

  let apiSidebarHtml = null;
  let hybridLinks = null;
  let sidebarHtml;

  if (isHybrid) {
    const firstApiPage = getFirstApiPageId(specData);
    const firstDocPage = getFirstDocPageId(config);
    sidebarHtml = buildSidebarHtml(config, draftPageIds, null, 'api/', offline, titleMap)
      + (firstApiPage ? buildSidebarModeLink(firstApiPage, 'API Reference', _apiIcon, offline) : '');
    apiSidebarHtml = buildApiSidebarHtml(specData, null, apiMeta, offline)
      + (firstDocPage ? buildSidebarModeLink(firstDocPage, 'Documentation', _docsIcon, offline) : '');
    hybridLinks = firstApiPage && firstDocPage ? { apiPage: firstApiPage, docsPage: firstDocPage, initialMode: 'docs' } : null;
  } else {
    sidebarHtml = buildSidebarHtml(config, draftPageIds, null, null, offline, titleMap);
  }

  const versionScript = versionConfig
    ? `<script>window.__DOCSLIT_VERSIONS__ = ${JSON.stringify({ current: currentVersion, default: versionConfig.default, list: versionConfig.list })};</script>`
    : '';
  const editUrlScript = config.editUrl
    ? `<script>window.__DOCSLIT_EDIT_URL__ = ${JSON.stringify(config.editUrl)};</script>`
    : '';
  const basePathScript = `<script>window.__DOCSLIT_BASE_PATH__=${JSON.stringify(basePath)};window.__DOCSLIT_LOCALE__=${JSON.stringify(currentLocale)};</script>`;
  const playgroundScript = config.playground?.proxyUrl
    ? `<script>window.__DOCSLIT_PLAYGROUND_PROXY__=${JSON.stringify(config.playground.proxyUrl)};</script>`
    : '';
  const siteUrlScript = config.url
    ? `<script>window.__DOCSLIT_SITE_URL__=${JSON.stringify(config.url.replace(/\/$/, ''))};</script>`
    : '';
  const versionSelectorHtml = versionConfig ? buildVersionSelector(versionConfig, currentVersion, offline) : '';
  const importMap = buildImportMap(mode, vendorData);
  const announcementChrome = await buildAnnouncementChrome({ config, versionConfig, currentVersion, offline });
  const resolvedTheme = siteTheme ?? resolveSiteThemeSync(config);
  const htmlTag = buildHtmlTag(resolvedTheme, currentLocale);

  if (offline) {
    const offlineStyles = minify
      ? `<style>${_minifyCSS(buildStyles(resolvedTheme).replace(/^<style>\n?/, '').replace(/<\/style>$/, ''))}</style>`
      : buildStyles(resolvedTheme);
    const offlineComponents = minify ? _minifyJS(buildComponents()) : buildComponents();
    const offlineLoaderScript = buildOfflineLoader();
    const offlineApp = minify
      ? _minifyJS(buildAppScript('static', offlineLoaderScript, '', true))
      : buildAppScript('static', offlineLoaderScript, '', true);

    return `<!DOCTYPE html>
${htmlTag}
<head>
  <meta charset="UTF-8" />
  ${buildThemeInit()}
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="description" content="${escHtml(config.description || siteTitle)}">
  ${chrome.favicon}
  <title>${siteTitle} — DocsLit</title>
  ${announcementChrome.head}
  ${chrome.head}
  ${offlineStyles}
  ${chrome.cssLink}
</head>
<body>
${announcementChrome.html}
${buildNavHtml(siteTitle, versionSelectorHtml, hybridLinks, offline, logoSrc, { navbarLinks: chrome.navbarLinks, localeSwitcher: chrome.localeSwitcher, basePath })}
${buildSearchOverlayHtml(offline)}
<div class="sidebar-overlay" id="sidebar-overlay"></div>

${buildMainLayoutHtml(sidebarHtml, siteTitle, '<div class="loading-state">Loading…</div>', 'Loading…', false, apiSidebarHtml, offline)}
${chrome.footer}

${versionScript}
${editUrlScript}
${basePathScript}
${playgroundScript}
${siteUrlScript}
${announcementChrome.hashScript}
<script type="importmap">${importMap}</script>
<script type="module">
${offlineComponents}
</script>
<script>
${offlineApp}
</script>
</body>
</html>`;
  }

  const wsScript = mode === 'dev' ? buildWsScript(port) : '';
  const loaderScript = mode === 'dev' ? buildDevLoader() : buildStaticLoader();

  const stylesBlock = minify
    ? `<style>${_minifyCSS(buildStyles(resolvedTheme).replace(/^<style>\n?/, '').replace(/<\/style>$/, ''))}</style>`
    : buildStyles(resolvedTheme);
  const componentsBlock = minify ? _minifyJS(buildComponents()) : buildComponents();
  const appBlock = minify
    ? _minifyJS(buildAppScript(mode, loaderScript, wsScript, false))
    : buildAppScript(mode, loaderScript, wsScript, false);

  return `<!DOCTYPE html>
${htmlTag}
<head>
  <meta charset="UTF-8" />
  ${buildThemeInit()}
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="description" content="${escHtml(config.description || siteTitle)}">
  ${chrome.favicon}
  <title>${siteTitle} — DocsLit</title>
  ${announcementChrome.head}
  ${chrome.head}
  ${chrome.analytics}
  ${buildFontLinks()}
  ${stylesBlock}
  ${chrome.cssLink}
</head>
<body>
${announcementChrome.html}
${buildNavHtml(siteTitle, versionSelectorHtml, hybridLinks, false, logoSrc, { navbarLinks: chrome.navbarLinks, localeSwitcher: chrome.localeSwitcher, basePath })}
${buildSearchOverlayHtml()}
<div class="sidebar-overlay" id="sidebar-overlay"></div>

${buildMainLayoutHtml(sidebarHtml, siteTitle, '<div class="loading-state">Loading…</div>', 'Loading…', false, apiSidebarHtml)}
${chrome.footer}

${versionScript}
${editUrlScript}
${basePathScript}
${playgroundScript}
${siteUrlScript}
${announcementChrome.hashScript}
${pdfManifest ? `<script>window.__DOCSLIT_PDF__ = ${JSON.stringify(pdfManifest)};</script>\n` : ''}
<script type="importmap">${importMap}</script>
<script type="module">
${componentsBlock}
</script>
<script>
${appBlock}
</script>
</body>
</html>`;
}

export async function renderPage({ config, siteTheme = null, id, meta, html, draftPageIds = [], versionConfig = null, currentVersion = null, specData = null, apiMeta = null, pdfManifest = null, locale = null, ogImagePath = null, titleMap = null }) {
  const basePath = normalizeBasePath(config.basePath);
  const i18n = getI18nConfig(config);
  const currentLocale = locale || i18n.defaultLocale;
  const isHybridEarly = specData && (config.sidebar || []).length > 0;
  const sidebarHtml = buildSidebarHtml(config, draftPageIds, id, isHybridEarly ? 'api/' : null, false, titleMap);
  const siteTitle = config.name || 'DocsLit';
  const logoSrc = config.logo
    ? withBasePath(basePath, config.logo.startsWith('/') ? config.logo : '/' + config.logo)
    : withBasePath(basePath, '/favicon-32x32.png');
  const versionSelectorHtml = versionConfig ? buildVersionSelector(versionConfig, currentVersion) : '';
  const importMap = buildImportMap('static');
  const versionScript = versionConfig
    ? `<script>window.__DOCSLIT_VERSIONS__ = ${JSON.stringify({ current: currentVersion, default: versionConfig.default, list: versionConfig.list })};</script>`
    : '';
  const editUrlScript = config.editUrl
    ? `<script>window.__DOCSLIT_EDIT_URL__ = ${JSON.stringify(config.editUrl)};</script>`
    : '';
  const basePathScript = `<script>window.__DOCSLIT_BASE_PATH__=${JSON.stringify(basePath)};window.__DOCSLIT_LOCALE__=${JSON.stringify(currentLocale)};</script>`;
  const playgroundScript = config.playground?.proxyUrl
    ? `<script>window.__DOCSLIT_PLAYGROUND_PROXY__=${JSON.stringify(config.playground.proxyUrl)};</script>`
    : '';
  const siteUrlScript = config.url
    ? `<script>window.__DOCSLIT_SITE_URL__=${JSON.stringify(config.url.replace(/\/$/, ''))};</script>`
    : '';

  const pageTitle = meta.title || toLabel(id);
  const desc = meta.description || meta.desc || config.description || '';
  const baseUrl = (config.url || '').replace(/\/$/, '');
  const localePrefix = currentLocale !== i18n.defaultLocale ? `/${currentLocale}` : '';
  const versionPrefix = currentVersion ? `/${currentVersion}` : '';
  const pathPrefix = `${basePath}${localePrefix}${versionPrefix}`;
  const canonicalUrl = baseUrl ? `${baseUrl}${pathPrefix}/${id}` : '';

  const depth = id.split('/').length - 1;
  const assetPrefix = '../'.repeat(depth);
  const chrome = buildSiteChrome(config, { basePath, locale: currentLocale, pageId: id, assetPrefix });

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
  const ogEnabled = config.ogImage !== false && meta.ogImage !== false;
  if (ogEnabled && ogImagePath && baseUrl) {
    const ogUrl = `${baseUrl}${pathPrefix}/${ogImagePath}`;
    seoTags += `\n  <meta property="og:image" content="${escHtml(ogUrl)}">`;
    seoTags += `\n  <meta name="twitter:card" content="summary_large_image">`;
    seoTags += `\n  <meta name="twitter:image" content="${escHtml(ogUrl)}">`;
  } else {
    seoTags += `\n  <meta name="twitter:card" content="summary">`;
  }
  seoTags += `\n  <meta name="twitter:title" content="${escHtml(pageTitle)}">`;
  if (desc) seoTags += `\n  <meta name="twitter:description" content="${escHtml(desc)}">`;
  if (chrome.hreflang) seoTags += `\n  ${chrome.hreflang}`;

  const jsonLd = { '@context': 'https://schema.org', '@type': 'TechArticle', headline: pageTitle, name: pageTitle, isPartOf: { '@type': 'WebSite', name: siteTitle } };
  if (desc) jsonLd.description = desc;
  if (canonicalUrl) jsonLd.url = canonicalUrl;
  if (baseUrl) jsonLd.isPartOf.url = baseUrl;

  const groupName = findGroupForPage(config.sidebar || [], id);
  const breadcrumbText = groupName ? `${escHtml(groupName)} › ${escHtml(pageTitle)}` : escHtml(pageTitle);
  const isApiPage = id.startsWith('api/') || meta.layout === 'api';
  const apiClass = isApiPage ? ' api-layout' : '';
  const isHybrid = specData && (config.sidebar || []).length > 0;

  let docsSidebarHtml = sidebarHtml;
  let apiSidebarHtml = null;
  let hybridLinks = null;

  if (isHybrid) {
    const firstApiPage = getFirstApiPageId(specData);
    const firstDocPage = getFirstDocPageId(config);
    apiSidebarHtml = buildApiSidebarHtml(specData, isApiPage ? id : null, apiMeta)
      + (firstDocPage ? buildSidebarModeLink(firstDocPage, 'Documentation', _docsIcon) : '');
    docsSidebarHtml += firstApiPage ? buildSidebarModeLink(firstApiPage, 'API Reference', _apiIcon) : '';
    hybridLinks = firstApiPage && firstDocPage ? { apiPage: firstApiPage, docsPage: firstDocPage, initialMode: isApiPage ? 'api' : 'docs' } : null;
  } else if (isApiPage && specData) {
    docsSidebarHtml = buildApiSidebarHtml(specData, id, apiMeta);
    apiSidebarHtml = null;
  }

  const announcementChrome = await buildAnnouncementChrome({ config, versionConfig, currentVersion });
  const resolvedTheme = siteTheme ?? resolveSiteThemeSync(config);
  const htmlTag = buildHtmlTag(resolvedTheme, currentLocale);
  const agentDirective = buildAgentDirectiveHtml(config, currentVersion);
  const siteUrl = (config.url || '').replace(/\/$/, '');
  const pageContent = html.replace(/<\/h1>/, '</h1>' + injectPageMeta(meta, id, pdfManifest, assetPrefix, siteUrl, basePath));

  return `<!DOCTYPE html>
${htmlTag}
<head>
  <meta charset="UTF-8" />
  ${buildThemeInit()}
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  ${chrome.favicon}
  <title>${escHtml(pageTitle)} — ${escHtml(siteTitle)}</title>${seoTags}
  ${announcementChrome.head}
  ${chrome.head}
  ${chrome.analytics}
  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
  ${buildFontLinks()}
  <link rel="stylesheet" href="${assetPrefix}docslit.css">
  ${chrome.cssLink}
</head>
<body class="${apiClass.trim()}">
${agentDirective}
${announcementChrome.html}
${buildNavHtml(siteTitle, versionSelectorHtml, hybridLinks, false, logoSrc, { navbarLinks: chrome.navbarLinks, localeSwitcher: chrome.localeSwitcher, basePath })}
${buildSearchOverlayHtml()}
<div class="sidebar-overlay" id="sidebar-overlay"></div>

${buildMainLayoutHtml(docsSidebarHtml, siteTitle, pageContent, breadcrumbText, isApiPage, apiSidebarHtml)}
${chrome.footer}

${versionScript}
${editUrlScript}
${basePathScript}
${playgroundScript}
${siteUrlScript}
${announcementChrome.hashScript}
${pdfManifest ? `<script>window.__DOCSLIT_PDF__ = ${JSON.stringify(pdfManifest)};</script>\n` : ''}
<script>window.__DOCSLIT_PAGE_ID__ = ${JSON.stringify(id)};</script>
<script type="importmap">${importMap}</script>
<script type="module" src="${assetPrefix}docslit.js"></script>
<script defer src="${assetPrefix}docslit-app.js"></script>
</body>
</html>`;
}

export function buildStylesFile({ minify = false, siteTheme = null } = {}) {
  const resolved = siteTheme ?? resolveSiteThemeSync(null);
  const raw = buildStyles(resolved).replace(/^<style>\n?/, '').replace(/<\/style>$/, '');
  return minify ? _minifyCSS(raw) : raw;
}

export function buildComponentsFile(mode = 'static', { minify = false } = {}) {
  const raw = buildComponents();
  return minify ? _minifyJS(raw) : raw;
}

export function buildAppFile(mode = 'static', { minify = false } = {}) {
  const loaderScript = mode === 'dev' ? buildDevLoader() : buildStaticLoader();
  const wsScript = mode === 'dev' ? buildWsScript(3000) : '';
  const raw = buildAppScript(mode, loaderScript, wsScript);
  return minify ? _minifyJS(raw) : raw;
}

export function buildOfflineThemeInitFile({ minify = false } = {}) {
  const raw = buildThemeInitCode() + buildA11yInitCode();
  return minify ? _minifyJS(raw) : raw;
}

export function buildOfflineAppFile({ minify = false } = {}) {
  const loaderScript = buildOfflineLoader();
  const raw = buildAppScript('static', loaderScript, '', true);
  return minify ? _minifyJS(raw) : raw;
}

export function buildImportMap(mode, vendorData = null) {
  if (mode === 'dev') return `{"imports":{"lit":"/vendor/lit.js","lit/decorators.js":"/vendor/lit-decorators.js","lit/directives/unsafe-html.js":"/vendor/lit-unsafe-html.js","@lit/reactive-element":"/vendor/reactive-element.js","lit-html":"/vendor/lit-html.js","lit-element/lit-element.js":"/vendor/lit-element.js"}}`;
  if (vendorData) {
    const imports = {};
    for (const [key, content] of Object.entries(vendorData)) {
      imports[key] = 'data:text/javascript;base64,' + Buffer.from(content).toString('base64');
    }
    return JSON.stringify({ imports });
  }
  return `{"imports":{"lit":"https://esm.sh/lit@3","lit/decorators.js":"https://esm.sh/lit@3/decorators","lit/directives/unsafe-html.js":"https://esm.sh/lit@3/directives/unsafe-html.js","@lit/reactive-element":"https://esm.sh/@lit/reactive-element@2","lit-html":"https://esm.sh/lit-html@3","lit-element/lit-element.js":"https://esm.sh/lit-element@4/lit-element.js"}}`;
}

function buildThemeInitCode() {
  return `(function(){
      var s=localStorage.getItem('docslit-theme')||'system';
      var h=document.documentElement;
      function a(m){
        h.classList.remove('light','dark');
        if(m==='light')h.classList.add('light');
        else if(m==='dark')h.classList.add('dark');
        else if(window.matchMedia('(prefers-color-scheme:dark)').matches)h.classList.add('dark');
      }
      a(s);window.__themeMode=s;
      window.matchMedia('(prefers-color-scheme:dark)').addEventListener('change',function(){if((localStorage.getItem('docslit-theme')||'system')==='system')a('system');});
    })();`;
}

function buildA11yInitCode() {
  return `(function(){
      var h=document.documentElement;
      var ts=parseInt(localStorage.getItem('docslit-a11y-textsize'))||0;
      if(ts){h.classList.add('a11y-text-'+(ts>0?'p':'m')+Math.abs(ts));}
      if(localStorage.getItem('docslit-a11y-contrast')==='1')h.classList.add('a11y-contrast');
      if(localStorage.getItem('docslit-a11y-grayscale')==='1')h.classList.add('a11y-grayscale');
      if(localStorage.getItem('docslit-a11y-underline')==='1')h.classList.add('a11y-underline');
    })();`;
}

function buildThemeInit() {
  return `<script>${buildThemeInitCode()}${buildA11yInitCode()}</script>`;
}

function buildFontLinks(offline = false) {
  if (offline) return '';
  return `<link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">`;
}

async function buildAnnouncementChrome({ config, versionConfig, currentVersion, offline = false }) {
  const announcement = getAnnouncement(config, currentVersion, versionConfig);
  if (!announcement) {
    return { head: '', html: '', hashScript: '' };
  }

  const hash = hashAnnouncementMessage(announcement.message);
  const messageHtml = (await renderMarkdown(
    announcement.message,
    [],
    currentVersion ? { versionSlug: currentVersion } : {},
  )).trim();
  const type = escHtml(announcement.type || 'neutral');
  const dismissible = announcement.dismissible !== false;
  const dismissBtn = dismissible
    ? `<button class="announcement-dismiss" type="button" aria-label="Dismiss announcement"${offline ? '' : ' onclick="dismissAnnouncement()"'}>✕</button>`
    : '';

  const head = `<script>(function(){try{if(localStorage.getItem('docslit-announcement')===${JSON.stringify(hash)})document.documentElement.classList.add('announcement-dismissed');}catch(e){}})();</script>`;
  const html = `<div class="announcement-banner announcement-${type}" id="announcement-banner" role="region" aria-label="Announcement"><div class="announcement-inner">${messageHtml}</div>${dismissBtn}</div>`;
  const hashScript = `<script>window.__DOCSLIT_ANNOUNCEMENT_HASH__=${JSON.stringify(hash)};</script>`;

  return { head, html, hashScript };
}

function buildAnnouncementRuntime() {
  return `
(function(){
  if (!window.__DOCSLIT_ANNOUNCEMENT_HASH__) return;
  var hash = window.__DOCSLIT_ANNOUNCEMENT_HASH__;
  function syncAnnouncementLayout() {
    var el = document.getElementById('announcement-banner');
    var h = el && !document.documentElement.classList.contains('announcement-dismissed') ? el.offsetHeight : 0;
    document.documentElement.style.setProperty('--announcement-h', h + 'px');
  }
  window.dismissAnnouncement = function() {
    try { localStorage.setItem('docslit-announcement', hash); } catch(e) {}
    document.documentElement.classList.add('announcement-dismissed');
    syncAnnouncementLayout();
  };
  syncAnnouncementLayout();
  window.addEventListener('resize', syncAnnouncementLayout);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(syncAnnouncementLayout);
})();`;
}

function buildSiteChrome(config, { basePath = '', offline = false, locale = 'en', pageId = '', assetPrefix = '' } = {}) {
  const i18n = getI18nConfig(config);
  let cssLink = '';
  if (config.css) {
    const cssHref = assetPrefix
      ? assetPrefix + String(config.css).replace(/^\//, '')
      : withBasePath(basePath, '/' + String(config.css).replace(/^\//, ''));
    cssLink = `<link rel="stylesheet" href="${escHtml(cssHref)}">`;
  }
  return {
    favicon: faviconLinks(config, assetPrefix || (basePath ? basePath.replace(/\/?$/, '/') : '')),
    head: buildCustomHead(config.head),
    analytics: offline ? '' : buildAnalyticsSnippet(config.analytics),
    cssLink,
    navbarLinks: buildNavbarLinksHtml(config.navbar, basePath, offline),
    footer: buildFooterHtml(config.footer, basePath),
    localeSwitcher: buildLocaleSwitcherHtml({ i18n, currentLocale: locale, basePath, pageId, offline }),
    hreflang: pageId ? buildHreflangTags({ i18n, config, pageId, basePath }) : '',
  };
}

function buildNavHtml(siteTitle, versionSelectorHtml, hybridLinks = null, offline = false, logoSrc = '/favicon-32x32.png', extra = {}) {
  const { navbarLinks = '', localeSwitcher = '', basePath = '' } = extra;
  const homeHref = basePath || '/';
  let modeLinksHtml = '';
  if (hybridLinks) {
    const showApi = hybridLinks.initialMode !== 'api' ? '' : ' style="display:none"';
    const showDocs = hybridLinks.initialMode === 'api' ? '' : ' style="display:none"';
    const modeClick = offline ? '' : ` onclick="loadPage('${escHtml(hybridLinks.apiPage)}');return false;"`;
    const modeClick2 = offline ? '' : ` onclick="loadPage('${escHtml(hybridLinks.docsPage)}');return false;"`;
    modeLinksHtml = `<a id="nav-api-link" class="nav-mode-link" href="${escHtml(hybridLinks.apiPage)}"${modeClick}${showApi}>API Reference</a>` +
      `<a id="nav-docs-link" class="nav-mode-link" href="${escHtml(hybridLinks.docsPage)}"${modeClick2}${showDocs}>Documentation</a>`;
  }
  const searchClick = offline ? '' : ' onclick="openSearch()"';
  const themeClick = offline ? '' : ' onclick="toggleTheme()"';
  return `<a class="skip-link" href="#docs-content">Skip to content</a>
<nav class="nav">
  <div class="nav-left">
    <button class="nav-menu-btn" id="nav-menu-btn" aria-label="Open navigation" aria-expanded="false">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
    </button>
    <a class="nav-logo" href="${escHtml(homeHref)}">
      <img class="nav-logo-icon" src="${escHtml(logoSrc)}" alt="${siteTitle}">
      <span class="nav-logo-text">${siteTitle}</span>
    </a>
  </div>
  <div class="nav-links">
    ${modeLinksHtml}
    ${navbarLinks}
    <button class="search-trigger"${searchClick} id="search-trigger" title="Search (⌘K)">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg>
      <span class="search-trigger-text">Search…</span>
      <span class="search-trigger-kbd"><kbd>⌘</kbd><kbd>K</kbd></span>
    </button>
    ${localeSwitcher}
    ${versionSelectorHtml}
    <button class="a11y-btn" id="a11y-btn"${offline ? '' : ' onclick="toggleA11yPanel()"'} aria-label="Accessibility settings">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="4" r="2"/><path d="M4 8l4.5 1.5M19.5 8L15 9.5"/><path d="M8.5 9.5L12 12l3.5-2.5"/><path d="M12 12v4"/><path d="M9 20l3-4 3 4"/></svg>
    </button>
    <button class="theme-btn" id="theme-btn"${themeClick} aria-label="Toggle theme"></button>
  </div>
</nav>
<div class="a11y-panel" id="a11y-panel" role="dialog" aria-label="Accessibility settings">
  <div class="a11y-header">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="4" r="2"/><path d="M4 8l4.5 1.5M19.5 8L15 9.5"/><path d="M8.5 9.5L12 12l3.5-2.5"/><path d="M12 12v4"/><path d="M9 20l3-4 3 4"/></svg>
    <span class="a11y-title">Accessibility</span>
    <button class="a11y-close"${offline ? '' : ' onclick="closeA11yPanel()"'} aria-label="Close accessibility settings">&times;</button>
  </div>
  <div class="a11y-row">
    <span class="a11y-row-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><text x="6" y="18" font-size="16" fill="currentColor" stroke="none" font-weight="600" font-family="serif">T</text></svg></span>
    <span class="a11y-row-label">Text Size</span>
    <div class="a11y-size-controls">
      <button class="a11y-size-btn"${offline ? '' : ' onclick="a11yTextSize(-1)"'} aria-label="Decrease text size">&minus;</button>
      <span class="a11y-size-value" id="a11y-size-value">0</span>
      <button class="a11y-size-btn"${offline ? '' : ' onclick="a11yTextSize(1)"'} aria-label="Increase text size">+</button>
    </div>
  </div>
  <div class="a11y-row a11y-toggle-row" data-a11y="contrast"${offline ? '' : ' onclick="a11yToggle(\'contrast\')"'}>
    <span class="a11y-row-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 0 20z" fill="currentColor"/></svg></span>
    <span class="a11y-row-label">High Contrast</span>
    <span class="a11y-toggle-label" id="a11y-contrast-label">Off</span>
  </div>
  <div class="a11y-row a11y-toggle-row" data-a11y="grayscale"${offline ? '' : ' onclick="a11yToggle(\'grayscale\')"'}>
    <span class="a11y-row-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="10"/></svg></span>
    <span class="a11y-row-label">Grayscale</span>
    <span class="a11y-toggle-label" id="a11y-grayscale-label">Off</span>
  </div>
  <div class="a11y-row a11y-toggle-row" data-a11y="underline"${offline ? '' : ' onclick="a11yToggle(\'underline\')"'}>
    <span class="a11y-row-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 3v7a6 6 0 0 0 12 0V3"/><line x1="4" y1="21" x2="20" y2="21"/></svg></span>
    <span class="a11y-row-label">Underline Links</span>
    <span class="a11y-toggle-label" id="a11y-underline-label">Off</span>
  </div>
  <button class="a11y-reset"${offline ? '' : ' onclick="a11yReset()"'}>
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
    Reset Settings
  </button>
</div>`;
}

function buildSearchOverlayHtml(offline = false) {
  const overlayClick = offline ? '' : ' onclick="handleOverlayClick(event)"';
  const inputHandlers = offline ? '' : ' oninput="handleSearchInput(this.value)" onkeydown="handleSearchKey(event)"';
  return `<div class="search-overlay" id="search-overlay"${overlayClick}>
  <div class="search-modal" role="dialog" aria-modal="true" aria-label="Search documentation">
    <div class="search-input-wrap">
      <svg class="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg>
      <input class="search-input" id="search-input" type="text" placeholder="Search docs…" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="true" aria-controls="search-results" aria-activedescendant=""${inputHandlers}>
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

function buildMainLayoutHtml(sidebarHtml, siteTitle, contentHtml, breadcrumbText, isApiPage = false, apiSidebarHtml = null, offline = false) {
  const examplesPanel = '\n        <div class="docs-examples" id="docs-examples"></div>';
  let sidebarContent;
  if (apiSidebarHtml) {
    const docsDisplay = isApiPage ? ' style="display:none"' : '';
    const apiDisplay = isApiPage ? '' : ' style="display:none"';
    sidebarContent = `<div id="sidebar-docs"${docsDisplay}>${sidebarHtml}</div><div id="sidebar-api"${apiDisplay}>${apiSidebarHtml}</div>`;
  } else {
    sidebarContent = sidebarHtml;
  }
  const filterHandlers = offline ? '' : ' oninput="_filterSidebar(this.value)" onkeydown="_filterKey(event)"';
  const clearClick = offline ? '' : ' onclick="_clearSidebarFilter()"';
  return `<div class="docs-page">
  <div class="docs-layout">
    <aside class="docs-sidebar" id="docs-sidebar">
      <div class="sidebar-filter-wrap">
        <svg class="sidebar-filter-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg>
        <input class="sidebar-filter" id="sidebar-filter" type="text" placeholder="Filter pages…" autocomplete="off" spellcheck="false"${filterHandlers}>
        <button class="sidebar-filter-clear" id="sidebar-filter-clear"${clearClick} aria-label="Clear filter">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>
      <nav class="sidebar-scroll" id="sidebar-scroll" aria-label="Documentation pages">
      ${sidebarContent}
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
        <div class="docs-toc" id="docs-toc"></div>${examplesPanel}
      </div>
    </div>
  </div>
</div>`;
}

function buildEventDelegation() {
  return `
// ── EVENT DELEGATION (offline CSP-safe) ──────────────────────────────────
(function() {
  var sidebar = document.getElementById('sidebar-scroll');
  if (sidebar) sidebar.addEventListener('click', function(e) {
    var el = e.target.closest('.sidebar-item');
    if (!el) return;
    e.preventDefault();
    loadPage(el.dataset.page, el);
    if (window.innerWidth <= 1024) closeSidebar();
  });

  var menuBtn = document.getElementById('nav-menu-btn');
  if (menuBtn) menuBtn.addEventListener('click', function() { openSidebar(); });

  var sidebarOverlay = document.getElementById('sidebar-overlay');
  if (sidebarOverlay) sidebarOverlay.addEventListener('click', function() { closeSidebar(); });

  var apiLink = document.getElementById('nav-api-link');
  if (apiLink) apiLink.addEventListener('click', function(e) { e.preventDefault(); loadPage(this.getAttribute('href')); });
  var docsLink = document.getElementById('nav-docs-link');
  if (docsLink) docsLink.addEventListener('click', function(e) { e.preventDefault(); loadPage(this.getAttribute('href')); });

  var searchTrigger = document.getElementById('search-trigger');
  if (searchTrigger) searchTrigger.addEventListener('click', function() { openSearch(); });

  var themeBtn = document.getElementById('theme-btn');
  if (themeBtn) themeBtn.addEventListener('click', function() { toggleTheme(); });

  var searchOverlay = document.getElementById('search-overlay');
  if (searchOverlay) searchOverlay.addEventListener('click', function(e) { handleOverlayClick(e); });

  var searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.addEventListener('input', function() { handleSearchInput(this.value); });
    searchInput.addEventListener('keydown', function(e) { handleSearchKey(e); });
  }

  var filterInput = document.getElementById('sidebar-filter');
  if (filterInput) {
    filterInput.addEventListener('input', function() { _filterSidebar(this.value); });
    filterInput.addEventListener('keydown', function(e) { _filterKey(e); });
  }

  var filterClear = document.getElementById('sidebar-filter-clear');
  if (filterClear) filterClear.addEventListener('click', function() { _clearSidebarFilter(); });

  var vsel = document.getElementById('version-select');
  if (vsel) vsel.addEventListener('change', function() { switchVersion(this.value); });

  var content = document.getElementById('docs-content');
  if (content) content.addEventListener('click', function(e) {
    var navBtn = e.target.closest('.page-nav-btn');
    if (navBtn) {
      e.preventDefault();
      loadPage(navBtn.getAttribute('href'));
      if (window.innerWidth <= 1024) closeSidebar();
      return;
    }
    var copyToggle = e.target.closest('.copy-page-toggle');
    if (copyToggle) { toggleCopyMenu(e); return; }
    var copyItem = e.target.closest('.copy-page-item');
    if (copyItem) {
      var titleEl = copyItem.querySelector('.copy-page-item-title');
      var titleText = titleEl ? titleEl.textContent : '';
      if (titleText.indexOf('Copy page') >= 0) { copyMd(); closeCopyMenu(); }
      else if (titleText.indexOf('MCP') >= 0) { copyMcpCommand(); closeCopyMenu(); }
      return;
    }
    var metaBtn = e.target.closest('.meta-btn');
    if (metaBtn) {
      var title = metaBtn.getAttribute('title') || '';
      if (title.indexOf('Copy') >= 0) copyMd();
      else if (title.indexOf('Save') >= 0) printPage();
      return;
    }
    var notFoundBtn = e.target.closest('.not-found-btn');
    if (notFoundBtn) {
      e.preventDefault();
      if (notFoundBtn.classList.contains('not-found-btn-alt')) { openSearch(); }
      else { var f = document.querySelector('.sidebar-item'); if (f) loadPage(f.dataset.page, f); }
      return;
    }
  });

  var searchResults = document.getElementById('search-results');
  if (searchResults) {
    searchResults.addEventListener('click', function(e) {
      var item = e.target.closest('.search-item');
      if (item) selectSearchItem(item);
    });
    searchResults.addEventListener('mouseover', function(e) {
      var item = e.target.closest('.search-item');
      if (item && item.dataset.idx != null) { _searchActive = parseInt(item.dataset.idx, 10); _updateActive(); }
    });
  }
})();`;
}

function buildAppScript(mode, loaderScript, wsScript, offline = false) {
  return `var _OFFLINE = ${offline ? 'true' : 'false'};
${buildTheme()}
${buildA11y()}
${buildAnnouncementRuntime()}
${loaderScript}
${buildSearchScript(mode, offline)}
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

// ── SIDEBAR MODE SWITCHING ───────────────────────────────────────────────
function _switchSidebarMode(mode) {
  var docsEl = document.getElementById('sidebar-docs');
  var apiEl = document.getElementById('sidebar-api');
  if (!docsEl || !apiEl) return;
  docsEl.style.display = mode === 'docs' ? '' : 'none';
  apiEl.style.display = mode === 'api' ? '' : 'none';
  var apiLink = document.getElementById('nav-api-link');
  var docsLink = document.getElementById('nav-docs-link');
  if (apiLink) apiLink.style.display = mode === 'docs' ? '' : 'none';
  if (docsLink) docsLink.style.display = mode === 'api' ? '' : 'none';
  if (typeof _clearSidebarFilter === 'function') _clearSidebarFilter();
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
  const navH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--chrome-h')) || 60;
  const top = el.getBoundingClientRect().top + window.scrollY - navH - 44 - 16;
  try { history.pushState(null, '', location.pathname + '#' + id); } catch(e) {}
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

  if (headings.length >= 2) {
    const scrollWrap = document.createElement('div');
    scrollWrap.className = 'toc-scroll';

    const title = document.createElement('div');
    title.className = 'toc-title';
    title.textContent = 'On this page';
    scrollWrap.appendChild(title);

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
    scrollWrap.appendChild(list);
    toc.appendChild(scrollWrap);

    // Track the topmost heading whose top has crossed the active line (just
    // below the sticky nav). Picks the lowest heading still "above the line",
    // which is the section the user is currently reading.
    const navH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--chrome-h')) || 60;
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

  if (!_OFFLINE) {
    const actions = document.createElement('div');
    actions.className = 'toc-actions' + (headings.length < 2 ? ' toc-actions-solo' : '');

    const copyWrap = document.createElement('div');
    copyWrap.className = 'copy-page-menu toc-copy-menu';
    const copyBtn = document.createElement('button');
    copyBtn.className = 'toc-action-btn';
    copyBtn.title = 'Copy page as Markdown';
    copyBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg> Copy page';
    copyBtn.addEventListener('click', copyMd);
    copyWrap.appendChild(copyBtn);
    const tocToggle = document.createElement('button');
    tocToggle.className = 'toc-action-btn copy-page-toggle toc-chevron';
    tocToggle.setAttribute('aria-haspopup', 'true');
    tocToggle.setAttribute('aria-expanded', 'false');
    tocToggle.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
    tocToggle.addEventListener('click', function(e) { toggleCopyMenu(e); });
    copyWrap.appendChild(tocToggle);
    const tocDd = document.createElement('div');
    tocDd.className = 'copy-page-dropdown';
    tocDd.setAttribute('role', 'menu');
    tocDd.hidden = true;
    tocDd.innerHTML = _copyPageDropdownItems();
    copyWrap.appendChild(tocDd);
    actions.appendChild(copyWrap);

    const curId = window.__DOCSLIT_CURRENT_PAGE__ || window.__DOCSLIT_PAGE_ID__ || '';
    const pdfManifest = window.__DOCSLIT_PDF__;
    if (pdfManifest) {
      const chapter = (pdfManifest.chapters || []).find(c => c.id === curId) || (pdfManifest.chapters || [])[0];
      if (chapter) {
        const pdfLink = document.createElement('a');
        pdfLink.className = 'toc-action-btn';
        pdfLink.href = _pdfAssetHref(chapter.file);
        pdfLink.download = '';
        pdfLink.title = 'Download PDF';
        pdfLink.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg> Download PDF';
        actions.appendChild(pdfLink);
      }
    } else {
      const pdfBtn = document.createElement('button');
      pdfBtn.className = 'toc-action-btn';
      pdfBtn.title = 'Save page as PDF';
      pdfBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg> Save as PDF';
      pdfBtn.addEventListener('click', printPage);
      actions.appendChild(pdfBtn);
    }

    toc.appendChild(actions);

    const pageMeta = container.querySelector('.page-meta');
    if (pageMeta) {
      const metaViz = new IntersectionObserver((entries) => {
        actions.classList.toggle('toc-actions-visible', !entries[0].isIntersecting);
      }, { threshold: 0 });
      metaViz.observe(pageMeta);
    } else {
      actions.classList.add('toc-actions-visible');
    }
  }
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
    '<p class="not-found-desc">The page' + (id ? ' <code>' + _escHtml(id) + '</code>' : '') + ' doesn\\u2019t exist or may have been moved.</p>' +
    '<div class="not-found-actions">' +
    '<a class="not-found-btn" href="#"' + (_OFFLINE ? '' : ' onclick="var f=document.querySelector(\\'.sidebar-item\\');if(f)loadPage(f.dataset.page,f);return false;"') + '>Go to first page</a>' +
    '<button class="not-found-btn not-found-btn-alt"' + (_OFFLINE ? '' : ' onclick="openSearch()"') + '>Search docs</button>' +
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
  var container = document.getElementById('sidebar-api');
  if (!container || container.style.display === 'none') container = document.getElementById('sidebar-docs');
  if (!container) container = document.getElementById('sidebar-scroll');
  const all = Array.from(container.querySelectorAll('.sidebar-item:not(.sidebar-mode-item)'));
  const idx = all.findIndex(function(el){ return el.dataset.page === id; });
  const prev = idx > 0 ? all[idx-1] : null;
  const next = idx < all.length-1 ? all[idx+1] : null;
  let h = '';
  var editBase = window.__DOCSLIT_EDIT_URL__;
  if (editBase) {
    var editHref = editBase.replace(/\\/+$/, '') + '/' + id + '.md';
    h += '<div class="page-edit"><a href="' + _escHtml(editHref) + '" target="_blank" rel="noopener noreferrer"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> Edit this page</a></div>';
  }
  if (!prev && !next) return h;
  h += '<nav class="page-nav">';
  if (prev) {
    const pid = _escHtml(prev.dataset.page);
    const ptxt = _escHtml(prev.textContent.trim());
    h += '<a class="page-nav-btn" href="' + pid + '"' + (_OFFLINE ? '' : ' onclick="loadPage(\\'' + pid + '\\',this);if(window.innerWidth<=1024)closeSidebar();return false;"') + '><span class="page-nav-label">← Previous</span><span class="page-nav-title">' + ptxt + '</span></a>';
  } else { h += '<span></span>'; }
  if (next) {
    const nid = _escHtml(next.dataset.page);
    const ntxt = _escHtml(next.textContent.trim());
    h += '<a class="page-nav-btn next" href="' + nid + '"' + (_OFFLINE ? '' : ' onclick="loadPage(\\'' + nid + '\\',this);if(window.innerWidth<=1024)closeSidebar();return false;"') + '><span class="page-nav-label">Next →</span><span class="page-nav-title">' + ntxt + '</span></a>';
  } else { h += '<span></span>'; }
  h += '</nav>';
  return h;
}

// ── API EXAMPLES PLACEMENT ────────────────────────────────────────────────
function _placeApiExamples(content, isApi) {
  var exPanel = document.getElementById('docs-examples');
  var inlineWrap = content.querySelector('.api-examples-inline');
  if (!isApi) { if (exPanel) exPanel.innerHTML = ''; if (inlineWrap) inlineWrap.remove(); return; }
  var examples = Array.from(content.querySelectorAll('wc-api-examples'));
  if (!examples.length) { if (exPanel) exPanel.innerHTML = ''; return; }
  if (!inlineWrap) {
    inlineWrap = document.createElement('div');
    inlineWrap.className = 'api-examples-inline';
  }
  inlineWrap.innerHTML = '';
  if (exPanel) exPanel.innerHTML = '';
  var pageNav = content.querySelector('.page-nav');
  if (pageNav) content.insertBefore(inlineWrap, pageNav);
  else content.appendChild(inlineWrap);
  examples.forEach(function(el) {
    var clone = el.cloneNode(true);
    inlineWrap.appendChild(clone);
    if (exPanel) exPanel.appendChild(el);
  });
  if (exPanel && !exPanel.children.length) exPanel.innerHTML = '';
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
    if (!item.dataset.label) {
      var labelEl = item.querySelector('.api-nav-label');
      item.dataset.label = labelEl ? labelEl.textContent : item.textContent;
    }
  });

  var noResults = scroll.querySelector('.sidebar-no-results');
  if (noResults) noResults.remove();

  _filterIdx = -1;

  if (!q) {
    scroll.querySelectorAll('.sidebar-item').forEach(function(item) {
      var target = item.querySelector('.api-nav-label') || item;
      target.innerHTML = _escFilter(item.dataset.label);
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
        var target = item.querySelector('.api-nav-label') || item;
        target.innerHTML = _escFilter(text.slice(0, idx))
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
  var configured = window.__DOCSLIT_BASE_PATH__ || '';
  var locale = window.__DOCSLIT_LOCALE__;
  var pageId = window.__DOCSLIT_PAGE_ID__ || window.__DOCSLIT_CURRENT_PAGE__;
  var pathName = window.location.pathname.replace(/\\/+$/, '');
  if (pageId && pathName) {
    var htmlSuffix = '/' + pageId + '.html';
    var pageSuffix = '/' + pageId;
    if (pathName.endsWith(htmlSuffix)) return (pathName.slice(0, -htmlSuffix.length) || '') + '/';
    if (pathName.endsWith(pageSuffix)) return (pathName.slice(0, -pageSuffix.length) || '') + '/';
  }
  var vc = window.__DOCSLIT_VERSIONS__;
  if (vc) {
    var marker = '/' + vc.current;
    var ix = pathName.lastIndexOf(marker + '/');
    if (ix >= 0) return pathName.slice(0, ix + marker.length + 1);
    if (pathName.endsWith(marker)) return pathName + '/';
    return (configured || '') + '/' + vc.current + '/';
  }
  if (locale && configured) {
    var locMarker = configured + '/' + locale;
    if (pathName === locMarker || pathName.startsWith(locMarker + '/')) return locMarker + '/';
  }
  if (configured) return configured + '/';
  return '/';
}
function _docsRoot() {
  var vc = window.__DOCSLIT_VERSIONS__;
  var base = _docsBase();
  if (!vc) return base;
  var marker = '/' + vc.current + '/';
  var ix = base.lastIndexOf(marker);
  if (ix < 0) return '/';
  return base.slice(0, ix + 1);
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
function _pdfAssetHref(file) {
  var base = _docsBase();
  if (!file) return base;
  if (file.charAt(0) === '/') return file;
  return base + file;
}
function _printPdfButton() {
  return '<span class="meta-sep">|</span>' +
    '<button class="meta-btn"' + (_OFFLINE ? '' : ' onclick="printPage()"') + ' title="Save page as PDF"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg> Save as PDF</button>';
}
function _pdfDownloadButton(id) {
  var m = window.__DOCSLIT_PDF__;
  if (!m) return _printPdfButton();
  var chapterId = m.pageToChapter && m.pageToChapter[id];
  var chapter = null;
  if (chapterId && m.chapters) {
    for (var i = 0; i < m.chapters.length; i++) {
      if (m.chapters[i].id === chapterId) { chapter = m.chapters[i]; break; }
    }
  }
  var items = '<button type="button" class="pdf-menu-item" role="menuitem" onclick="printPage();closePdfMenu()">This page as PDF</button>';
  if (chapter) {
    items += '<a class="pdf-menu-item" role="menuitem" href="' + _escHtml(_pdfAssetHref(chapter.file)) + '" download>Download this chapter as PDF</a>';
  }
  if (m.fullManual) {
    items += '<a class="pdf-menu-item" role="menuitem" href="' + _escHtml(_pdfAssetHref(m.fullManual.file)) + '" download>Download full documentation</a>';
  }
  return '<span class="meta-sep">|</span><div class="pdf-menu">' +
    '<button type="button" class="meta-btn pdf-menu-btn" onclick="togglePdfMenu(event)" aria-haspopup="true" aria-expanded="false" title="Download PDF">' +
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg> Download PDF <span class="pdf-menu-chevron" aria-hidden="true">▾</span></button>' +
    '<div class="pdf-menu-dropdown" role="menu" hidden>' + items + '</div></div>';
}
function _copyPageDropdownItems() {
  var siteUrl = window.__DOCSLIT_SITE_URL__ || '';
  var id = window.__DOCSLIT_CURRENT_PAGE__ || window.__DOCSLIT_PAGE_ID__ || '';
  var pageUrl = siteUrl && id ? siteUrl + _docsBase() + id : '';
  var items = '<button type="button" class="copy-page-item" role="menuitem" onclick="copyMd();closeCopyMenu()">' +
    '<span class="copy-page-item-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg></span>' +
    '<span class="copy-page-item-text"><span class="copy-page-item-title">Copy page</span><span class="copy-page-item-desc">Copy page as Markdown for LLMs</span></span></button>';
  if (pageUrl) {
    var q = encodeURIComponent('Read from ' + pageUrl + ' so I can ask questions about it.');
    items += '<a class="copy-page-item" role="menuitem" href="https://chatgpt.com/?q=' + q + '" target="_blank" rel="noopener">' +
      '<span class="copy-page-item-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/></svg></span>' +
      '<span class="copy-page-item-text"><span class="copy-page-item-title">Open in ChatGPT <span class="copy-page-arrow">\\u2197</span></span><span class="copy-page-item-desc">Ask questions about this page</span></span></a>';
    items += '<a class="copy-page-item" role="menuitem" href="https://claude.ai/new?q=' + q + '" target="_blank" rel="noopener">' +
      '<span class="copy-page-item-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M4.709 15.955l4.397-10.985c.2-.497.378-.878.575-1.14.208-.277.503-.497.916-.497.414 0 .709.22.917.497.197.262.375.643.575 1.14L16.1 15.432l.055.137c.15.374.278.697.343.987.07.313.077.622-.046.925a1.494 1.494 0 01-.644.72c-.272.161-.576.203-.893.196-.294-.006-.64-.058-1.028-.118l-.147-.023-3.408-.537a3.22 3.22 0 00-.503-.042c-.17 0-.34.014-.504.042l-3.408.537-.146.023c-.389.06-.735.112-1.028.118-.318.007-.622-.035-.894-.197a1.494 1.494 0 01-.644-.72c-.123-.302-.117-.611-.046-.924.065-.29.193-.613.343-.987l.055-.137zM17.584 18.01c-.04.03-.068.073-.08.122a.228.228 0 00.017.148l.96 2.122c.083.183.15.303.217.386.077.096.175.212.35.212.177 0 .274-.116.351-.212.068-.083.134-.203.217-.386l.96-2.122a.228.228 0 00.017-.148.228.228 0 00-.08-.122l-1.688-1.374a.219.219 0 00-.138-.049.219.219 0 00-.139.049l-1.688 1.374z"/></svg></span>' +
      '<span class="copy-page-item-text"><span class="copy-page-item-title">Open in Claude <span class="copy-page-arrow">\\u2197</span></span><span class="copy-page-item-desc">Ask questions about this page</span></span></a>';
    items += '<button type="button" class="copy-page-item" role="menuitem" onclick="copyMcpCommand();closeCopyMenu()">' +
      '<span class="copy-page-item-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg></span>' +
      '<span class="copy-page-item-text"><span class="copy-page-item-title">Copy MCP install command</span><span class="copy-page-item-desc">Copy npx command to install MCP server</span></span></button>';
  }
  return items;
}
function _mdButtons(id) {
  var copyIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>';
  return '<span class="meta-sep">|</span>' +
    '<div class="copy-page-menu">' +
    '<button class="meta-btn copy-page-main"' + (_OFFLINE ? '' : ' onclick="copyMd()"') + ' title="Copy page as Markdown">' + copyIcon + ' Copy page</button>' +
    '<button type="button" class="meta-btn copy-page-toggle"' + (_OFFLINE ? '' : ' onclick="toggleCopyMenu(event)"') + ' aria-haspopup="true" aria-expanded="false"><span class="copy-page-chevron" aria-hidden="true"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></span></button>' +
    '<div class="copy-page-dropdown" role="menu" hidden>' + _copyPageDropdownItems() + '</div>' +
    '</div>' +
    (window.__DOCSLIT_PDF__ ? _pdfDownloadButton(id) : _printPdfButton());
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
    var btn = document.querySelector('.copy-page-main');
    if (btn) { var orig = btn.innerHTML; btn.innerHTML = btn.innerHTML.replace('Copy page', 'Copied!'); setTimeout(function() { btn.innerHTML = orig; }, 2000); }
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
function printPage() {
  window.print();
}
function togglePdfMenu(e) {
  e.stopPropagation();
  var menu = e.currentTarget.closest('.pdf-menu');
  if (!menu) return;
  var dd = menu.querySelector('.pdf-menu-dropdown');
  var btn = menu.querySelector('.pdf-menu-btn');
  if (!dd) return;
  var open = !dd.hidden;
  document.querySelectorAll('.pdf-menu-dropdown').forEach(function(el) { el.hidden = true; });
  document.querySelectorAll('.pdf-menu-btn').forEach(function(el) { el.setAttribute('aria-expanded', 'false'); });
  if (!open) { dd.hidden = false; if (btn) btn.setAttribute('aria-expanded', 'true'); }
}
function closePdfMenu() {
  document.querySelectorAll('.pdf-menu-dropdown').forEach(function(el) { el.hidden = true; });
  document.querySelectorAll('.pdf-menu-btn').forEach(function(el) { el.setAttribute('aria-expanded', 'false'); });
}
function toggleCopyMenu(e) {
  e.stopPropagation();
  closePdfMenu();
  var menu = e.currentTarget.closest('.copy-page-menu');
  if (!menu) return;
  var dd = menu.querySelector('.copy-page-dropdown');
  var btn = menu.querySelector('.copy-page-toggle');
  if (!dd) return;
  var open = !dd.hidden;
  closeCopyMenu();
  if (!open) {
    dd.hidden = false;
    if (btn) btn.setAttribute('aria-expanded', 'true');
    var tocEl = menu.closest('.docs-toc');
    if (tocEl) tocEl.style.overflow = 'visible';
  }
}
function closeCopyMenu() {
  document.querySelectorAll('.copy-page-dropdown').forEach(function(el) { el.hidden = true; });
  document.querySelectorAll('.copy-page-toggle').forEach(function(el) { el.setAttribute('aria-expanded', 'false'); });
  var tocEl = document.getElementById('docs-toc');
  if (tocEl) tocEl.style.overflow = '';
}
async function copyMcpCommand() {
  try {
    var siteUrl = window.__DOCSLIT_SITE_URL__ || '';
    if (!siteUrl) return;
    var cmd = 'npx docslit mcp ' + siteUrl;
    await navigator.clipboard.writeText(cmd);
    var item = document.querySelector('.copy-page-item[onclick*="copyMcpCommand"]');
    if (item) {
      var titleEl = item.querySelector('.copy-page-item-title');
      if (titleEl) { var orig = titleEl.textContent; titleEl.textContent = 'Copied!'; setTimeout(function() { titleEl.textContent = orig; }, 2000); }
    }
  } catch(e) { console.error('Copy failed', e); }
}
document.addEventListener('click', function() { closePdfMenu(); closeCopyMenu(); });
window.copyMd = copyMd;
window.viewMd = viewMd;
window.toggleCopyMenu = toggleCopyMenu;
window.closeCopyMenu = closeCopyMenu;
window.copyMcpCommand = copyMcpCommand;
window.printPage = printPage;
window.togglePdfMenu = togglePdfMenu;
window.closePdfMenu = closePdfMenu;
window._filterSidebar = _filterSidebar;
window._filterKey = _filterKey;
window._clearSidebarFilter = _clearSidebarFilter;
${offline ? buildEventDelegation() : ''}`;
}


const PDF_DOC_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>';

function pdfAssetHref(assetPrefix, file) {
  return `${assetPrefix}${file}`;
}

function pdfButtons(id, pdfManifest, assetPrefix = '') {
  if (!pdfManifest) {
    return `<span class="meta-sep">|</span><button class="meta-btn" onclick="printPage()" title="Save page as PDF">${PDF_DOC_ICON} Save as PDF</button>`;
  }
  const chapterId = pdfManifest.pageToChapter?.[id];
  const chapter = chapterId ? pdfManifest.chapters?.find((c) => c.id === chapterId) : null;
  let items = '<button type="button" class="pdf-menu-item" role="menuitem" onclick="printPage();closePdfMenu()">This page as PDF</button>';
  if (chapter) {
    items += `<a class="pdf-menu-item" role="menuitem" href="${escHtml(pdfAssetHref(assetPrefix, chapter.file))}" download>Download this chapter as PDF</a>`;
  }
  if (pdfManifest.fullManual) {
    items += `<a class="pdf-menu-item" role="menuitem" href="${escHtml(pdfAssetHref(assetPrefix, pdfManifest.fullManual.file))}" download>Download full documentation</a>`;
  }
  return `<span class="meta-sep">|</span><div class="pdf-menu"><button type="button" class="meta-btn pdf-menu-btn" onclick="togglePdfMenu(event)" aria-haspopup="true" aria-expanded="false" title="Download PDF">${PDF_DOC_ICON} Download PDF <span class="pdf-menu-chevron" aria-hidden="true">▾</span></button><div class="pdf-menu-dropdown" role="menu" hidden>${items}</div></div>`;
}

function copyPageDropdownItems(pageUrl, siteUrl) {
  const copyIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>';
  const chatgptIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/></svg>';
  const claudeIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M4.709 15.955l4.397-10.985c.2-.497.378-.878.575-1.14.208-.277.503-.497.916-.497.414 0 .709.22.917.497.197.262.375.643.575 1.14L16.1 15.432l.055.137c.15.374.278.697.343.987.07.313.077.622-.046.925a1.494 1.494 0 01-.644.72c-.272.161-.576.203-.893.196-.294-.006-.64-.058-1.028-.118l-.147-.023-3.408-.537a3.22 3.22 0 00-.503-.042c-.17 0-.34.014-.504.042l-3.408.537-.146.023c-.389.06-.735.112-1.028.118-.318.007-.622-.035-.894-.197a1.494 1.494 0 01-.644-.72c-.123-.302-.117-.611-.046-.924.065-.29.193-.613.343-.987l.055-.137zM17.584 18.01c-.04.03-.068.073-.08.122a.228.228 0 00.017.148l.96 2.122c.083.183.15.303.217.386.077.096.175.212.35.212.177 0 .274-.116.351-.212.068-.083.134-.203.217-.386l.96-2.122a.228.228 0 00.017-.148.228.228 0 00-.08-.122l-1.688-1.374a.219.219 0 00-.138-.049.219.219 0 00-.139.049l-1.688 1.374z"/></svg>';
  const mcpIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>';
  let items = `<button type="button" class="copy-page-item" role="menuitem" onclick="copyMd();closeCopyMenu()"><span class="copy-page-item-icon">${copyIcon}</span><span class="copy-page-item-text"><span class="copy-page-item-title">Copy page</span><span class="copy-page-item-desc">Copy page as Markdown for LLMs</span></span></button>`;
  if (pageUrl) {
    const q = encodeURIComponent('Read from ' + pageUrl + ' so I can ask questions about it.');
    items += `<a class="copy-page-item" role="menuitem" href="https://chatgpt.com/?q=${q}" target="_blank" rel="noopener"><span class="copy-page-item-icon">${chatgptIcon}</span><span class="copy-page-item-text"><span class="copy-page-item-title">Open in ChatGPT <span class="copy-page-arrow">↗</span></span><span class="copy-page-item-desc">Ask questions about this page</span></span></a>`;
    items += `<a class="copy-page-item" role="menuitem" href="https://claude.ai/new?q=${q}" target="_blank" rel="noopener"><span class="copy-page-item-icon">${claudeIcon}</span><span class="copy-page-item-text"><span class="copy-page-item-title">Open in Claude <span class="copy-page-arrow">↗</span></span><span class="copy-page-item-desc">Ask questions about this page</span></span></a>`;
    items += `<button type="button" class="copy-page-item" role="menuitem" onclick="copyMcpCommand();closeCopyMenu()"><span class="copy-page-item-icon">${mcpIcon}</span><span class="copy-page-item-text"><span class="copy-page-item-title">Copy MCP install command</span><span class="copy-page-item-desc">Copy npx command to install MCP server</span></span></button>`;
  }
  return items;
}

function mdButtons(id, pdfManifest = null, assetPrefix = '', siteUrl = '', basePath = '') {
  const copyIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>';
  const pageUrl = siteUrl && id ? siteUrl + (basePath || '/') + id : '';
  const dropdownItems = copyPageDropdownItems(pageUrl, siteUrl);
  return `<span class="meta-sep">|</span><div class="copy-page-menu"><button class="meta-btn copy-page-main" onclick="copyMd()" title="Copy page as Markdown">${copyIcon} Copy page</button><button type="button" class="meta-btn copy-page-toggle" onclick="toggleCopyMenu(event)" aria-haspopup="true" aria-expanded="false"><span class="copy-page-chevron" aria-hidden="true"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></span></button><div class="copy-page-dropdown" role="menu" hidden>${dropdownItems}</div></div>${pdfButtons(id, pdfManifest, assetPrefix)}`;
}

function injectPageMeta(meta, id, pdfManifest = null, assetPrefix = '', siteUrl = '', basePath = '') {
  const parts = [];
  if (meta.tag) parts.push(`<span>${escHtml(meta.tag)}</span>`);
  if (meta.component) parts.push(`<span>•</span><span>${escHtml(meta.component)}</span>`);
  if (meta.readtime) parts.push(`<span>•</span><span>${escHtml(meta.readtime)}</span>`);
  if (meta.updated) parts.push(`<span>•</span><span>Updated ${escHtml(meta.updated)}</span>`);
  parts.push(mdButtons(id, pdfManifest, assetPrefix, siteUrl, basePath));
  return `<div class="page-meta">${parts.join('')}</div>`;
}

function buildSidebarHtml(config, draftIds = [], activePageId = null, excludePrefix = null, offline = false, titleMap = null) {
  const draftSet = new Set(draftIds);
  function _excluded(id) {
    return draftSet.has(id) || (excludePrefix && id.startsWith(excludePrefix));
  }
  function _sidebarClick(id) {
    if (offline) return '';
    return ` onclick="loadPage('${escHtml(id)}',this);if(window.innerWidth<=1024)closeSidebar();return false;"`;
  }
  function renderPages(pages) {
    let out = '';
    for (const item of pages) {
      if (typeof item === 'object' && item.group) {
        const subPages = (item.pages || []).filter(p => {
          if (typeof p === 'string') return !_excluded(p);
          if (p.id) return !_excluded(p.id);
          return true;
        });
        if (!subPages.length) continue;
        out += `<div class="sidebar-subgroup">`;
        out += `<div class="sidebar-subgroup-title">${escHtml(item.group)}</div>`;
        out += renderPages(subPages);
        out += `</div>`;
      } else if (typeof item === 'string' && !_excluded(item)) {
        const label = (titleMap && titleMap[item]) || toLabel(item);
        const activeClass = item === activePageId ? ' active' : '';
        out += `<a class="sidebar-item${activeClass}" data-page="${escHtml(item)}" href="${escHtml(item)}"${_sidebarClick(item)}>${escHtml(label)}</a>`;
      } else if (typeof item === 'object' && item.id && !_excluded(item.id)) {
        const label = item.title || (titleMap && titleMap[item.id]) || toLabel(item.id);
        const activeClass = item.id === activePageId ? ' active' : '';
        if (item.method) {
          const methodClass = item.method.toLowerCase();
          out += `<a class="sidebar-item api-nav-item${activeClass}" data-page="${escHtml(item.id)}" href="${escHtml(item.id)}"${_sidebarClick(item.id)}><span class="api-nav-label">${escHtml(label)}</span><span class="method-badge ${methodClass}">${item.method}</span></a>`;
        } else {
          out += `<a class="sidebar-item${activeClass}" data-page="${escHtml(item.id)}" href="${escHtml(item.id)}"${_sidebarClick(item.id)}>${escHtml(label)}</a>`;
        }
      }
    }
    return out;
  }
  let html = '';
  for (const group of (config.sidebar || [])) {
    const visiblePages = (group.pages || []).filter(p => {
      if (typeof p === 'string') return !_excluded(p);
      if (p.id) return !_excluded(p.id);
      return true;
    });
    if (!visiblePages.length) continue;
    html += `<div class="sidebar-section">`;
    html += `<div class="sidebar-group-title">${escHtml(group.group || '')}</div>`;
    html += renderPages(visiblePages);
    html += `</div>`;
  }
  return html;
}

function buildApiSidebarHtml(specData, activePageId, apiMeta, offline = false) {
  const byTag = new Map();
  for (const ep of specData) {
    const tag = ep.tags[0] || 'Default';
    if (!byTag.has(tag)) byTag.set(tag, []);
    byTag.get(tag).push(ep);
  }

  function renderEndpoint(ep) {
    if (!ep.operationId) return '';
    const slug = ep.operationId.replace(/([a-z])([A-Z])/g, '$1-$2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2').toLowerCase();
    const pageId = `api/${slug}`;
    const activeClass = pageId === activePageId ? ' active' : '';
    const methodClass = ep.method.toLowerCase();
    const label = ep.summary || ep.path;
    const click = offline ? '' : ` onclick="loadPage('${escHtml(pageId)}',this);if(window.innerWidth<=1024)closeSidebar();return false;"`;
    return `<a class="sidebar-item api-nav-item${activeClass}" data-page="${escHtml(pageId)}" href="${escHtml(pageId)}"${click}><span class="api-nav-label">${escHtml(label)}</span><span class="method-badge ${methodClass}">${ep.method}</span></a>`;
  }

  function renderTagSection(tagName) {
    const eps = byTag.get(tagName);
    if (!eps || !eps.length) return '';
    let out = `<div class="sidebar-tag-section">`;
    out += `<div class="sidebar-tag-title">${escHtml(tagName)}</div>`;
    for (const ep of eps) out += renderEndpoint(ep);
    out += `</div>`;
    return out;
  }

  const tagGroups = apiMeta?.tagGroups || [];
  let html = '';

  if (tagGroups.length) {
    const renderedTags = new Set();
    for (const group of tagGroups) {
      let groupContent = '';
      for (const tagName of group.tags) {
        groupContent += renderTagSection(tagName);
        renderedTags.add(tagName);
      }
      if (!groupContent) continue;
      html += `<div class="sidebar-section">`;
      html += `<div class="sidebar-group-title">${escHtml(group.name)}</div>`;
      html += groupContent;
      html += `</div>`;
    }
    for (const [tag] of byTag) {
      if (!renderedTags.has(tag)) {
        html += `<div class="sidebar-section">`;
        html += `<div class="sidebar-group-title">${escHtml(tag)}</div>`;
        const eps = byTag.get(tag);
        for (const ep of eps) html += renderEndpoint(ep);
        html += `</div>`;
      }
    }
  } else {
    for (const [tag, eps] of byTag) {
      html += `<div class="sidebar-section">`;
      html += `<div class="sidebar-group-title">${escHtml(tag)}</div>`;
      for (const ep of eps) html += renderEndpoint(ep);
      html += `</div>`;
    }
  }
  return html;
}

function buildVersionSelector(versionConfig, currentVersion, offline = false) {
  const options = versionConfig.list.map(v => {
    const label = v.tag ? `${escHtml(v.version)} (${escHtml(v.tag)})` : escHtml(v.version);
    const selected = v.version === currentVersion ? ' selected' : '';
    return `<option value="${escHtml(v.version)}"${selected}>${label}</option>`;
  }).join('');
  const changeHandler = offline ? '' : ' onchange="switchVersion(this.value)"';
  return `<select class="version-select" id="version-select"${changeHandler} aria-label="Documentation version">${options}</select>`;
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function getFirstDocPageId(config) {
  for (const group of (config.sidebar || [])) {
    for (const item of (group.pages || [])) {
      if (typeof item === 'string' && !item.startsWith('api/')) return item;
      if (item.id && !item.id.startsWith('api/')) return item.id;
    }
  }
  return null;
}

function getFirstApiPageId(specData) {
  if (!specData?.length) return null;
  const ep = specData[0];
  if (!ep.operationId) return null;
  const slug = ep.operationId.replace(/([a-z])([A-Z])/g, '$1-$2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2').toLowerCase();
  return `api/${slug}`;
}

const _apiIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M16 18l6-6-6-6"/><path d="M8 6l-6 6 6 6"/></svg>';
const _docsIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>';

function buildSidebarModeLink(targetPageId, label, icon, offline = false) {
  const click = offline ? '' : ` onclick="loadPage('${escHtml(targetPageId)}',this);if(window.innerWidth<=1024)closeSidebar();return false;"`;
  return `<div class="sidebar-mode-link"><a class="sidebar-item sidebar-mode-item" data-page="${escHtml(targetPageId)}" href="${escHtml(targetPageId)}"${click}>${icon} ${escHtml(label)}</a></div>`;
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
  window.scrollTo(0, 0);
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
    var isApi = id.startsWith('api/') || meta.layout === 'api';
    if (isApi) document.body.classList.add('api-layout'); else document.body.classList.remove('api-layout');
    _switchSidebarMode(isApi ? 'api' : 'docs');
    const logoText = document.querySelector('.nav-logo-text');
    if (meta.title) {
      document.title = meta.title + ' — ' + (logoText ? logoText.textContent.trim() : '');
      _setBreadcrumb(id, meta.title);
      var sidebarEl = document.querySelector('.sidebar-item[data-page="' + id + '"]');
      if (sidebarEl) {
        var labelSpan = sidebarEl.querySelector('.api-nav-label');
        if (labelSpan) labelSpan.textContent = meta.title;
        else sidebarEl.textContent = meta.title;
      }
    }
    var metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute('content', meta.description || meta.desc || '');
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
    _placeApiExamples(content, isApi);
  } catch(e) {
    _show404(id);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  _updateThemeBtn();
  _a11yUpdateUI();
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
const _htmlCache = {};

async function _fetchPageHtml(id) {
  if (_htmlCache[id] !== undefined) return _htmlCache[id];
  try {
    const res = await fetch(_docsBase() + id + '.html');
    if (!res.ok) {
      var vc = window.__DOCSLIT_VERSIONS__;
      if (vc && vc.current !== vc.default) {
        const fallback = await fetch(_docsRoot() + vc.default + '/' + id + '.html');
        if (fallback.ok) { _htmlCache[id] = await fallback.text(); return _htmlCache[id]; }
      }
      throw new Error('Not found');
    }
    _htmlCache[id] = await res.text();
  } catch(e) { _htmlCache[id] = null; }
  return _htmlCache[id];
}

async function loadPage(id, el) {
  window.__DOCSLIT_CURRENT_PAGE__ = id;
  activateSidebar(id);
  window.scrollTo(0, 0);
  const target = _docsBase() + id;
  if (location.pathname !== target) history.pushState({page: id}, '', target);
  const content = document.getElementById('docs-content');
  content.textContent = 'Loading…';
  const htmlText = await _fetchPageHtml(id);
  if (!htmlText) { _show404(id); return; }
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlText, 'text/html');
  const isApi = doc.body.classList.contains('api-layout');
  if (isApi) document.body.classList.add('api-layout'); else document.body.classList.remove('api-layout');
  _switchSidebarMode(isApi ? 'api' : 'docs');
  const remoteContent = doc.getElementById('docs-content');
  const pageTitle = doc.querySelector('title')?.textContent?.split(' — ')[0] || '';
  const logoText = document.querySelector('.nav-logo-text');
  if (pageTitle) {
    document.title = pageTitle + ' — ' + (logoText ? logoText.textContent.trim() : '');
    _setBreadcrumb(id, pageTitle);
  }
  var remoteDesc = doc.querySelector('meta[name="description"]');
  var metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc) metaDesc.setAttribute('content', remoteDesc ? remoteDesc.getAttribute('content') || '' : '');
  content.innerHTML = remoteContent ? remoteContent.innerHTML : '';
  _wrapTables(content);
  buildToc(content);
  content.insertAdjacentHTML('beforeend', _buildPrevNext(id));
  _placeApiExamples(content, isApi);
}

window.addEventListener('DOMContentLoaded', () => {
  _updateThemeBtn();
  _a11yUpdateUI();
  var preRenderedId = window.__DOCSLIT_PAGE_ID__;
  if (preRenderedId) {
    window.__DOCSLIT_CURRENT_PAGE__ = preRenderedId;
    activateSidebar(preRenderedId);
    var content = document.getElementById('docs-content');
    _wrapTables(content);
    buildToc(content);
    content.insertAdjacentHTML('beforeend', _buildPrevNext(preRenderedId));
    var isApi = preRenderedId.startsWith('api/') || document.body.classList.contains('api-layout');
    _placeApiExamples(content, isApi);
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
window.__DOCSLIT_PAGES__ = window.__DOCSLIT_PAGES__ || {};
const _loadedScripts = {};
const _isFile = location.protocol === 'file:';

function _safePushState(state, title, url) {
  if (_isFile) { location.hash = '#' + state.page; return; }
  history.pushState(state, title, url);
}
function _safeReplaceState(state, title, url) {
  if (_isFile) { location.hash = '#' + state.page; return; }
  history.replaceState(state, title, url);
}

function _loadPageData(id) {
  if (window.__DOCSLIT_PAGES__[id]) return Promise.resolve(window.__DOCSLIT_PAGES__[id]);
  const file = 'pages/' + id.replace(/\\//g, '--') + '.js';
  if (_loadedScripts[file]) return _loadedScripts[file];
  _loadedScripts[file] = new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = file;
    s.onload = () => resolve(window.__DOCSLIT_PAGES__[id] || null);
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
  });
  return _loadedScripts[file];
}

async function loadPage(id, el) {
  window.__DOCSLIT_CURRENT_PAGE__ = id;
  activateSidebar(id);
  window.scrollTo(0, 0);
  _safePushState({page: id}, '', _isFile ? '' : _docsBase() + id);
  const content = document.getElementById('docs-content');
  content.textContent = 'Loading…';
  const data = await _loadPageData(id);
  if (!data) { _show404(id); return; }
  const { meta, html } = data;
  var isApi = id.startsWith('api/') || meta.layout === 'api';
  if (isApi) document.body.classList.add('api-layout'); else document.body.classList.remove('api-layout');
  _switchSidebarMode(isApi ? 'api' : 'docs');
  const logoText = document.querySelector('.nav-logo-text');
  if (meta.title) {
    document.title = meta.title + ' — ' + (logoText ? logoText.textContent.trim() : '');
    _setBreadcrumb(id, meta.title);
  }
  var metaDescEl = document.querySelector('meta[name="description"]');
  if (metaDescEl) metaDescEl.setAttribute('content', meta.description || meta.desc || '');
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
  _placeApiExamples(content, isApi);
}

window.addEventListener('DOMContentLoaded', () => {
  _updateThemeBtn();
  _a11yUpdateUI();
  const _knownPages = new Set(Array.from(document.querySelectorAll('.sidebar-item[data-page]')).map(el => el.dataset.page));
  function _resolvePageLink(href) {
    var id = href.replace(/^\\.?\\//, '').replace(/\\.html$/, '').replace(/\\/$/, '');
    if (_knownPages.has(id)) return id;
    var cur = window.__DOCSLIT_CURRENT_PAGE__ || '';
    var dir = cur.lastIndexOf('/') >= 0 ? cur.slice(0, cur.lastIndexOf('/') + 1) : '';
    if (dir) { var resolved = dir + id; if (_knownPages.has(resolved)) return resolved; }
    return null;
  }
  document.addEventListener('click', function(e) {
    var href, el;
    el = e.target.closest('#docs-content a[href]');
    if (el) { href = el.getAttribute('href'); }
    if (!href) {
      el = e.target.closest('#docs-content [href]');
      if (el) href = el.getAttribute('href');
    }
    if (!href || href.startsWith('#') || href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:')) return;
    const id = _resolvePageLink(href);
    if (id) {
      e.preventDefault();
      loadPage(id);
    }
  });
  const fromHash = location.hash.slice(1);
  const fromPath = _isFile ? null : _pageFromUrl();
  const firstEl = document.querySelector('.sidebar-item');
  const firstId = fromHash || fromPath || (firstEl && firstEl.dataset.page) || 'introduction';
  _safeReplaceState({page: firstId}, '', _isFile ? '' : _docsBase() + firstId);
  loadPage(firstId, document.querySelector(\`.sidebar-item[data-page="\${firstId}"]\`));
});

window.addEventListener('popstate', () => {
  const id = location.hash.slice(1) || (_isFile ? null : _pageFromUrl()) || document.querySelector('.sidebar-item')?.dataset.page || 'introduction';
  loadPage(id, document.querySelector(\`.sidebar-item[data-page="\${id}"]\`));
});

if (_isFile) window.addEventListener('hashchange', () => {
  const id = location.hash.slice(1);
  if (id && id !== window.__DOCSLIT_CURRENT_PAGE__ && document.querySelector('.sidebar-item[data-page="' + id + '"]')) loadPage(id);
});

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

function buildSearchScript(mode, offline = false) {
  const fetchUrl = mode === 'dev'
    ? `(() => { var vc = window.__DOCSLIT_VERSIONS__; return vc ? '/api/search-index/' + vc.current : '/api/search-index'; })()`
    : `_docsBase() + 'search-index.json'`;

  const loadIndexBlock = offline
    ? `
    if (window.__DOCSLIT_SEARCH_INDEX__) {
      _searchIndex = window.__DOCSLIT_SEARCH_INDEX__;
    } else {
      await new Promise(function(resolve) {
        var s = document.createElement('script');
        s.src = 'search-index.js';
        s.onload = function() { resolve(); };
        s.onerror = function() { resolve(); };
        document.head.appendChild(s);
      });
      _searchIndex = window.__DOCSLIT_SEARCH_INDEX__ || [];
    }`
    : `
    if (window.__DOCSLIT_SEARCH_INDEX__) {
      _searchIndex = window.__DOCSLIT_SEARCH_INDEX__;
    } else {
      var url = ${fetchUrl};
      var res = await fetch(url);
      _searchIndex = await res.json();
    }`;

  const buildFlexBlock = `
    var flexUrl = ${offline
      ? `'flexsearch.js'`
      : mode === 'dev'
        ? `'/vendor/flexsearch.js'`
        : `_docsBase() + 'flexsearch.js'`};
    var { default: FlexSearch } = await import(flexUrl);
    _searchFlex = new FlexSearch.Document({
      document: { id: 'id', index: ['title', 'desc', 'body'], store: ['id', 'title', 'group', 'desc', 'section', 'pageTitle'] },
      tokenize: 'forward',
      resolution: 9,
    });
    for (var doc of _searchIndex) _searchFlex.add(doc);`;

  return `
var _searchIndex = null;
var _searchFlex = null;
var _searchActive = -1;
var _searchLoadPromise = null;
var _searchFailed = false;

function _searchOverlayOpen() {
  var overlay = document.getElementById('search-overlay');
  return !!(overlay && overlay.classList.contains('open'));
}

function _renderSearchLoading() {
  var container = document.getElementById('search-results');
  if (!container) return;
  var rows = '';
  for (var i = 0; i < 5; i++) {
    rows += '<div class="search-skel" aria-hidden="true">' +
      '<div class="search-skel-icon"></div>' +
      '<div class="search-skel-text"><div class="search-skel-line"></div><div class="search-skel-line short"></div></div>' +
      '</div>';
  }
  container.innerHTML =
    '<div class="search-loading" role="status" aria-live="polite">' +
      '<div class="search-loading-label"><span class="search-spinner" aria-hidden="true"></span>Preparing search…</div>' +
      rows +
    '</div>';
}

async function _loadSearchIndex() {
  if (_searchIndex && _searchFlex) return;
  if (_searchLoadPromise) return _searchLoadPromise;
  _searchLoadPromise = (async function() {
    try {
      ${loadIndexBlock}
      ${buildFlexBlock}
      _searchFailed = false;
    } catch(e) {
      console.error('Search index load failed:', e);
      _searchFailed = true;
      _searchIndex = _searchIndex || [];
    } finally {
      if (_searchOverlayOpen()) {
        var input = document.getElementById('search-input');
        var q = input ? input.value : '';
        if (q && q.trim()) handleSearchInput(q);
        else _renderDefaultResults();
      }
    }
  })();
  return _searchLoadPromise;
}

function _prefetchSearch() {
  if (_searchLoadPromise || (_searchIndex && _searchFlex)) return;
  var run = function() { _loadSearchIndex(); };
  if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 2500 });
  else setTimeout(run, 800);
}

function openSearch() {
  var overlay = document.getElementById('search-overlay');
  overlay.classList.add('open');
  var input = document.getElementById('search-input');
  input.value = '';
  input.focus();
  _searchActive = -1;
  if (_searchIndex && _searchIndex.length) _renderDefaultResults();
  else _renderSearchLoading();
  _loadSearchIndex();
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

function _quickAccessItems() {
  if (!_searchIndex || !_searchIndex.length) return [];
  var pages = [];
  for (var i = 0; i < _searchIndex.length; i++) {
    var doc = _searchIndex[i];
    if (doc.id && String(doc.id).indexOf('#') === -1) pages.push(doc);
    if (pages.length >= 8) break;
  }
  return pages.length ? pages : _searchIndex.slice(0, 8);
}

function _renderDefaultResults() {
  var container = document.getElementById('search-results');
  if (!container) return;
  if (_searchFailed && (!_searchIndex || !_searchIndex.length)) {
    container.innerHTML = '<div class="search-empty">Search is unavailable. Try refreshing the page.</div>';
    return;
  }
  if (!_searchIndex || !_searchIndex.length) {
    _renderSearchLoading();
    return;
  }
  var items = _quickAccessItems();
  var html = '<div class="search-group-title">Quick Access</div>';
  items.forEach(function(item, i) {
    html += _renderItem(item, i);
  });
  container.innerHTML = html;
  _searchActive = 0;
  _updateActive();
}

function _renderItem(item, idx) {
  var label = item.section ? (_esc(item.pageTitle || item.title) + ' → ' + _esc(item.section)) : _esc(item.title);
  var desc = item.section ? '' : (item.desc ? '<div class="search-item-desc">' + _esc(item.desc) + '</div>' : '');
  return '<div class="search-item" id="search-opt-' + idx + '" role="option" data-idx="' + idx + '" data-id="' + _esc(item.id) + '"' + (_OFFLINE ? '' : ' onclick="selectSearchItem(this)" onmouseenter="_searchActive=' + idx + ';_updateActive()"') + '>' +
    '<div class="search-item-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div>' +
    '<div class="search-item-text"><div class="search-item-title">' + label + '</div>' +
    desc +
    '</div>' +
    '<span class="search-item-badge">' + _esc(item.group) + '</span>' +
    '</div>';
}

function _renderItemHl(item, idx, query) {
  var title = item.section ? ((item.pageTitle || '') + ' → ' + item.section) : item.title;
  var desc = item.section ? '' : (item.desc ? '<div class="search-item-desc">' + _highlight(item.desc, query) + '</div>' : '');
  return '<div class="search-item" id="search-opt-' + idx + '" role="option" data-idx="' + idx + '" data-id="' + _esc(item.id) + '"' + (_OFFLINE ? '' : ' onclick="selectSearchItem(this)" onmouseenter="_searchActive=' + idx + ';_updateActive()"') + '>' +
    '<div class="search-item-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div>' +
    '<div class="search-item-text"><div class="search-item-title">' + _highlight(title, query) + '</div>' +
    desc +
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
  var results = [];
  if (_searchFlex) {
    var raw = _searchFlex.search(q, { limit: 20, enrich: true });
    var seen = {};
    for (var field of raw) {
      for (var entry of (field.result || [])) {
        if (!seen[entry.id]) {
          seen[entry.id] = true;
          results.push(entry.doc);
        }
      }
    }
  } else if (_searchIndex) {
    var ql = q.toLowerCase();
    for (var doc of _searchIndex) {
      if ((doc.title && doc.title.toLowerCase().includes(ql)) ||
          (doc.desc && doc.desc.toLowerCase().includes(ql)) ||
          (doc.body && doc.body.toLowerCase().includes(ql))) {
        results.push(doc);
        if (results.length >= 20) break;
      }
    }
  } else {
    _renderSearchLoading(); return;
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
  var id = el.dataset.id || '';
  var hash = '';
  var hashIdx = id.indexOf('#');
  if (hashIdx >= 0) {
    hash = id.slice(hashIdx + 1);
    id = id.slice(0, hashIdx);
  }
  closeSearch();
  loadPage(id).then(function() {
    if (hash) {
      var target = document.getElementById(hash);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      try { history.replaceState(history.state, '', (window.location.pathname || '') + '#' + hash); } catch (e) {}
    }
  }).catch(function() {
    loadPage(id);
    if (hash) setTimeout(function() {
      var target = document.getElementById(hash);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  });
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
  var trigger = document.getElementById('search-trigger');
  if (trigger) {
    trigger.addEventListener('pointerenter', _prefetchSearch, { once: true });
    trigger.addEventListener('focus', _prefetchSearch, { once: true });
  }
  _prefetchSearch();
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
  h.classList.remove('light', 'dark');
  if (next === 'light') h.classList.add('light');
  else if (next === 'dark') h.classList.add('dark');
  else if (window.matchMedia('(prefers-color-scheme:dark)').matches) h.classList.add('dark');
  _updateThemeBtn();
}`;
}

function buildA11y() {
  return `
const _A11Y_TEXT_MIN = -3, _A11Y_TEXT_MAX = 5;

function _a11yRemoveTextClasses() {
  var h = document.documentElement;
  for (var i = _A11Y_TEXT_MIN; i <= _A11Y_TEXT_MAX; i++) {
    if (i !== 0) h.classList.remove('a11y-text-' + (i > 0 ? 'p' : 'm') + Math.abs(i));
  }
}

function _a11yUpdateUI() {
  var ts = parseInt(localStorage.getItem('docslit-a11y-textsize')) || 0;
  var el = document.getElementById('a11y-size-value');
  if (el) el.textContent = ts;
  ['contrast', 'grayscale', 'underline'].forEach(function(k) {
    var lbl = document.getElementById('a11y-' + k + '-label');
    if (lbl) {
      var on = localStorage.getItem('docslit-a11y-' + k) === '1';
      lbl.textContent = on ? 'On' : 'Off';
      lbl.closest('.a11y-toggle-row')?.classList.toggle('active', on);
    }
  });
}

function toggleA11yPanel() {
  var panel = document.getElementById('a11y-panel');
  if (!panel) return;
  var open = panel.classList.toggle('open');
  if (open) _a11yUpdateUI();
}

function closeA11yPanel() {
  var panel = document.getElementById('a11y-panel');
  if (panel) panel.classList.remove('open');
}

function a11yTextSize(delta) {
  var cur = parseInt(localStorage.getItem('docslit-a11y-textsize')) || 0;
  var next = Math.max(_A11Y_TEXT_MIN, Math.min(_A11Y_TEXT_MAX, cur + delta));
  _a11yRemoveTextClasses();
  if (next !== 0) document.documentElement.classList.add('a11y-text-' + (next > 0 ? 'p' : 'm') + Math.abs(next));
  localStorage.setItem('docslit-a11y-textsize', String(next));
  _a11yUpdateUI();
}

function a11yToggle(key) {
  var storageKey = 'docslit-a11y-' + key;
  var cls = 'a11y-' + key;
  var on = localStorage.getItem(storageKey) !== '1';
  if (on) {
    localStorage.setItem(storageKey, '1');
    document.documentElement.classList.add(cls);
  } else {
    localStorage.removeItem(storageKey);
    document.documentElement.classList.remove(cls);
  }
  _a11yUpdateUI();
}

function a11yReset() {
  _a11yRemoveTextClasses();
  document.documentElement.classList.remove('a11y-contrast', 'a11y-grayscale', 'a11y-underline');
  localStorage.removeItem('docslit-a11y-textsize');
  localStorage.removeItem('docslit-a11y-contrast');
  localStorage.removeItem('docslit-a11y-grayscale');
  localStorage.removeItem('docslit-a11y-underline');
  _a11yUpdateUI();
}

document.addEventListener('click', function(e) {
  var panel = document.getElementById('a11y-panel');
  var btn = document.getElementById('a11y-btn');
  if (!panel) return;
  if (panel.classList.contains('open') && !panel.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
    closeA11yPanel();
    return;
  }
  if (btn && (e.target === btn || btn.contains(e.target)) && _OFFLINE) { toggleA11yPanel(); return; }
  var t = e.target.closest ? e.target.closest('[data-a11y]') : null;
  if (t && _OFFLINE) { a11yToggle(t.dataset.a11y); return; }
  var sizeBtn = e.target.closest ? e.target.closest('.a11y-size-btn') : null;
  if (sizeBtn && _OFFLINE) { a11yTextSize(sizeBtn.textContent.trim() === '+' ? 1 : -1); return; }
  if (e.target.closest && e.target.closest('.a11y-close') && _OFFLINE) { closeA11yPanel(); return; }
  if (e.target.closest && e.target.closest('.a11y-reset') && _OFFLINE) { a11yReset(); return; }
});

document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') closeA11yPanel();
});

window.toggleA11yPanel = toggleA11yPanel;
window.closeA11yPanel = closeA11yPanel;
window.a11yTextSize = a11yTextSize;
window.a11yToggle = a11yToggle;
window.a11yReset = a11yReset;
`;
}

function buildStyles(resolvedTheme = null) {
  const resolved = resolvedTheme ?? resolveSiteThemeSync(null);
  const themeCss = buildThemeCss(resolved);
  return `<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

@font-face { font-family: 'Inter-fallback'; src: local('Arial'); size-adjust: 107%; ascent-override: 90%; descent-override: 22%; line-gap-override: 0%; }
@font-face { font-family: 'JetBrains-fallback'; src: local('Courier New'); size-adjust: 118%; ascent-override: 77%; descent-override: 20%; line-gap-override: 0%; }

:root {
  --bg: #0a0a0a; --surface: #111; --surface2: #1a1a1a; --surface3: #222;
  --border: #2a2a2a; --border2: #3a3a3a;
  --text: #f0f0f0; --text2: #a0a0a0; --text3: #666;
  --accent: #01696f; --accent-light: #4f98a3;
  --accent-dim: rgba(1,105,111,.15); --accent-dim2: rgba(1,105,111,.25);
  --sidebar-bg: #0f0f0f; --code-bg: #161616; --code-text: #e2e8f0;
  --font-sans: 'Inter', 'Inter-fallback', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-mono: 'JetBrains Mono', 'JetBrains-fallback', 'Fira Code', 'Cascadia Code', monospace;
  --radius: 8px; --radius-lg: 12px;
  --nav-h: 60px; --announcement-h: 0px; --chrome-h: calc(var(--nav-h) + var(--announcement-h)); --sidebar-w: 264px;
}
html.announcement-dismissed { --announcement-h: 0px; }
html.announcement-dismissed #announcement-banner { display: none; }
html.light {
  --bg: #ffffff; --surface: #f8f8f8; --surface2: #f0f0f0; --surface3: #e8e8e8;
  --border: #e2e2e2; --border2: #d0d0d0;
  --text: #0f0f0f; --text2: #555; --text3: #737373;
  --accent-light: #015e63;
  --accent-dim: rgba(1,105,111,.08); --accent-dim2: rgba(1,105,111,.15);
  --sidebar-bg: #f5f5f5; --code-bg: #f6f8fa; --code-text: #24292f;
}
${themeCss}
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
  font-size: 16px;
  -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
  font-feature-settings: 'cv02', 'cv03', 'cv04', 'cv11';
  hanging-punctuation: first last;
  transition: background .2s, color .2s;
}

/* ANNOUNCEMENT */
.announcement-banner {
  position: fixed; top: 0; left: 0; right: 0; z-index: 350;
  display: flex; align-items: center; justify-content: center; gap: 12px;
  padding: 10px 44px 10px 20px;
  font-family: var(--font-sans); font-size: 13px; line-height: 1.55; text-align: center;
  border-bottom: 1px solid;
}
.announcement-inner { flex: 1; min-width: 0; }
.announcement-inner p { margin: 0; }
.announcement-inner a { color: inherit; text-decoration: underline; text-underline-offset: 2px; }
.announcement-dismiss {
  position: absolute; right: 12px; top: 50%; transform: translateY(-50%);
  background: none; border: none; cursor: pointer; color: inherit; opacity: .55;
  font-size: 16px; line-height: 1; padding: 4px 6px; flex-shrink: 0; transition: opacity .15s;
}
.announcement-dismiss:hover { opacity: 1; }
.announcement-dismiss:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; border-radius: 2px; }
.announcement-neutral { background: var(--surface, #111); border-color: var(--border); color: var(--text2); }
.announcement-info { background: #0c1a2e; border-color: rgba(59,130,246,.45); color: #93c5fd; }
html.light .announcement-info { background: #eff6ff; color: #1d4ed8; border-color: rgba(37,99,235,.35); }
.announcement-warning { background: #1c1408; border-color: rgba(245,158,11,.45); color: #fcd34d; }
html.light .announcement-warning { background: #fffbeb; color: #b45309; border-color: rgba(180,83,9,.3); }
.announcement-success { background: #071a14; border-color: rgba(16,185,129,.45); color: #34d399; }
html.light .announcement-success { background: #ecfdf5; color: #047857; border-color: rgba(4,120,87,.3); }
.announcement-error { background: #1a0c0c; border-color: rgba(239,68,68,.45); color: #f87171; }
html.light .announcement-error { background: #fef2f2; color: #dc2626; border-color: rgba(220,38,38,.3); }

/* NAV */
.nav {
  position: fixed; top: var(--announcement-h); left: 0; right: 0; z-index: 300;
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
  border-radius: 7px;
}
.nav-logo-text { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.nav-links { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
.nav-ext-link { font-size: 13px; font-weight: 500; color: var(--dl-text-muted, #94a3b8); text-decoration: none; padding: 6px 10px; border-radius: 6px; }
.nav-ext-link:hover { color: var(--dl-text, #f8fafc); background: rgba(255,255,255,.06); }
.locale-switcher { font-size: 12px; font-weight: 600; background: transparent; border: 1px solid var(--dl-border, rgba(255,255,255,.12)); color: inherit; border-radius: 6px; padding: 5px 8px; }
.site-footer { background: var(--surface); border-top: 1px solid var(--border); }
.site-footer-inner { max-width: 1560px; margin: 0 auto; padding: 40px 24px 28px; display: flex; flex-direction: column; gap: 32px; }
.site-footer-columns { display: flex; flex-wrap: wrap; gap: 32px 64px; justify-content: center; }
.site-footer-col { display: flex; flex-direction: column; gap: 8px; min-width: 120px; }
.site-footer-col-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: var(--text); margin-bottom: 4px; }
.site-footer-col a { color: var(--text2); text-decoration: none; font-size: 13px; line-height: 1.6; }
.site-footer-col a:hover { color: var(--text); }
.site-footer-bottom { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; padding-top: 20px; border-top: 1px solid var(--border); }
.site-footer-links { display: flex; flex-wrap: wrap; gap: 8px 20px; }
.site-footer-links a { color: var(--text2); text-decoration: none; font-size: 13px; }
.site-footer-links a:hover { color: var(--text); }
.site-footer-copy { font-size: 12px; color: var(--text3); }
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
  position: fixed; inset: var(--chrome-h) 0 0 0;
  background: rgba(0,0,0,.6);
  z-index: 199;
  backdrop-filter: blur(2px); -webkit-backdrop-filter: blur(2px);
  cursor: pointer;
}
.sidebar-overlay.open { display: block; }

/* LAYOUT */
.docs-page { padding-top: var(--chrome-h); min-height: 100vh; }
.docs-layout {
  display: flex; max-width: 1560px; margin: 0 auto;
  min-height: calc(100vh - var(--chrome-h));
}

/* SIDEBAR */
.docs-sidebar {
  width: var(--sidebar-w); flex-shrink: 0;
  background: var(--sidebar-bg);
  border-right: 1px solid var(--border);
  padding: 0;
  position: sticky; top: var(--chrome-h);
  height: calc(100vh - var(--chrome-h));
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
  height: 44px; box-sizing: border-box;
  padding: 0 14px;
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
.sidebar-subgroup { margin-bottom: 2px; }
.sidebar-subgroup-title { padding: 10px 18px 4px; font-size: 13px; font-weight: 600; color: var(--text2); }
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
.sidebar-mode-link { padding: 12px 18px; border-top: 1px solid var(--border); margin-top: 8px; }
.sidebar-mode-item { display: flex !important; align-items: center; gap: 8px; font-weight: 500 !important; color: var(--accent-light) !important; border-left: none !important; }
.sidebar-mode-item:hover { color: var(--accent-light) !important; background: var(--accent-dim) !important; }
.nav-mode-link {
  font-family: var(--font-sans); font-size: 13px; font-weight: 500;
  color: var(--text2); text-decoration: none; padding: 6px 12px;
  border-radius: var(--radius); transition: color .15s, background .15s; cursor: pointer;
}
.nav-mode-link:hover { color: var(--accent-light); background: var(--surface2); }

/* MAIN COLUMN */
.docs-main-col { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.docs-nav-top {
  position: sticky; top: var(--chrome-h); height: 44px;
  background: var(--bg); border-bottom: 1px solid var(--border);
  display: flex; align-items: center; padding: 0 52px; z-index: 40;
  box-shadow: 100vw 0 0 0 var(--bg), 100vw 1px 0 0 var(--border);
}
.docs-breadcrumb { font-size: 13px; color: var(--text3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.docs-breadcrumb span { color: var(--text2); }
.docs-main { flex: 1; display: flex; justify-content: center; }

/* CONTENT */
.docs-content { flex: 0 1 780px; min-width: 0; max-width: 780px; padding: 48px 56px 80px; }

/* TOC */
.docs-toc {
  width: 216px; flex-shrink: 0;
  padding: 48px 0 48px 16px;
  position: sticky; top: calc(var(--chrome-h) + 44px);
  align-self: flex-start;
  max-height: calc(100vh - var(--chrome-h) - 44px);
  overflow-y: hidden; scrollbar-width: none;
  display: flex; flex-direction: column;
}
.docs-toc::-webkit-scrollbar, .toc-scroll::-webkit-scrollbar { display: none; }
.toc-scroll { flex: 1; min-height: 0; overflow-y: auto; scrollbar-width: none; padding-right: 24px; }
.toc-actions { flex-shrink: 0; display: flex; flex-direction: column; gap: 1px; padding: 12px 24px 0 0; margin-top: 12px; border-top: 1px solid var(--border); opacity: 0; pointer-events: none; transform: translateY(6px); transition: opacity .22s ease, transform .22s ease; }
.toc-actions.toc-actions-visible { opacity: 1; pointer-events: auto; transform: translateY(0); }
.toc-actions-solo { border-top: none; margin-top: 4px; padding-top: 0; }
.toc-action-btn { display: flex; align-items: center; gap: 7px; background: none; border: none; padding: 5px 0; font-family: var(--font-sans); font-size: 12px; color: var(--text3); cursor: pointer; text-align: left; width: 100%; transition: color .15s; text-decoration: none; }
.toc-action-btn:hover { color: var(--text2); }
.toc-action-btn svg { flex-shrink: 0; }
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
.docs-content h1, .docs-content h2, .docs-content h3, .docs-content h4 { font-feature-settings: 'ss01'; }
.docs-content h1 { font-size: 3rem; font-weight: 500; letter-spacing: -.04em; margin-bottom: 20px; line-height: 1.1; color: var(--text); text-wrap: balance; }
.docs-content h2 { font-size: 1.875rem; font-weight: 500; letter-spacing: -.03em; line-height: 1.2; margin: 56px 0 16px; color: var(--text); }
.docs-content h3 { font-size: 1.375rem; font-weight: 500; letter-spacing: -.02em; line-height: 1.3; margin: 40px 0 12px; color: var(--text); }
.docs-content h4 { font-size: 1.125rem; font-weight: 500; letter-spacing: -.01em; line-height: 1.4; margin: 32px 0 8px; color: var(--text); }
.docs-content p { color: var(--text2); line-height: 1.6; margin-bottom: 16px; text-wrap: pretty; }
.docs-content ul, .docs-content ol { color: var(--text2); line-height: 1.6; margin: 0 0 16px 24px; }
.docs-content li { margin-bottom: 6px; }
.docs-content li > ul, .docs-content li > ol { margin-top: 6px; margin-bottom: 6px; }
.docs-content li::marker { color: var(--text3); }
.docs-content strong { color: var(--text); font-weight: 600; }
.docs-content code { font-family: var(--font-mono); font-size: .8125em; background: var(--surface2); border: 1px solid var(--border); padding: 3px 7px; border-radius: 4px; color: var(--accent-light); word-break: break-word; font-feature-settings: 'ss01'; }
.docs-content pre { background: var(--code-bg); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 20px 24px; overflow-x: auto; margin: 24px 0; -webkit-overflow-scrolling: touch; tab-size: 2; }
.docs-content pre code { background: none; border: none; padding: 0; color: var(--code-text); font-size: 14px; line-height: 1.7; word-break: normal; font-variant-ligatures: none; }
.docs-content a { color: var(--accent-light); text-decoration: none; transition: color .15s; }
.docs-content a:hover { text-decoration: underline; text-underline-offset: 3px; text-decoration-thickness: 1px; }
.docs-content .table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; border: 1px solid var(--border); border-radius: var(--radius-lg); margin: 20px 0; }
.docs-content table { width: 100%; border-collapse: collapse; font-size: 15px; min-width: 480px; }
.docs-content .table-wrap table { margin: 0; min-width: unset; }
.docs-content th { text-align: left; padding: 12px 16px; background: var(--surface); border-bottom: 1px solid var(--border); font-weight: 600; color: var(--text2); white-space: nowrap; }
.docs-content td { padding: 12px 16px; border-bottom: 1px solid var(--border); color: var(--text2); vertical-align: top; line-height: 1.6; font-variant-numeric: tabular-nums; }
.docs-content tr:last-child td { border-bottom: none; }
.docs-content tr:hover td { background: rgba(255,255,255,.015); }
html.light .docs-content tr:hover td { background: rgba(0,0,0,.015); }
.docs-content blockquote { border-left: 3px solid var(--accent); padding: 14px 24px; background: var(--surface); border-radius: 0 8px 8px 0; margin: 24px 0; color: var(--text2); }
.docs-content blockquote p:last-child { margin-bottom: 0; }
.docs-content hr { border: none; border-top: 1px solid var(--border); margin: 40px 0; }
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
wc-columns:not(:defined) { display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px; }
wc-columns:not(:defined)[cols="3"] { grid-template-columns: repeat(3, 1fr); }
wc-columns:not(:defined)[cols="4"] { grid-template-columns: repeat(4, 1fr); }
@media(max-width:768px) { wc-columns:not(:defined) { grid-template-columns: 1fr !important; } }
wc-tiles:not(:defined) { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; min-height: 120px; }
@media(max-width:768px) { wc-tiles:not(:defined) { grid-template-columns: 1fr; } }
wc-tabs:not(:defined), wc-code-group:not(:defined) { min-height: 120px; }
wc-accordion:not(:defined), wc-expandable:not(:defined) { min-height: 52px; }

/* PAGE META */
.page-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; padding: 0 0 24px; font-size: 13px; color: var(--text3); border-bottom: 1px solid var(--border); margin-bottom: 28px; }
.meta-sep { color: var(--border); font-size: 14px; user-select: none; }
.meta-btn { display: inline-flex; align-items: center; gap: 5px; background: none; border: none; padding: 0; font-family: var(--font-sans); font-size: 13px; color: var(--text3); cursor: pointer; text-decoration: none; transition: color .15s; }
.meta-btn:hover { color: var(--accent-light); }
.meta-btn svg { flex-shrink: 0; }

/* PDF DOWNLOAD MENU */
.pdf-menu { position: relative; display: inline-flex; }
.pdf-menu-btn { gap: 4px; }
.pdf-menu-chevron { font-size: 10px; opacity: 0.7; margin-left: 2px; }
.pdf-menu-dropdown {
  position: absolute; top: calc(100% + 6px); right: 0; z-index: 200;
  min-width: 220px; padding: 6px;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius); box-shadow: 0 8px 24px rgba(0,0,0,.35);
}
.pdf-menu-dropdown[hidden] { display: none !important; }
.pdf-menu-item {
  display: block; width: 100%; text-align: left;
  padding: 8px 12px; border: none; border-radius: 6px;
  font-family: var(--font-sans); font-size: 13px; font-weight: 500;
  color: var(--text2); background: none; cursor: pointer;
  text-decoration: none; box-sizing: border-box;
}
.pdf-menu-item:hover { background: var(--surface2); color: var(--text); }
.pdf-menu-item:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
@media print { .pdf-menu { display: none !important; } }

/* COPY PAGE SPLIT BUTTON */
.copy-page-menu { position: relative; display: inline-flex; align-items: center; }
.copy-page-main { border-right: none; }
.copy-page-toggle { padding: 2px 6px !important; margin-left: -2px; gap: 0 !important; }
.copy-page-chevron { display: inline-flex; align-items: center; }
.copy-page-dropdown {
  position: absolute; top: calc(100% + 6px); right: 0; z-index: 200;
  min-width: 300px; padding: 6px;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius); box-shadow: 0 8px 24px rgba(0,0,0,.35);
}
.copy-page-dropdown[hidden] { display: none !important; }
.copy-page-item {
  display: flex; align-items: flex-start; gap: 10px; width: 100%; text-align: left;
  padding: 10px 12px; border: none; border-radius: 6px;
  font-family: var(--font-sans); font-size: 13px;
  color: var(--text2); background: none; cursor: pointer;
  text-decoration: none; box-sizing: border-box;
}
.copy-page-item:hover { background: var(--surface2); color: var(--text); }
.copy-page-item:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.copy-page-item-icon { flex-shrink: 0; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; margin-top: 1px; opacity: 0.7; }
.copy-page-item-text { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.copy-page-item-title { font-weight: 600; font-size: 13px; color: var(--text); white-space: nowrap; }
.copy-page-item-desc { font-size: 12px; color: var(--text3); }
.copy-page-arrow { font-size: 11px; opacity: 0.6; }
.toc-copy-menu { display: flex; align-items: center; white-space: nowrap; }
.toc-copy-menu .toc-action-btn { width: auto; }
.toc-chevron { padding: 5px 2px !important; margin-left: 0 !important; flex-shrink: 0; }
.toc-copy-menu .copy-page-dropdown { top: calc(100% + 6px); bottom: auto; right: auto; left: 0; }
@media print { .copy-page-menu { display: none !important; } }

/* EDIT THIS PAGE */
.page-edit { margin: 48px 0 0; }
.page-edit a { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 500; color: var(--text3); text-decoration: none; transition: color .15s; }
.page-edit a:hover { color: var(--accent); }
.page-edit a svg { flex-shrink: 0; }

/* PREV / NEXT */
.page-nav { display: flex; justify-content: space-between; gap: 12px; margin: 56px 0 0; padding-top: 24px; border-top: 1px solid var(--border); }
.page-edit + .page-nav { margin-top: 24px; }
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
.search-loading { padding: 8px 0 12px; }
.search-loading-label {
  display: flex; align-items: center; justify-content: center; gap: 10px;
  padding: 8px 18px 14px; font-size: 13px; color: var(--text3);
}
.search-spinner {
  width: 14px; height: 14px; border-radius: 50%;
  border: 2px solid var(--border2, var(--border));
  border-top-color: var(--accent-light, var(--accent, #38bdf8));
  animation: searchSpin .7s linear infinite; flex-shrink: 0;
}
@keyframes searchSpin { to { transform: rotate(360deg); } }
.search-skel {
  display: flex; align-items: center; gap: 12px; padding: 10px 18px;
}
.search-skel-icon {
  width: 28px; height: 28px; border-radius: 6px; flex-shrink: 0;
  background: var(--surface2); border: 1px solid var(--border);
}
.search-skel-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.search-skel-line {
  height: 10px; border-radius: 4px; width: 72%;
  background: linear-gradient(90deg, var(--surface2) 0%, var(--surface3) 50%, var(--surface2) 100%);
  background-size: 200% 100%;
  animation: searchShimmer 1.2s ease-in-out infinite;
}
.search-skel-line.short { width: 44%; }
@keyframes searchShimmer {
  0% { background-position: 100% 0; }
  100% { background-position: -100% 0; }
}
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

/* API LAYOUT — three-column Stripe-style for API reference pages */
.api-layout .docs-main { justify-content: flex-start; }
.api-layout .docs-content { flex: 1 1 auto; max-width: 720px; padding: 48px 40px 80px; }
.api-layout .docs-toc { display: none; }
.api-layout .docs-examples {
  width: 480px; flex-shrink: 0;
  background: transparent;
  position: sticky; top: calc(var(--chrome-h) + 44px);
  align-self: flex-start; max-height: calc(100vh - var(--chrome-h) - 44px);
  overflow-y: auto; padding: 48px 24px 24px;
}
.docs-examples { display: none; }
.api-layout .docs-examples { display: block; }
.api-examples-inline { display: none; }
.method-badge { font-family: var(--font-mono); font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 3px; text-transform: uppercase; margin-right: 6px; }
.method-badge.get { background: rgba(16,185,129,.15); color: #34d399; }
.method-badge.post { background: rgba(59,130,246,.15); color: #60a5fa; }
.method-badge.put, .method-badge.patch { background: rgba(245,158,11,.15); color: #fbbf24; }
.method-badge.delete { background: rgba(239,68,68,.15); color: #f87171; }
.api-nav-item { font-size: 13px !important; font-family: var(--font-sans); display: flex !important; align-items: center; justify-content: space-between; gap: 8px; }
.api-nav-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.sidebar-tag-section { margin: 0 0 4px; }
.sidebar-tag-title { font-size: 13px; font-weight: 600; color: var(--text); padding: 6px 16px 4px; }

/* RESPONSIVE */
@media(max-width:1280px) {
  .docs-toc { display: none; }
  .api-layout .docs-examples { display: none; }
  .api-layout .docs-content { max-width: 100%; }
  .api-layout .docs-content .api-examples-inline { display: block; margin-top: 32px; padding-top: 24px; border-top: 1px solid var(--border); }
  /* No TOC means content can grow naturally — restore flex grow + full width. */
  .docs-content { flex: 1 1 auto; max-width: 100%; }
}
@media(max-width:1100px) {
  .docs-content { padding: 40px 44px 72px; }
}
@media(max-width:1024px) {
  .nav-menu-btn { display: flex; }
  .docs-sidebar {
    position: fixed; top: var(--chrome-h); left: 0; height: calc(100vh - var(--chrome-h)); height: calc(100dvh - var(--chrome-h));
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
  .docs-content h1 { font-size: 2.25rem; }
  .docs-content h2 { font-size: 1.5rem; margin: 40px 0 12px; }
  .docs-content h3 { font-size: 1.125rem; }
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
  .docs-content h1 { font-size: 1.875rem; }
  .docs-content h2 { font-size: 1.375rem; margin: 36px 0 10px; }
  .docs-content h3 { font-size: 1.0625rem; }
  .docs-content pre { padding: 14px 16px; }
  .docs-nav-top { height: 40px; padding: 0 16px; }
  .docs-breadcrumb { font-size: 12px; }
  .page-nav { flex-direction: column; }
  .page-nav-btn, .page-nav-btn.next { max-width: 100%; text-align: left; }
  .page-meta { gap: 8px; font-size: 12px; padding-bottom: 20px; margin-bottom: 20px; }
}
@media(max-width:400px) {
  .docs-content { padding: 20px 16px 40px; }
  .docs-content h1 { font-size: 1.625rem; }
}

/* ACCESSIBILITY WIDGET */
.a11y-btn {
  width: 34px; height: 34px;
  background: var(--surface2); border: 1px solid var(--border);
  border-radius: var(--radius);
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  color: var(--text2); transition: all .15s;
}
.a11y-btn:hover { background: var(--surface3); }
.a11y-panel {
  display: none; position: fixed; top: calc(var(--chrome-h) + 4px); right: 54px;
  width: 300px; background: var(--bg); border: 1px solid var(--border);
  border-radius: var(--radius-lg); box-shadow: 0 8px 32px rgba(0,0,0,.18);
  z-index: 1000; font-family: var(--font-sans); overflow: hidden;
}
.a11y-panel.open { display: block; }
.a11y-header {
  display: flex; align-items: center; gap: 8px;
  padding: 14px 16px; border-bottom: 1px solid var(--border);
  color: var(--text);
}
.a11y-title { font-size: 15px; font-weight: 600; flex: 1; }
.a11y-close {
  width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;
  background: none; border: none; cursor: pointer; border-radius: var(--radius);
  color: var(--text3); font-size: 18px; line-height: 1; transition: all .15s;
}
.a11y-close:hover { background: var(--surface2); color: var(--text); }
.a11y-row {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 16px; font-size: 14px; color: var(--text);
}
.a11y-row-icon { flex-shrink: 0; display: flex; color: var(--text3); }
.a11y-row-label { flex: 1; }
.a11y-toggle-row { cursor: pointer; transition: background .15s; border-radius: 0; }
.a11y-toggle-row:hover { background: var(--surface2); }
.a11y-toggle-row.active .a11y-toggle-label { color: var(--accent-light); font-weight: 600; }
.a11y-toggle-label { font-size: 13px; color: var(--text3); font-weight: 500; }
.a11y-size-controls { display: flex; align-items: center; gap: 0; }
.a11y-size-btn {
  width: 30px; height: 30px; display: flex; align-items: center; justify-content: center;
  background: var(--surface2); border: 1px solid var(--border);
  cursor: pointer; font-size: 15px; color: var(--text2); transition: all .15s;
  font-family: var(--font-sans); line-height: 1;
}
.a11y-size-btn:first-child { border-radius: var(--radius) 0 0 var(--radius); }
.a11y-size-btn:last-child { border-radius: 0 var(--radius) var(--radius) 0; }
.a11y-size-btn:hover { background: var(--surface3); color: var(--text); }
.a11y-size-value {
  width: 32px; height: 30px; display: flex; align-items: center; justify-content: center;
  font-size: 13px; font-weight: 600; color: var(--text);
  border-top: 1px solid var(--border); border-bottom: 1px solid var(--border);
  background: var(--bg);
}
.a11y-reset {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  width: calc(100% - 32px); margin: 8px 16px 14px; padding: 10px;
  background: var(--surface2); border: 1px solid var(--border);
  border-radius: var(--radius); cursor: pointer;
  font-family: var(--font-sans); font-size: 13px; font-weight: 500;
  color: var(--text2); transition: all .15s;
}
.a11y-reset:hover { background: var(--surface3); color: var(--text); }
/* Accessibility effect classes */
.a11y-text-p1 .docs-content { font-size: 17px; }
.a11y-text-p2 .docs-content { font-size: 19px; }
.a11y-text-p3 .docs-content { font-size: 21px; }
.a11y-text-p4 .docs-content { font-size: 23px; }
.a11y-text-p5 .docs-content { font-size: 25px; }
.a11y-text-m1 .docs-content { font-size: 14px; }
.a11y-text-m2 .docs-content { font-size: 13px; }
.a11y-text-m3 .docs-content { font-size: 12px; }
html.a11y-contrast { --text: #000; --text2: #111; --text3: #333; --border: #555; --border2: #777; }
html.a11y-contrast.light, html.light.a11y-contrast { --text: #000; --text2: #111; --text3: #333; --border: #888; --border2: #666; --bg: #fff; --surface: #f0f0f0; --surface2: #e0e0e0; --surface3: #d0d0d0; }
html.a11y-contrast:not(.light) { --text: #fff; --text2: #eee; --text3: #ccc; --bg: #000; --surface: #111; --surface2: #1a1a1a; --surface3: #222; }
html.a11y-grayscale body { filter: grayscale(1); }
html.a11y-underline .docs-content a { text-decoration: underline !important; text-decoration-thickness: 2px !important; text-underline-offset: 3px; }
@media(max-width:640px) {
  .a11y-panel { right: 8px; left: 8px; width: auto; }
}
@media print {
  .a11y-btn, .a11y-panel { display: none !important; }
}

/* SKIP LINK */
.skip-link {
  position: fixed; top: -100px; left: 16px; z-index: 9999;
  padding: 8px 16px; background: var(--accent); color: #fff;
  font-family: var(--font-sans); font-size: 14px; font-weight: 600;
  border-radius: 0 0 var(--radius) var(--radius);
  text-decoration: none; transition: top .15s;
}
.skip-link:focus { top: var(--announcement-h); outline: none; }

/* FOCUS INDICATORS */
*:focus-visible {
  outline: 2px solid var(--accent); outline-offset: 2px;
  border-radius: 4px;
}
.sidebar-item:focus-visible { outline-offset: -2px; }
.search-input:focus-visible { outline: none; }
.a11y-btn:focus-visible, .theme-btn:focus-visible, .nav-menu-btn:focus-visible,
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

/* PRINT / SAVE AS PDF */
@media print {
  @page { margin: 1.5cm 2cm; size: A4; }
  body { background: #fff !important; color: #000 !important; font-size: 12pt; }
  .docs-sidebar, .docs-toc, .docs-examples, .docs-nav-top, .docs-topbar,
  .nav, .announcement-banner, .page-meta, .page-nav, .page-edit, .search-overlay, .skip-link, .sidebar-toggle,
  .nav-menu-btn, .feedback-widget, .pdf-menu, .copy-page-menu { display: none !important; }
  .docs-layout { display: block !important; }
  .docs-main { margin: 0 !important; padding: 0 !important; max-width: 100% !important; }
  .docs-content { padding: 0 !important; max-width: 100% !important; }
  .docs-content h1 { font-size: 24pt; font-weight: 500; margin-top: 0; }
  .docs-content h2 { font-size: 18pt; font-weight: 500; }
  .docs-content h3 { font-size: 14pt; font-weight: 500; }
  .docs-content a { color: #000 !important; text-decoration: underline; }
  .docs-content a[href^="http"]::after { content: " (" attr(href) ")"; font-size: 9pt; color: #555; word-break: break-all; }
  .docs-content pre { border: 1px solid #ddd; padding: 12px; page-break-inside: avoid; break-inside: avoid; white-space: pre-wrap; word-wrap: break-word; font-size: 9pt; background: #f8f8f8 !important; color: #000 !important; }
  .docs-content code { background: #f0f0f0 !important; color: #000 !important; }
  .docs-content img { max-width: 100% !important; page-break-inside: avoid; break-inside: avoid; }
  .docs-content table { page-break-inside: avoid; break-inside: avoid; }
  .docs-content wc-code-block, .docs-content wc-code-group,
  .docs-content wc-callout, .docs-content wc-warning, .docs-content wc-info, .docs-content wc-tip, .docs-content wc-check, .docs-content wc-note,
  .docs-content wc-panel, .docs-content wc-steps, .docs-content wc-tabs,
  .docs-content wc-accordion, .docs-content wc-expandable,
  .docs-content blockquote { page-break-inside: avoid; break-inside: avoid; }
  h2, h3, h4 { page-break-after: avoid; break-after: avoid; }
}
</style>`;
}
