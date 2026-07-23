import path from 'path';
import fs from 'fs-extra';
import pc from 'picocolors';
import { fileURLToPath } from 'url';
import { loadConfig, getAllPageIds, getVersionConfig, getOpenAPIConfig, getVersionSidebar, getChangedDocs, gitReadFile } from './config.js';
import { parseDoc } from './markdown.js';
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
import { normalizeBasePath, withBasePath } from './site-config.js';
import { collectRedirects, writeRedirectArtifacts } from './redirects.js';
import { writeFeeds } from './feeds.js';
import { generateOgImage, ogColorsFromTheme } from './og-image.js';
import { buildSearchEntries } from './search-index.js';
import { getI18nConfig, localeDocsDir, getSidebarForLocale, discoverLocales, localeUrlPrefix } from './i18n.js';
import { loadHooks } from './hooks.js';
import { getPageLastmods } from './git-dates.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function preparePdfManifest(config, pagesData, pdfOptions) {
  if (!pdfOptions.enabled) return null;
  const { chapters, pageToChapter } = getChapterManifest(config, pagesData, pdfOptions);
  return buildPdfManifest({ options: pdfOptions, chapters, pageToChapter, pagesData });
}

function buildTitleMap(pagesData) {
  const map = {};
  for (const [id, { meta }] of Object.entries(pagesData)) {
    if (meta.title) map[id] = meta.title;
  }
  return map;
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
  const file = path.join(outDir, 'pages', _pageFileName(id));
  const js = `(window.__DOCSLIT_PAGES__=window.__DOCSLIT_PAGES__||{})[${JSON.stringify(id)}]=${JSON.stringify(data)};`;
  return fs.ensureDir(path.dirname(file)).then(() => fs.writeFile(file, js));
}

function _writeSearchIndexJs(outDir, searchIndex) {
  const js = `window.__DOCSLIT_SEARCH_INDEX__=${JSON.stringify(searchIndex)};`;
  return fs.writeFile(path.join(outDir, 'search-index.js'), js);
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
      await fs.copyFile(faviconFile, path.join(outDir, path.basename(config.favicon)));
      console.log(`  ${pc.green('✓')} Copied custom favicon ${config.favicon}`);
    }
  }

  // Copy custom CSS if configured
  if (config.css) {
    const cssFile = path.resolve(cwd, config.css);
    if (await fs.pathExists(cssFile)) {
      await fs.copyFile(cssFile, path.join(outDir, path.basename(config.css)));
      console.log(`  ${pc.green('✓')} Copied custom CSS ${config.css}`);
    }
  }

  if (config.logo) {
    const logoFile = path.resolve(cwd, config.logo);
    if (await fs.pathExists(logoFile)) {
      await fs.copyFile(logoFile, path.join(outDir, path.basename(config.logo)));
      console.log(`  ${pc.green('✓')} Copied logo ${config.logo}`);
    } else {
      console.log(`  ${pc.yellow('⚠')} Logo file not found: ${config.logo}`);
    }
  }

  // Copy FlexSearch vendor bundle
  const flexSearchSrc = path.join(__dirname, 'vendor', 'flexsearch.js');
  if (await fs.pathExists(flexSearchSrc)) {
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

  const parseResults = await Promise.all(pageIds.map(async (id) => {
    const mdPath = path.join(cwd, 'docs', `${id}.md`);
    if (!await fs.pathExists(mdPath)) return { id, notFound: true };
    const raw = await fs.readFile(mdPath, 'utf8');
    const parsed = await parseDoc(raw, {
      docsRoot: path.join(cwd, 'docs'),
      pagePath: mdPath,
      globalAttributes: getRuntimeAttributes(config),
    });
    return { id, ...parsed };
  }));

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
  const pdfManifest = !offline ? preparePdfManifest(config, pagesData, pdfOptions) : null;

  // Generate OG images
  const ogColors = ogColorsFromTheme(siteTheme);
  const siteName = config.name || 'Documentation';

  if (offline) {
    const vendorData = await _loadVendorData();
    const searchIndex = buildSearchIndex(config, pagesData);
    const indexHtml = await renderShell({ config, siteTheme, mode: 'static', out, offline: true, draftPageIds, minify, specData, apiMeta, vendorData, titleMap });
    await Promise.all([
      fs.writeFile(path.join(outDir, 'index.html'), indexHtml),
      _writeSearchIndexJs(outDir, searchIndex),
      ...Object.entries(pagesData).map(([id, { meta, html }]) => _writePageJs(outDir, id, { meta, html })),
    ]);
    console.log(`  ${pc.green('✓')} Built ${built} page${built !== 1 ? 's' : ''} (offline)${draftNote}${skippedNote}`);
  } else {
    await fs.writeFile(path.join(outDir, 'docslit.css'), buildStylesFile({ minify, siteTheme }));
    await fs.writeFile(path.join(outDir, 'docslit.js'), buildComponentsFile('static', { minify }));
    await fs.writeFile(path.join(outDir, 'docslit-app.js'), buildAppFile('static', { minify }));

    const publishedIds = Object.keys(pagesData);
    const hasRegularDocs = (config.sidebar || []).length > 0;
    const isHybrid = specData && hasRegularDocs;

    // Generate OG images for each page
    const ogPromises = [];
    for (const [id, { meta }] of Object.entries(pagesData)) {
      if (config.ogImage === false || meta.ogImage === false) continue;
      const safeId = id.replace(/\//g, '--');
      const outFile = path.join(outDir, 'og', `${safeId}.png`);
      ogPromises.push(generateOgImage({ title: meta.title || toLabel(id), siteName, colors: ogColors, outFile }).catch(() => {}));
    }
    await Promise.all(ogPromises);
    if (ogPromises.length) {
      console.log(`  ${pc.green('✓')} Generated ${ogPromises.length} OG image${ogPromises.length !== 1 ? 's' : ''}`);
    }

    for (const [id, { meta, html, isApiPage }] of Object.entries(pagesData)) {
      const ogEnabled = config.ogImage !== false && meta.ogImage !== false;
      const safeId = id.replace(/\//g, '--');
      const ogImagePath = ogEnabled ? `og/${safeId}.png` : null;
      const pageHtml = await renderPage({ config, siteTheme, id, meta, html, draftPageIds, specData: (isApiPage || isHybrid) ? specData : null, apiMeta: (isApiPage || isHybrid) ? apiMeta : null, pdfManifest, ogImagePath, titleMap });
      const destHtml = path.join(outDir, `${id}.html`);
      await fs.ensureDir(path.dirname(destHtml));
      await fs.writeFile(destHtml, pageHtml);
    }

    if (publishedIds.length) {
      await fs.copyFile(path.join(outDir, `${publishedIds[0]}.html`), path.join(outDir, 'index.html'));
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
    await generateAgentJson({ config, pageIds: Object.keys(pagesData), outDir });
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

  const defaultParseResults = await Promise.all(defaultPageIds.map(async (id) => {
    const mdPath = path.join(cwd, 'docs', `${id}.md`);
    if (!await fs.pathExists(mdPath)) return null;
    const raw = await fs.readFile(mdPath, 'utf8');
    const parsed = await parseDoc(raw, {
      docsRoot: path.join(cwd, 'docs'),
      pagePath: mdPath,
      globalAttributes: getRuntimeAttributes(config, defaultVersion, defaultBranch),
    });
    return { id, ...parsed };
  }));

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
  const defaultPdfManifest = !offline ? preparePdfManifest(config, defaultPagesData, pdfOptions) : null;

  if (offline) {
    await fs.ensureDir(defaultDir);
    const defaultShell = await renderShell({
      config, siteTheme, mode: 'static', out, draftPageIds,
      versionConfig, currentVersion: defaultVersion,
      offline: true, minify,
      specData, apiMeta, vendorData, titleMap: defaultTitleMap,
    });
    const searchIndex = buildSearchIndex(config, defaultPagesData);
    await Promise.all([
      fs.writeFile(path.join(defaultDir, 'index.html'), defaultShell),
      _writeSearchIndexJs(defaultDir, searchIndex),
      ...Object.entries(defaultPagesData).map(([id, { meta, html }]) => _writePageJs(defaultDir, id, { meta, html })),
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
      ogPromises.push(generateOgImage({ title: meta.title || toLabel(id), siteName, colors: ogColors, outFile: path.join(defaultDir, 'og', `${safeId}.png`) }).catch(() => {}));
    }
    await Promise.all(ogPromises);

    for (const [id, { meta, html, isApiPage }] of Object.entries(defaultPagesData)) {
      const ogEnabled = config.ogImage !== false && meta.ogImage !== false;
      const safeId = id.replace(/\//g, '--');
      const ogImagePath = ogEnabled ? `og/${safeId}.png` : null;
      const pageHtml = await renderPage({ config, siteTheme, id, meta, html, draftPageIds, versionConfig, currentVersion: defaultVersion, specData: (isApiPage || defaultIsHybrid) ? specData : null, apiMeta: (isApiPage || defaultIsHybrid) ? apiMeta : null, pdfManifest: defaultPdfManifest, ogImagePath, titleMap: defaultTitleMap });
      const destHtml = path.join(defaultDir, `${id}.html`);
      await fs.ensureDir(path.dirname(destHtml));
      await fs.writeFile(destHtml, pageHtml);
    }

    if (publishedIds.length) {
      await fs.copyFile(path.join(defaultDir, `${publishedIds[0]}.html`), path.join(defaultDir, 'index.html'));
    }
    await generateLlmsTxt({ config, pagesData: defaultPagesData, outDir: defaultDir, version: defaultVersion });
    if (pdfOptions.enabled) {
      await generatePdfs({ outDir: defaultDir, config, pagesData: defaultPagesData, pdfOptions });
    }
  }

  console.log(`  ${pc.green('✓')} ${defaultVersion}: ${built} pages (full build)`);

  // Build non-default versions — only changed pages
  for (const entry of versionConfig.list) {
    if (entry.version === defaultVersion) continue;
    const versionDir = path.join(outDir, entry.version);
    const versionBranch = entry.branch;

    const versionSidebar = await getVersionSidebar(versionBranch, cwd);
    const versionConf = { ...config, sidebar: versionSidebar.length ? versionSidebar : config.sidebar };
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
          docsRoot: path.join(cwd, 'docs'),
          pagePath: `docs/${id}.md@${versionBranch}`,
          globalAttributes: getRuntimeAttributes(config, entry.version, versionBranch),
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
    const versionTitleMap = buildTitleMap(versionPagesData);

    if (offline) {
      const versionShell = await renderShell({
        config: versionConf, siteTheme, mode: 'static', out, draftPageIds: [],
        versionConfig, currentVersion: entry.version,
        offline: true, minify,
        specData, apiMeta, vendorData, titleMap: versionTitleMap,
      });
      const vSearchIndex = buildSearchIndex(versionConf, versionPagesData);
      await Promise.all([
        fs.writeFile(path.join(versionDir, 'index.html'), versionShell),
        _writeSearchIndexJs(versionDir, vSearchIndex),
        ...Object.entries(versionPagesData).map(([id, { meta, html }]) => _writePageJs(versionDir, id, { meta, html })),
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
        const pageHtml = await renderPage({ config: versionConf, siteTheme, id, meta, html, draftPageIds: [], versionConfig, currentVersion: entry.version, specData: (isApiPage || vIsHybrid) ? specData : null, apiMeta: (isApiPage || vIsHybrid) ? apiMeta : null, pdfManifest: versionPdfManifest, titleMap: versionTitleMap });
        const destHtml = path.join(versionDir, `${id}.html`);
        await fs.ensureDir(path.dirname(destHtml));
        await fs.writeFile(destHtml, pageHtml);
      }

      if (vPublishedIds.length) {
        await fs.copyFile(path.join(versionDir, `${vPublishedIds[0]}.html`), path.join(versionDir, 'index.html'));
      }
      if (pdfOptions.enabled) {
        await generatePdfs({ outDir: versionDir, config: versionConf, pagesData: versionPagesData, pdfOptions });
      }
    }

    await fs.writeFile(path.join(versionDir, '_manifest.json'), JSON.stringify(manifest, null, 2));
    if (!offline) {
      await generateLlmsTxt({ config: versionConf, pagesData: versionPagesData, outDir: versionDir, version: entry.version });
    }

    console.log(`  ${pc.green('✓')} ${entry.version}: ${vBuilt} changed page${vBuilt !== 1 ? 's' : ''} built, ${Object.keys(manifest).length - vBuilt} shared from ${defaultVersion}`);
  }

  // Root index.html redirects to default version
  const defaultFirstId = Object.keys(defaultPagesData)[0] || 'introduction';
  const redirectUrl = offline
    ? `${defaultVersion}/index.html#${defaultFirstId}`
    : `/${defaultVersion}/${defaultFirstId}`;
  const rootRedirect = `<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0;url=${redirectUrl}"><script>location.replace('${redirectUrl}');</script></head></html>`;
  await fs.writeFile(path.join(outDir, 'index.html'), rootRedirect);

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
    await generateAgentJson({ config, pageIds: allPageIds, outDir, versionConfig });
    await generateMcpServer({ config, pagesData: allPagesData, outDir, versionConfig });

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
  function collectPages(pages, groupName) {
    for (const item of (pages || [])) {
      if (typeof item === 'string') {
        if (!pagesData[item]) continue;
        const { meta, html } = pagesData[item];
        const entries = buildSearchEntries({
          id: item,
          title: meta.title || toLabel(item),
          group: groupName,
          desc: meta.description || meta.desc || '',
          html: html || '',
          markdown: pagesData[item].preprocessedMarkdown || meta.description || '',
        });
        index.push(...entries);
      } else if (item.id) {
        if (!pagesData[item.id]) continue;
        const { meta, html } = pagesData[item.id];
        const entries = buildSearchEntries({
          id: item.id,
          title: meta.title || item.title || toLabel(item.id),
          group: groupName,
          desc: meta.description || meta.desc || '',
          html: html || '',
          markdown: pagesData[item.id].preprocessedMarkdown || meta.description || '',
        });
        index.push(...entries);
      } else if (item.pages) {
        collectPages(item.pages, groupName);
      }
    }
  }
  for (const group of (config.sidebar || [])) {
    collectPages(group.pages, group.group || 'Pages');
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
  lines.push(`\n> Raw Markdown for each page is available at ${mdPattern}`);
  lines.push('');

  function collectLlmsPages(pages) {
    const result = [];
    for (const item of (pages || [])) {
      if (typeof item === 'string' && pagesData[item]) result.push(item);
      else if (typeof item === 'object' && item.id && pagesData[item.id]) result.push(item.id);
      else if (typeof item === 'object' && item.pages) result.push(...collectLlmsPages(item.pages));
    }
    return result;
  }
  for (const group of (config.sidebar || [])) {
    const groupPages = collectLlmsPages(group.pages);
    if (!groupPages.length) continue;

    lines.push(`## ${group.group || 'Pages'}`);
    lines.push('');
    for (const id of groupPages) {
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

  for (const group of (config.sidebar || [])) {
    const groupName = group.group || 'Pages';
    const groupPages = collectLlmsPages(group.pages);
    if (!groupPages.length) continue;
    for (const id of groupPages) {
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
        searchIndex.push({
          id,
          title: meta.title || toLabel(id),
          group: groupName,
          desc: meta.description || meta.desc || '',
          body: stripFrontmatter(src),
        });
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
  const baseUrl = (config.url || '').replace(/\/$/, '');
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

    lines.push(`Sitemap: ${baseUrl}/llms.txt`);
  }

  lines.push('');
  await fs.writeFile(path.join(outDir, 'robots.txt'), lines.join('\n'));
  console.log(`  ${pc.green('✓')} Generated robots.txt`);
}

async function generateSitemap({ config, pagesData, outDir, versionConfig = null, defaultVersion = null, lastmods = {} }) {
  const baseUrl = (config.url || '').replace(/\/$/, '');
  if (!baseUrl) {
    console.log(`  ${pc.dim('○')} Skipped sitemap.xml — no url in docslit.json`);
    return;
  }

  const today = new Date().toISOString().split('T')[0];

  if (versionConfig) {
    for (const entry of versionConfig.list) {
      const versionDir = path.join(outDir, entry.version);
      const isDefault = entry.version === defaultVersion;
      const priority = isDefault ? '1.0' : '0.6';
      const urls = [];

      urls.push(`  <url>\n    <loc>${escXml(baseUrl)}/${escXml(entry.version)}/</loc>\n    <lastmod>${today}</lastmod>\n    <priority>${priority}</priority>\n  </url>`);

      for (const id of Object.keys(pagesData)) {
        const lastmod = lastmods[id] || today;
        urls.push(`  <url>\n    <loc>${escXml(baseUrl)}/${escXml(entry.version)}/${escXml(id)}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <priority>${isDefault ? '0.8' : '0.5'}</priority>\n  </url>`);
      }

      const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
      await fs.ensureDir(versionDir);
      await fs.writeFile(path.join(versionDir, 'sitemap.xml'), xml);
    }
  } else {
    const urls = [];

    urls.push(`  <url>\n    <loc>${escXml(baseUrl)}/</loc>\n    <lastmod>${today}</lastmod>\n    <priority>1.0</priority>\n  </url>`);

    for (const id of Object.keys(pagesData)) {
      const lastmod = lastmods[id] || today;
      urls.push(`  <url>\n    <loc>${escXml(baseUrl)}/${escXml(id)}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <priority>0.8</priority>\n  </url>`);
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
    await fs.writeFile(path.join(outDir, 'sitemap.xml'), xml);
  }

  console.log(`  ${pc.green('✓')} Generated sitemap.xml (${Object.keys(pagesData).length} URLs)`);
}

function escXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
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
// Compatible with Cloudflare Workers/Pages, Vercel Edge, Netlify Edge Functions
const MD_PATHS = new Set(${pathsJson});
const VERSIONS = ${versionsJson};

export default async function middleware(request, context) {
  const url = new URL(request.url);
  let pathname = url.pathname.replace(/\\/$/, '') || '/';

  const accept = request.headers.get('accept') || '';
  const wantsMarkdown = accept.includes('text/markdown') && !accept.includes('text/html');
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
        headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
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
    rewrites: [
      {
        source: `${sourcePrefix}/:path*`,
        has: [{ type: 'header', key: 'accept', value: '(?i).*text/markdown.*' }],
        destination: `${sourcePrefix}/:path*.md`,
      },
    ],
  };

  const headersFile = '/*.md\n  Content-Type: text/markdown; charset=utf-8\n';

  await Promise.all([
    fs.writeFile(path.join(outDir, '_middleware.js'), middleware),
    fs.ensureDir(path.join(outDir, 'functions')).then(() =>
      fs.writeFile(path.join(outDir, 'functions', '_middleware.js'), middleware)),
    fs.ensureDir(path.join(cwd, 'functions')).then(() =>
      fs.writeFile(path.join(cwd, 'functions', '_middleware.js'), middleware)),
    fs.writeFile(path.join(outDir, '_headers'), headersFile),
    fs.writeFile(path.join(outDir, 'vercel.json'), JSON.stringify(vercelConfig, null, 2) + '\n'),
  ]);
  console.log(`  ${pc.green('✓')} Generated functions/_middleware.js + _headers + vercel.json (content negotiation for ${mdPaths.size} pages)`);
}

async function generateAgentJson({ config, pageIds, outDir, versionConfig = null }) {
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
    pages: pageIds.map(id => ({
      slug: id,
      markdown: getMarkdownUrl(config, id, defaultVersion),
    })),
  };

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

async function generateMcpServer({ config, pagesData, outDir, versionConfig = null }) {
  const siteTitle = config.name || 'Documentation';
  const siteDesc = config.description || '';
  const pageIds = Object.keys(pagesData);
  const pages = pageIds.map(id => ({
    id,
    title: pagesData[id].meta.title || toLabel(id),
    desc: pagesData[id].meta.description || pagesData[id].meta.desc || '',
  }));

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
const PAGES = ${JSON.stringify(pages)};

let searchIndex = null;

async function loadSearchIndex() {
  if (searchIndex) return searchIndex;
  try {
    const raw = await readFile(join(__dirname, 'search-index.json'), 'utf8');
    searchIndex = JSON.parse(raw);
  } catch {
    searchIndex = [];
  }
  return searchIndex;
}

async function getPage(id) {
  const mdPath = join(__dirname, id + '.md');
  try {
    return await readFile(mdPath, 'utf8');
  } catch {
    return null;
  }
}

const tools = [
  {
    name: 'list_pages',
    description: 'List all documentation pages with titles and descriptions',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_page',
    description: 'Get the full Markdown content of a documentation page by its slug',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'Page slug (e.g. "quickstart" or "guides/setup")' },
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
      },
      required: ['query'],
    },
  },
];

async function handleToolCall(name, args) {
  if (name === 'list_pages') {
    const list = PAGES.map(p => p.desc ? \`- **\${p.title}** (\${p.id}): \${p.desc}\` : \`- **\${p.title}** (\${p.id})\`).join('\\n');
    return \`# \${SITE}\\n\\n\${list}\`;
  }

  if (name === 'get_page') {
    const slug = args.slug;
    const content = await getPage(slug);
    if (!content) return \`Page "\${slug}" not found. Use list_pages to see available pages.\`;
    return content;
  }

  if (name === 'search_docs') {
    const query = (args.query || '').toLowerCase();
    const index = await loadSearchIndex();
    const results = index
      .filter(p => p.title.toLowerCase().includes(query) ||
                   p.desc.toLowerCase().includes(query) ||
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

  return \`Unknown tool: \${name}\`;
}

function send(msg) {
  const json = JSON.stringify(msg);
  process.stdout.write(\`Content-Length: \${Buffer.byteLength(json)}\\r\\n\\r\\n\${json}\`);
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
    return respond(id, { protocolVersion: '2024-11-05', capabilities: CAPABILITIES, serverInfo: SERVER_INFO });
  }
  if (method === 'notifications/initialized') return;
  if (method === 'tools/list') {
    return respond(id, { tools });
  }
  if (method === 'tools/call') {
    const { name, arguments: args } = params;
    handleToolCall(name, args || {}).then(text => {
      respond(id, { content: [{ type: 'text', text }] });
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
  while (true) {
    const headerEnd = buffer.indexOf('\\r\\n\\r\\n');
    if (headerEnd < 0) break;
    const header = buffer.slice(0, headerEnd);
    const match = header.match(/Content-Length:\\s*(\\d+)/i);
    if (!match) { buffer = buffer.slice(headerEnd + 4); continue; }
    const len = parseInt(match[1], 10);
    const bodyStart = headerEnd + 4;
    if (buffer.length < bodyStart + len) break;
    const body = buffer.slice(bodyStart, bodyStart + len);
    buffer = buffer.slice(bodyStart + len);
    try {
      handleMessage(JSON.parse(body));
    } catch {}
  }
});

process.stderr.write(\`\${SITE} MCP server running on stdio\\n\`);
`;

  await fs.writeFile(path.join(outDir, 'mcp-server.js'), server);
  console.log(`  ${pc.green('✓')} Generated mcp-server.js (${pageIds.length} pages, 3 tools: list_pages, get_page, search_docs)`);
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

async function copyDocsMedia(docsDir, outDir) {
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

  const sidebar = getSidebarForLocale(config, locale, i18n.defaultLocale);
  const localeConfig = { ...config, sidebar };
  const pageIds = getAllPageIds(localeConfig);
  const localeOutDir = path.join(outDir, locale);
  await fs.ensureDir(localeOutDir);

  let built = 0;
  const localePagesData = {};
  const localeParsed = [];

  for (const id of pageIds) {
    const mdPath = path.join(docsDir, `${id}.md`);
    if (!await fs.pathExists(mdPath)) continue;
    const raw = await fs.readFile(mdPath, 'utf8');
    let { meta, html, preprocessedMarkdown } = await parseDoc(raw, {
      docsRoot: docsDir,
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
    localeParsed.push({ id, meta, html, isApiPage, preprocessedMarkdown });
  }

  const localeTitleMap = buildTitleMap(localePagesData);

  for (const { id, meta, html, isApiPage, preprocessedMarkdown } of localeParsed) {
    const ogEnabled = config.ogImage !== false && meta.ogImage !== false;
    const safeId = id.replace(/\//g, '--');
    const ogImagePath = ogEnabled ? `og/${safeId}.png` : null;

    const pageHtml = await renderPage({ config: localeConfig, siteTheme, id, meta, html, draftPageIds, specData, apiMeta, pdfManifest, locale, ogImagePath, titleMap: localeTitleMap });
    const destHtml = path.join(localeOutDir, `${id}.html`);
    await fs.ensureDir(path.dirname(destHtml));
    await fs.writeFile(destHtml, pageHtml);

    const destMd = path.join(localeOutDir, `${id}.md`);
    await writePageMarkdown(destMd, preprocessedMarkdown, config, id);
    built++;
  }

  const publishedIds = Object.keys(localePagesData);
  if (publishedIds.length) {
    await fs.copyFile(path.join(localeOutDir, `${publishedIds[0]}.html`), path.join(localeOutDir, 'index.html'));
  }

  // Copy shared CSS/JS/app into locale dir
  await fs.writeFile(path.join(localeOutDir, 'docslit.css'), buildStylesFile({ minify, siteTheme }));
  await fs.writeFile(path.join(localeOutDir, 'docslit.js'), buildComponentsFile('static', { minify }));
  await fs.writeFile(path.join(localeOutDir, 'docslit-app.js'), buildAppFile('static', { minify }));

  if (built) {
    console.log(`  ${pc.green('✓')} Built ${built} page${built !== 1 ? 's' : ''} for locale ${pc.cyan(locale)}`);
  }
}
