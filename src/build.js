import path from 'path';
import { mapLimit, DEFAULT_LIMIT } from './concurrency.js';
import fs from 'fs-extra';
import pc from 'picocolors';
import { fileURLToPath } from 'url';
import { loadConfig, getAllPageIds, getVersionConfig, getOpenAPIConfig, getVersionNavigation, getChangedDocs, gitReadFile } from './config.js';
import { parseDoc } from './markdown.js';
import { sidebarLabel } from './sidebar.js';
import { hasTabs, tabIdForPage, tabLandingId, walkPages, pageNavMeta, isNoindexMeta, isSearchableMeta, collectHiddenIds } from './navigation.js';
import { pageClientInfo, withApiTab } from './nav-chrome.js';
import { renderShell, renderPage, buildStylesFile, buildComponentsFile, buildAppFile, buildOfflineThemeInitFile, buildOfflineAppFile, isEsbuildAvailable } from './template.js';
import { resolveSiteTheme } from './themes.js';
import { loadSpec, getEndpoints, getApiMeta, resolveSpecRefs, buildApiPageMarkdown } from './openapi.js';
import { initHighlighter } from './highlighter.js';
import { resolvePdfOptions, buildPdfManifest, getChapterManifest, generatePdfs } from './pdf.js';
import {
  buildAgentDirectiveMarkdown,
  buildMarkdownPattern,
  getLlmsTxtUrl,
  getMarkdownUrl,
  getVersionPathPrefix,
  prependAgentDirectiveToMarkdown,
} from './agent-docs.js';
import { normalizeBasePath, withBasePath, logoFiles } from './site-config.js';
import { collectRedirects, writeRedirectArtifacts, redirectStubHtml } from './redirects.js';
import { writeFeeds } from './feeds.js';
import { generateOgImage, ogColorsFromTheme } from './og-image.js';
import { buildSearchEntries } from './search-index.js';
import { getI18nConfig, localeDocsDir, getSidebarForLocale, discoverLocales, localeUrlPrefix } from './i18n.js';
import { loadHooks } from './hooks.js';
import { getPageLastmods } from './git-dates.js';
import { PREFERS_MARKDOWN_SRC } from './negotiation.js';
import { pagesUseMath, writeKatexAssets } from './math.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function preparePdfManifest(config, pagesData, pdfOptions) {
  if (!pdfOptions.enabled) return null;
  const { chapters, pageToChapter } = getChapterManifest(config, pagesData, pdfOptions);
  return buildPdfManifest({ options: pdfOptions, chapters, pageToChapter, pagesData });
}

function buildTitleMap(pagesData) {
  const map = {};
  for (const [id, { meta }] of Object.entries(pagesData)) {
    const label = sidebarLabel(meta);
    if (label) map[id] = label;
  }
  return map;
}

/** Sidebar-relevant frontmatter (icon, badge, availability, hidden) per page id. */
function buildNavMeta(pagesData) {
  const map = {};
  for (const [id, { meta }] of Object.entries(pagesData)) {
    const m = pageNavMeta(meta);
    if (Object.keys(m).length) map[id] = m;
  }
  return map;
}

/** Ids that are built and linkable but kept out of the sidebar, search, llms.txt and the sitemap. */
function indexExcludedIds(config, pagesData) {
  const out = collectHiddenIds(config.sidebar);
  for (const [id, { meta }] of Object.entries(pagesData)) if (isNoindexMeta(meta)) out.add(id);
  return out;
}

/** First page that should be the site's entry point: a visible page, falling back to any page. */
function firstVisibleId(config, pagesData) {
  const ids = Object.keys(pagesData);
  const hidden = indexExcludedIds(config, pagesData);
  if (hasTabs(config)) {
    for (const tab of config.tabs) {
      const landing = tabLandingId(tab, hidden);
      if (landing && pagesData[landing]) return landing;
    }
  }
  return ids.find((id) => !hidden.has(id)) || ids[0];
}

/**
 * The index.html of a site, version or locale root. It redirects to the first page
 * instead of duplicating it: a copy would carry the first page's canonical while
 * the URL is "/", and its relative content links were written for the page's own
 * folder, so they 404 from the root. `urlPrefix` is basePath + locale + version.
 */
async function writeRootIndexStub({ dir, firstId, urlPrefix = '', config }) {
  const to = `${urlPrefix}/${firstId}`;
  const baseUrl = (config.url || '').replace(/\/$/, '');
  await fs.writeFile(path.join(dir, 'index.html'), redirectStubHtml(to, {
    canonical: baseUrl ? `${baseUrl}${to}` : to,
    fileHref: `${firstId}.html`,
  }));
}

function getRuntimeAttributes(config, version = null, branch = null) {
  const attrs = { ...(config.attributes || {}) };
  attrs.DOCSLIT_VERSION = version || 'unversioned';
  attrs.DOCSLIT_BRANCH = branch || 'working-tree';
  return attrs;
}

async function writePageMarkdown(destMd, content, config, id, version = null) {
  await fs.ensureDir(path.dirname(destMd));
  const markdown = prependAgentDirectiveToMarkdown(content, buildAgentDirectiveMarkdown(config, id, version));
  await fs.writeFile(destMd, markdown);
}

function _formatBytes(b) {
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) return (b / 1024).toFixed(0) + ' KB';
  return (b / 1024 / 1024).toFixed(1) + ' MB';
}

function _pageFileName(id) {
  return id.replace(/\//g, '--') + '.js';
}

function _writePageJs(outDir, id, data) {
  // data: { meta, html, nav } — `nav` carries the page's tab/layout switches for the offline runtime.
  const file = path.join(outDir, 'pages', _pageFileName(id));
  const js = `(window.__DOCSLIT_PAGES__=window.__DOCSLIT_PAGES__||{})[${JSON.stringify(id)}]=${JSON.stringify(data)};`;
  return fs.ensureDir(path.dirname(file)).then(() => fs.writeFile(file, js));
}

/** Build-time page warning (e.g. invalid TeX). Printed, never fatal. */
function warnPage({ file, line, message }) {
  const where = file ? `${path.isAbsolute(file) ? path.relative(process.cwd(), file) : file}${line ? `:${line}` : ''}` : '';
  console.log(`  ${pc.yellow('⚠')} ${where ? `${where}  ` : ''}${message}`);
}

// Copy configured logo/favicon/css to the same relative path the HTML references
// (dev serves them from the project root, so "assets/logo.png" -> /assets/logo.png).
function _assetDest(p) {
  const rel = path.posix.normalize(String(p).replace(/\\/g, '/').replace(/^\/+/, ''));
  return rel.startsWith('..') ? path.basename(rel) : rel;
}

function _writeSearchIndexJs(outDir, searchIndex) {
  const js = `window.__DOCSLIT_SEARCH_INDEX__=${JSON.stringify(searchIndex)};`;
  // Offline pages load FlexSearch as a classic script (modules can't load on file://).
  const iife = path.join(__dirname, 'vendor', 'flexsearch.iife.js');
  return Promise.all([
    fs.writeFile(path.join(outDir, 'search-index.js'), js),
    fs.pathExists(iife).then(ok => ok && fs.copyFile(iife, path.join(outDir, 'flexsearch.iife.js'))),
  ]);
}

const VENDOR_FILES = {
  'lit': 'lit.js',
  'lit/decorators.js': 'lit-decorators.js',
  'lit/directives/unsafe-html.js': 'lit-unsafe-html.js',
  '@lit/reactive-element': 'reactive-element.js',
  'lit-html': 'lit-html.js',
  'lit-element/lit-element.js': 'lit-element.js',
};

async function _loadVendorData() {
  const vendorDir = path.join(__dirname, 'vendor');
  const data = {};
  await Promise.all(Object.entries(VENDOR_FILES).map(async ([key, file]) => {
    data[key] = await fs.readFile(path.join(vendorDir, file), 'utf8');
  }));
  return data;
}

export async function build({ out = 'dist', offline = false, minify = true, pdf = false, noPdf = false, pdfDir = null } = {}) {
  const t0 = performance.now();
  const cwd = process.cwd();
  const [config] = await Promise.all([loadConfig(cwd), initHighlighter()]);
  const siteTheme = await resolveSiteTheme(config, cwd);
  const outDir = path.resolve(cwd, out);
  const versionConfig = getVersionConfig(config);
  const pdfOptions = resolvePdfOptions(config, { pdf, noPdf, pdfDir });
  const hooks = await loadHooks(cwd);
  const basePath = normalizeBasePath(config.basePath);

  const modeLabel = offline ? ' (offline mode)' : '';
  const minifyLabel = minify ? '' : ' (unminified)';
  const pdfLabel = pdfOptions.enabled ? ' + PDF' : '';
  console.log(`\n  ${pc.bold('DocsLit')} building static site${modeLabel}${minifyLabel}${pdfLabel}...\n`);

  if (hooks.file) {
    console.log(`  ${pc.green('✓')} Loaded hooks from ${path.basename(hooks.file)}`);
  }

  if (pdfOptions.enabled && offline) {
    console.log(`  ${pc.yellow('⚠')} PDF generation skipped in offline mode (use a standard build with --pdf)\n`);
    pdfOptions.enabled = false;
  }

  if (minify && !isEsbuildAvailable()) {
    console.log(`  ${pc.yellow('⚠')} esbuild not found — output unminified; install esbuild or use --no-minify\n`);
  }

  await fs.emptyDir(outDir);

  // Copy user components (shared across versions)
  const componentsDir = path.join(cwd, 'components');
  if (await fs.pathExists(componentsDir)) {
    const entries = await fs.readdir(componentsDir);
    if (entries.length) {
      await fs.copy(componentsDir, path.join(outDir, 'components'));
      console.log(`  ${pc.green('✓')} Copied components/`);
    }
  }

  // Copy favicon assets
  const assetsDir = path.join(__dirname, 'assets');
  for (const f of ['favicon-32x32.png', 'favicon-16x16.png', 'apple-touch-icon.png']) {
    await fs.copyFile(path.join(assetsDir, f), path.join(outDir, f));
  }
  console.log(`  ${pc.green('✓')} Copied favicon assets`);

  // Copy custom favicon if configured
  if (config.favicon) {
    const faviconFile = path.resolve(cwd, config.favicon);
    if (await fs.pathExists(faviconFile)) {
      await fs.copy(faviconFile, path.join(outDir, _assetDest(config.favicon)));
      console.log(`  ${pc.green('✓')} Copied custom favicon ${config.favicon}`);
    }
  }

  // Copy custom CSS if configured
  if (config.css) {
    const cssFile = path.resolve(cwd, config.css);
    if (await fs.pathExists(cssFile)) {
      await fs.copy(cssFile, path.join(outDir, _assetDest(config.css)));
      console.log(`  ${pc.green('✓')} Copied custom CSS ${config.css}`);
    }
  }

  for (const logo of logoFiles(config)) {
    const logoFile = path.resolve(cwd, logo);
    if (await fs.pathExists(logoFile)) {
      await fs.copy(logoFile, path.join(outDir, _assetDest(logo)));
      console.log(`  ${pc.green('✓')} Copied logo ${logo}`);
    } else {
      console.log(`  ${pc.yellow('⚠')} Logo file not found: ${logo}`);
    }
  }

  // Copy FlexSearch vendor bundle (ESM, loaded via import() by online builds).
  // Offline builds load flexsearch.iife.js instead (see _writeSearchIndexJs), and
  // versioned builds load the copy inside <version>/ (the search base is the version
  // dir), so a root copy would be dead weight in both.
  const flexSearchSrc = path.join(__dirname, 'vendor', 'flexsearch.js');
  if (!offline && !versionConfig && await fs.pathExists(flexSearchSrc)) {
    await fs.copyFile(flexSearchSrc, path.join(outDir, 'flexsearch.js'));
  }

  // Copy docs media (images) preserving relative paths
  await copyDocsMedia(path.join(cwd, 'docs'), outDir);

  if (versionConfig) {
    await buildVersioned({ config, versionConfig, cwd, outDir, out, offline, minify, pdfOptions, siteTheme, hooks, basePath });
  } else {
    await buildSingle({ config, cwd, outDir, out, offline, minify, pdfOptions, siteTheme, hooks, basePath });
  }

  const sizeKb = await getDirSize(outDir);
  const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
  console.log(`\n  ${pc.bold('Done!')} Output: ${pc.cyan(path.relative(cwd, outDir))}/ (${sizeKb} KB) in ${pc.green(elapsed + 's')}\n`);
  if (offline) {
    console.log(`  Serve locally:  ${pc.cyan(`npx serve ${out}`)}  ${pc.dim('or')}  ${pc.cyan(`open ${out}/index.html`)}`);
    console.log(`  ${pc.dim('Self-contained — no internet connection required')}\n`);
  } else {
    console.log(`  Serve locally:  ${pc.cyan('npx serve dist')}`);
    console.log(`  Deploy to:      GitHub Pages, Vercel, Netlify, S3, or any static host\n`);
  }
}

async function buildSingle({ config, cwd, outDir, out, offline, minify, pdfOptions, siteTheme, hooks, basePath }) {
  const pageIds = getAllPageIds(config);
  const pagesData = {};
  const draftPageIds = [];
  let built = 0, drafts = 0, failed = 0;

  // Load OpenAPI spec if configured
  let specData = null;
  let apiMeta = null;
  const openapiConfig = getOpenAPIConfig(config);
  if (openapiConfig?.spec) {
    try {
      const spec = await loadSpec(
        path.resolve(cwd, openapiConfig.spec),
        openapiConfig.overlay ? path.resolve(cwd, openapiConfig.overlay) : null,
      );
      specData = getEndpoints(spec);
      apiMeta = getApiMeta(spec);
      console.log(`  ${pc.green('✓')} Loaded OpenAPI spec (${specData.length} endpoints)`);
    } catch (e) {
      console.log(`  ${pc.yellow('⚠')} Failed to load OpenAPI spec: ${e.message}`);
    }
  }

  if (specData) {
    for (const ep of specData) {
      if (!ep.operationId) continue;
      const slug = ep.operationId.replace(/([a-z])([A-Z])/g, '$1-$2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2').toLowerCase();
      const apiId = `api/${slug}`;
      if (!pageIds.includes(apiId)) pageIds.push(apiId);
    }
  }

  const parseResults = await mapLimit(pageIds, DEFAULT_LIMIT, async (id) => {
    const mdPath = path.join(cwd, 'docs', `${id}.md`);
    if (!await fs.pathExists(mdPath)) return { id, notFound: true };
    const raw = await fs.readFile(mdPath, 'utf8');
    const parsed = await parseDoc(raw, {
      onWarning: warnPage,
      docsRoot: path.join(cwd, 'docs'),
      pagePath: mdPath,
      globalAttributes: getRuntimeAttributes(config),
    });
    return { id, ...parsed };
  });

  for (const result of parseResults) {
    if (result.notFound) {
      console.log(`  ${pc.yellow('!')} Skipped ${result.id}.md — file not found`);
      failed++;
      continue;
    }

    let { id, meta, html, preprocessedMarkdown } = result;

    if (meta.draft === true) {
      draftPageIds.push(id);
      drafts++;
      console.log(`  ${pc.dim('○')} Skipped ${id} — draft`);
      continue;
    }

    if (specData) {
      html = resolveSpecRefs(html, specData);
    }

    // Apply transformPage hook
    if (hooks.transformPage) {
      try {
        html = await hooks.transformPage({ id, meta, html }) || html;
      } catch (e) {
        console.log(`  ${pc.yellow('⚠')} transformPage hook failed for ${id}: ${e.message}`);
      }
    }

    const isApiPage = id.startsWith('api/') || meta.layout === 'api';
    pagesData[id] = { meta, html, isApiPage, preprocessedMarkdown };
    if (!offline) {
      const destMd = path.join(outDir, `${id}.md`);
      const mdContent = isApiPage && specData
        ? buildApiPageMarkdown(preprocessedMarkdown, specData)
        : preprocessedMarkdown;
      await writePageMarkdown(destMd, mdContent, config, id);
    }
    built++;
  }

  const skippedNote = failed ? pc.yellow(` (${failed} skipped)`) : '';
  const draftNote = drafts ? pc.dim(` (${drafts} draft${drafts !== 1 ? 's' : ''} hidden)`) : '';
  const titleMap = buildTitleMap(pagesData);
  const navMeta = buildNavMeta(pagesData);
  const navConfig = withApiTab(config, !!specData);
  const pdfManifest = !offline ? preparePdfManifest(config, pagesData, pdfOptions) : null;

  // Generate OG images
  const ogColors = ogColorsFromTheme(siteTheme);
  const siteName = config.name || 'Documentation';

  if (pagesUseMath(pagesData)) await writeKatexAssets(outDir);
  if (offline) {
    const vendorData = await _loadVendorData();
    const searchIndex = buildSearchIndex(config, pagesData);
    const indexHtml = await renderShell({ config, siteTheme, mode: 'static', out, offline: true, draftPageIds, minify, specData, apiMeta, vendorData, titleMap, navMeta });
    await Promise.all([
      fs.writeFile(path.join(outDir, 'index.html'), indexHtml),
      _writeSearchIndexJs(outDir, searchIndex),
      ...Object.entries(pagesData).map(([id, { meta, html }]) => _writePageJs(outDir, id, { meta, html, nav: pageClientInfo(navConfig, id, meta) })),
    ]);
    console.log(`  ${pc.green('✓')} Built ${built} page${built !== 1 ? 's' : ''} (offline)${draftNote}${skippedNote}`);
  } else {
    await fs.writeFile(path.join(outDir, 'docslit.css'), buildStylesFile({ minify, siteTheme }));
    await fs.writeFile(path.join(outDir, 'docslit.js'), buildComponentsFile('static', { minify }));
    await fs.writeFile(path.join(outDir, 'docslit-app.js'), buildAppFile('static', { minify }));

    const publishedIds = Object.keys(pagesData);
    const hasRegularDocs = (config.sidebar || []).length > 0;
    const isHybrid = specData && hasRegularDocs;

    // Generate OG images for each page (bounded: each render holds a full image in memory)
    const ogPromises = [];
    for (const [id, { meta }] of Object.entries(pagesData)) {
      if (config.ogImage === false || meta.ogImage === false) continue;
      const safeId = id.replace(/\//g, '--');
      const outFile = path.join(outDir, 'og', `${safeId}.png`);
      ogPromises.push(() => generateOgImage({ title: meta.title || toLabel(id), siteName, colors: ogColors, outFile }).catch(() => {}));
    }
    await mapLimit(ogPromises, DEFAULT_LIMIT, (job) => job());
    if (ogPromises.length) {
      console.log(`  ${pc.green('✓')} Generated ${ogPromises.length} OG image${ogPromises.length !== 1 ? 's' : ''}`);
    }

    for (const [id, { meta, html, isApiPage }] of Object.entries(pagesData)) {
      const ogEnabled = config.ogImage !== false && meta.ogImage !== false;
      const safeId = id.replace(/\//g, '--');
      const ogImagePath = ogEnabled ? `og/${safeId}.png` : null;
      const pageHtml = await renderPage({ config, siteTheme, id, meta, html, draftPageIds, specData: (isApiPage || isHybrid) ? specData : null, apiMeta: (isApiPage || isHybrid) ? apiMeta : null, pdfManifest, ogImagePath, titleMap, navMeta });
      const destHtml = path.join(outDir, `${id}.html`);
      await fs.ensureDir(path.dirname(destHtml));
      await fs.writeFile(destHtml, pageHtml);
    }

    if (publishedIds.length) {
      await writeRootIndexStub({ dir: outDir, firstId: firstVisibleId(config, pagesData), urlPrefix: basePath, config });
    }

    console.log(`  ${pc.green('✓')} Built ${built} page${built !== 1 ? 's' : ''} + shared assets${draftNote}${skippedNote}`);
    await generateLlmsTxt({ config, pagesData, outDir });
  }

  if (!offline) {
    // Sitemap with git lastmods
    const lastmods = await getPageLastmods(cwd, pagesData);
    await generateRobotsTxt({ config, outDir });
    await generateSitemap({ config, pagesData, outDir, lastmods });
    await generateMarkdownMiddleware({ pageIds: Object.keys(pagesData), outDir, cwd, basePath });
    await generateAgentJson({ config, pageIds: Object.keys(pagesData), pagesData, outDir });
    await generateMcpServer({ config, pagesData, outDir });

    // Redirects
    const redirects = collectRedirects(config, pagesData, basePath);
    if (redirects.length) {
      const { stubs } = await writeRedirectArtifacts({ redirects, outDir, basePath });
      console.log(`  ${pc.green('✓')} Generated ${stubs} redirect stub${stubs !== 1 ? 's' : ''}`);
    }

    // RSS/Atom feeds
    const wroteFeeds = await writeFeeds({ config, pagesData, outDir, basePath });
    if (wroteFeeds) {
      console.log(`  ${pc.green('✓')} Generated rss.xml + atom.xml`);
    }
  }

  if (pdfOptions.enabled && !offline) {
    await generatePdfs({ outDir, config, pagesData, pdfOptions });
  }

  // i18n: build non-default locale pages
  const i18n = getI18nConfig(config);
  if (i18n.enabled && !offline) {
    const locales = await discoverLocales(cwd, i18n);
    for (const locale of locales) {
      if (locale === i18n.defaultLocale) continue;
      await buildLocalePages({ config, cwd, outDir, locale, i18n, siteTheme, minify, hooks, basePath, specData, apiMeta, draftPageIds, pdfManifest });
    }
  }

  // onBuildEnd hook
  if (hooks.onBuildEnd) {
    try {
      await hooks.onBuildEnd({ outDir, pages: pagesData, config });
    } catch (e) {
      console.log(`  ${pc.yellow('⚠')} onBuildEnd hook failed: ${e.message}`);
    }
  }
}

async function buildVersioned({ config, versionConfig, cwd, outDir, out, offline, minify, pdfOptions, siteTheme, hooks, basePath }) {
  const defaultVersion = versionConfig.default;
  const defaultEntry = versionConfig.list.find(v => v.version === defaultVersion);
  const defaultBranch = defaultEntry?.branch || 'main';

  console.log(`  ${pc.bold('Versions:')} ${versionConfig.list.map(v => v.version === defaultVersion ? pc.cyan(v.version + ' (default)') : v.version).join(', ')}\n`);

  // Load OpenAPI spec if configured
  let specData = null;
  let apiMeta = null;
  const openapiConfig = getOpenAPIConfig(config);
  if (openapiConfig?.spec) {
    try {
      const spec = await loadSpec(
        path.resolve(cwd, openapiConfig.spec),
        openapiConfig.overlay ? path.resolve(cwd, openapiConfig.overlay) : null,
      );
      specData = getEndpoints(spec);
      apiMeta = getApiMeta(spec);
      console.log(`  ${pc.green('✓')} Loaded OpenAPI spec (${specData.length} endpoints)`);
    } catch (e) {
      console.log(`  ${pc.yellow('⚠')} Failed to load OpenAPI spec: ${e.message}`);
    }
  }

  // Build default version fully from the working directory
  const defaultDir = path.join(outDir, defaultVersion);
  const defaultPageIds = getAllPageIds(config);
  if (specData) {
    for (const ep of specData) {
      if (!ep.operationId) continue;
      const slug = ep.operationId.replace(/([a-z])([A-Z])/g, '$1-$2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2').toLowerCase();
      const apiId = `api/${slug}`;
      if (!defaultPageIds.includes(apiId)) defaultPageIds.push(apiId);
    }
  }
  const defaultPagesData = {};
  const draftPageIds = [];
  let built = 0;

  const defaultParseResults = await mapLimit(defaultPageIds, DEFAULT_LIMIT, async (id) => {
    const mdPath = path.join(cwd, 'docs', `${id}.md`);
    if (!await fs.pathExists(mdPath)) return null;
    const raw = await fs.readFile(mdPath, 'utf8');
    const parsed = await parseDoc(raw, {
      onWarning: warnPage,
      docsRoot: path.join(cwd, 'docs'),
      pagePath: mdPath,
      globalAttributes: getRuntimeAttributes(config, defaultVersion, defaultBranch),
      basePath,
    });
    return { id, ...parsed };
  });

  for (const result of defaultParseResults) {
    if (!result) continue;
    let { id, meta, html, preprocessedMarkdown } = result;
    if (meta.draft === true) { draftPageIds.push(id); continue; }
    if (specData) html = resolveSpecRefs(html, specData);
    if (hooks.transformPage) {
      try { html = await hooks.transformPage({ id, meta, html }) || html; } catch {}
    }
    const isApiPage = id.startsWith('api/') || meta.layout === 'api';
    defaultPagesData[id] = { meta, html, isApiPage };
    if (!offline) {
      const destMd = path.join(defaultDir, `${id}.md`);
      const mdContent = isApiPage && specData
        ? buildApiPageMarkdown(preprocessedMarkdown, specData)
        : preprocessedMarkdown;
      await writePageMarkdown(destMd, mdContent, config, id, defaultVersion);
    }
    built++;
  }

  const sharedCss = offline ? null : buildStylesFile({ minify, siteTheme });
  const sharedJs = offline ? null : buildComponentsFile('static', { minify });
  const sharedApp = offline ? null : buildAppFile('static', { minify });
  const vendorData = offline ? await _loadVendorData() : null;
  const defaultTitleMap = buildTitleMap(defaultPagesData);
  const defaultNavMeta = buildNavMeta(defaultPagesData);
  const defaultNavConfig = withApiTab(config, !!specData);
  const defaultPdfManifest = !offline ? preparePdfManifest(config, defaultPagesData, pdfOptions) : null;

  if (pagesUseMath(defaultPagesData)) await writeKatexAssets(defaultDir);
  // pages are served from /<version>/..., so their relative image / poster / download paths resolve inside the version dir
  await copyDocsMedia(path.join(cwd, 'docs'), defaultDir, { locales: false, quiet: true });
  if (offline) {
    await fs.ensureDir(defaultDir);
    const defaultShell = await renderShell({
      config, siteTheme, mode: 'static', out, draftPageIds,
      versionConfig, currentVersion: defaultVersion,
      offline: true, minify,
      specData, apiMeta, vendorData, titleMap: defaultTitleMap, navMeta: defaultNavMeta,
    });
    const searchIndex = buildSearchIndex(config, defaultPagesData);
    await Promise.all([
      fs.writeFile(path.join(defaultDir, 'index.html'), defaultShell),
      _writeSearchIndexJs(defaultDir, searchIndex),
      ...Object.entries(defaultPagesData).map(([id, { meta, html }]) => _writePageJs(defaultDir, id, { meta, html, nav: pageClientInfo(defaultNavConfig, id, meta) })),
    ]);
  } else {
    await fs.writeFile(path.join(defaultDir, 'docslit.css'), sharedCss);
    await fs.writeFile(path.join(defaultDir, 'docslit.js'), sharedJs);
    await fs.writeFile(path.join(defaultDir, 'docslit-app.js'), sharedApp);
    // Copy FlexSearch into version dir
    const flexSrc = path.join(__dirname, 'vendor', 'flexsearch.js');
    if (await fs.pathExists(flexSrc)) await fs.copyFile(flexSrc, path.join(defaultDir, 'flexsearch.js'));

    const publishedIds = Object.keys(defaultPagesData);
    const defaultHasRegularDocs = (config.sidebar || []).length > 0;
    const defaultIsHybrid = specData && defaultHasRegularDocs;

    // OG images for versioned default
    const ogColors = ogColorsFromTheme(siteTheme);
    const siteName = config.name || 'Documentation';
    const ogPromises = [];
    for (const [id, { meta }] of Object.entries(defaultPagesData)) {
      if (config.ogImage === false || meta.ogImage === false) continue;
      const safeId = id.replace(/\//g, '--');
      ogPromises.push(() => generateOgImage({ title: meta.title || toLabel(id), siteName, colors: ogColors, outFile: path.join(defaultDir, 'og', `${safeId}.png`) }).catch(() => {}));
    }
    await mapLimit(ogPromises, DEFAULT_LIMIT, (job) => job());

    for (const [id, { meta, html, isApiPage }] of Object.entries(defaultPagesData)) {
      const ogEnabled = config.ogImage !== false && meta.ogImage !== false;
      const safeId = id.replace(/\//g, '--');
      const ogImagePath = ogEnabled ? `og/${safeId}.png` : null;
      const pageHtml = await renderPage({ config, siteTheme, id, meta, html, draftPageIds, versionConfig, currentVersion: defaultVersion, specData: (isApiPage || defaultIsHybrid) ? specData : null, apiMeta: (isApiPage || defaultIsHybrid) ? apiMeta : null, pdfManifest: defaultPdfManifest, ogImagePath, titleMap: defaultTitleMap, navMeta: defaultNavMeta });
      const destHtml = path.join(defaultDir, `${id}.html`);
      await fs.ensureDir(path.dirname(destHtml));
      await fs.writeFile(destHtml, pageHtml);
    }

    if (publishedIds.length) {
      await writeRootIndexStub({ dir: defaultDir, firstId: firstVisibleId(config, defaultPagesData), urlPrefix: `${basePath}/${defaultVersion}`, config });
    }
    await generateLlmsTxt({ config, pagesData: defaultPagesData, outDir: defaultDir, version: defaultVersion });
    if (pdfOptions.enabled) {
      await generatePdfs({ outDir: defaultDir, config, pagesData: defaultPagesData, pdfOptions });
    }
  }

  console.log(`  ${pc.green('✓')} ${defaultVersion}: ${built} pages (full build)`);
  // Page lists per version for the generated mcp-server.js (files live in <version>/).
  const versionPages = { [defaultVersion]: pageListOf(defaultPagesData, config) };

  // Build non-default versions — only changed pages
  for (const entry of versionConfig.list) {
    if (entry.version === defaultVersion) continue;
    const versionDir = path.join(outDir, entry.version);
    const versionBranch = entry.branch;

    const versionNav = await getVersionNavigation(versionBranch, cwd);
    const versionConf = versionNav.sidebar.length
      ? { ...config, sidebar: versionNav.sidebar, tabs: versionNav.tabs || undefined }
      : config;
    const versionPageIds = getAllPageIds(versionConf);
    const changedSlugs = new Set(await getChangedDocs(defaultBranch, versionBranch, cwd));
    const manifest = {};
    const versionPagesData = {};
    let vBuilt = 0;

    for (const id of versionPageIds) {
      if (changedSlugs.has(id)) {
        const raw = await gitReadFile(versionBranch, `docs/${id}.md`, cwd);
        if (!raw) continue;
        const readFromVersion = async (absPath) => {
          const relFromDocs = path.relative(path.join(cwd, 'docs'), absPath).replace(/\\/g, '/');
          const gitPath = `docs/${relFromDocs}`;
          const fromGit = await gitReadFile(versionBranch, gitPath, cwd);
          if (fromGit == null) throw new Error(`Include target not found in ${versionBranch}: ${gitPath}`);
          return fromGit;
        };
        const existsFromVersion = async (absPath) => {
          const relFromDocs = path.relative(path.join(cwd, 'docs'), absPath).replace(/\\/g, '/');
          const gitPath = `docs/${relFromDocs}`;
          const fromGit = await gitReadFile(versionBranch, gitPath, cwd);
          return fromGit != null;
        };
        let { meta, html, preprocessedMarkdown } = await parseDoc(raw, {
      onWarning: warnPage,
          docsRoot: path.join(cwd, 'docs'),
          pagePath: `docs/${id}.md@${versionBranch}`,
          globalAttributes: getRuntimeAttributes(config, entry.version, versionBranch),
          basePath,
          readFile: readFromVersion,
          pathExists: existsFromVersion,
          strictFsSafety: false,
        });
        if (meta.draft === true) continue;
        if (specData) html = resolveSpecRefs(html, specData);
        if (hooks.transformPage) {
          try { html = await hooks.transformPage({ id, meta, html }) || html; } catch {}
        }
        versionPagesData[id] = { meta, html };
        if (!offline) {
          const destMd = path.join(versionDir, `${id}.md`);
          await writePageMarkdown(destMd, preprocessedMarkdown, config, id, entry.version);
        }
        manifest[id] = entry.version;
        vBuilt++;
      } else {
        manifest[id] = defaultVersion;
        if (defaultPagesData[id]) versionPagesData[id] = defaultPagesData[id];
      }
    }

    await fs.ensureDir(versionDir);
    await copyDocsMedia(path.join(cwd, 'docs'), versionDir, { locales: false, quiet: true });
    if (pagesUseMath(versionPagesData)) await writeKatexAssets(versionDir);
    const versionTitleMap = buildTitleMap(versionPagesData);
    const versionNavMeta = buildNavMeta(versionPagesData);
    const versionNavConfig = withApiTab(versionConf, !!specData);

    if (offline) {
      const versionShell = await renderShell({
        config: versionConf, siteTheme, mode: 'static', out, draftPageIds: [],
        versionConfig, currentVersion: entry.version,
        offline: true, minify,
        specData, apiMeta, vendorData, titleMap: versionTitleMap, navMeta: versionNavMeta,
      });
      const vSearchIndex = buildSearchIndex(versionConf, versionPagesData);
      await Promise.all([
        fs.writeFile(path.join(versionDir, 'index.html'), versionShell),
        _writeSearchIndexJs(versionDir, vSearchIndex),
        ...Object.entries(versionPagesData).map(([id, { meta, html }]) => _writePageJs(versionDir, id, { meta, html, nav: pageClientInfo(versionNavConfig, id, meta) })),
      ]);
    } else {
      await fs.writeFile(path.join(versionDir, 'docslit.css'), sharedCss);
      await fs.writeFile(path.join(versionDir, 'docslit.js'), sharedJs);
      await fs.writeFile(path.join(versionDir, 'docslit-app.js'), sharedApp);
      const flexSrcV = path.join(__dirname, 'vendor', 'flexsearch.js');
      if (await fs.pathExists(flexSrcV)) await fs.copyFile(flexSrcV, path.join(versionDir, 'flexsearch.js'));

      const vPublishedIds = Object.keys(versionPagesData);
      const vIsHybrid = specData && (versionConf.sidebar || []).length > 0;
      const versionPdfManifest = preparePdfManifest(versionConf, versionPagesData, pdfOptions);
      for (const [id, { meta, html }] of Object.entries(versionPagesData)) {
        const isApiPage = id.startsWith('api/') || meta.layout === 'api';
        const pageHtml = await renderPage({ config: versionConf, siteTheme, id, meta, html, draftPageIds: [], versionConfig, currentVersion: entry.version, specData: (isApiPage || vIsHybrid) ? specData : null, apiMeta: (isApiPage || vIsHybrid) ? apiMeta : null, pdfManifest: versionPdfManifest, titleMap: versionTitleMap, navMeta: versionNavMeta });
        const destHtml = path.join(versionDir, `${id}.html`);
        await fs.ensureDir(path.dirname(destHtml));
        await fs.writeFile(destHtml, pageHtml);
      }

      if (vPublishedIds.length) {
        await writeRootIndexStub({ dir: versionDir, firstId: firstVisibleId(versionConf, versionPagesData), urlPrefix: `${basePath}/${entry.version}`, config: versionConf });
      }
      if (pdfOptions.enabled) {
        await generatePdfs({ outDir: versionDir, config: versionConf, pagesData: versionPagesData, pdfOptions });
      }
    }

    await fs.writeFile(path.join(versionDir, '_manifest.json'), JSON.stringify(manifest, null, 2));
    if (!offline) {
      await generateLlmsTxt({ config: versionConf, pagesData: versionPagesData, outDir: versionDir, version: entry.version });
    }

    versionPages[entry.version] = pageListOf(versionPagesData, versionConf);
    console.log(`  ${pc.green('✓')} ${entry.version}: ${vBuilt} changed page${vBuilt !== 1 ? 's' : ''} built, ${Object.keys(manifest).length - vBuilt} shared from ${defaultVersion}`);
  }

  // Root index.html redirects to default version
  const defaultFirstId = firstVisibleId(config, defaultPagesData) || 'introduction';
  const redirectUrl = offline
    ? `${defaultVersion}/index.html#${defaultFirstId}`
    : `${basePath}/${defaultVersion}/${defaultFirstId}`;
  const siteUrl = (config.url || '').replace(/\/$/, '');
  await fs.writeFile(path.join(outDir, 'index.html'), redirectStubHtml(redirectUrl, {
    canonical: !offline && siteUrl ? `${siteUrl}${redirectUrl}` : redirectUrl,
    fileHref: offline ? null : `${defaultVersion}/${defaultFirstId}.html`,
  }));

  if (!offline) {
    const allPagesData = {};
    for (const id of defaultPageIds) {
      if (defaultPagesData[id]) allPagesData[id] = defaultPagesData[id];
    }
    await generateRootLlmsIndex({ config, versionConfig, outDir });
    const lastmods = await getPageLastmods(cwd, allPagesData);
    await generateRobotsTxt({ config, outDir, versionConfig });
    await generateSitemap({ config, pagesData: allPagesData, outDir, versionConfig, defaultVersion, lastmods });
    const allPageIds = Object.keys(allPagesData);
    await generateMarkdownMiddleware({ pageIds: allPageIds, outDir, cwd, versionConfig, basePath });
    await generateAgentJson({ config, pageIds: allPageIds, pagesData: allPagesData, outDir, versionConfig });
    await generateMcpServer({ config, pagesData: allPagesData, outDir, versionConfig, versionPages });

    // Redirects
    const redirects = collectRedirects(config, allPagesData, basePath);
    if (redirects.length) {
      const { stubs } = await writeRedirectArtifacts({ redirects, outDir, basePath });
      console.log(`  ${pc.green('✓')} Generated ${stubs} redirect stub${stubs !== 1 ? 's' : ''}`);
    }

    // RSS/Atom feeds
    const wroteFeeds = await writeFeeds({ config, pagesData: allPagesData, outDir, basePath });
    if (wroteFeeds) console.log(`  ${pc.green('✓')} Generated rss.xml + atom.xml`);
  }

  // onBuildEnd hook
  if (hooks.onBuildEnd) {
    try {
      await hooks.onBuildEnd({ outDir, pages: defaultPagesData, config });
    } catch (e) {
      console.log(`  ${pc.yellow('⚠')} onBuildEnd hook failed: ${e.message}`);
    }
  }
}

// ── llms.txt generation ────────────────────────────────────────────────────
// Follows the llmstxt.org specification:
//   https://llmstxt.org
//
// Structure:
//   # Site Title
//   > Optional site description
//
//   ## Sidebar Group
//   - [Page Title](url/to/slug.md): Short description from frontmatter
//
// Also writes llms-full.txt — all pages concatenated for models that want
// the complete corpus in one request.

function buildSearchIndex(config, pagesData) {
  const index = [];
  const excluded = indexExcludedIds(config, pagesData);
  const seen = new Set();
  for (const entry of walkPages(config)) {
    const { id, item } = entry;
    if (seen.has(id) || !pagesData[id] || excluded.has(id) || !isSearchableMeta(pagesData[id].meta)) continue;
    seen.add(id);
    const { meta, html } = pagesData[id];
    const entries = buildSearchEntries({
      id,
      title: meta.title || (item && item.title) || toLabel(id),
      group: entry.group || 'Pages',
      desc: meta.description || meta.desc || '',
      html: html || '',
      markdown: pagesData[id].preprocessedMarkdown || meta.description || '',
    });
    if (entry.tabLabel) for (const en of entries) en.tab = entry.tabLabel;
    index.push(...entries);
  }
  return index;
}

function stripFrontmatter(src) {
  const m = src.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/);
  return m ? m[1].trim() : src.trim();
}

async function generateLlmsTxt({ config, pagesData, outDir, version = null }) {
  const siteTitle = config.name || 'Documentation';
  const siteDesc = config.description || '';
  const mdPattern = buildMarkdownPattern(config, version);

  // ── llms.txt ──
  const lines = [`# ${siteTitle}`];
  if (siteDesc) lines.push(`\n> ${siteDesc}`);
  // Not a URL: a literal "{slug}" link reads as a broken link to crawlers and link checkers.
  lines.push(`\n> Raw Markdown for each page: append \`.md\` to the page URL, or request the page with \`Accept: text/markdown\`. Every link below already points at the Markdown.`);
  lines.push('');

  const excluded = indexExcludedIds(config, pagesData);
  // One section per (tab, group): "## Tab — Group" (just "## Group" without tabs).
  const sections = [];
  const sectionByKey = new Map();
  for (const entry of walkPages(config)) {
    if (!pagesData[entry.id] || excluded.has(entry.id)) continue;
    const key = `${entry.tab || ''}\u0000${entry.groupIndex}`;
    let section = sectionByKey.get(key);
    if (!section) {
      const title = entry.tabLabel && entry.group ? `${entry.tabLabel} — ${entry.group}` : (entry.tabLabel || entry.group || 'Pages');
      section = { title, tabLabel: entry.tabLabel || '', group: entry.group || '', ids: [] };
      sectionByKey.set(key, section);
      sections.push(section);
    }
    if (!section.ids.includes(entry.id)) section.ids.push(entry.id);
  }
  for (const section of sections) {
    lines.push(`## ${section.title}`);
    lines.push('');
    for (const id of section.ids) {
      const { meta } = pagesData[id];
      const title = meta.title || toLabel(id);
      const desc = meta.description || meta.desc || '';
      const mdUrl = getMarkdownUrl(config, id, version);
      lines.push(desc ? `- [${title}](${mdUrl}): ${desc}` : `- [${title}](${mdUrl})`);
    }
    lines.push('');
  }

  await fs.writeFile(path.join(outDir, 'llms.txt'), lines.join('\n'));

  // ── llms-full.txt + search-index.json (single pass) ──
  const fullParts = [
    `# ${siteTitle} — Full Documentation`,
    `# Generated by DocsLit · https://docslit.com`,
    '',
  ];
  const searchIndex = [];

  for (const section of sections) {
    const groupName = section.group || 'Pages';
    for (const id of section.ids) {
      const mdPath = path.join(outDir, `${id}.md`);
      const mdPathFallback = path.join(outDir, 'docs', `${id}.md`);
      const resolvedMdPath = await fs.pathExists(mdPath) ? mdPath : mdPathFallback;
      if (await fs.pathExists(resolvedMdPath)) {
        const src = await fs.readFile(resolvedMdPath, 'utf8');
        fullParts.push('---');
        fullParts.push(`# Source: ${id}.md`);
        fullParts.push('');
        fullParts.push(src.trim());
        fullParts.push('');

        const { meta } = pagesData[id];
        const doc = {
          id,
          title: meta.title || toLabel(id),
          group: groupName,
          desc: meta.description || meta.desc || '',
          body: stripFrontmatter(src),
        };
        if (section.tabLabel) doc.tab = section.tabLabel;
        searchIndex.push(doc);
      }
    }
  }

  await Promise.all([
    fs.writeFile(path.join(outDir, 'llms-full.txt'), fullParts.join('\n')),
    fs.writeFile(path.join(outDir, 'search-index.json'), JSON.stringify(searchIndex)),
  ]);

  const count = Object.keys(pagesData).length;
  console.log(`  ${pc.green('✓')} Generated llms.txt + llms-full.txt + search-index.json (${count} page${count !== 1 ? 's' : ''} indexed)`);
}

async function generateRootLlmsIndex({ config, versionConfig, outDir }) {
  const siteTitle = config.name || 'Documentation';
  const siteDesc = config.description || '';
  const lines = [`# ${siteTitle}`];
  if (siteDesc) lines.push(`\n> ${siteDesc}`);
  lines.push('\n> Version-specific documentation indexes are listed below. Each links to an llms.txt with page-level Markdown URLs.');
  lines.push('\n## Versions');
  lines.push('');
  for (const entry of versionConfig.list) {
    const label = entry.version === versionConfig.default
      ? `${entry.version} (default)`
      : entry.version;
    const llmsUrl = getLlmsTxtUrl(config, entry.version);
    lines.push(`- [${label}](${llmsUrl}): Documentation for version ${entry.version}`);
  }
  lines.push('');
  await fs.writeFile(path.join(outDir, 'llms.txt'), lines.join('\n'));
  console.log(`  ${pc.green('✓')} Generated root llms.txt (version index)`);
}

async function generateRobotsTxt({ config, outDir, versionConfig = null }) {
  const baseUrl = (config.url || '').replace(/\/$/, '') + normalizeBasePath(config.basePath);
  const lines = [
    'User-agent: *',
    'Allow: /',
    '',
    'User-agent: GPTBot',
    'Allow: /',
    '',
    'User-agent: Google-Extended',
    'Allow: /',
    '',
    'User-agent: Claude-Web',
    'Allow: /',
    '',
    'User-agent: OAI-SearchBot',
    'Allow: /',
    '',
    'User-agent: PerplexityBot',
    'Allow: /',
    '',
    'User-agent: Applebot-Extended',
    'Allow: /',
  ];

  if (baseUrl) {
    lines.push('');
    if (versionConfig) {
      for (const v of versionConfig.list) {
        lines.push(`Sitemap: ${baseUrl}/${v.version}/sitemap.xml`);
      }
    } else {
      lines.push(`Sitemap: ${baseUrl}/sitemap.xml`);
    }
  }

  lines.push('');
  await fs.writeFile(path.join(outDir, 'robots.txt'), lines.join('\n'));
  console.log(`  ${pc.green('✓')} Generated robots.txt`);
}

async function generateSitemap({ config, pagesData, outDir, versionConfig = null, defaultVersion = null, lastmods = {} }) {
  // Page URLs match each page's canonical: <url><basePath>[/<version>]/<id>. Roots
  // ("/", "/<version>/") are redirect stubs to the first page, so they are not listed.
  const baseUrl = (config.url || '').replace(/\/$/, '') + normalizeBasePath(config.basePath);
  if (!baseUrl) {
    console.log(`  ${pc.dim('○')} Skipped sitemap.xml — no url in docslit.json`);
    return;
  }

  const today = new Date().toISOString().split('T')[0];
  // Hidden / noindex pages are built and linkable but stay out of the sitemap.
  const noIndex = indexExcludedIds(config, pagesData);
  const sitemapIds = Object.keys(pagesData).filter((id) => !noIndex.has(id));

  if (versionConfig) {
    for (const entry of versionConfig.list) {
      const versionDir = path.join(outDir, entry.version);
      const isDefault = entry.version === defaultVersion;
      const urls = [];


      for (const id of sitemapIds) {
        const lastmod = lastmods[id] || today;
        urls.push(`  <url>\n    <loc>${escXml(baseUrl)}/${escXml(entry.version)}/${escXml(id)}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <priority>${isDefault ? '0.8' : '0.5'}</priority>\n  </url>`);
      }

      const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
      await fs.ensureDir(versionDir);
      await fs.writeFile(path.join(versionDir, 'sitemap.xml'), xml);
    }
  } else {
    const urls = [];


    for (const id of sitemapIds) {
      const lastmod = lastmods[id] || today;
      urls.push(`  <url>\n    <loc>${escXml(baseUrl)}/${escXml(id)}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <priority>0.8</priority>\n  </url>`);
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
    await fs.writeFile(path.join(outDir, 'sitemap.xml'), xml);
  }

  console.log(`  ${pc.green('✓')} Generated sitemap.xml (${sitemapIds.length} URLs)`);
}

function escXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

// Cloudflare Pages only reads Functions from <project root>/functions, not from
// the output dir. We never create that file implicitly (builds must not write
// into the user's source tree); `docslit deploy --cloudflare` installs it. If a
// project already has a DocsLit-generated copy (from older versions or deploy),
// keep it fresh so Accept: text/markdown negotiation does not go stale.
async function refreshProjectMiddleware(cwd, middleware) {
  const file = path.join(cwd, 'functions', '_middleware.js');
  try {
    const existing = await fs.readFile(file, 'utf8');
    if (existing.includes('generated by DocsLit')) await fs.writeFile(file, middleware);
  } catch { /* not present: leave the source tree alone */ }
}

async function generateMarkdownMiddleware({ pageIds, outDir, cwd, versionConfig = null, basePath = '' }) {
  const mdPaths = new Set();
  const versions = versionConfig ? versionConfig.list.map(v => v.version) : [];

  for (const id of pageIds) {
    if (versionConfig) {
      for (const v of versions) mdPaths.add(`/${v}/${id}`);
    } else {
      mdPaths.add(`/${id}`);
    }
  }

  const pathsJson = JSON.stringify([...mdPaths]);
  const versionsJson = JSON.stringify(versions);

  const middleware = `// Content negotiation middleware — generated by DocsLit
// Serves raw Markdown when the request has Accept: text/markdown
// Compatible with Cloudflare Pages Functions and Netlify Edge Functions.
// Vercel does not load this file: run \`docslit deploy --vercel\` for its middleware.js.
const MD_PATHS = new Set(${pathsJson});
const VERSIONS = ${versionsJson};

${PREFERS_MARKDOWN_SRC}

export default async function middleware(request, context) {
  const url = new URL(request.url);
  let pathname = url.pathname.replace(/\\/$/, '') || '/';

  const wantsMarkdown = prefersMarkdown(request.headers.get('accept') || '');
  if (!wantsMarkdown) return context.next ? context.next() : fetch(request);

  if (pathname === '/' && MD_PATHS.size) {
    const first = [...MD_PATHS][0];
    pathname = first;
  }

  if (MD_PATHS.has(pathname)) {
    const mdUrl = new URL(pathname + '.md', url.origin);
    const res = await fetch(mdUrl);
    if (res.ok) {
      return new Response(res.body, {
        status: 200,
        headers: { 'Content-Type': 'text/markdown; charset=utf-8', 'Vary': 'Accept' },
      });
    }
  }

  return context.next ? context.next() : fetch(request);
}

// Cloudflare Pages
export function onRequest(context) {
  return middleware(context.request, { next: context.next });
}
`;

  const sourcePrefix = basePath || '';
  const vercelConfig = {
    headers: [
      {
        source: `${sourcePrefix}/(.*)\\.md`,
        headers: [{ key: 'Content-Type', value: 'text/markdown; charset=utf-8' }],
      },
    ],
    // Pretty URLs (/guide/setup -> guide/setup.html). Accept: text/markdown is handled by
    // the root middleware.js from \`docslit deploy --vercel\`: a vercel.json rewrite never
    // runs for it, because Vercel applies rewrites only after a static file fails to match.
    cleanUrls: true,
    trailingSlash: false,
  };

  const headersFile = '/*.md\n  Content-Type: text/markdown; charset=utf-8\n';

  await Promise.all([
    fs.writeFile(path.join(outDir, '_middleware.js'), middleware),
    fs.ensureDir(path.join(outDir, 'functions')).then(() =>
      fs.writeFile(path.join(outDir, 'functions', '_middleware.js'), middleware)),
    refreshProjectMiddleware(cwd, middleware),
    fs.writeFile(path.join(outDir, '_headers'), headersFile),
    fs.writeFile(path.join(outDir, 'vercel.json'), JSON.stringify(vercelConfig, null, 2) + '\n'),
  ]);
  console.log(`  ${pc.green('✓')} Generated _middleware.js, functions/_middleware.js + _headers + vercel.json (content negotiation for ${mdPaths.size} pages)`);
}

async function generateAgentJson({ config, pageIds, pagesData = null, outDir, versionConfig = null }) {
  const baseUrl = (config.url || '').replace(/\/$/, '');
  const defaultVersion = versionConfig?.default || null;
  const versionPrefix = getVersionPathPrefix(defaultVersion);
  const llmsFullPath = `${versionPrefix}/llms-full.txt`.replace(/^\/\//, '/');
  const searchIndexPath = `${versionPrefix}/search-index.json`.replace(/^\/\//, '/');
  const agent = {
    name: config.name || 'Documentation',
    description: config.description || '',
    spec: 'https://agentdocsspec.com/spec/',
    docs: {
      llms_txt: getLlmsTxtUrl(config, versionConfig ? null : defaultVersion),
      llms_full_txt: baseUrl ? `${baseUrl}${llmsFullPath}` : llmsFullPath,
      search_index: baseUrl ? `${baseUrl}${searchIndexPath}` : searchIndexPath,
      markdown_pattern: versionConfig
        ? (baseUrl ? `${baseUrl}/{version}/{slug}.md` : '/{version}/{slug}.md')
        : buildMarkdownPattern(config),
    },
    content_negotiation: {
      accept: 'text/markdown',
      description: 'Request any page URL with Accept: text/markdown to receive raw Markdown',
    },
    pages: pageIds.map((id) => {
      const entry = { slug: id, markdown: getMarkdownUrl(config, id, defaultVersion) };
      if (hasTabs(config)) {
        const tabId = tabIdForPage(config, id, pagesData?.[id]?.meta);
        if (tabId) entry.tab = tabId;
      }
      if (pagesData?.[id] && isNoindexMeta(pagesData[id].meta)) entry.hidden = true;
      return entry;
    }),
  };
  if (hasTabs(config)) {
    const hidden = pagesData ? indexExcludedIds(config, pagesData) : new Set();
    agent.tabs = config.tabs.map((t) => {
      const out = { id: t.id, label: t.label };
      if (t.href) out.url = t.href;
      else {
        const landing = tabLandingId(t, hidden);
        if (landing) out.landing = landing;
      }
      return out;
    });
  }

  if (versionConfig) {
    agent.versions = versionConfig.list.map(v => v.version);
    agent.default_version = versionConfig.default;
    agent.docs.llms_txt = getLlmsTxtUrl(config);
  }

  const wellKnown = path.join(outDir, '.well-known');
  await fs.ensureDir(wellKnown);
  await fs.writeFile(path.join(wellKnown, 'agent.json'), JSON.stringify(agent, null, 2) + '\n');
  console.log(`  ${pc.green('✓')} Generated .well-known/agent.json`);
}

/**
 * Generates a dependency-free stdio MCP server next to the built site.
 *
 * The server sits at the output root. For unversioned sites the Markdown pages
 * (<id>.md) and search-index.json live right next to it; for versioned builds
 * they live in <version>/ (and non-default versions only carry pages that changed,
 * the rest are shared with the default version via <version>/_manifest.json), so
 * the server is version-aware: every tool takes an optional `version` argument and
 * defaults to the build's default version.
 */
function pageListOf(data, config = null) {
  const tabs = config && hasTabs(config) ? new Map(config.tabs.map((t) => [t.id, t.label])) : null;
  return Object.keys(data).map((id) => {
    const entry = {
      id,
      title: data[id].meta.title || toLabel(id),
      desc: data[id].meta.description || data[id].meta.desc || '',
    };
    if (tabs) {
      const tabId = tabIdForPage(config, id, data[id].meta);
      if (tabId && tabs.has(tabId)) entry.tab = tabs.get(tabId);
    }
    return entry;
  });
}

async function generateMcpServer({ config, pagesData, outDir, versionConfig = null, versionPages = null }) {
  const siteTitle = config.name || 'Documentation';
  const siteDesc = config.description || '';
  const versioned = !!(versionConfig && versionPages && Object.keys(versionPages).length);
  const pages = versioned ? null : pageListOf(pagesData, config);
  const defaultVersion = versioned ? (versionConfig.default || Object.keys(versionPages)[0]) : null;
  const pageCount = versioned ? (versionPages[defaultVersion] || []).length : pages.length;

  const server = `#!/usr/bin/env node
// MCP server for ${siteTitle} — generated by DocsLit
// Run: node mcp-server.js
// Protocol: MCP over stdio (JSON-RPC 2.0)

import { createInterface } from 'readline';
import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SITE = ${JSON.stringify(siteTitle)};
const DESCRIPTION = ${JSON.stringify(siteDesc)};
// Unversioned sites: PAGES + files next to this script.
// Versioned sites: VERSION_PAGES[version] + files under <version>/.
const PAGES = ${JSON.stringify(pages)};
const VERSION_PAGES = ${JSON.stringify(versioned ? versionPages : null)};
const DEFAULT_VERSION = ${JSON.stringify(defaultVersion)};

const searchIndexes = new Map();

class ToolFailure extends Error {}

/** Resolve the requested version (default: the build's default). null for unversioned sites. */
function resolveVersion(args) {
  if (!VERSION_PAGES) return null;
  const v = args.version === undefined || args.version === null || args.version === '' ? DEFAULT_VERSION : String(args.version);
  if (!Object.prototype.hasOwnProperty.call(VERSION_PAGES, v)) {
    throw new ToolFailure(\`Unknown version "\${v}". Available versions: \${Object.keys(VERSION_PAGES).join(', ')} (default: \${DEFAULT_VERSION}).\`);
  }
  return v;
}

function pagesFor(version) {
  return version === null ? PAGES : VERSION_PAGES[version];
}

function dirFor(version) {
  return version === null ? __dirname : join(__dirname, version);
}

async function readJsonFile(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

async function loadSearchIndex(version) {
  const key = version === null ? '' : version;
  if (searchIndexes.has(key)) return searchIndexes.get(key);
  const index = (await readJsonFile(join(dirFor(version), 'search-index.json'))) || [];
  searchIndexes.set(key, index);
  return index;
}

async function getPage(id, version) {
  const slug = String(id || '').trim().replace(/^\\/+/, '').replace(/\\.md$/, '');
  // Only serve pages that exist in this version's page list (also blocks path traversal).
  if (!pagesFor(version).some((p) => p.id === slug)) return null;
  const dirs = [dirFor(version)];
  if (version !== null) {
    // Non-default versions only contain changed pages; others are shared (see _manifest.json).
    const manifest = await readJsonFile(join(dirFor(version), '_manifest.json'));
    if (manifest && manifest[slug] && manifest[slug] !== version && Object.prototype.hasOwnProperty.call(VERSION_PAGES, manifest[slug])) {
      dirs.push(dirFor(manifest[slug]));
    }
    if (version !== DEFAULT_VERSION) dirs.push(dirFor(DEFAULT_VERSION));
  }
  for (const dir of dirs) {
    try {
      return await readFile(join(dir, slug + '.md'), 'utf8');
    } catch { /* try the next location */ }
  }
  return null;
}

const versionProperty = VERSION_PAGES
  ? { version: { type: 'string', description: \`Documentation version (default: \${DEFAULT_VERSION}). Available: \${Object.keys(VERSION_PAGES).join(', ')}\` } }
  : {};

const tools = [
  {
    name: 'list_pages',
    description: 'List all documentation pages with titles and descriptions',
    inputSchema: { type: 'object', properties: { ...versionProperty } },
  },
  {
    name: 'get_page',
    description: 'Get the full Markdown content of a documentation page by its slug',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'Page slug (e.g. "quickstart" or "guides/setup")' },
        ...versionProperty,
      },
      required: ['slug'],
    },
  },
  {
    name: 'search_docs',
    description: 'Search documentation by keyword. Returns matching pages with excerpts.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        ...versionProperty,
      },
      required: ['query'],
    },
  },
];

async function handleToolCall(name, args) {
  if (name === 'list_pages') {
    const version = resolveVersion(args);
    const list = pagesFor(version).map(p => p.desc ? \`- **\${p.title}** (\${p.id}): \${p.desc}\` : \`- **\${p.title}** (\${p.id})\`).join('\\n');
    return \`# \${SITE}\${version !== null ? \` (version \${version})\` : ''}\\n\\n\${list}\`;
  }

  if (name === 'get_page') {
    const version = resolveVersion(args);
    const slug = args.slug;
    const content = await getPage(slug, version);
    if (!content) throw new ToolFailure(\`Page "\${slug}" not found\${version !== null ? \` in version \${version}\` : ''}. Use list_pages to see available pages.\`);
    return content;
  }

  if (name === 'search_docs') {
    const version = resolveVersion(args);
    const query = (args.query || '').toLowerCase();
    const index = await loadSearchIndex(version);
    const results = index
      .filter(p => (p.title || '').toLowerCase().includes(query) ||
                   (p.desc || '').toLowerCase().includes(query) ||
                   (p.body || '').toLowerCase().includes(query))
      .slice(0, 10);

    if (!results.length) return \`No results for "\${args.query}".\`;

    return results.map(r => {
      const body = (r.body || '').toLowerCase();
      const idx = body.indexOf(query);
      let excerpt = '';
      if (idx >= 0) {
        const start = Math.max(0, idx - 80);
        const end = Math.min(body.length, idx + query.length + 80);
        excerpt = '\\n  > ...' + (r.body || '').slice(start, end).replace(/\\n/g, ' ') + '...';
      }
      return \`- **\${r.title}** (\${r.id})\${r.desc ? ': ' + r.desc : ''}\${excerpt}\`;
    }).join('\\n');
  }

  throw new ToolFailure(\`Unknown tool: \${name}\`);
}

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\\n');
}

function respond(id, result) {
  send({ jsonrpc: '2.0', id, result });
}

function respondError(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}

const SERVER_INFO = { name: \`\${SITE} Docs MCP\`, version: '1.0.0' };
const CAPABILITIES = { tools: {} };

function handleMessage(msg) {
  const { id, method, params } = msg;

  if (method === 'initialize') {
    const SUPPORTED = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
    const asked = params && params.protocolVersion;
    return respond(id, { protocolVersion: SUPPORTED.includes(asked) ? asked : SUPPORTED[0], capabilities: CAPABILITIES, serverInfo: SERVER_INFO });
  }
  if (method === 'notifications/initialized') return;
  if (method === 'ping') return respond(id, {});
  if (method === 'tools/list') {
    return respond(id, { tools });
  }
  if (method === 'tools/call') {
    const { name, arguments: args } = params || {};
    handleToolCall(name, args || {}).then(text => {
      respond(id, { content: [{ type: 'text', text }] });
    }).catch(e => {
      if (e instanceof ToolFailure) respond(id, { content: [{ type: 'text', text: e.message }], isError: true });
      else respondError(id, -32603, String(e && e.message || e));
    });
    return;
  }
  if (id !== undefined) {
    respondError(id, -32601, \`Method not found: \${method}\`);
  }
}

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let nl;
  while ((nl = buffer.indexOf('\\n')) !== -1) {
    const line = buffer.slice(0, nl).trim();
    buffer = buffer.slice(nl + 1);
    if (!line) continue;
    try {
      handleMessage(JSON.parse(line));
    } catch {
      send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
    }
  }
});

process.stderr.write(\`\${SITE} MCP server running on stdio\\n\`);
`;

  await fs.writeFile(path.join(outDir, 'mcp-server.js'), server);
  const verNote = versioned ? `, ${Object.keys(versionPages).length} versions (default ${defaultVersion})` : '';
  console.log(`  ${pc.green('✓')} Generated mcp-server.js (${pageCount} pages${verNote}, 3 tools: list_pages, get_page, search_docs)`);
}

function toLabel(id) {
  return id.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

async function getDirSize(dir) {
  return Math.round(await getDirBytes(dir) / 1024);
}

async function getDirBytes(dir) {
  let total = 0;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) total += await getDirBytes(p);
    else total += (await fs.stat(p)).size;
  }
  return total;
}

const MEDIA_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico']);

async function copyDocsMedia(docsDir, outDir, { locales = true, quiet = false } = {}) {
  if (!await fs.pathExists(docsDir)) return;
  let copied = 0;
  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name.startsWith('_')) continue;
        await walk(full);
      } else if (MEDIA_EXTENSIONS.has(path.extname(e.name).toLowerCase())) {
        const rel = path.relative(docsDir, full);
        const dest = path.join(outDir, rel);
        await fs.ensureDir(path.dirname(dest));
        await fs.copyFile(full, dest);
        copied++;
      }
    }
  }
  await walk(docsDir);

  // Also copy from locale docs dirs (docs.fr/ etc.)
  if (!locales) { if (copied && !quiet) console.log(`  ${pc.green('✓')} Copied ${copied} media file${copied !== 1 ? 's' : ''} from docs/`); return; }
  const parent = path.dirname(docsDir);
  const entries = await fs.readdir(parent, { withFileTypes: true });
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const m = e.name.match(/^docs\.([a-z]{2,})$/);
    if (!m) continue;
    const locale = m[1];
    const locDir = path.join(parent, e.name);
    async function walkLoc(dir) {
      const subs = await fs.readdir(dir, { withFileTypes: true });
      for (const s of subs) {
        const full = path.join(dir, s.name);
        if (s.isDirectory()) {
          if (s.name.startsWith('_')) continue;
          await walkLoc(full);
        } else if (MEDIA_EXTENSIONS.has(path.extname(s.name).toLowerCase())) {
          const rel = path.relative(locDir, full);
          const dest = path.join(outDir, locale, rel);
          await fs.ensureDir(path.dirname(dest));
          await fs.copyFile(full, dest);
          copied++;
        }
      }
    }
    await walkLoc(locDir);
  }

  if (copied) console.log(`  ${pc.green('✓')} Copied ${copied} media file${copied !== 1 ? 's' : ''} from docs/`);
}

async function buildLocalePages({ config, cwd, outDir, locale, i18n, siteTheme, minify, hooks, basePath, specData, apiMeta, draftPageIds, pdfManifest }) {
  const docsDir = localeDocsDir(cwd, locale, i18n.defaultLocale);
  if (!await fs.pathExists(docsDir)) return;

  // With tabs, locale builds keep the tab structure (per-locale sidebar overrides apply to plain sidebars only).
  const sidebar = hasTabs(config) ? config.sidebar : getSidebarForLocale(config, locale, i18n.defaultLocale);
  const localeConfig = { ...config, sidebar };
  const pageIds = getAllPageIds(localeConfig);
  const localeOutDir = path.join(outDir, locale);
  await fs.ensureDir(localeOutDir);

  let built = 0;
  const localePagesData = {};
  const localeParsed = [];

  const defaultDocsDir = path.join(cwd, 'docs');
  for (const id of pageIds) {
    // Untranslated pages fall back to the default-locale source so every sidebar link
    // in the locale site resolves; their canonical points at the default-locale page.
    let mdPath = path.join(docsDir, `${id}.md`);
    let untranslated = false;
    if (!await fs.pathExists(mdPath)) {
      mdPath = path.join(defaultDocsDir, `${id}.md`);
      untranslated = true;
      if (!await fs.pathExists(mdPath)) continue;
    }
    const raw = await fs.readFile(mdPath, 'utf8');
    let { meta, html, preprocessedMarkdown } = await parseDoc(raw, {
      onWarning: untranslated ? () => {} : warnPage,
      docsRoot: untranslated ? defaultDocsDir : docsDir,
      pagePath: mdPath,
      globalAttributes: getRuntimeAttributes(config),
    });

    if (meta.draft === true) continue;
    if (specData) html = resolveSpecRefs(html, specData);
    if (hooks.transformPage) {
      try { html = await hooks.transformPage({ id, meta, html, locale }) || html; } catch {}
    }

    const isApiPage = id.startsWith('api/') || meta.layout === 'api';
    localePagesData[id] = { meta, html, isApiPage };
    localeParsed.push({ id, meta, html, isApiPage, preprocessedMarkdown, untranslated });
  }

  const localeTitleMap = buildTitleMap(localePagesData);
  const localeNavMeta = buildNavMeta(localePagesData);

  for (const { id, meta, html, isApiPage, preprocessedMarkdown, untranslated } of localeParsed) {
    const ogEnabled = config.ogImage !== false && meta.ogImage !== false;
    const safeId = id.replace(/\//g, '--');
    const ogImagePath = ogEnabled ? `og/${safeId}.png` : null;

    const pageHtml = await renderPage({ config: localeConfig, siteTheme, id, meta, html, draftPageIds, specData, apiMeta, pdfManifest, locale, ogImagePath, titleMap: localeTitleMap, navMeta: localeNavMeta, untranslated });
    const destHtml = path.join(localeOutDir, `${id}.html`);
    await fs.ensureDir(path.dirname(destHtml));
    await fs.writeFile(destHtml, pageHtml);

    const destMd = path.join(localeOutDir, `${id}.md`);
    await writePageMarkdown(destMd, preprocessedMarkdown, config, id);
    if (!untranslated) built++;
  }

  const publishedIds = Object.keys(localePagesData);
  if (publishedIds.length) {
    await writeRootIndexStub({ dir: localeOutDir, firstId: firstVisibleId(localeConfig, localePagesData), urlPrefix: localeUrlPrefix(locale, i18n.defaultLocale, basePath), config });
  }

  if (pagesUseMath(localePagesData)) await writeKatexAssets(localeOutDir);
  // Copy shared CSS/JS/app into locale dir
  await fs.writeFile(path.join(localeOutDir, 'docslit.css'), buildStylesFile({ minify, siteTheme }));
  await fs.writeFile(path.join(localeOutDir, 'docslit.js'), buildComponentsFile('static', { minify }));
  await fs.writeFile(path.join(localeOutDir, 'docslit-app.js'), buildAppFile('static', { minify }));

  if (built) {
    console.log(`  ${pc.green('✓')} Built ${built} page${built !== 1 ? 's' : ''} for locale ${pc.cyan(locale)}`);
  }
}
