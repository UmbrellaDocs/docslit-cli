/**
 * Site customization helpers: basePath, analytics, head/css/navbar/footer.
 */

export function normalizeBasePath(raw) {
  if (!raw || raw === '/') return '';
  let p = String(raw).trim();
  if (!p.startsWith('/')) p = '/' + p;
  return p.replace(/\/+$/, '');
}

export function withBasePath(basePath, href) {
  const base = normalizeBasePath(basePath);
  if (!href) return base || '/';
  if (/^(https?:|mailto:|tel:|#)/i.test(href)) return href;
  const path = href.startsWith('/') ? href : '/' + href;
  return base + path;
}

export function buildAnalyticsSnippet(analytics) {
  if (!analytics || typeof analytics !== 'object') return '';
  const provider = String(analytics.provider || '').toLowerCase();
  if (provider === 'plausible') {
    const domain = analytics.domain || analytics.siteId;
    if (!domain) return '';
    const src = analytics.src || 'https://plausible.io/js/script.js';
    return `<script defer data-domain="${escAttr(domain)}" src="${escAttr(src)}"></script>`;
  }
  if (provider === 'fathom') {
    const siteId = analytics.siteId || analytics.domain;
    if (!siteId) return '';
    const src = analytics.src || 'https://cdn.usefathom.com/script.js';
    return `<script src="${escAttr(src)}" data-site="${escAttr(siteId)}" defer></script>`;
  }
  if (provider === 'ga4' || provider === 'google') {
    const id = analytics.measurementId || analytics.siteId;
    if (!id) return '';
    return `<script async src="https://www.googletagmanager.com/gtag/js?id=${escAttr(id)}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config',${JSON.stringify(id)});</script>`;
  }
  if (provider === 'posthog') {
    const key = analytics.apiKey || analytics.siteId;
    const host = analytics.host || 'https://us.i.posthog.com';
    if (!key) return '';
    return `<script>
!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey getNextSurveyStep identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property get_session_property createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
posthog.init(${JSON.stringify(key)},{api_host:${JSON.stringify(host)}});
</script>`;
  }
  return '';
}

export function buildCustomHead(head) {
  if (!head) return '';
  if (Array.isArray(head)) return head.map(String).join('\n  ');
  return String(head);
}

export function buildNavbarLinksHtml(navbar, basePath = '', offline = false) {
  const links = navbar?.links;
  if (!Array.isArray(links) || !links.length) return '';
  return links.map((link) => {
    const label = escHtml(link.label || link.title || link.href || '');
    const href = withBasePath(basePath, link.href || '#');
    const external = link.external || /^https?:/i.test(link.href || '');
    const target = external ? ' target="_blank" rel="noopener noreferrer"' : '';
    const click = !offline && !external && href.startsWith(normalizeBasePath(basePath) || '/')
      ? ''
      : '';
    return `<a class="nav-ext-link" href="${escAttr(href)}"${target}${click}>${label}</a>`;
  }).join('');
}

export function buildFooterHtml(footer, basePath = '') {
  if (!footer || typeof footer !== 'object') return '';
  const copyright = footer.copyright ? `<div class="site-footer-copy">${escHtml(footer.copyright)}</div>` : '';
  let linksHtml = '';
  if (Array.isArray(footer.links) && footer.links.length) {
    linksHtml = `<div class="site-footer-links">${footer.links.map((l) => {
      const href = withBasePath(basePath, l.href || '#');
      const external = l.external || /^https?:/i.test(l.href || '');
      const target = external ? ' target="_blank" rel="noopener noreferrer"' : '';
      return `<a href="${escAttr(href)}"${target}>${escHtml(l.label || l.title || '')}</a>`;
    }).join('')}</div>`;
  }
  let columnsHtml = '';
  if (Array.isArray(footer.columns) && footer.columns.length) {
    columnsHtml = `<div class="site-footer-columns">${footer.columns.map((col) => {
      const title = col.title ? `<div class="site-footer-col-title">${escHtml(col.title)}</div>` : '';
      const items = (col.links || []).map((l) => {
        const href = withBasePath(basePath, l.href || '#');
        const external = l.external || /^https?:/i.test(l.href || '');
        const target = external ? ' target="_blank" rel="noopener noreferrer"' : '';
        return `<a href="${escAttr(href)}"${target}>${escHtml(l.label || l.title || '')}</a>`;
      }).join('');
      return `<div class="site-footer-col">${title}${items}</div>`;
    }).join('')}</div>`;
  }
  if (!copyright && !linksHtml && !columnsHtml) return '';
  const bottomRow = (linksHtml || copyright)
    ? `<div class="site-footer-bottom">${linksHtml}${copyright}</div>`
    : '';
  return `<footer class="site-footer"><div class="site-footer-inner">${columnsHtml}${bottomRow}</div></footer>`;
}

export function faviconLinks(config, assetPrefix = '') {
  if (config.favicon) {
    const href = config.favicon.startsWith('http') ? config.favicon : assetPrefix + (config.favicon.startsWith('/') ? config.favicon.slice(1) : config.favicon);
    return `<link rel="icon" href="${escAttr(href)}">`;
  }
  return `<link rel="icon" type="image/png" sizes="32x32" href="${assetPrefix}favicon-32x32.png">
  <link rel="icon" type="image/png" sizes="16x16" href="${assetPrefix}favicon-16x16.png">
  <link rel="apple-touch-icon" sizes="180x180" href="${assetPrefix}apple-touch-icon.png">`;
}

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function escAttr(s) {
  return escHtml(s);
}
