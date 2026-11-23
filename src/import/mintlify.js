// Mintlify (docs.json and legacy mint.json) -> docslit.json
import fs from 'fs-extra';
import path from 'path';
import { OP_RE, iconOf, findPageFile, OpenApiPages, tidySidebar, collectPageIds } from './nav.js';
import { buildThemeConfig } from './theme.js';
import { slugify } from '../navigation.js';

const posix = (p) => p.split(path.sep).join('/');
const LEFT = (v) => (v && typeof v === 'object' ? v : {});

const ANALYTICS = {
  ga4: (c) => ({ provider: 'ga4', measurementId: c.measurementId }),
  plausible: (c) => ({ provider: 'plausible', domain: c.domain, ...(c.server ? { src: `https://${String(c.server).replace(/^https?:\/\//, '')}/js/script.js` } : {}) }),
  posthog: (c) => ({ provider: 'posthog', apiKey: c.apiKey, ...(c.apiHost ? { host: c.apiHost } : {}) }),
  fathom: (c) => ({ provider: 'fathom', siteId: c.siteId }),
};

const CONTEXTUAL = { copy: 'copy', view: 'view-markdown', chatgpt: 'chatgpt', claude: 'claude', perplexity: 'perplexity', mcp: 'mcp', 'add-mcp': 'mcp' };

export async function loadMintlifyConfig(sourceDir) {
  for (const f of ['docs.json', 'mint.json']) {
    const p = path.join(sourceDir, f);
    if (await fs.pathExists(p)) {
      try { return { file: f, cfg: JSON.parse(await fs.readFile(p, 'utf8')), legacy: f === 'mint.json' }; }
      catch (e) { return { file: f, cfg: null, error: e.message, legacy: f === 'mint.json' }; }
    }
  }
  return null;
}

export async function convertMintlify(imp, { file, cfg, legacy }, opts = {}) {
  const R = imp.reporter;
  const rep = (sev, code, msg, extra = {}) => imp.report(sev, code, msg, { file, ...extra });
  const api = new OpenApiPages(imp);
  imp.openapi = api;
  const out = {};
  const mapped = (from, to) => R.mapKey(`${file} ${from}`, to);
  const unmapped = (from, note) => { R.unmapKey(`${file} ${from}`, note); rep('info', 'config-unmapped', `Config key "${from}" has no DocsLit equivalent${note ? `: ${note}` : ''}.`, { fix: note }); };

  if (cfg.name) { out.name = String(cfg.name); mapped('name', 'name'); }
  if (cfg.description) { out.description = String(cfg.description); mapped('description', 'description'); }

  // logo / favicon
  const logo = cfg.logo;
  if (typeof logo === 'string') { out.logo = imp.configAsset(logo, `${file} logo`); mapped('logo', 'logo'); }
  else if (logo && typeof logo === 'object') {
    const l = {};
    if (logo.light) l.light = imp.configAsset(logo.light, `${file} logo.light`);
    if (logo.dark) l.dark = imp.configAsset(logo.dark, `${file} logo.dark`);
    if (logo.href) l.href = logo.href;
    out.logo = l; mapped('logo', 'logo');
  }
  const fav = typeof cfg.favicon === 'string' ? cfg.favicon : (cfg.favicon?.light || cfg.favicon?.dark);
  if (fav) { out.favicon = imp.configAsset(fav, `${file} favicon`); mapped('favicon', 'favicon'); }

  // colours / fonts / appearance -> theme
  const brand = { light: {}, dark: {}, colors: {} };
  const colors = cfg.colors || {};
  if (colors.primary) { brand.light.accent = colors.primary; brand.dark.accent = colors.light || colors.primary; if (colors.dark) brand.light.accentLight = colors.dark; if (colors.light) brand.dark.accentLight = colors.light; mapped('colors', 'theme.light/dark.accent'); }
  const bg = cfg.background?.color || colors.background;
  if (bg && typeof bg === 'object') { if (bg.light) brand.light.bg = bg.light; if (bg.dark) brand.dark.bg = bg.dark; mapped('background.color', 'theme.*.bg'); }
  const fonts = {};
  const fontCss = [];
  const head = [];
  const fontCfg = cfg.fonts || {};
  const famOf = (f) => (f && f.family ? f : null);
  const body = famOf(fontCfg.body) || famOf(fontCfg);
  const heading = famOf(fontCfg.heading);
  const googleFamilies = [];
  for (const [role, f] of [['fontSans', body], ['fontHeading', heading]]) {
    if (!f) continue;
    fonts[role] = `"${f.family}", ui-sans-serif, system-ui, sans-serif`;
    if (f.source) fontCss.push(`@font-face{font-family:"${f.family}";src:url("${f.source}")${f.format ? ` format("${f.format}")` : ''};font-weight:${f.weight || 400};font-display:swap}`);
    else googleFamilies.push(`${f.family.replace(/ /g, '+')}:wght@${f.weight || 400};600;700`);
  }
  if (googleFamilies.length) head.push(`<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=${googleFamilies.join('&family=')}&display=swap" rel="stylesheet">`);
  if (cfg.fonts) mapped('fonts', 'theme.fonts');
  if (cfg.theme) unmapped('theme', `Mintlify theme "${cfg.theme}" is replaced by the DocsLit "${opts.themeOpt || 'peppermint'}" theme`);
  // appearance: "system" | "light" | "dark" or { default, strict }
  let appearance; let strictMode;
  if (cfg.appearance) {
    if (typeof cfg.appearance === 'string') appearance = cfg.appearance;
    else { appearance = cfg.appearance.default; strictMode = cfg.appearance.strict === true; }
    mapped('appearance', 'theme.appearance / theme.strict');
  }
  for (const k of ['styling', 'thumbnails', 'interaction', 'directory', 'eyebrow', 'backgroundImage']) if (cfg[k] !== undefined) unmapped(k, '');
  if (cfg.background?.image || cfg.background?.decoration) unmapped('background.image/decoration', 'decorative backgrounds are not supported');
  if (cfg.icons?.library) { out.icons = { library: cfg.icons.library === 'lucide' ? 'lucide' : 'fontawesome' }; mapped('icons.library', 'icons.library'); }
  const theme = buildThemeConfig({ vendor: 'mintlify', brand, fonts, appearance, strict: strictMode, themeOpt: opts.themeOpt, report: (s, c, m, x) => rep(s, c, m, x) });
  if (theme !== undefined) out.theme = theme;

  // navigation
  const state = { api, tabs: null };
  const nav = await convertNavigation(imp, cfg, legacy, state, rep, opts);
  Object.assign(out, nav.config);
  if (nav.layout) out.layout = { ...(out.layout || {}), ...nav.layout };
  mapped('navigation', nav.tabs ? 'tabs/sidebar' : 'sidebar');

  // navbar
  const navbar = {};
  const links = [];
  for (const l of (legacy ? cfg.topbarLinks : cfg.navbar?.links) || []) {
    const label = l.label || l.name; const href = l.href || l.url;
    if (l.type === 'github') links.push({ type: 'github', href });
    else if (l.type === 'discord') links.push({ type: 'discord', href });
    else links.push({ label, href, ...(l.icon ? { icon: iconOf(l.icon) } : {}) });
  }
  if (links.length) navbar.links = links;
  const prim = legacy ? cfg.topbarCtaButton : cfg.navbar?.primary;
  if (prim) {
    const t = prim.type === 'github' ? 'github' : 'button';
    navbar.primary = { type: t, label: prim.label || prim.name, href: prim.href || prim.url };
  }
  if (Object.keys(navbar).length) { out.navbar = navbar; mapped(legacy ? 'topbarLinks/topbarCtaButton' : 'navbar', 'navbar'); }

  // footer
  const footer = {};
  const socials = (legacy ? cfg.footerSocials : cfg.footer?.socials);
  if (socials && typeof socials === 'object') { footer.socials = { ...socials }; }
  if (Array.isArray(cfg.footer?.links)) {
    if (cfg.footer.links.some((c) => Array.isArray(c.items))) footer.columns = cfg.footer.links.map((c) => ({ title: c.header || '', links: (c.items || []).map((i) => ({ label: i.label, href: i.href })) }));
    else footer.links = cfg.footer.links.map((i) => ({ label: i.label, href: i.href }));
  }
  if (Object.keys(footer).length) { out.footer = footer; mapped('footer', 'footer'); }

  // banner
  if (cfg.banner?.content) {
    out.announcement = { message: String(cfg.banner.content), dismissible: cfg.banner.dismissible !== false, ...(cfg.banner.type ? { type: ({ info: 'info', warning: 'warning', critical: 'error' })[cfg.banner.type] || 'neutral' } : {}) };
    mapped('banner', 'announcement');
  }

  // redirects
  const reds = cfg.redirects;
  if (Array.isArray(reds) && reds.length) {
    for (const r of reds) {
      if (!r.source || !r.destination) continue;
      if (/[:*]/.test(r.source)) { rep('warning', 'redirect-wildcard', `Redirect "${r.source}" -> "${r.destination}" uses a wildcard/pattern, which DocsLit redirects do not support.`, { action: 'Skipped.', fix: 'Add one explicit entry per path under "redirects" in docslit.json.' }); R.unmapKey(`${file} redirects[${r.source}]`, 'wildcard'); continue; }
      imp.redirects[r.source.startsWith('/') ? r.source : '/' + r.source] = r.destination.startsWith('http') ? r.destination : (r.destination.startsWith('/') ? r.destination : '/' + r.destination);
    }
    mapped('redirects', 'redirects');
  }

  // seo / metadata
  const metatags = { ...LEFT(cfg.seo?.metatags), ...LEFT(cfg.metadata), ...LEFT(cfg.metatags) };
  for (const [k, v] of Object.entries(metatags)) head.push(`<meta ${/^og:|^twitter:/.test(k) ? 'property' : 'name'}="${k}" content="${String(v).replace(/"/g, '&quot;')}">`);
  if (Object.keys(metatags).length) mapped('seo.metatags', 'head');
  if (cfg.seo?.indexing) unmapped('seo.indexing', 'DocsLit indexes every page unless a page sets noindex');

  // search / contextual / feedback
  if (cfg.search) unmapped('search', 'search prompt/placeholder is not configurable');
  const ctxOpts = cfg.contextual?.options;
  if (Array.isArray(ctxOpts)) {
    const list = [];
    for (const o of ctxOpts) {
      if (typeof o === 'string') { if (CONTEXTUAL[o]) { if (!list.includes(CONTEXTUAL[o])) list.push(CONTEXTUAL[o]); } else rep('info', 'contextual-unsupported', `Contextual menu option "${o}" is not supported by DocsLit and was dropped.`, { action: 'Dropped.' }); }
      else if (o && o.title && o.href) list.push({ title: o.title, href: o.href, ...(o.description ? { description: o.description } : {}), ...(o.icon ? { icon: o.icon } : {}) });
    }
    if (list.length) { out.contextual = list; mapped('contextual.options', 'contextual'); }
  }
  if (cfg.feedback) { out.feedback = true; mapped('feedback', 'feedback'); }

  // analytics / integrations
  const integ = { ...(legacy ? LEFT(cfg.analytics) : {}), ...LEFT(cfg.integrations) };
  let analyticsSet = false;
  for (const [k, v] of Object.entries(integ)) {
    if (!v || typeof v !== 'object') continue;
    if (ANALYTICS[k] && !analyticsSet) { out.analytics = ANALYTICS[k](v); analyticsSet = true; mapped(`integrations.${k}`, 'analytics'); }
    else if (k === 'gtm' && v.tagId) {
      head.push(`<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${v.tagId}');</script>`);
      mapped('integrations.gtm', 'head');
    } else rep('warning', 'integration-unsupported', `Analytics/integration "${k}" has no DocsLit equivalent.`, { action: 'Not converted.', fix: 'Paste the provider snippet into "head" in docslit.json.' });
  }

  // api
  if (cfg.api) {
    if (cfg.api.playground?.display === 'none') { /* default off */ }
    for (const k of Object.keys(cfg.api)) if (!['openapi', 'playground', 'baseUrl', 'auth'].includes(k)) unmapped(`api.${k}`, '');
    if (cfg.api.playground?.proxy) unmapped('api.playground.proxy', 'set playground.proxyUrl in docslit.json to a CORS proxy if needed');
  }
  const specs = [].concat(cfg.openapi || cfg.api?.openapi || []).filter((s) => typeof s === 'string');
  if (state.specs) for (const s of state.specs) if (!specs.includes(s)) specs.push(s);
  const localSpecs = [];
  for (const s of specs) {
    if (/^https?:\/\//.test(s)) { rep('warning', 'openapi-remote', `OpenAPI spec URL "${s}" is remote; DocsLit builds from a local file.`, { action: 'Not copied.', fix: 'Download the spec into the project and set "openapi" in docslit.json.' }); continue; }
    localSpecs.push(s.replace(/^\//, ''));
  }
  if (localSpecs.length) {
    out.openapi = imp.configAsset(localSpecs[0], `${file} openapi`);
    imp.openapiDefault = localSpecs[0];
    mapped('openapi', 'openapi');
    if (localSpecs.length > 1) rep('warning', 'openapi-multiple', `Multiple OpenAPI specs (${localSpecs.join(', ')}) are configured; DocsLit supports one spec per project.`, { action: `Used ${localSpecs[0]}; the others were copied but not wired up.`, fix: 'Merge the specs or keep the API pages of the others as static pages.' });
    for (const s of localSpecs.slice(1)) imp.configAsset(s, `${file} openapi`);
  }

  if (head.length) out.head = head;
  if (fontCss.length) imp.extraCss = (imp.extraCss || []).concat(fontCss);
  imp.mintlifyNav = nav;
  return { config: out, nav, api };
}

// ─── navigation ────────────────────────────────────────────────────────────────
async function convertNavigation(imp, cfg, legacy, state, rep, opts) {
  const sourceDir = imp.sourceDir;
  const apiPages = state.api;
  const specs = new Set();
  state.specs = specs;
  const exists = (id) => findPageFile(sourceDir, id);

  const regPage = (id, extra = {}) => {
    const rel = exists(id);
    if (!rel) { rep('warning', 'nav-page-missing', `Navigation page "${id}" has no file in the source project.`, { action: 'Removed it from the sidebar.', fix: 'Create the page or remove it from the navigation.' }); return null; }
    const slug = rel.replace(/\.(mdx?|md)$/i, '');
    if (!imp.pages.has(rel)) imp.registerPage(rel, slug, extra);
    return imp.pages.get(rel).slug;
  };

  const convertPages = async (entries, st, depth) => {
    const items = [];
    for (const e of entries || []) {
      if (typeof e === 'string') {
        const m = OP_RE.exec(e.trim());
        if (m && st.spec) { items.push({ __op: { spec: st.spec, method: m[1], path: m[2] } }); continue; }
        const slug = regPage(e);
        if (slug) items.push(slug);
      } else if (e && typeof e === 'object') {
        if (e.group !== undefined) {
          const spec = e.openapi && typeof e.openapi === 'string' ? e.openapi.replace(/^\//, '') : (e.openapi && e.openapi.source ? e.openapi.source : st.spec);
          if (e.openapi) specs.add(spec);
          const g = { group: String(e.group) };
          const ic = iconOf(e.icon, e.iconType); if (ic) g.icon = ic;
          if (e.tag) g.tag = String(e.tag);
          if (e.hidden) g.hidden = true;
          if (e.root) { const rs = regPage(e.root); if (rs) g.root = rs; }
          if (e.expanded === true) g.collapsed = false; else if (depth > 0) g.collapsed = true;
          if (depth === 0 && e.expanded === false) g.collapsed = true;
          const sub = await convertPages(e.pages || [], { ...st, spec }, depth + 1);
          if (e.openapi && !(e.pages || []).length) sub.push({ __openapiAll: spec });
          g.pages = sub;
          items.push(g);
        } else if (e.href && (e.title || e.label)) {
          items.push({ href: e.href, title: e.title || e.label });
        } else if (e.page) {
          const slug = regPage(e.page);
          if (slug) items.push({ id: slug, ...(e.title ? { title: e.title } : {}), ...(iconOf(e.icon, e.iconType) ? { icon: iconOf(e.icon, e.iconType) } : {}), ...(e.tag ? { badge: e.tag } : {}) });
        }
      }
    }
    return items;
  };

  const groupsOf = (node, st) => convertPages(node.groups || node.pages || [], st, 0);
  // groups: a bare pages array at top-level is wrapped into one group
  const topLevel = async (node, st) => {
    if (node.groups) return convertPages(node.groups, st, 0);
    if (node.pages) return wrapLoose(await convertPages(node.pages, st, 0));
    return [];
  };
  void groupsOf;
  const wrapLoose = (items) => { const out = []; let loose = []; for (const it of items) { if (it && it.group !== undefined) { if (loose.length) { out.push({ group: 'Documentation', pages: loose }); loose = []; } out.push(it); } else loose.push(it); } if (loose.length) out.push({ group: 'Documentation', pages: loose }); return out; };

  let config = {};
  let tabsOut = null;
  let layout = null;
  const nav = legacy ? cfg.navigation : cfg.navigation;
  const wrapTab = async (t, st) => {
    const tab = { tab: String(t.tab || t.name || t.item || t.anchor || t.dropdown || t.product || 'Tab') };
    const ic = iconOf(t.icon, t.iconType); if (ic) tab.icon = ic;
    if (t.href || t.url) { tab.href = t.href || t.url; if (t.hidden) tab.hidden = true; return tab; }
    if (t.hidden) tab.hidden = true;
    let sidebar = [];
    const spec = t.openapi ? String(t.openapi).replace(/^\//, '') : st.spec;
    if (t.openapi) specs.add(spec);
    const sub = { ...st, spec };
    if (t.groups || t.pages) sidebar = await topLevel(t, sub);
    for (const key of ['menu', 'anchors', 'dropdowns', 'versions', 'languages']) {
      if (!Array.isArray(t[key])) continue;
      rep('info', 'nav-flattened', `Tab "${tab.tab}" uses nested "${key}" which DocsLit navigation does not have; each entry became a sidebar group.`, { action: 'Flattened into groups.' });
      for (const item of t[key]) {
        const label = item.item || item.anchor || item.dropdown || item.version || item.language || 'Group';
        if (item.href && !item.groups && !item.pages) { sidebar.push({ group: label, pages: [{ href: item.href, title: label }] }); continue; }
        const inner = await topLevel(item, sub);
        sidebar.push({ group: label, pages: inner.flatMap((g) => (g.group !== undefined ? [g] : [g])) });
      }
    }
    if (t.openapi && !sidebar.length) { tab.openapi = true; sidebar = [{ __openapiAll: spec }]; }
    tab.sidebar = sidebar;
    return tab;
  };

  const versionNodes = nav.versions || (legacy && Array.isArray(cfg.versions) ? null : null);
  void versionNodes;

  const strat = opts.versions || 'tabs';
  const buildFromNode = async (node, st) => {
    // returns { sidebar } or { tabs }
    if (Array.isArray(node)) return { sidebar: await topLevel({ groups: node }, st) };
    if (node.tabs) { const tabs = []; for (const t of node.tabs) tabs.push(await wrapTab(t, st)); return { tabs }; }
    if (node.anchors || node.dropdowns || node.products) {
      const kind = node.anchors ? 'anchors' : node.dropdowns ? 'dropdowns' : 'products';
      const list = node[kind];
      const anchorsOnly = []; const tabs = [];
      for (const a of list) {
        if (a.href && !a.groups && !a.pages && !a.tabs) { anchorsOnly.push({ label: a.anchor || a.dropdown || a.product, href: a.href, ...(iconOf(a.icon, a.iconType) ? { icon: iconOf(a.icon, a.iconType) } : {}) }); continue; }
        if (a.tabs) { for (const t of a.tabs) { const tb = await wrapTab(t, st); tb.tab = `${a.anchor || a.dropdown || a.product}: ${tb.tab}`; tabs.push(tb); } continue; }
        tabs.push(await wrapTab(a, st));
      }
      if (kind === 'products') rep('info', 'nav-products', 'Mintlify "products" have no DocsLit equivalent; each product became a tab.', { action: 'Mapped products to tabs.' });
      if (tabs.length) { layout = { tabsPlacement: 'sidebar' }; return { tabs, anchors: anchorsOnly }; }
      return { sidebar: [], anchors: anchorsOnly };
    }
    return { sidebar: await topLevel(node, st) };
  };

  let result;
  const versions = Array.isArray(nav?.versions) ? nav.versions : null;
  const legacyVersions = legacy && Array.isArray(cfg.versions) && cfg.versions.length > 1 ? cfg.versions : null;
  const languages = Array.isArray(nav?.languages) ? nav.languages : null;
  if (languages && languages.length) {
    rep('warning', 'nav-languages', `Navigation defines ${languages.length} languages (${languages.map((l) => l.language).join(', ')}). DocsLit i18n uses a docs.<locale>/ folder per language.`, { action: `Converted the first language (${languages[0].language}) only; pages of the others are kept as hidden pages.`, fix: 'Move each language into docs.<locale>/ and set i18n in docslit.json.' });
    result = await buildFromNode(languages[0], { spec: null });
  } else if (versions && versions.length) {
    result = await versionResult(versions, buildFromNode, rep, strat, (v) => v.version, imp);
  } else if (legacyVersions) {
    // mint.json: groups carry `version`
    const all = Array.isArray(nav) ? nav : [];
    const vs = legacyVersions.map((v) => ({ version: v, groups: all.filter((g) => g.version === v || !g.version) }));
    result = await versionResult(vs, buildFromNode, rep, strat, (v) => v.version, imp);
  } else if (legacy) {
    result = await legacyNav(imp, cfg, topLevel, wrapTab, convertPages, rep);
  } else {
    result = await buildFromNode(nav || {}, { spec: null });
  }
  if (result.layout) layout = { ...(layout || {}), ...result.layout };

  // global anchors
  const anchors = [...(result.anchors || [])];
  const ga = nav?.global?.anchors || [];
  for (const a of ga) anchors.push({ label: a.anchor, href: a.href, ...(iconOf(a.icon, a.iconType) ? { icon: iconOf(a.icon, a.iconType) } : {}) });
  if (legacy) for (const a of cfg.anchors || []) anchors.push({ label: a.name, href: a.url, ...(iconOf(a.icon, a.iconType) ? { icon: iconOf(a.icon, a.iconType) } : {}) });
  if (anchors.length) config.anchors = anchors;

  // OpenAPI expansion
  if (result.tabs) {
    for (const t of result.tabs) if (t.sidebar) t.sidebar = tidySidebar(await apiPages.expand(t.sidebar));
    tabsOut = result.tabs.filter((t) => t.href || (t.sidebar && t.sidebar.length));
    for (const t of tabsOut) if (t.sidebar && t.sidebar.length === 0) delete t.sidebar;
    for (const t of tabsOut) if (t.openapi) delete t.openapi;
    const apiTab = tabsOut.find((t) => t.sidebar && JSON.stringify(t.sidebar).includes('"api/'));
    if (apiTab && result.tabs.some((t) => t.openapi)) apiTab.openapi = true;
    config.tabs = tabsOut;
  } else {
    config.sidebar = tidySidebar(await apiPages.expand(result.sidebar || []));
  }
  return { config, tabs: !!tabsOut, layout };
}

async function versionResult(versions, buildFromNode, rep, strat, nameOf, imp) {
  const def = versions.find((v) => v.default) || versions[0];
  if (strat === 'latest') {
    rep('warning', 'nav-versions', `Navigation has ${versions.length} versions (${versions.map(nameOf).join(', ')}); only the default "${nameOf(def)}" was converted.`, { action: 'Other versions kept as hidden pages.', fix: 'DocsLit versions are git branches (see `docslit.json` versions): create a branch per version if you need the selector.' });
    return buildFromNode(def, { spec: null });
  }
  rep('warning', 'nav-versions', `Navigation has ${versions.length} versions (${versions.map(nameOf).join(', ')}). DocsLit versions are git branches, so each version became a top-level tab in one site.`, { action: 'One tab per version.', fix: 'To get a version selector, split each version onto its own branch and configure "versions" in docslit.json (see the versioning guide).' });
  const tabs = [];
  for (const v of versions) {
    const r = await buildFromNode(v, { spec: null });
    const label = String(nameOf(v));
    if (r.tabs) for (const t of r.tabs) { t.tab = `${label}: ${t.tab}`; tabs.push(t); }
    else tabs.push({ tab: label, sidebar: r.sidebar });
  }
  void imp;
  return { tabs, layout: { tabsPlacement: 'header' } };
}

async function legacyNav(imp, cfg, topLevel, wrapTab, convertPages, rep) {
  const groups = Array.isArray(cfg.navigation) ? cfg.navigation : [];
  const tabsCfg = Array.isArray(cfg.tabs) ? cfg.tabs : [];
  if (!tabsCfg.length) return { sidebar: await convertPages(groups, { spec: null }, 0) };
  const tabs = tabsCfg.map((t) => ({ tab: t.name, url: t.url, groups: [] }));
  const rest = [];
  for (const g of groups) {
    const first = firstPage(g);
    const t = tabs.find((x) => first && (first === x.url || first.startsWith(x.url + '/')));
    (t ? t.groups : rest).push(g);
  }
  const out = [];
  if (rest.length) out.push({ tab: 'Documentation', sidebar: await convertPages(rest, { spec: null }, 0) });
  for (const t of tabs) {
    if (!t.groups.length) { out.push({ tab: t.tab, path: t.url }); rep('info', 'nav-tab-empty', `Tab "${t.tab}" (${t.url}) has no navigation groups.`, { action: 'Kept an auto-generated tab.' }); continue; }
    out.push({ tab: t.tab, sidebar: await convertPages(t.groups, { spec: null }, 0) });
  }
  return { tabs: out };
}
function firstPage(g) {
  for (const p of g.pages || []) { if (typeof p === 'string') return p; if (p && p.pages) { const f = firstPage(p); if (f) return f; } }
  return null;
}

export { collectPageIds, slugify, posix };
