import path from 'path';
import { mapLimit, DEFAULT_LIMIT } from './concurrency.js';
import { prefillHighlights } from './highlight-prefill.js';
import { writeObjectsInv } from './api-python/site.js';
import fs from 'node:fs/promises';
import { pathExists, ensureDir, emptyDir, writeFileIfChanged, copyFileIfChanged } from './fs-helpers.js';
import pc from 'picocolors';
import { fileURLToPath } from 'url';
import { loadConfig, getAllPageIds, getVersionConfig, getOpenAPIConfig, getVersionNavigation, getChangedDocs, gitReadFile } from './config.js';
import { parseDoc } from './markdown.js';
import { sidebarLabel } from './sidebar.js';
import { hasTabs, tabIdForPage, tabLandingId, walkPages, pageNavMeta, isNoindexMeta, isSearchableMeta, collectHiddenIds } from './navigation.js';
import { pageClientInfo, withApiTab } from './nav-chrome.js';
import { renderShell, renderPage, buildOfflineThemeInitFile, buildOfflineAppFile, isEsbuildAvailable, LIT_VENDOR_FILES } from './template.js';
import { resolveSiteTheme } from './themes.js';
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
import { shutdownOgImagePool } from './og-image.js';
import { buildSearchEntries } from './search-index.js';
import { getI18nConfig, localeDocsDir, getSidebarForLocale, discoverLocales, localeUrlPrefix } from './i18n.js';
import { loadHooks } from './hooks.js';
import { PREFERS_MARKDOWN_SRC } from './negotiation.js';
import { pagesUseMath, writeKatexAssets } from './math.js';
import { resolveBuildOptions } from './build-options.js';
import { contentHash, readGeneratorCache, writeGeneratorCache } from './build-cache.js';
import { createOutputTracker } from './build-output.js';
import { serialize } from 'node:v8';
import {
  createBuildProfiler,
  loadOpenApiIfNeeded,
  buildSharedAssets,
  writeSharedAssets,
  writeLitVendor,
  collectOgJobs,
  generateOgImagesForPages,
  writePageHtmlBatch,
  parsePageWithCache,
  getOgImagePath,
  ogColorsFromTheme,
} from './build-helpers.js';

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
async function writeRootIndexStub({ dir, firstId, urlPrefix = '', config, outputTracker = null }) {
  const to = `${urlPrefix}/${firstId}`;
  const baseUrl = (config.url || '').replace(/\/$/, '');
  const dest = path.join(dir, 'index.html');
  await writeFileIfChanged(dest, redirectStubHtml(to, {
    canonical: baseUrl ? `${baseUrl}${to}` : to,
    fileHref: `${firstId}.html`,
  }), true);
  if (outputTracker) outputTracker.add(dest);
}

function getRuntimeAttributes(config, version = null, branch = null) {
  const attrs = { ...(config.attributes || {}) };
  attrs.DOCSLIT_VERSION = version || 'unversioned';
  attrs.DOCSLIT_BRANCH = branch || 'working-tree';
  return attrs;
}

async function writePageMarkdown(destMd, content, config, id, version = null, llmsEnabled = true, incremental = false) {
  await ensureDir(path.dirname(destMd));
  const markdown = prependAgentDirectiveToMarkdown(content, buildAgentDirectiveMarkdown(config, id, version, llmsEnabled));
  await writeFileIfChanged(destMd, markdown, incremental);
  return markdown;
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
  return ensureDir(path.dirname(file)).then(() => fs.writeFile(file, js));
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
    pathExists(iife).then(ok => ok && fs.copyFile(iife, path.join(outDir, 'flexsearch.iife.js'))),
  ]);
}


async function _loadVendorData() {
  const vendorDir = path.join(__dirname, 'vendor');
  const data = {};
  await Promise.all(Object.entries(LIT_VENDOR_FILES).map(async ([key, file]) => {
    data[key] = await fs.readFile(path.join(vendorDir, file), 'utf8');
  }));
  return data;
}

export async function build({
  out = 'dist',
  offline = false,
  minify = true,
  pdf = false,
  noPdf = false,
  pdfDir = null,
  incremental = false,
  ogImages = false,
  noOgImages = false,
  noSearchIndex = false,
  noLlmsTxt = false,
  noMcp = false,
  noSitemap = false,
  profile = false,
  verbose = false,
} = {}) {
  const t0 = performance.now();
  const cwd = process.cwd();
  const config = await loadConfig(cwd);
  const buildOptions = resolveBuildOptions(config, {
    offline, minify, incremental, ogImages, noOgImages, noSearchIndex, noLlmsTxt, noMcp, noSitemap, profile, verbose,
  });
  const profiler = createBuildProfiler(buildOptions.profile);
  const siteTheme = await resolveSiteTheme(config, cwd);
  const outDir = path.resolve(cwd, out);
  const outputTracker = createOutputTracker(outDir);
  outputTracker.protect(path.join(outDir, 'index.html'));
  const versionConfig = getVersionConfig(config);
  const pdfOptions = resolvePdfOptions(config, { pdf, noPdf, pdfDir });
  const hooks = await loadHooks(cwd);
  const basePath = normalizeBasePath(config.basePath);

  const modeLabel = buildOptions.offline ? ' (offline mode)' : '';
  const minifyLabel = buildOptions.minify ? '' : ' (unminified)';
  const pdfLabel = pdfOptions.enabled ? ' + PDF' : '';
  console.log(`\n  ${pc.bold('DocsLit')} building static site${modeLabel}${minifyLabel}${pdfLabel}...\n`);

  if (hooks.file) {
    console.log(`  ${pc.green('✓')} Loaded hooks from ${path.basename(hooks.file)}`);
  }

  if (pdfOptions.enabled && buildOptions.offline) {
    console.log(`  ${pc.yellow('⚠')} PDF generation skipped in offline mode (use a standard build with --pdf)\n`);
    pdfOptions.enabled = false;
  }

  if (buildOptions.minify && !isEsbuildAvailable()) {
    console.log(`  ${pc.yellow('⚠')} esbuild not found — output unminified; install esbuild or use --no-minify\n`);
  }

  if (!buildOptions.incremental) {
    await emptyDir(outDir);
  } else {
    await ensureDir(outDir);
    console.log(`  ${pc.dim('○')} Incremental build — preserving existing dist output`);
    const ogOptedOut = noOgImages || config.build?.ogImages === false || config.ogImage === false;
    if (!offline && (ogOptedOut || !buildOptions.searchIndex || !buildOptions.llmsTxt || !buildOptions.mcp || !buildOptions.sitemap)) {
      console.log(`  ${pc.yellow('⚠')} Untracked previously generated optional files may remain; use a clean build to remove them`);
    }
  }

  // Copy user components (shared across versions)
  const componentsDir = path.join(cwd, 'components');
  if (await pathExists(componentsDir)) {
    const entries = await fs.readdir(componentsDir);
    if (entries.length) {
      await fs.cp(componentsDir, path.join(outDir, 'components'), { recursive: true, verbatimSymlinks: true });
      outputTracker.protectDirectory(path.join(outDir, 'components'));
      console.log(`  ${pc.green('✓')} Copied components/`);
    }
  }

  // Copy favicon assets
  const assetsDir = path.join(__dirname, 'assets');
  for (const f of ['favicon-32x32.png', 'favicon-16x16.png', 'apple-touch-icon.png']) {
    await copyFileIfChanged(path.join(assetsDir, f), path.join(outDir, f), buildOptions.incremental);
    outputTracker.protect(path.join(outDir, f));
  }
  console.log(`  ${pc.green('✓')} Copied favicon assets`);

  // Copy custom favicon if configured
  if (config.favicon) {
    const faviconFile = path.resolve(cwd, config.favicon);
    if (await pathExists(faviconFile)) {
      await ensureDir(path.dirname(path.join(outDir, _assetDest(config.favicon))));
      await copyFileIfChanged(faviconFile, path.join(outDir, _assetDest(config.favicon)), buildOptions.incremental);
      outputTracker.protect(path.join(outDir, _assetDest(config.favicon)));
      console.log(`  ${pc.green('✓')} Copied custom favicon ${config.favicon}`);
    }
  }

  // Copy custom CSS if configured
  if (config.css) {
    const cssFile = path.resolve(cwd, config.css);
    if (await pathExists(cssFile)) {
      await ensureDir(path.dirname(path.join(outDir, _assetDest(config.css))));
      await copyFileIfChanged(cssFile, path.join(outDir, _assetDest(config.css)), buildOptions.incremental);
      outputTracker.protect(path.join(outDir, _assetDest(config.css)));
      console.log(`  ${pc.green('✓')} Copied custom CSS ${config.css}`);
    }
  }

  for (const logo of logoFiles(config)) {
    const logoFile = path.resolve(cwd, logo);
    if (await pathExists(logoFile)) {
      await ensureDir(path.dirname(path.join(outDir, _assetDest(logo))));
      await copyFileIfChanged(logoFile, path.join(outDir, _assetDest(logo)), buildOptions.incremental);
      outputTracker.protect(path.join(outDir, _assetDest(logo)));
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
  if (buildOptions.searchIndex && !versionConfig && await pathExists(flexSearchSrc)) {
    await copyFileIfChanged(flexSearchSrc, path.join(outDir, 'flexsearch.js'), buildOptions.incremental);
    outputTracker.protect(path.join(outDir, 'flexsearch.js'));
    outputTracker.add(path.join(outDir, 'flexsearch.js'));
  }

  // Copy docs media (images) preserving relative paths
  await copyDocsMedia(path.join(cwd, 'docs'), outDir, { incremental: buildOptions.incremental, outputTracker });

  if (versionConfig) {
    await buildVersioned({ config, versionConfig, cwd, outDir, out, buildOptions, pdfOptions, siteTheme, hooks, basePath, profiler, outputTracker });
  } else {
    await buildSingle({ config, cwd, outDir, out, buildOptions, pdfOptions, siteTheme, hooks, basePath, profiler, outputTracker });
  }

  await shutdownOgImagePool();
  profiler.start('cleanup');
  await outputTracker.finish(buildOptions.incremental);
  profiler.end('cleanup');

  const sizeKb = await getDirSize(outDir);
  const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
  profiler.log();
  console.log(`\n  ${pc.bold('Done!')} Output: ${pc.cyan(path.relative(cwd, outDir))}/ (${sizeKb} KB) in ${pc.green(elapsed + 's')}\n`);
  if (buildOptions.offline) {
    console.log(`  Serve locally:  ${pc.cyan(`npx serve ${out}`)}  ${pc.dim('or')}  ${pc.cyan(`open ${out}/index.html`)}`);
    console.log(`  ${pc.dim('Self-contained — no internet connection required')}\n`);
  } else {
    console.log(`  Serve locally:  ${pc.cyan('npx serve dist')}`);
    console.log(`  Deploy to:      GitHub Pages, Vercel, Netlify, S3, or any static host\n`);
  }
}

/** Highlight the pages' code blocks in worker threads before the (single-threaded) parse. */
async function prefillPageHighlights(cwd, ids, profiler) {
  profiler.start('highlight');
  try {
    const sources = await mapLimit(ids, DEFAULT_LIMIT, async (id) => {
      try { return await fs.readFile(path.join(cwd, 'docs', `${id}.md`), 'utf8'); } catch { return ''; }
    });
    await prefillHighlights(sources);
  } catch { /* best effort: the parse highlights anything missing */ }
  profiler.end('highlight');
}

async function buildSingle({ config, cwd, outDir, out, buildOptions, pdfOptions, siteTheme, hooks, basePath, profiler, outputTracker }) {
  const { offline, minify, incremental } = buildOptions;
  const pageIds = getAllPageIds(config);
  const pagesData = {};
  const draftPageIds = [];
  let built = 0, drafts = 0, failed = 0;

  profiler.start('openapi');
  const { specData, apiMeta, resolveSpecRefs, buildApiPageMarkdown, error: openApiError } = await loadOpenApiIfNeeded(config, cwd);
  profiler.end('openapi');
  if (openApiError) {
    console.log(`  ${pc.yellow('⚠')} Failed to load OpenAPI spec: ${openApiError.message}`);
  } else if (specData) {
    console.log(`  ${pc.green('✓')} Loaded OpenAPI spec (${specData.length} endpoints)`);
  }

  if (specData) {
    for (const ep of specData) {
      if (!ep.operationId) continue;
      const slug = ep.operationId.replace(/([a-z])([A-Z])/g, '$1-$2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2').toLowerCase();
      const apiId = `api/${slug}`;
      if (!pageIds.includes(apiId)) pageIds.push(apiId);
    }
  }

  await prefillPageHighlights(cwd, pageIds, profiler);
  profiler.start('parse');
  const parseResults = await mapLimit(pageIds, DEFAULT_LIMIT, async (id) => {
    const mdPath = path.join(cwd, 'docs', `${id}.md`);
    if (!await pathExists(mdPath)) return { id, notFound: true };
    const raw = await fs.readFile(mdPath, 'utf8');
    return parsePageWithCache({
      id,
      mdPath,
      raw,
      parseOpts: {
        onWarning: warnPage,
        docsRoot: path.join(cwd, 'docs'),
        pagePath: mdPath,
        globalAttributes: getRuntimeAttributes(config),
      },
      incremental,
    });
  });
  profiler.end('parse');

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

    if (specData && resolveSpecRefs) {
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
      const mdContent = isApiPage && specData && buildApiPageMarkdown
        ? buildApiPageMarkdown(preprocessedMarkdown, specData)
        : preprocessedMarkdown;
      pagesData[id].outputMarkdown = await writePageMarkdown(destMd, mdContent, config, id, null, buildOptions.llmsTxt, incremental);
      outputTracker.add(destMd);
    }
    built++;
  }

  const skippedNote = failed ? pc.yellow(` (${failed} skipped)`) : '';
  const draftNote = drafts ? pc.dim(` (${drafts} draft${drafts !== 1 ? 's' : ''} hidden)`) : '';
  const titleMap = buildTitleMap(pagesData);
  const navMeta = buildNavMeta(pagesData);
  const navConfig = withApiTab(config, !!specData);
  const pdfManifest = !offline ? preparePdfManifest(config, pagesData, pdfOptions) : null;
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
    outputTracker.add(path.join(outDir, 'search-index.js'));
    for (const id of Object.keys(pagesData)) outputTracker.add(path.join(outDir, 'pages', _pageFileName(id)));
    console.log(`  ${pc.green('✓')} Built ${built} page${built !== 1 ? 's' : ''} (offline)${draftNote}${skippedNote}`);
  } else {
    profiler.start('minify');
    await writeSharedAssets(outDir, { minify, siteTheme, incremental });
    profiler.end('minify');

    const publishedIds = Object.keys(pagesData);
    const hasRegularDocs = (config.sidebar || []).length > 0;
    const isHybrid = specData && hasRegularDocs;

    profiler.start('og');
    const ogJobs = collectOgJobs(pagesData, { buildOptions, siteName, ogColors, outDir, toLabel });
    const ogCount = await generateOgImagesForPages(ogJobs, { incremental, onOutput: file => outputTracker.add(file) });
    profiler.end('og');
    if (ogCount) {
      console.log(`  ${pc.green('✓')} Generated ${ogCount} OG image${ogCount !== 1 ? 's' : ''}`);
    }

    profiler.start('html');
    const { reused } = await writePageHtmlBatch(
      Object.entries(pagesData).map(([id, { meta, html, isApiPage }]) => [
        id,
        { meta, html, isApiPage, destHtml: path.join(outDir, `${id}.html`) },
      ]),
      async (id, { meta, html, isApiPage }) => renderPage({
        config, siteTheme, id, meta, html, draftPageIds,
        specData: (isApiPage || isHybrid) ? specData : null,
        apiMeta: (isApiPage || isHybrid) ? apiMeta : null,
        pdfManifest,
        ogImagePath: getOgImagePath(buildOptions, meta, id),
        titleMap,
        navMeta,
        searchEnabled: buildOptions.searchIndex,
        llmsEnabled: buildOptions.llmsTxt,
      }),
      { incremental, context: { config, siteTheme, draftPageIds, specData, apiMeta, pdfManifest, titleMap, buildOptions, isHybrid } },
    );
    profiler.end('html');
    for (const id of publishedIds) if (id !== 'index') outputTracker.add(path.join(outDir, `${id}.html`));
    if (reused) console.log(`  ${pc.dim('○')} Reused ${reused} cached page${reused !== 1 ? 's' : ''}`);

    if (publishedIds.length) {
      await writeRootIndexStub({ dir: outDir, firstId: firstVisibleId(config, pagesData), urlPrefix: basePath, config, outputTracker });
    }

    console.log(`  ${pc.green('✓')} Built ${built} page${built !== 1 ? 's' : ''} + shared assets${draftNote}${skippedNote}`);
    if (buildOptions.llmsTxt || buildOptions.searchIndex) {
      profiler.start('llms');
      await generateLlmsTxt({ config, pagesData, outDir, buildOptions });
      const invCount = await writeObjectsInv(outDir, { project: config.name || 'Documentation' });
      if (invCount) console.log(`  ${pc.green('✓')} Generated objects.inv (${invCount} Python objects)`);
      if (buildOptions.llmsTxt) {
        outputTracker.add(path.join(outDir, 'llms.txt'));
        outputTracker.add(path.join(outDir, 'llms-full.txt'));
      }
      if (buildOptions.searchIndex) outputTracker.add(path.join(outDir, 'search-index.json'));
      profiler.end('llms');
    }
  }

  if (!offline) {
    if (buildOptions.sitemap && config.url) {
      profiler.start('seo');
      const { getPageLastmods } = await import('./git-dates.js');
      const lastmods = await getPageLastmods(cwd, pagesData);
      await generateRobotsTxt({ config, outDir, buildOptions });
      await generateSitemap({ config, pagesData, outDir, lastmods, buildOptions });
      outputTracker.add(path.join(outDir, 'robots.txt'));
      outputTracker.add(path.join(outDir, 'sitemap.xml'));
      profiler.end('seo');
    }
    await generateMarkdownMiddleware({ pageIds: Object.keys(pagesData), outDir, cwd, basePath, incremental });
    if (buildOptions.mcp) {
      await generateAgentJson({ config, pageIds: Object.keys(pagesData), pagesData, outDir, buildOptions });
      await generateMcpServer({ config, pagesData, outDir, buildOptions });
      outputTracker.add(path.join(outDir, '.well-known', 'agent.json'));
      outputTracker.add(path.join(outDir, 'mcp-server.js'));
    }

    // Redirects
    const redirects = collectRedirects(config, pagesData, basePath);
    if (redirects.length) {
      const { stubs, ownsRedirects } = await writeRedirectArtifacts({ redirects, outDir, basePath, incremental });
      if (ownsRedirects) outputTracker.add(path.join(outDir, '_redirects'));
      for (const { from } of redirects) {
        if (from !== '/') outputTracker.add(path.join(outDir, from.replace(/^\//, '') + '.html'));
      }
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
      await buildLocalePages({ config, cwd, outDir, locale, i18n, siteTheme, buildOptions, hooks, basePath, specData, apiMeta, draftPageIds, pdfManifest, resolveSpecRefs, outputTracker });
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

async function buildVersioned({ config, versionConfig, cwd, outDir, out, buildOptions, pdfOptions, siteTheme, hooks, basePath, profiler, outputTracker }) {
  const { offline, minify, incremental } = buildOptions;
  const defaultVersion = versionConfig.default;
  const defaultEntry = versionConfig.list.find(v => v.version === defaultVersion);
  const defaultBranch = defaultEntry?.branch || 'main';

  console.log(`  ${pc.bold('Versions:')} ${versionConfig.list.map(v => v.version === defaultVersion ? pc.cyan(v.version + ' (default)') : v.version).join(', ')}\n`);

  profiler.start('openapi');
  const { specData, apiMeta, resolveSpecRefs, buildApiPageMarkdown, error: openApiError } = await loadOpenApiIfNeeded(config, cwd);
  profiler.end('openapi');
  if (openApiError) {
    console.log(`  ${pc.yellow('⚠')} Failed to load OpenAPI spec: ${openApiError.message}`);
  } else if (specData) {
    console.log(`  ${pc.green('✓')} Loaded OpenAPI spec (${specData.length} endpoints)`);
  }

  // Build default version fully from the working directory
  const defaultDir = path.join(outDir, defaultVersion);
  outputTracker.protect(path.join(defaultDir, 'index.html'));
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

  await prefillPageHighlights(cwd, defaultPageIds, profiler);
  profiler.start('parse');
  const defaultParseResults = await mapLimit(defaultPageIds, DEFAULT_LIMIT, async (id) => {
    const mdPath = path.join(cwd, 'docs', `${id}.md`);
    if (!await pathExists(mdPath)) return null;
    const raw = await fs.readFile(mdPath, 'utf8');
    return parsePageWithCache({
      id,
      mdPath,
      raw,
      parseOpts: {
        onWarning: warnPage,
        docsRoot: path.join(cwd, 'docs'),
        pagePath: mdPath,
        globalAttributes: getRuntimeAttributes(config, defaultVersion, defaultBranch),
        basePath,
      },
      incremental,
    });
  });
  profiler.end('parse');

  for (const result of defaultParseResults) {
    if (!result) continue;
    let { id, meta, html, preprocessedMarkdown } = result;
    if (meta.draft === true) { draftPageIds.push(id); continue; }
    if (specData && resolveSpecRefs) html = resolveSpecRefs(html, specData);
    if (hooks.transformPage) {
      try { html = await hooks.transformPage({ id, meta, html }) || html; } catch {}
    }
    const isApiPage = id.startsWith('api/') || meta.layout === 'api';
    defaultPagesData[id] = { meta, html, isApiPage };
    if (!offline) {
      const destMd = path.join(defaultDir, `${id}.md`);
      const mdContent = isApiPage && specData && buildApiPageMarkdown
        ? buildApiPageMarkdown(preprocessedMarkdown, specData)
        : preprocessedMarkdown;
      defaultPagesData[id].outputMarkdown = await writePageMarkdown(destMd, mdContent, config, id, defaultVersion, buildOptions.llmsTxt, incremental);
      outputTracker.add(destMd);
    }
    built++;
  }

  profiler.start('minify');
  const [sharedCss, sharedJs, sharedApp] = offline
    ? [null, null, null]
    : await buildSharedAssets({ minify, siteTheme, incremental });
  profiler.end('minify');
  const vendorData = offline ? await _loadVendorData() : null;
  const defaultTitleMap = buildTitleMap(defaultPagesData);
  const defaultNavMeta = buildNavMeta(defaultPagesData);
  const defaultNavConfig = withApiTab(config, !!specData);
  const defaultPdfManifest = !offline ? preparePdfManifest(config, defaultPagesData, pdfOptions) : null;

  if (pagesUseMath(defaultPagesData)) await writeKatexAssets(defaultDir);
  // pages are served from /<version>/..., so their relative image / poster / download paths resolve inside the version dir
  await copyDocsMedia(path.join(cwd, 'docs'), defaultDir, { locales: false, quiet: true, incremental, outputTracker });
  if (offline) {
    await ensureDir(defaultDir);
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
    outputTracker.add(path.join(defaultDir, 'index.html'));
    outputTracker.add(path.join(defaultDir, 'search-index.js'));
    for (const id of Object.keys(defaultPagesData)) outputTracker.add(path.join(defaultDir, 'pages', _pageFileName(id)));
  } else {
    await writeFileIfChanged(path.join(defaultDir, 'docslit.css'), sharedCss, incremental);
    await writeFileIfChanged(path.join(defaultDir, 'docslit.js'), sharedJs, incremental);
    await writeFileIfChanged(path.join(defaultDir, 'docslit-app.js'), sharedApp, incremental);
    await writeLitVendor(defaultDir, incremental);
    // Copy FlexSearch into version dir
    const flexSrc = path.join(__dirname, 'vendor', 'flexsearch.js');
    if (buildOptions.searchIndex && await pathExists(flexSrc)) {
      await copyFileIfChanged(flexSrc, path.join(defaultDir, 'flexsearch.js'), incremental);
      outputTracker.add(path.join(defaultDir, 'flexsearch.js'));
    }

    const publishedIds = Object.keys(defaultPagesData);
    const defaultHasRegularDocs = (config.sidebar || []).length > 0;
    const defaultIsHybrid = specData && defaultHasRegularDocs;
    const ogColors = ogColorsFromTheme(siteTheme);
    const siteName = config.name || 'Documentation';

    profiler.start('og');
    const ogJobs = collectOgJobs(defaultPagesData, { buildOptions, siteName, ogColors, outDir: defaultDir, toLabel });
    await generateOgImagesForPages(ogJobs, { incremental, onOutput: file => outputTracker.add(file) });
    profiler.end('og');

    profiler.start('html');
    await writePageHtmlBatch(
      Object.entries(defaultPagesData).map(([id, { meta, html, isApiPage }]) => [
        id,
        { meta, html, isApiPage, destHtml: path.join(defaultDir, `${id}.html`) },
      ]),
      async (id, { meta, html, isApiPage }) => renderPage({
        config, siteTheme, id, meta, html, draftPageIds, versionConfig, currentVersion: defaultVersion,
        specData: (isApiPage || defaultIsHybrid) ? specData : null,
        apiMeta: (isApiPage || defaultIsHybrid) ? apiMeta : null,
        pdfManifest: defaultPdfManifest,
        ogImagePath: getOgImagePath(buildOptions, meta, id),
        titleMap: defaultTitleMap,
        navMeta: defaultNavMeta,
        searchEnabled: buildOptions.searchIndex,
        llmsEnabled: buildOptions.llmsTxt,
      }),
      { incremental, context: { config, siteTheme, draftPageIds, versionConfig, defaultVersion, specData, apiMeta, defaultPdfManifest, defaultTitleMap, buildOptions, defaultIsHybrid } },
    );
    profiler.end('html');
    for (const id of publishedIds) if (id !== 'index') outputTracker.add(path.join(defaultDir, `${id}.html`));

    if (publishedIds.length) {
      await writeRootIndexStub({ dir: defaultDir, firstId: firstVisibleId(config, defaultPagesData), urlPrefix: `${basePath}/${defaultVersion}`, config, outputTracker });
    }
    if (buildOptions.llmsTxt || buildOptions.searchIndex) {
      profiler.start('llms');
      await generateLlmsTxt({ config, pagesData: defaultPagesData, outDir: defaultDir, version: defaultVersion, buildOptions });
      await writeObjectsInv(defaultDir, { project: config.name || 'Documentation', version: String(defaultVersion || '') });
      profiler.end('llms');
      if (buildOptions.llmsTxt) {
        outputTracker.add(path.join(defaultDir, 'llms.txt'));
        outputTracker.add(path.join(defaultDir, 'llms-full.txt'));
      }
      if (buildOptions.searchIndex) outputTracker.add(path.join(defaultDir, 'search-index.json'));
    }
    if (pdfOptions.enabled) {
      await generatePdfs({ outDir: defaultDir, config, pagesData: defaultPagesData, pdfOptions });
    }
  }

  console.log(`  ${pc.green('✓')} ${defaultVersion}: ${built} pages (full build)`);
  // Page lists per version for the generated mcp-server.js (files live in <version>/).
  const versionPages = { [defaultVersion]: pageListOf(defaultPagesData, config) };

  // Build non-default versions — only changed pages
  profiler.start('versions');
  for (const entry of versionConfig.list) {
    if (entry.version === defaultVersion) continue;
    const versionDir = path.join(outDir, entry.version);
    outputTracker.protect(path.join(versionDir, 'index.html'));
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
        if (specData && resolveSpecRefs) html = resolveSpecRefs(html, specData);
        if (hooks.transformPage) {
          try { html = await hooks.transformPage({ id, meta, html }) || html; } catch {}
        }
        versionPagesData[id] = { meta, html };
        if (!offline) {
          const destMd = path.join(versionDir, `${id}.md`);
          versionPagesData[id].outputMarkdown = await writePageMarkdown(destMd, preprocessedMarkdown, config, id, entry.version, buildOptions.llmsTxt, incremental);
          outputTracker.add(destMd);
        }
        manifest[id] = entry.version;
        vBuilt++;
      } else {
        manifest[id] = defaultVersion;
        if (defaultPagesData[id]) versionPagesData[id] = { ...defaultPagesData[id], outputMarkdown: undefined };
      }
    }

    await ensureDir(versionDir);
    await copyDocsMedia(path.join(cwd, 'docs'), versionDir, { locales: false, quiet: true, incremental, outputTracker });
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
      outputTracker.add(path.join(versionDir, 'index.html'));
      outputTracker.add(path.join(versionDir, 'search-index.js'));
      for (const id of Object.keys(versionPagesData)) outputTracker.add(path.join(versionDir, 'pages', _pageFileName(id)));
    } else {
      await writeFileIfChanged(path.join(versionDir, 'docslit.css'), sharedCss, incremental);
      await writeFileIfChanged(path.join(versionDir, 'docslit.js'), sharedJs, incremental);
      await writeFileIfChanged(path.join(versionDir, 'docslit-app.js'), sharedApp, incremental);
      await writeLitVendor(versionDir, incremental);
      const flexSrcV = path.join(__dirname, 'vendor', 'flexsearch.js');
      if (buildOptions.searchIndex && await pathExists(flexSrcV)) {
        await copyFileIfChanged(flexSrcV, path.join(versionDir, 'flexsearch.js'), incremental);
        outputTracker.add(path.join(versionDir, 'flexsearch.js'));
      }

      const vPublishedIds = Object.keys(versionPagesData);
      const vIsHybrid = specData && (versionConf.sidebar || []).length > 0;
      const versionPdfManifest = preparePdfManifest(versionConf, versionPagesData, pdfOptions);
      await writePageHtmlBatch(
        Object.entries(versionPagesData).map(([id, { meta, html }]) => [
          id,
          { meta, html, isApiPage: id.startsWith('api/') || meta.layout === 'api', destHtml: path.join(versionDir, `${id}.html`) },
        ]),
        async (id, { meta, html, isApiPage }) => renderPage({
          config: versionConf, siteTheme, id, meta, html, draftPageIds: [], versionConfig, currentVersion: entry.version,
          specData: (isApiPage || vIsHybrid) ? specData : null,
          apiMeta: (isApiPage || vIsHybrid) ? apiMeta : null,
          pdfManifest: versionPdfManifest,
          titleMap: versionTitleMap,
          navMeta: versionNavMeta,
          searchEnabled: buildOptions.searchIndex,
          llmsEnabled: buildOptions.llmsTxt,
        }),
        { incremental, context: { config: versionConf, siteTheme, versionConfig, currentVersion: entry.version, specData, apiMeta, versionPdfManifest, versionTitleMap, buildOptions, vIsHybrid } },
      );
      for (const id of vPublishedIds) if (id !== 'index') outputTracker.add(path.join(versionDir, `${id}.html`));

      if (vPublishedIds.length) {
        await writeRootIndexStub({ dir: versionDir, firstId: firstVisibleId(versionConf, versionPagesData), urlPrefix: `${basePath}/${entry.version}`, config: versionConf, outputTracker });
      }
      if (pdfOptions.enabled) {
        await generatePdfs({ outDir: versionDir, config: versionConf, pagesData: versionPagesData, pdfOptions });
      }
    }

    await writeFileIfChanged(path.join(versionDir, '_manifest.json'), JSON.stringify(manifest, null, 2), incremental);
    if (!offline && (buildOptions.llmsTxt || buildOptions.searchIndex)) {
      await generateLlmsTxt({ config: versionConf, pagesData: versionPagesData, outDir: versionDir, version: entry.version, buildOptions });
      if (buildOptions.llmsTxt) {
        outputTracker.add(path.join(versionDir, 'llms.txt'));
        outputTracker.add(path.join(versionDir, 'llms-full.txt'));
      }
      if (buildOptions.searchIndex) outputTracker.add(path.join(versionDir, 'search-index.json'));
    }

    versionPages[entry.version] = pageListOf(versionPagesData, versionConf);
    console.log(`  ${pc.green('✓')} ${entry.version}: ${vBuilt} changed page${vBuilt !== 1 ? 's' : ''} built, ${Object.keys(manifest).length - vBuilt} shared from ${defaultVersion}`);
  }
  profiler.end('versions');

  // Root index.html redirects to default version
  const defaultFirstId = firstVisibleId(config, defaultPagesData) || 'introduction';
  const redirectUrl = offline
    ? `${defaultVersion}/index.html#${defaultFirstId}`
    : `${basePath}/${defaultVersion}/${defaultFirstId}`;
  const siteUrl = (config.url || '').replace(/\/$/, '');
  await writeFileIfChanged(path.join(outDir, 'index.html'), redirectStubHtml(redirectUrl, {
    canonical: !offline && siteUrl ? `${siteUrl}${redirectUrl}` : redirectUrl,
    fileHref: offline ? null : `${defaultVersion}/${defaultFirstId}.html`,
  }), incremental);

  if (!offline) {
    const allPagesData = {};
    for (const id of defaultPageIds) {
      if (defaultPagesData[id]) allPagesData[id] = defaultPagesData[id];
    }
    if (buildOptions.llmsTxt) {
      await generateRootLlmsIndex({ config, versionConfig, outDir, incremental });
      outputTracker.add(path.join(outDir, 'llms.txt'));
    }
    if (buildOptions.sitemap && config.url) {
      profiler.start('seo');
      const { getPageLastmods } = await import('./git-dates.js');
      const lastmods = await getPageLastmods(cwd, allPagesData);
      await generateRobotsTxt({ config, outDir, versionConfig, buildOptions });
      await generateSitemap({ config, pagesData: allPagesData, outDir, versionConfig, defaultVersion, lastmods, buildOptions });
      outputTracker.add(path.join(outDir, 'robots.txt'));
      for (const entry of versionConfig.list) outputTracker.add(path.join(outDir, entry.version, 'sitemap.xml'));
      profiler.end('seo');
    }
    const allPageIds = Object.keys(allPagesData);
    await generateMarkdownMiddleware({ pageIds: allPageIds, outDir, cwd, versionConfig, basePath, incremental });
    if (buildOptions.mcp) {
      await generateAgentJson({ config, pageIds: allPageIds, pagesData: allPagesData, outDir, versionConfig, buildOptions });
      await generateMcpServer({ config, pagesData: allPagesData, outDir, versionConfig, versionPages, buildOptions });
      outputTracker.add(path.join(outDir, '.well-known', 'agent.json'));
      outputTracker.add(path.join(outDir, 'mcp-server.js'));
    }

    // Redirects
    const redirects = collectRedirects(config, allPagesData, basePath);
    if (redirects.length) {
      const { stubs, ownsRedirects } = await writeRedirectArtifacts({ redirects, outDir, basePath, incremental });
      if (ownsRedirects) outputTracker.add(path.join(outDir, '_redirects'));
      for (const { from } of redirects) {
        if (from !== '/') outputTracker.add(path.join(outDir, from.replace(/^\//, '') + '.html'));
      }
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

let generatorFingerprint;
async function getGeneratorFingerprint() {
  if (!generatorFingerprint) {
    const sources = await Promise.all(['build.js', 'agent-docs.js'].map(file => fs.readFile(new URL(`./${file}`, import.meta.url), 'utf8')));
    generatorFingerprint = contentHash(sources.join('\0'));
  }
  return generatorFingerprint;
}

async function generateLlmsTxt({ config, pagesData, outDir, version = null, buildOptions = null }) {
  const includeLlms = !buildOptions || buildOptions.llmsTxt !== false;
  const includeSearch = !buildOptions || buildOptions.searchIndex !== false;
  if (!includeLlms && !includeSearch) return;

  let cacheKey = null;
  if (buildOptions?.incremental && Object.values(pagesData).every(page => typeof page.outputMarkdown === 'string')) {
    const inputs = Object.entries(pagesData).map(([id, page]) => [id, page.meta, page.outputMarkdown]);
    cacheKey = contentHash(serialize([await getGeneratorFingerprint(), config, version, includeLlms, includeSearch, inputs]));
    const cached = await readGeneratorCache(cacheKey);
    if (cached !== null) {
      let outputs;
      try {
        outputs = JSON.parse(cached);
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
      }
      const expected = [...(includeLlms ? ['llms.txt', 'llms-full.txt'] : []), ...(includeSearch ? ['search-index.json'] : [])];
      if (outputs && typeof outputs === 'object' && !Array.isArray(outputs)
        && Object.keys(outputs).length === expected.length
        && expected.every(file => typeof outputs[file] === 'string')) {
        let matches = true;
        for (const file of expected) {
          try {
            if (await fs.readFile(path.join(outDir, file), 'utf8') !== outputs[file]) matches = false;
          } catch (error) {
            if (error.code !== 'ENOENT') throw error;
            matches = false;
          }
        }
        if (matches) {
          console.log(`  ${pc.dim('○')} Reused cached documentation indexes`);
          return;
        }
      } else {
        console.warn('  Warning: invalid documentation index cache; regenerating');
      }
    }
  }

  const siteTitle = config.name || 'Documentation';
  const siteDesc = config.description || '';
  const mdPattern = buildMarkdownPattern(config, version);

  // ── llms.txt ──
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

  const outputs = {};
  if (includeLlms) {
    const lines = [`# ${siteTitle}`];
    if (siteDesc) lines.push(`\n> ${siteDesc}`);
    // Not a URL: a literal "{slug}" link reads as a broken link to crawlers and link checkers.
    lines.push(`\n> Raw Markdown for each page: append \`.md\` to the page URL, or request the page with \`Accept: text/markdown\`. Every link below already points at the Markdown.`);
    lines.push('');
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
    outputs['llms.txt'] = lines.join('\n');
  }

  const fullParts = includeLlms ? [
    `# ${siteTitle} — Full Documentation`,
    `# Generated by DocsLit · https://docslit.com`,
    '',
  ] : [];
  const searchIndex = [];

  for (const section of sections) {
    const groupName = section.group || 'Pages';
    for (const id of section.ids) {
      let src = pagesData[id]?.outputMarkdown;
      if (typeof src !== 'string') {
        const mdPath = path.join(outDir, `${id}.md`);
        const mdPathFallback = path.join(outDir, 'docs', `${id}.md`);
        const resolvedMdPath = await pathExists(mdPath) ? mdPath : mdPathFallback;
        if (await pathExists(resolvedMdPath)) src = await fs.readFile(resolvedMdPath, 'utf8');
      }
      if (typeof src === 'string') {
        if (includeLlms) {
          fullParts.push('---');
          fullParts.push(`# Source: ${id}.md`);
          fullParts.push('');
          fullParts.push(src.trim());
          fullParts.push('');
        }
        if (includeSearch) {
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
  }

  if (includeLlms) outputs['llms-full.txt'] = fullParts.join('\n');
  if (includeSearch) outputs['search-index.json'] = JSON.stringify(searchIndex);
  await Promise.all(Object.entries(outputs).map(([file, contents]) =>
    writeFileIfChanged(path.join(outDir, file), contents, buildOptions?.incremental)));
  if (cacheKey) await writeGeneratorCache(cacheKey, JSON.stringify(outputs));

  const count = Object.keys(pagesData).length;
  const parts = [];
  if (includeLlms) parts.push('llms.txt', 'llms-full.txt');
  if (includeSearch) parts.push('search-index.json');
  console.log(`  ${pc.green('✓')} Generated ${parts.join(' + ')} (${count} page${count !== 1 ? 's' : ''} indexed)`);
}

async function generateRootLlmsIndex({ config, versionConfig, outDir, incremental = false }) {
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
  await writeFileIfChanged(path.join(outDir, 'llms.txt'), lines.join('\n'), incremental);
  console.log(`  ${pc.green('✓')} Generated root llms.txt (version index)`);
}

async function generateRobotsTxt({ config, outDir, versionConfig = null, buildOptions = null }) {
  if (buildOptions && !buildOptions.sitemap) return;
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
  await writeFileIfChanged(path.join(outDir, 'robots.txt'), lines.join('\n'), buildOptions?.incremental);
  console.log(`  ${pc.green('✓')} Generated robots.txt`);
}

async function generateSitemap({ config, pagesData, outDir, versionConfig = null, defaultVersion = null, lastmods = {}, buildOptions = null }) {
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
      await ensureDir(versionDir);
      await writeFileIfChanged(path.join(versionDir, 'sitemap.xml'), xml, buildOptions?.incremental);
    }
  } else {
    const urls = [];


    for (const id of sitemapIds) {
      const lastmod = lastmods[id] || today;
      urls.push(`  <url>\n    <loc>${escXml(baseUrl)}/${escXml(id)}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <priority>0.8</priority>\n  </url>`);
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
    await writeFileIfChanged(path.join(outDir, 'sitemap.xml'), xml, buildOptions?.incremental);
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
    if (existing.includes('generated by DocsLit')) await writeFileIfChanged(file, middleware);
  } catch { /* not present: leave the source tree alone */ }
}

async function generateMarkdownMiddleware({ pageIds, outDir, cwd, versionConfig = null, basePath = '', incremental = false }) {
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
    writeFileIfChanged(path.join(outDir, '_middleware.js'), middleware, incremental),
    ensureDir(path.join(outDir, 'functions')).then(() =>
      writeFileIfChanged(path.join(outDir, 'functions', '_middleware.js'), middleware, incremental)),
    refreshProjectMiddleware(cwd, middleware),
    writeFileIfChanged(path.join(outDir, '_headers'), headersFile, incremental),
    writeFileIfChanged(path.join(outDir, 'vercel.json'), JSON.stringify(vercelConfig, null, 2) + '\n', incremental),
  ]);
  console.log(`  ${pc.green('✓')} Generated _middleware.js, functions/_middleware.js + _headers + vercel.json (content negotiation for ${mdPaths.size} pages)`);
}

async function generateAgentJson({ config, pageIds, pagesData = null, outDir, versionConfig = null, buildOptions = {} }) {
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
      ...(buildOptions.llmsTxt ? {
        llms_txt: getLlmsTxtUrl(config, versionConfig ? null : defaultVersion),
        llms_full_txt: baseUrl ? `${baseUrl}${llmsFullPath}` : llmsFullPath,
      } : {}),
      ...(buildOptions.searchIndex ? { search_index: baseUrl ? `${baseUrl}${searchIndexPath}` : searchIndexPath } : {}),
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
    if (buildOptions.llmsTxt) agent.docs.llms_txt = getLlmsTxtUrl(config);
  }

  const wellKnown = path.join(outDir, '.well-known');
  await ensureDir(wellKnown);
  await writeFileIfChanged(path.join(wellKnown, 'agent.json'), JSON.stringify(agent, null, 2) + '\n', buildOptions.incremental);
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

async function generateMcpServer({ config, pagesData, outDir, versionConfig = null, versionPages = null, buildOptions = {} }) {
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
  ${buildOptions.searchIndex ? `{
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
  },` : ''}
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
    if (!${buildOptions.searchIndex}) return 'Search is disabled for this build.';
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

  await writeFileIfChanged(path.join(outDir, 'mcp-server.js'), server, buildOptions.incremental);
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

async function copyDocsMedia(docsDir, outDir, { locales = true, quiet = false, incremental = false, outputTracker = null } = {}) {
  if (!await pathExists(docsDir)) return;
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
        await ensureDir(path.dirname(dest));
        await copyFileIfChanged(full, dest, incremental);
        if (outputTracker) outputTracker.protect(dest);
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
          await ensureDir(path.dirname(dest));
          await copyFileIfChanged(full, dest, incremental);
          if (outputTracker) outputTracker.protect(dest);
          copied++;
        }
      }
    }
    await walkLoc(locDir);
  }

  if (copied) console.log(`  ${pc.green('✓')} Copied ${copied} media file${copied !== 1 ? 's' : ''} from docs/`);
}

async function buildLocalePages({ config, cwd, outDir, locale, i18n, siteTheme, buildOptions, hooks, basePath, specData, apiMeta, draftPageIds, pdfManifest, resolveSpecRefs, outputTracker }) {
  const { minify, incremental } = buildOptions;
  const docsDir = localeDocsDir(cwd, locale, i18n.defaultLocale);
  if (!await pathExists(docsDir)) return;

  // With tabs, locale builds keep the tab structure (per-locale sidebar overrides apply to plain sidebars only).
  const sidebar = hasTabs(config) ? config.sidebar : getSidebarForLocale(config, locale, i18n.defaultLocale);
  const localeConfig = { ...config, sidebar };
  const pageIds = getAllPageIds(localeConfig);
  const localeOutDir = path.join(outDir, locale);
  outputTracker.protect(path.join(localeOutDir, 'index.html'));
  await ensureDir(localeOutDir);

  let built = 0;
  const localePagesData = {};
  const localeParsed = [];

  const defaultDocsDir = path.join(cwd, 'docs');
  await Promise.all(pageIds.map(async (id) => {
    // Untranslated pages fall back to the default-locale source so every sidebar link
    // in the locale site resolves; their canonical points at the default-locale page.
    let mdPath = path.join(docsDir, `${id}.md`);
    let untranslated = false;
    if (!await pathExists(mdPath)) {
      mdPath = path.join(defaultDocsDir, `${id}.md`);
      untranslated = true;
      if (!await pathExists(mdPath)) return;
    }
    const raw = await fs.readFile(mdPath, 'utf8');
    const result = await parsePageWithCache({
      id,
      mdPath,
      raw,
      parseOpts: {
        onWarning: untranslated ? () => {} : warnPage,
        docsRoot: untranslated ? defaultDocsDir : docsDir,
        pagePath: mdPath,
        globalAttributes: getRuntimeAttributes(config),
      },
      incremental,
    });
    let { meta, html, preprocessedMarkdown } = result;

    if (meta.draft === true) return;
    if (specData && resolveSpecRefs) html = resolveSpecRefs(html, specData);
    if (hooks.transformPage) {
      try { html = await hooks.transformPage({ id, meta, html, locale }) || html; } catch {}
    }

    const isApiPage = id.startsWith('api/') || meta.layout === 'api';
    localePagesData[id] = { meta, html, isApiPage };
    localeParsed.push({ id, meta, html, isApiPage, preprocessedMarkdown, untranslated });
  }));

  const localeTitleMap = buildTitleMap(localePagesData);
  const localeNavMeta = buildNavMeta(localePagesData);
  const ogColors = ogColorsFromTheme(siteTheme);
  const siteName = config.name || 'Documentation';
  const ogJobs = collectOgJobs(localePagesData, { buildOptions, siteName, ogColors, outDir: localeOutDir, toLabel });
  await generateOgImagesForPages(ogJobs, { incremental, onOutput: file => outputTracker.add(file) });

  await writePageHtmlBatch(
    localeParsed.map(({ id, meta, html, isApiPage, untranslated }) => [
      id,
      { meta, html, isApiPage, untranslated, destHtml: path.join(localeOutDir, `${id}.html`) },
    ]),
    async (id, { meta, html, untranslated }) => renderPage({
      config: localeConfig, siteTheme, id, meta, html, draftPageIds, specData, apiMeta, pdfManifest, locale,
      ogImagePath: getOgImagePath(buildOptions, meta, id),
      titleMap: localeTitleMap,
      navMeta: localeNavMeta,
      untranslated,
      searchEnabled: buildOptions.searchIndex,
      llmsEnabled: buildOptions.llmsTxt,
    }),
    { incremental, context: { config: localeConfig, siteTheme, draftPageIds, specData, apiMeta, pdfManifest, locale, localeTitleMap, buildOptions } },
  );
  for (const id of Object.keys(localePagesData)) if (id !== 'index') outputTracker.add(path.join(localeOutDir, `${id}.html`));

  for (const { id, preprocessedMarkdown, untranslated } of localeParsed) {
    const destMd = path.join(localeOutDir, `${id}.md`);
    await writePageMarkdown(destMd, preprocessedMarkdown, config, id, null, buildOptions.llmsTxt, incremental);
    outputTracker.add(destMd);
    if (!untranslated) built++;
  }

  const publishedIds = Object.keys(localePagesData);
  if (publishedIds.length) {
    await writeRootIndexStub({ dir: localeOutDir, firstId: firstVisibleId(localeConfig, localePagesData), urlPrefix: localeUrlPrefix(locale, i18n.defaultLocale, basePath), config, outputTracker });
  }

  if (pagesUseMath(localePagesData)) await writeKatexAssets(localeOutDir);
  // Copy shared CSS/JS/app into locale dir
  await writeSharedAssets(localeOutDir, { minify, siteTheme, incremental });

  if (built) {
    console.log(`  ${pc.green('✓')} Built ${built} page${built !== 1 ? 's' : ''} for locale ${pc.cyan(locale)}`);
  }
}
