// Fern (fern/docs.yml + generators.yml + versions/products) -> docslit.json
import fs from 'fs-extra';
import path from 'path';
import { load as yamlLoad } from 'js-yaml';
import matter from '../frontmatter.js';
import { buildThemeConfig } from './theme.js';
import { OpenApiPages, tidySidebar } from './nav.js';

const posix = (p) => p.split(path.sep).join('/');
const slugify = (s) => String(s).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const stripExt = (p) => p.replace(/\.(mdx?|md)$/i, '');

export async function findFernDir(sourceDir) {
  for (const c of [path.join(sourceDir, 'fern'), sourceDir]) {
    if (await fs.pathExists(path.join(c, 'docs.yml')) || await fs.pathExists(path.join(c, 'docs.yaml'))) return c;
  }
  return null;
}

async function readYaml(p, rep) {
  try { return yamlLoad(await fs.readFile(p, 'utf8')) || {}; }
  catch (e) { rep('error', 'yaml-invalid', `Could not read ${path.basename(p)}: ${String(e.message).split('\n')[0]}`, { file: path.basename(p), fix: 'Fix the YAML syntax and re-run the import.' }); return null; }
}

const COLORS = { 'accent-primary': 'accent', background: 'bg', border: 'border', 'sidebar-background': 'sidebarBg', 'header-background': null, 'card-background': 'surface' };

export async function convertFern(imp, fernDir, opts = {}) {
  const R = imp.reporter;
  const docsFile = (await fs.pathExists(path.join(fernDir, 'docs.yml'))) ? 'docs.yml' : 'docs.yaml';
  const rep = (sev, code, msg, extra = {}) => imp.report(sev, code, msg, { file: docsFile, ...extra });
  const docs = await readYaml(path.join(fernDir, docsFile), rep);
  if (!docs) return { config: {} };
  const mapped = (from, to) => R.mapKey(`${docsFile} ${from}`, to);
  const unmapped = (from, note) => { R.unmapKey(`${docsFile} ${from}`, note); rep('info', 'config-unmapped', `Config key "${from}" has no DocsLit equivalent${note ? `: ${note}` : ''}.`, { fix: note }); };
  const out = {};
  const head = [];
  const api = new OpenApiPages(imp);
  imp.openapi = api;

  // identity
  if (docs.title) { out.name = String(docs.title); mapped('title', 'name'); }
  const inst = Array.isArray(docs.instances) ? docs.instances[0] : null;
  const domain = inst?.['custom-domain'] || inst?.url;
  imp.fernBasePaths = [];
  if (domain) {
    const d = String(domain).replace(/^https?:\/\//, '');
    const slash = d.indexOf('/');
    const base = slash === -1 ? '' : d.slice(slash).replace(/^\/|\/$/g, '');
    if (inst?.['custom-domain']) { out.url = `https://${d.split('/')[0]}`; mapped('instances[0].custom-domain', 'url'); }
    if (base) imp.fernBasePaths.push(base);
    rep('info', 'fern-base-path', 'Fern serves docs under a URL prefix; DocsLit serves the site from the domain root.', { fix: base ? `Old URLs start with /${base}; add redirects at your host if needed.` : undefined });
  }
  // logo/favicon
  if (docs.logo) {
    const l = docs.logo;
    if (typeof l === 'string') out.logo = imp.configAsset(l.replace(/^\.\//, ''), `${docsFile} logo`);
    else {
      const o = {};
      if (l.light) o.light = imp.configAsset(l.light.replace(/^\.\//, ''), `${docsFile} logo.light`);
      if (l.dark) o.dark = imp.configAsset(l.dark.replace(/^\.\//, ''), `${docsFile} logo.dark`);
      if (!o.light && !o.dark && l.path) o.light = imp.configAsset(l.path, `${docsFile} logo`);
      if (l.href) o.href = l.href;
      if (l.height) o.height = Number(l.height);
      if (l['right-text']) o.text = String(l['right-text']);
      out.logo = o;
    }
    mapped('logo', 'logo');
  }
  if (docs.favicon) { out.favicon = imp.configAsset(String(docs.favicon).replace(/^\.\//, ''), `${docsFile} favicon`); mapped('favicon', 'favicon'); }

  // colours
  const brand = { light: {}, dark: {}, colors: {} };
  const colors = docs.colors || {};
  for (const [k, token] of Object.entries(COLORS)) {
    const v = colors[k];
    if (!v) continue;
    if (!token) { unmapped(`colors.${k}`, 'not themeable separately'); continue; }
    if (typeof v === 'string') brand.colors[token] = v;
    else { if (v.light) brand.light[token] = v.light; if (v.dark) brand.dark[token] = v.dark; }
  }
  for (const k of Object.keys(colors)) if (!(k in COLORS)) unmapped(`colors.${k}`, '');
  if (Object.keys(colors).length) mapped('colors', 'theme');

  // typography
  const fonts = {};
  const css = [];
  const ty = docs.typography || {};
  const fontFace = (f, label) => {
    const paths = f.path ? [{ path: f.path, weight: f.weight, style: f.style }] : f.paths || [];
    for (const p of paths) {
      const rel = imp.configAsset(String(p.path).replace(/^\.\//, ''), `${docsFile} typography.${label}`);
      const ext = rel.split('.').pop().toLowerCase();
      css.push(`@font-face{font-family:"${f.name}";src:url("/${rel}") format("${ext === 'ttf' ? 'truetype' : ext === 'otf' ? 'opentype' : ext}");font-weight:${p.weight || 400};font-style:${p.style || 'normal'};font-display:swap}`);
    }
  };
  if (ty.bodyFont?.name) { fonts.fontSans = `"${ty.bodyFont.name}", ui-sans-serif, system-ui, sans-serif`; fontFace(ty.bodyFont, 'bodyFont'); }
  if (ty.codeFont?.name) { fonts.fontMono = `"${ty.codeFont.name}", ui-monospace, monospace`; fontFace(ty.codeFont, 'codeFont'); }
  if (ty.headingsFont?.name) { fonts.fontHeading = `"${ty.headingsFont.name}", ui-sans-serif, system-ui, sans-serif`; fontFace(ty.headingsFont, 'headingsFont'); }
  if (Object.keys(ty).length) mapped('typography', 'theme.fonts');
  const theme = buildThemeConfig({ vendor: 'fern', brand, fonts, themeOpt: opts.themeOpt, report: (s, c, m, x) => rep(s, c, m, x) });
  if (theme !== undefined) out.theme = theme;

  // layout
  const layout = {};
  const L = docs.layout || {};
  const len = (v) => (v === 'full' ? 'full' : (/^\d+(px)?$/.test(String(v)) ? Number(String(v).replace('px', '')) : (v === 'default' ? undefined : String(v))));
  if (L['page-width'] !== undefined) { const v = len(L['page-width']); if (v !== undefined) layout.pageWidth = v; }
  if (L['content-width'] !== undefined) { const v = len(L['content-width']); if (v !== undefined && v !== 'full') layout.contentWidth = v; }
  if (L['sidebar-width'] !== undefined) { const v = len(L['sidebar-width']); if (v !== undefined && v !== 'full') layout.sidebarWidth = v; }
  if (L['header-height'] !== undefined) { const v = len(L['header-height']); if (v !== undefined && v !== 'full') layout.headerHeight = v; }
  if (L['tabs-placement'] === 'sidebar' || L['tabs-placement'] === 'header') layout.tabsPlacement = L['tabs-placement'];
  if (L['content-alignment'] === 'left' || L['content-alignment'] === 'center') layout.contentAlignment = L['content-alignment'];
  if (L['hide-nav-links']) layout.hideNav = true;
  if (L['hide-feedback']) layout.hideFeedback = true;
  for (const k of ['searchbar-placement', 'switcher-placement', 'disable-header', 'mobile-toc', 'show-nav-availability-badges', 'tabs-placement'])
    if (L[k] !== undefined && !(k === 'tabs-placement') && k !== 'show-nav-availability-badges') unmapped(`layout.${k}`, 'no equivalent');
  const tt = docs.theme?.tabs;
  if (tt) { if (tt.style === 'bubble') layout.tabsStyle = 'pill'; if (tt.alignment === 'center' || tt.alignment === 'left') layout.tabsAlign = tt.alignment; if (tt.placement === 'sidebar' || tt.placement === 'header') layout.tabsPlacement = tt.placement; }
  if (Object.keys(layout).length) { out.layout = layout; mapped('layout', 'layout'); }
  for (const k of ['background', 'metadata', 'ai-search', 'ai-examples', 'experimental', 'default-language', 'languages', 'js', 'libraries', 'check', 'roles', 'permissions', 'auth', 'integrations', 'default-language']) {
    if (docs[k] === undefined) continue;
    if (k === 'js') { rep('warning', 'fern-js', 'Custom JavaScript (docs.yml `js`) cannot be carried over automatically.', { action: 'Not converted.', fix: 'Add a <script> to "head" in docslit.json if the script is still needed.' }); R.unmapKey(`${docsFile} js`, 'custom JS'); }
    else if (k === 'metadata') { for (const [mk, mv] of Object.entries(docs.metadata || {})) head.push(`<meta ${/^og:|^twitter:/.test(mk) ? 'property' : 'name'}="${mk.replace(/^og:title$/, 'og:title')}" content="${String(mv).replace(/"/g, '&quot;')}">`); mapped('metadata', 'head'); }
    else unmapped(k, '');
  }

  // navbar / footer / announcement
  const links = [];
  for (const l of docs['navbar-links'] || []) {
    const label = l.text || l.label;
    const href = l.href || l.url;
    switch (l.type) {
      case 'github': links.push({ type: 'github', href: l.value || href }); break;
      case 'dropdown': links.push({ type: 'dropdown', label, links: (l.links || []).map((x) => ({ label: x.text || x.label, href: x.href || x.url, ...(x.icon ? { icon: x.icon } : {}) })) }); break;
      case 'filled': case 'outlined': links.push({ type: l.type, label, href, ...(l.icon ? { icon: l.icon } : {}), ...(l['right-icon'] || l.rightIcon ? { rightIcon: l['right-icon'] || l.rightIcon } : {}), ...(l.rounded ? { rounded: true } : {}) }); break;
      default: links.push({ label, href, ...(l.icon ? { icon: l.icon } : {}) });
    }
  }
  if (links.length) { out.navbar = { links }; mapped('navbar-links', 'navbar.links'); }
  if (docs['footer-links'] && typeof docs['footer-links'] === 'object') {
    const socials = {};
    for (const [k, v] of Object.entries(docs['footer-links'])) socials[k] = typeof v === 'string' ? v : v?.href || '';
    out.footer = { socials }; mapped('footer-links', 'footer.socials');
  }
  if (docs.announcement?.message) { out.announcement = { message: String(docs.announcement.message), dismissible: true }; mapped('announcement', 'announcement'); }
  if (docs['page-actions']?.options) {
    const MAP = { 'copy-page': 'copy', 'view-as-markdown': 'view-markdown', chatgpt: 'chatgpt', claude: 'claude', mcp: 'mcp' };
    const opts2 = docs['page-actions'].options;
    const list = Object.keys(opts2 || {}).filter((k) => opts2[k] !== false).map((k) => MAP[k]).filter(Boolean);
    if (list.length) { out.contextual = list; mapped('page-actions', 'contextual'); }
    for (const k of Object.keys(opts2 || {})) if (!MAP[k]) rep('info', 'contextual-unsupported', `Page action "${k}" is not supported by DocsLit and was dropped.`, { action: 'Dropped.' });
  }
  // analytics
  const an = docs.analytics || {};
  if (an.ga4?.['measurement-id']) { out.analytics = { provider: 'ga4', measurementId: an.ga4['measurement-id'] }; mapped('analytics.ga4', 'analytics'); }
  else if (an.posthog?.['api-key']) { out.analytics = { provider: 'posthog', apiKey: an.posthog['api-key'], ...(an.posthog.endpoint ? { host: an.posthog.endpoint } : {}) }; mapped('analytics.posthog', 'analytics'); }
  if (an.gtm?.['container-id']) { head.push(`<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${an.gtm['container-id']}');</script>`); mapped('analytics.gtm', 'head'); }
  for (const k of Object.keys(an)) if (!['ga4', 'posthog', 'gtm'].includes(k)) rep('warning', 'integration-unsupported', `Analytics provider "${k}" has no DocsLit equivalent.`, { action: 'Not converted.', fix: 'Paste the provider snippet into "head" in docslit.json.' });

  // redirects
  for (const r of docs.redirects || []) {
    if (!r.source || !r.destination) continue;
    if (/[:*]/.test(r.source)) { rep('warning', 'redirect-wildcard', `Redirect "${r.source}" -> "${r.destination}" uses a pattern, which DocsLit redirects do not support.`, { action: 'Skipped.', fix: 'Add one explicit entry per path under "redirects" in docslit.json.' }); R.unmapKey(`${docsFile} redirects[${r.source}]`, 'pattern'); continue; }
    const strip = (u) => { let s = u; for (const b of imp.fernBasePaths) if (s.startsWith('/' + b + '/')) s = s.slice(b.length + 1); return s; };
    imp.redirects[strip(r.source)] = /^https?:/.test(r.destination) ? r.destination : strip(r.destination);
  }
  if ((docs.redirects || []).length) mapped('redirects', 'redirects');

  // css
  const cssFiles = [].concat(docs.css || []);
  const cssParts = [];
  for (const c of cssFiles) {
    const p = path.join(fernDir, String(c));
    if (await fs.pathExists(p)) cssParts.push(`/* ${c} */\n` + await fs.readFile(p, 'utf8'));
    else rep('warning', 'css-missing', `CSS file "${c}" was not found.`, { action: 'Skipped.' });
  }
  if (cssFiles.length) mapped('css', 'css');
  imp.customCss = cssParts;
  imp.extraCss = css;

  // specs from generators.yml
  const specs = await findSpecs(fernDir, rep);

  // navigation
  const nav = await convertFernNav(imp, fernDir, docs, api, specs, rep, opts);
  if (nav.tabs) out.tabs = nav.tabs; else out.sidebar = nav.sidebar;
  if (nav.layout) out.layout = { ...(out.layout || {}), ...nav.layout };
  if (nav.anchors?.length) out.anchors = nav.anchors;
  mapped('navigation', nav.tabs ? 'tabs' : 'sidebar');
  if (nav.specUsed) { out.openapi = imp.configAsset(nav.specUsed, 'generators.yml'); mapped('generators.yml api.specs', 'openapi'); }
  if (head.length) out.head = head;
  return { config: out };
}

async function findSpecs(fernDir, rep) {
  const specs = [];
  const gen = path.join(fernDir, 'generators.yml');
  if (await fs.pathExists(gen)) {
    const g = await readYaml(gen, (...a) => rep(...a));
    const collect = (node) => {
      if (!node) return;
      const arr = Array.isArray(node) ? node : node.specs || node.path || [];
      for (const s of [].concat(arr)) {
        if (typeof s === 'string') specs.push(s);
        else if (s?.openapi) specs.push(typeof s.openapi === 'string' ? s.openapi : s.openapi.path || s.openapi.spec);
        else if (s?.asyncapi || s?.proto || s?.conjure) rep('warning', 'fern-spec-unsupported', 'Only OpenAPI specs are converted (AsyncAPI/proto/Conjure found).', { file: 'generators.yml' });
      }
    };
    collect(g?.api);
    if (g?.openapi) specs.push(typeof g.openapi === 'string' ? g.openapi : g.openapi.path);
  }
  const apisDir = path.join(fernDir, 'apis');
  if (await fs.pathExists(apisDir)) {
    for (const d of (await fs.readdir(apisDir)).sort()) {
      const gp = path.join(apisDir, d, 'generators.yml');
      const g = (await fs.pathExists(gp)) ? await readYaml(gp, rep) : null;
      const before = specs.length;
      const arr = g?.api?.specs || (Array.isArray(g?.api) ? g.api : []);
      for (const s of arr) if (s?.openapi) specs.push(posix(path.join('apis', d, typeof s.openapi === 'string' ? s.openapi : s.openapi.path)));
      if (specs.length === before) for (const n of ['openapi/openapi.yml', 'openapi/openapi.yaml', 'openapi/openapi.json']) if (await fs.pathExists(path.join(apisDir, d, n))) { specs.push(posix(path.join('apis', d, n))); break; }
    }
  }
  if (!specs.length) for (const n of ['openapi/openapi.yml', 'openapi/openapi.yaml', 'openapi/openapi.json', 'openapi.yml', 'openapi.yaml', 'openapi.json'])
    if (await fs.pathExists(path.join(fernDir, n))) { specs.push(n); break; }
  if (!specs.length && await fs.pathExists(path.join(fernDir, 'definition'))) rep('warning', 'fern-definition', 'This project uses the Fern Definition format (definition/*.yml) for its API, which cannot be converted to OpenAPI automatically.', { action: 'API reference pages were not generated.', fix: 'Export an OpenAPI spec (`fern export openapi`) and run `docslit openapi scaffold <spec>`.' });
  return specs.map((s) => posix(path.normalize(s.replace(/^\.\//, ''))));
}

// ─── navigation ───────────────────────────────────────────────────────────────
async function convertFernNav(imp, fernDir, docs, api, specs, rep, opts) {
  const state = { used: new Set() };
  const readFm = async (rel) => { try { return matter(await fs.readFile(path.join(fernDir, rel), 'utf8')).data || {}; } catch { return {}; } };
  const pageExists = (p) => p && fs.pathExistsSync(path.join(fernDir, p));

  const registerPage = async (relPath, title, prefix, item = {}, base = '') => {
    const rel = posix(path.normalize(path.join(base, String(relPath))));
    if (!pageExists(rel)) { rep('warning', 'nav-page-missing', `Navigation page "${relPath}" was not found.`, { action: 'Removed it from the sidebar.', fix: 'Create the page or remove it from docs.yml.' }); return null; }
    const fm = await readFm(rel);
    let slugPath;
    if (fm.slug) slugPath = String(fm.slug).replace(/^\/+|\/+$/g, '').replace(new RegExp(`^(${imp.fernBasePaths.join('|')})/`), '');
    else slugPath = [...prefix, item.slug ? String(item.slug) : slugify(title || path.basename(rel, path.extname(rel)))].filter(Boolean).join('/');
    if (item.__index) slugPath = [...prefix].filter(Boolean).join('/') + '/overview';
    // collisions
    let slug = slugPath || 'index'; let n = 2;
    while (imp.slugs.has(slug) && imp.pageSrcOf?.(slug) !== rel) { slug = `${slugPath}-${n++}`; }
    if (!imp.pages.has(rel)) {
      slug = imp.registerPage(rel, slug, { navTitle: title, fmTitle: fm.title, override: { ...(fm.title ? {} : { title }) } });
      imp.urlToSlug.set(slug.replace(/\/overview$/, ''), slug);
      if (item.__index && /\/overview$/.test(slug)) imp.redirects['/' + slug.replace(/\/overview$/, '')] ??= '/' + slug;
    }
    const reg = imp.pages.get(rel);
    return { slug: reg.slug, fm };
  };

  const convertItems = async (items, prefix, depth, st) => {
    const out = [];
    for (const item of items || []) {
      if (!item || typeof item !== 'object') continue;
      const hidden = item.hidden === true;
      if (item.page !== undefined) {
        if (!item.path) continue;
        const r = await registerPage(item.path, item.page, prefix, item, st.base);
        if (!r) continue;
        const entry = { id: r.slug };
        if (!r.fm.title || String(r.fm.title) !== String(item.page)) entry.title = String(item.page);
        if (item.icon) entry.icon = String(item.icon);
        if (hidden) entry.hidden = true;
        if (item.availability) entry.availability = String(item.availability);
        out.push(entry);
      } else if (item.section !== undefined) {
        const segment = item['skip-slug'] ? [] : [item.slug ? String(item.slug) : slugify(item.section)];
        const sub = [...prefix, ...segment];
        const g = { group: String(item.section) };
        if (item.icon) g.icon = String(item.icon);
        if (hidden) g.hidden = true;
        if (item.availability) g.availability = String(item.availability);
        if (item.collapsed === true) g.collapsed = true; else if (item.collapsed === 'open-by-default') g.collapsed = 'open-by-default';
        if (item.path) {
          const r = await registerPage(item.path, item.section, sub, { __index: true }, st.base);
          if (r) g.root = r.slug;
        }
        g.pages = await convertItems(item.contents, sub, depth + 1, st);
        out.push(g);
      } else if (item.link !== undefined) {
        out.push({ href: item.href, title: String(item.link), ...(item.icon ? { icon: String(item.icon) } : {}) });
      } else if (item.folder !== undefined) {
        out.push(...await folderItems(item, prefix, st.base));
      } else if (item.api !== undefined) {
        const spec = specs[0];
        if (!spec) { rep('warning', 'fern-api-no-spec', `API reference "${item.api}" has no OpenAPI spec (generators.yml) to convert.`, { action: 'Skipped the API section.' }); continue; }
        st.used.add(spec); st.hasApi = true;
        out.push({ group: String(item.api), ...(item.icon ? { icon: String(item.icon) } : {}), pages: [{ __openapiAll: spec }] });
        if (item.layout || item.flattened || item.paginated) rep('info', 'fern-api-layout', `API section "${item.api}" layout options (flattened/paginated/layout) are not applicable; endpoints are grouped by tag.`, { action: 'Used tag grouping.' });
      } else if (item.changelog !== undefined) {
        const g = await changelogPage(item, prefix, st.base);
        if (g) out.push(g);
      }
    }
    return out;
  };

  const folderItems = async (item, prefix, base = '') => {
    const dir = posix(path.normalize(path.join(base, String(item.folder))));
    const abs = path.join(fernDir, dir);
    const out = [];
    if (!await fs.pathExists(abs)) { rep('warning', 'nav-page-missing', `Folder "${item.folder}" was not found.`, { action: 'Skipped.' }); return out; }
    const files = (await fs.readdir(abs)).filter((f) => /\.(mdx?|md)$/i.test(f)).sort();
    const pages = [];
    for (const f of files) {
      const rel = posix(path.join(dir, f));
      const fm = await readFm(rel);
      const title = fm.title || slugify(path.basename(f, path.extname(f))).replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      const r = await registerPage(rel, title, [...prefix, item.title ? slugify(item.title) : ''].filter(Boolean), {}, '');
      if (r) pages.push(r.slug);
    }
    if (item.title) out.push({ group: String(item.title), pages }); else out.push(...pages);
    return out;
  };

  const changelogPage = async (item, prefix, base = '') => {
    const dir = posix(path.normalize(path.join(base, String(item.changelog))));
    const abs = path.join(fernDir, dir);
    if (!await fs.pathExists(abs)) { rep('warning', 'nav-page-missing', `Changelog folder "${item.changelog}" was not found.`, { action: 'Skipped.' }); return null; }
    const files = (await fs.readdir(abs)).filter((f) => /\.(mdx?|md)$/i.test(f)).sort().reverse();
    (imp.consumedDirs ||= new Set()).add(dir.replace(/\/$/, ''));
    const title = item.title || 'Changelog';
    const slug = [...prefix, item.slug || slugify(title)].join('/');
    const parts = [];
    for (const f of files) {
      const rel = posix(path.join(dir, f));
      const res = await imp.convertFile(rel, { isSnippet: false });
      const date = path.basename(f, path.extname(f)).replace(/\.(mdx?|md)$/i, '');
      const fmx = res.rawFm || {};
      const label = String(fmx.title || date);
      parts.push(`<wc-update label="${label.replace(/"/g, '&quot;')}"${fmx.title ? ` description="${date}"` : ''}>\n\n${res.body.trim()}\n\n</wc-update>`);
    }
    imp.outFiles.set(`docs/${slug}.md`, `---\ntitle: ${JSON.stringify(title)}\n---\n\n${parts.join('\n\n')}\n`);
    imp.slugs.add(slug); imp.urlToSlug.set(slug, slug);
    imp.stats.pages++;
    imp.reporter.count('changelog folder', 'wc-update');
    return slug;
  };

  // tabs definition
  const tabDefs = docs.tabs || {};
  let result;
  const nav = docs.navigation;
  const buildLayout = async (navArr, prefix, st, base = '') => {
    st.base = base;
    const items = await convertItems(navArr, prefix, 0, st);
    return wrapTop(items);
  };
  const wrapTop = (items) => {
    const out = []; let loose = [];
    for (const it of items) {
      if (typeof it === 'object' && it.group !== undefined) { if (loose.length) { out.push({ group: 'Documentation', pages: loose }); loose = []; } out.push(it); } else loose.push(it);
    }
    if (loose.length) out.push({ group: 'Documentation', pages: loose });
    return out;
  };

  const navFromArray = async (arr, prefix, base = '') => {
    const hasTabs = arr.some((i) => i && i.tab !== undefined);
    if (!hasTabs) { const st = { used: new Set() }; const sidebar = await buildLayout(arr, prefix, st, base); st.used.forEach((s2) => state.used.add(s2)); return { sidebar, hasApi: st.hasApi }; }
    const tabs = [];
    for (const t of arr) {
      if (t.tab === undefined) continue;
      const def = tabDefs[t.tab] || {};
      const tab = { tab: String(def['display-name'] || t.tab) };
      if (def.icon) tab.icon = String(def.icon);
      if (def.href) { tab.href = def.href; if (def.target) tab.target = def.target; tabs.push(tab); continue; }
      if (def.hidden || t.hidden) tab.hidden = true;
      if (def.variants) rep('warning', 'fern-tab-variants', `Tab "${t.tab}" has variants, which DocsLit tabs do not support.`, { action: 'Variant layouts were flattened into one sidebar.', fix: 'Split variants into separate tabs if the groups collide.' });
      const segment = def['skip-slug'] ? [] : [def.slug ? String(def.slug) : slugify(tab.tab)];
      const st = { used: new Set() };
      let sidebar;
      if (def.changelog) { const g = await changelogPage({ changelog: def.changelog, title: tab.tab, slug: def.slug }, prefix, base); sidebar = g ? [{ group: tab.tab, pages: [g] }] : []; }
      else sidebar = await buildLayout(t.layout || [], [...prefix, ...segment], st, base);
      if (st.hasApi) tab.openapi = true;
      st.used.forEach((s) => state.used.add(s));
      tab.sidebar = sidebar;
      tabs.push(tab);
    }
    return { tabs };
  };

  const strat = opts.versions || 'tabs';
  if (Array.isArray(docs.versions) && docs.versions.length) {
    const defV = docs.versions.find((v) => v.default) || docs.versions[0];
    const list = strat === 'latest' ? [defV] : docs.versions;
    if (strat === 'latest') rep('warning', 'nav-versions', `docs.yml defines ${docs.versions.length} versions; only "${defV['display-name']}" was converted.`, { action: 'Other versions skipped.', fix: 'DocsLit versions are git branches: create a branch per version.' });
    else rep('warning', 'nav-versions', `docs.yml defines ${docs.versions.length} versions. DocsLit versions are git branches, so each version became a top-level tab in one site.`, { action: 'One tab per version.', fix: 'To get a version selector, split each onto its own branch and configure "versions".' });
    const tabs = [];
    for (const v of list) {
      const vf = await readYaml(path.join(fernDir, String(v.path)), rep);
      if (!vf) continue;
      const vslug = v.slug ? String(v.slug) : slugify(v['display-name']);
      const r = await navFromArray(vf.navigation || [], strat === 'latest' ? [] : [vslug], posix(path.dirname(String(v.path))));
      const label = String(v['display-name']);
      if (r.tabs) for (const t of r.tabs) { t.tab = strat === 'latest' ? t.tab : `${label}: ${t.tab}`; tabs.push(t); }
      else tabs.push({ tab: label, sidebar: r.sidebar });
    }
    result = strat === 'latest' && tabs.length === 1 && !docs.tabs ? { sidebar: tabs[0].sidebar } : { tabs };
  } else if (Array.isArray(docs.products) && docs.products.length) {
    rep('info', 'nav-products', 'Fern "products" have no DocsLit equivalent; each product became a tab.', { action: 'Mapped products to tabs.' });
    const tabs = [];
    for (const p of docs.products) {
      const pf = await readYaml(path.join(fernDir, String(p.path)), rep);
      if (!pf) continue;
      const slug = p.slug ? String(p.slug) : slugify(p['display-name']);
      if (p.href) { tabs.push({ tab: String(p['display-name']), href: p.href }); continue; }
      const r = await navFromArray(pf.navigation || [], [slug], posix(path.dirname(String(p.path))));
      if (r.tabs) for (const t of r.tabs) { t.tab = `${p['display-name']}: ${t.tab}`; tabs.push(t); } else tabs.push({ tab: String(p['display-name']), sidebar: r.sidebar });
    }
    result = { tabs };
  } else result = await navFromArray(Array.isArray(nav) ? nav : [], []);

  // landing page
  const lp = docs['landing-page'];
  if (lp?.path) {
    const rel = posix(path.normalize(String(lp.path).replace(/^\.\//, '')));
    if (pageExists(rel) && !imp.pages.has(rel) && !imp.slugs.has('index')) {
      const fm = await readFm(rel);
      imp.registerPage(rel, 'index', { override: { ...(fm.title ? {} : { title: lp.page || 'Home' }), ...(fm.layout ? {} : { layout: 'full' }) } });
      imp.urlToSlug.set('', 'index');
      R_map(imp, docsFile(docs), 'landing-page', 'docs/index.md');
    }
  }

  // expand API markers
  let specUsed = null;
  if (result.tabs) { for (const t of result.tabs) if (t.sidebar) t.sidebar = tidySidebar(await api.expand(t.sidebar)); const api0 = result.tabs.find((t) => t.openapi); void api0; result.tabs = result.tabs.filter((t) => t.href || t.sidebar?.length); }
  else result.sidebar = tidySidebar(await api.expand(result.sidebar || []));
  if (state.used.size) specUsed = [...state.used][0];
  if (state.used.size > 1) rep('warning', 'openapi-multiple', `Multiple OpenAPI specs (${[...state.used].join(', ')}) are referenced; DocsLit supports one per project.`, { action: `Used ${specUsed}.` });
  return { ...result, specUsed };
}
const docsFile = () => 'docs.yml';
function R_map(imp, f, from, to) { imp.reporter.mapKey(`${f} ${from}`, to); }
export { slugify, stripExt };
