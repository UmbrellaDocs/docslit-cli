/**
 * Site customization helpers: basePath, analytics, head/css/navbar/footer.
 */
import { renderIcon } from './nav-icons.js';
import { normalizeNavbar, normalizeSocials, normalizeLogo } from './navigation.js';

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

const NAV_EXT_ARROW = '<svg class="nav-ext-arrow" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17L17 7M8 7h9v9"/></svg>';
const NAV_CHEVRON = '<svg class="nav-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>';
const NAV_STAR = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.5l2.95 5.98 6.6.96-4.78 4.66 1.13 6.57L12 17.56l-5.9 3.1 1.13-6.57L2.45 9.44l6.6-.96z"/></svg>';

function linkAttrs(l, basePath) {
  const href = l.external ? l.href : withBasePath(basePath, l.href || '#');
  const target = l.target || (l.external ? '_blank' : '');
  const rel = target === '_blank' ? ' rel="noopener noreferrer"' : '';
  return `href="${escAttr(href)}"${target ? ` target="${escAttr(target)}"` : ''}${rel}`;
}

function iconFor(name, basePath, size = 16) {
  return name ? renderIcon(name, { size, className: 'nav-icon', resolveSrc: (s) => (s.startsWith('/') ? withBasePath(basePath, s) : s) }) : '';
}

/** One normalised navbar entry -> HTML. `kind`: "bar" (header) or "drawer" (mobile). */
function renderNavbarEntry(l, basePath) {
  const icon = iconFor(l.icon, basePath);
  const right = iconFor(l.rightIcon, basePath);
  if (l.type === 'dropdown') {
    const items = l.links.map((d) => `<a class="nav-dropdown-item" role="menuitem" ${linkAttrs(d, basePath)}>${iconFor(d.icon, basePath)}<span>${escHtml(d.label)}</span>${d.external ? NAV_EXT_ARROW : ''}</a>`).join('');
    return `<div class="nav-dropdown"><button type="button" class="nav-ext-link nav-dropdown-btn" aria-haspopup="menu" aria-expanded="false">${icon}<span>${escHtml(l.label)}</span>${NAV_CHEVRON}</button><div class="nav-dropdown-menu" role="menu" aria-label="${escAttr(l.label)}">${items}</div></div>`;
  }
  if (l.type === 'github') {
    return `<a class="nav-ext-link nav-github" ${linkAttrs({ ...l, external: true }, basePath)} data-repo="${escAttr(l.repo)}">${renderIcon('github', { size: 18, className: 'nav-icon' })}<span class="nav-github-label">${escHtml(l.label)}</span>${l.stars ? `<span class="nav-github-stars" aria-label="GitHub stars">${NAV_STAR}<span class="nav-github-count"></span></span>` : ''}</a>`;
  }
  if (l.type === 'filled' || l.type === 'outlined') {
    return `<a class="nav-btn nav-btn-${l.type}${l.rounded ? ' nav-btn-rounded' : ''}" ${linkAttrs(l, basePath)}>${icon}<span>${escHtml(l.label)}</span>${right}</a>`;
  }
  const discord = l.type === 'discord' ? renderIcon('discord', { size: 16, className: 'nav-icon' }) : '';
  return `<a class="nav-ext-link" ${linkAttrs(l, basePath)}>${discord || icon}${l.type === 'discord' || icon || right ? `<span>${escHtml(l.label)}</span>` : escHtml(l.label)}${right}</a>`;
}

/**
 * Navbar HTML. Returns { links, cta, mobile }:
 *   links   text links / dropdowns / GitHub (left of the search box)
 *   cta     filled & outlined buttons and `navbar.primary` (right-most)
 *   mobile  the same entries flattened for the mobile drawer
 */
export function buildNavbarHtml(navbar, basePath = '') {
  const { links, primary } = normalizeNavbar(navbar);
  const plain = links.filter((l) => l.type !== 'filled' && l.type !== 'outlined');
  const buttons = links.filter((l) => l.type === 'filled' || l.type === 'outlined');
  if (primary) buttons.push(primary.type === 'github' ? primary : { ...primary, type: primary.type === 'outlined' ? 'outlined' : 'filled' });
  const linksHtml = plain.map((l) => renderNavbarEntry(l, basePath)).join('');
  const ctaHtml = buttons.map((l) => (l.type === 'github' ? renderNavbarEntry(l, basePath).replace('nav-ext-link nav-github', 'nav-btn nav-btn-outlined nav-github') : renderNavbarEntry(l, basePath))).join('');
  const flat = [];
  for (const l of plain) {
    if (l.type === 'dropdown') flat.push(...l.links.map((d) => ({ ...d, type: 'link' })));
    else flat.push(l);
  }
  const mobileLinks = flat.map((l) => renderNavbarEntry(l.type === 'github' ? { ...l, stars: false } : l, basePath)).join('');
  const mobileButtons = buttons.map((l) => renderNavbarEntry(l.type === 'github' ? { ...l, type: 'outlined', label: l.label } : l, basePath)).join('');
  const mobile = mobileLinks || mobileButtons ? `<div class="sidebar-mobile-extras" aria-label="Site links">${mobileLinks}${mobileButtons}</div>` : '';
  return {
    links: linksHtml ? `<div class="nav-primary-links">${linksHtml}</div>` : '',
    cta: ctaHtml ? `<div class="nav-cta">${ctaHtml}</div>` : '',
    mobile,
  };
}

/** Back-compat: just the link markup (no CTA buttons). */
export function buildNavbarLinksHtml(navbar, basePath = '', offline = false) {
  return buildNavbarHtml(navbar, basePath).links;
}

/** Local logo files a config references (string logo, or logo.light / logo.dark); URLs are skipped. */
export function logoFiles(config) {
  const raw = normalizeLogo(config?.logo);
  if (!raw) return [];
  return [...new Set([raw.light, raw.dark].filter((p) => p && !/^(https?:)?\/\//i.test(p) && !p.startsWith('data:')))];
}

/** Logo markup parts: <img> for light/dark, link target, optional text. */
export function resolveLogo(config, { basePath = '', offline = false, assetPrefix = '' } = {}) {
  const raw = normalizeLogo(config.logo);
  const fallback = 'favicon-32x32.png';
  const toSrc = (p) => {
    if (!p) return '';
    if (/^(https?:)?\/\//i.test(p) || p.startsWith('data:')) return p;
    const clean = String(p).replace(/^\/+/, '');
    return offline ? assetPrefix + clean : withBasePath(basePath, '/' + clean);
  };
  const light = raw?.light ? toSrc(raw.light) : toSrc(fallback);
  const dark = raw?.dark ? toSrc(raw.dark) : light;
  return { light, dark, variants: !!(raw && !raw.single && light !== dark), wordmark: !!config.logo && typeof config.logo === 'object', href: raw?.href || '', text: raw?.text || '', height: raw?.height || 0 };
}

export function buildFooterHtml(footer, basePath = '') {
  if (!footer || typeof footer !== 'object') return '';
  const copyright = footer.copyright ? `<div class="site-footer-copy">${escHtml(footer.copyright)}</div>` : '';
  const linkHtml = (l) => {
    const external = l.external || /^https?:/i.test(l.href || '');
    const href = external ? (l.href || '#') : withBasePath(basePath, l.href || '#');
    const target = external ? ' target="_blank" rel="noopener noreferrer"' : '';
    return `<a href="${escAttr(href)}"${target}>${escHtml(l.label || l.title || '')}</a>`;
  };
  // Mintlify shape: footer.links = [{ header, items: [{ label, href }] }] -> columns.
  const columns = [];
  const flatLinks = [];
  for (const l of Array.isArray(footer.links) ? footer.links : []) {
    if (l && Array.isArray(l.items)) columns.push({ title: l.header || l.title, links: l.items });
    else if (l) flatLinks.push(l);
  }
  for (const c of Array.isArray(footer.columns) ? footer.columns : []) columns.push(c);
  let linksHtml = '';
  if (flatLinks.length) {
    linksHtml = `<div class="site-footer-links">${flatLinks.map(linkHtml).join('')}</div>`;
  }
  let columnsHtml = '';
  if (columns.length) {
    columnsHtml = `<div class="site-footer-columns">${columns.map((col) => {
      const title = col.title ? `<div class="site-footer-col-title">${escHtml(col.title)}</div>` : '';
      const items = (col.links || []).map(linkHtml).join('');
      return `<div class="site-footer-col">${title}${items}</div>`;
    }).join('')}</div>`;
  }
  const socials = normalizeSocials(footer.socials);
  const socialsHtml = socials.length
    ? `<div class="site-footer-socials">${socials.map((s) => `<a class="site-footer-social" href="${escAttr(s.href)}" target="_blank" rel="noopener noreferrer" aria-label="${escAttr(s.label)}" title="${escAttr(s.label)}">${renderIcon(s.icon, { size: 18, className: 'nav-icon' })}</a>`).join('')}</div>`
    : '';
  if (!copyright && !linksHtml && !columnsHtml && !socialsHtml) return '';
  const bottomRow = (linksHtml || copyright || socialsHtml)
    ? `<div class="site-footer-bottom">${linksHtml}${copyright}${socialsHtml}</div>`
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
