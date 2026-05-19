import path from 'path';
import fs from 'fs-extra';
import pc from 'picocolors';
import { fileURLToPath } from 'url';
import { loadConfig, getAllPageIds, getVersionConfig, getOpenAPIConfig, getVersionSidebar, getChangedDocs, gitReadFile } from './config.js';
import { parseDoc } from './markdown.js';
import { renderShell, renderPage, buildStylesFile, buildComponentsFile, buildAppFile, buildOfflineThemeInitFile, buildOfflineAppFile } from './template.js';
import { loadSpec, getEndpoints, getApiMeta, resolveSpecRefs, buildApiPageMarkdown } from './openapi.js';
import { initHighlighter } from './highlighter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getRuntimeAttributes(config, version = null, branch = null) {
  const attrs = { ...(config.attributes || {}) };
  attrs.DOCSLIT_VERSION = version || 'unversioned';
  attrs.DOCSLIT_BRANCH = branch || 'working-tree';
  return attrs;
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

export async function build({ out = 'dist', offline = false, minify = true } = {}) {
  const t0 = performance.now();
  const cwd = process.cwd();
  const [config] = await Promise.all([loadConfig(cwd), initHighlighter()]);
  const outDir = path.resolve(cwd, out);
  const versionConfig = getVersionConfig(config);

  const modeLabel = offline ? ' (offline mode)' : '';
  const minifyLabel = minify ? '' : ' (unminified)';
  console.log(`\n  ${pc.bold('DocsLit')} building static site${modeLabel}${minifyLabel}...\n`);

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

  if (versionConfig) {
    await buildVersioned({ config, versionConfig, cwd, outDir, out, offline, minify });
  } else {
    await buildSingle({ config, cwd, outDir, out, offline, minify });
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

async function buildSingle({ config, cwd, outDir, out, offline, minify }) {
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

    const isApiPage = id.startsWith('api/') || meta.layout === 'api';
    pagesData[id] = { meta, html, isApiPage };
    if (!offline) {
      const destMd = path.join(outDir, `${id}.md`);
      await fs.ensureDir(path.dirname(destMd));
      if (isApiPage && specData) {
        await fs.writeFile(destMd, buildApiPageMarkdown(preprocessedMarkdown, specData));
      } else {
        await fs.writeFile(destMd, preprocessedMarkdown);
      }
    }
    built++;
  }

  const skippedNote = failed ? pc.yellow(` (${failed} skipped)`) : '';
  const draftNote = drafts ? pc.dim(` (${drafts} draft${drafts !== 1 ? 's' : ''} hidden)`) : '';

  if (offline) {
    const vendorData = await _loadVendorData();
    const searchIndex = buildSearchIndex(config, pagesData);
    const indexHtml = renderShell({ config, mode: 'static', out, offline: true, draftPageIds, minify, specData, apiMeta, vendorData });
    await Promise.all([
      fs.writeFile(path.join(outDir, 'index.html'), indexHtml),
      _writeSearchIndexJs(outDir, searchIndex),
      ...Object.entries(pagesData).map(([id, { meta, html }]) => _writePageJs(outDir, id, { meta, html })),
    ]);
    console.log(`  ${pc.green('✓')} Built ${built} page${built !== 1 ? 's' : ''} (offline)${draftNote}${skippedNote}`);
  } else {
    await fs.writeFile(path.join(outDir, 'docslit.css'), buildStylesFile({ minify }));
    await fs.writeFile(path.join(outDir, 'docslit.js'), buildComponentsFile('static', { minify }));
    await fs.writeFile(path.join(outDir, 'docslit-app.js'), buildAppFile('static', { minify }));

    const publishedIds = Object.keys(pagesData);
    const hasRegularDocs = (config.sidebar || []).length > 0;
    const isHybrid = specData && hasRegularDocs;
    for (const [id, { meta, html, isApiPage }] of Object.entries(pagesData)) {
      const pageHtml = renderPage({ config, id, meta, html, draftPageIds, specData: (isApiPage || isHybrid) ? specData : null, apiMeta: (isApiPage || isHybrid) ? apiMeta : null });
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
    await generateRobotsTxt({ config, outDir });
    await generateSitemap({ config, pagesData, outDir });
    await generateMarkdownMiddleware({ pageIds: Object.keys(pagesData), outDir });
    await generateAgentJson({ config, pageIds: Object.keys(pagesData), outDir });
    await generateMcpServer({ config, pagesData, outDir });
  }
}

async function buildVersioned({ config, versionConfig, cwd, outDir, out, offline, minify }) {
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
    const isApiPage = id.startsWith('api/') || meta.layout === 'api';
    defaultPagesData[id] = { meta, html, isApiPage };
    if (!offline) {
      const destMd = path.join(defaultDir, `${id}.md`);
      await fs.ensureDir(path.dirname(destMd));
      if (isApiPage && specData) {
        await fs.writeFile(destMd, buildApiPageMarkdown(preprocessedMarkdown, specData));
      } else {
        await fs.writeFile(destMd, preprocessedMarkdown);
      }
    }
    built++;
  }

  const sharedCss = offline ? null : buildStylesFile({ minify });
  const sharedJs = offline ? null : buildComponentsFile('static', { minify });
  const sharedApp = offline ? null : buildAppFile('static', { minify });
  const vendorData = offline ? await _loadVendorData() : null;

  if (offline) {
    await fs.ensureDir(defaultDir);
    const defaultShell = renderShell({
      config, mode: 'static', out, draftPageIds,
      versionConfig, currentVersion: defaultVersion,
      offline: true, minify,
      specData, apiMeta, vendorData,
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

    const publishedIds = Object.keys(defaultPagesData);
    const defaultHasRegularDocs = (config.sidebar || []).length > 0;
    const defaultIsHybrid = specData && defaultHasRegularDocs;
    for (const [id, { meta, html, isApiPage }] of Object.entries(defaultPagesData)) {
      const pageHtml = renderPage({ config, id, meta, html, draftPageIds, versionConfig, currentVersion: defaultVersion, specData: (isApiPage || defaultIsHybrid) ? specData : null, apiMeta: (isApiPage || defaultIsHybrid) ? apiMeta : null });
      const destHtml = path.join(defaultDir, `${id}.html`);
      await fs.ensureDir(path.dirname(destHtml));
      await fs.writeFile(destHtml, pageHtml);
    }

    if (publishedIds.length) {
      await fs.copyFile(path.join(defaultDir, `${publishedIds[0]}.html`), path.join(defaultDir, 'index.html'));
    }
    await generateLlmsTxt({ config, pagesData: defaultPagesData, outDir: defaultDir });
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
        versionPagesData[id] = { meta, html };
        if (!offline) {
          const destMd = path.join(versionDir, 'docs', `${id}.md`);
          await fs.ensureDir(path.dirname(destMd));
          await fs.writeFile(destMd, preprocessedMarkdown);
        }
        manifest[id] = entry.version;
        vBuilt++;
      } else {
        manifest[id] = defaultVersion;
        if (defaultPagesData[id]) versionPagesData[id] = defaultPagesData[id];
      }
    }

    await fs.ensureDir(versionDir);

    if (offline) {
      const versionShell = renderShell({
        config: versionConf, mode: 'static', out, draftPageIds: [],
        versionConfig, currentVersion: entry.version,
        offline: true, minify,
        specData, apiMeta, vendorData,
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

      const vPublishedIds = Object.keys(versionPagesData);
      const vIsHybrid = specData && (versionConf.sidebar || []).length > 0;
      for (const [id, { meta, html }] of Object.entries(versionPagesData)) {
        const isApiPage = id.startsWith('api/') || meta.layout === 'api';
        const pageHtml = renderPage({ config: versionConf, id, meta, html, draftPageIds: [], versionConfig, currentVersion: entry.version, specData: (isApiPage || vIsHybrid) ? specData : null, apiMeta: (isApiPage || vIsHybrid) ? apiMeta : null });
        const destHtml = path.join(versionDir, `${id}.html`);
        await fs.ensureDir(path.dirname(destHtml));
        await fs.writeFile(destHtml, pageHtml);
      }

      if (vPublishedIds.length) {
        await fs.copyFile(path.join(versionDir, `${vPublishedIds[0]}.html`), path.join(versionDir, 'index.html'));
      }
    }

    await fs.writeFile(path.join(versionDir, '_manifest.json'), JSON.stringify(manifest, null, 2));
    if (!offline) {
      await generateLlmsTxt({ config: versionConf, pagesData: versionPagesData, outDir: versionDir });
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
    await generateRobotsTxt({ config, outDir, versionConfig });
    await generateSitemap({ config, pagesData: allPagesData, outDir, versionConfig, defaultVersion });
    const allPageIds = Object.keys(allPagesData);
    await generateMarkdownMiddleware({ pageIds: allPageIds, outDir, versionConfig });
    await generateAgentJson({ config, pageIds: allPageIds, outDir, versionConfig });
    await generateMcpServer({ config, pagesData: allPagesData, outDir, versionConfig });
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
        const { meta } = pagesData[item];
        index.push({
          id: item,
          title: meta.title || toLabel(item),
          group: groupName,
          desc: meta.description || meta.desc || '',
          body: '',
        });
      } else if (item.id) {
        if (!pagesData[item.id]) continue;
        const { meta } = pagesData[item.id];
        index.push({
          id: item.id,
          title: meta.title || item.title || toLabel(item.id),
          group: groupName,
          desc: meta.description || meta.desc || '',
          body: '',
        });
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

async function generateLlmsTxt({ config, pagesData, outDir }) {
  const siteTitle = config.name || 'Documentation';
  const siteDesc = config.description || '';
  const baseUrl = (config.url || '').replace(/\/$/, '');

  // ── llms.txt ──
  const lines = [`# ${siteTitle}`];
  if (siteDesc) lines.push(`\n> ${siteDesc}`);
  const mdBase = baseUrl ? `${baseUrl}/docs` : 'docs';
  lines.push(`\n> Raw Markdown for each page is available at ${mdBase}/{slug}.md`);
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
      const mdUrl = baseUrl ? `${baseUrl}/${id}.md` : `${id}.md`;
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

async function generateSitemap({ config, pagesData, outDir, versionConfig = null, defaultVersion = null }) {
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
        urls.push(`  <url>\n    <loc>${escXml(baseUrl)}/${escXml(entry.version)}/${escXml(id)}</loc>\n    <lastmod>${today}</lastmod>\n    <priority>${isDefault ? '0.8' : '0.5'}</priority>\n  </url>`);
      }

      const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
      await fs.ensureDir(versionDir);
      await fs.writeFile(path.join(versionDir, 'sitemap.xml'), xml);
    }
  } else {
    const urls = [];

    urls.push(`  <url>\n    <loc>${escXml(baseUrl)}/</loc>\n    <lastmod>${today}</lastmod>\n    <priority>1.0</priority>\n  </url>`);

    for (const id of Object.keys(pagesData)) {
      urls.push(`  <url>\n    <loc>${escXml(baseUrl)}/${escXml(id)}</loc>\n    <lastmod>${today}</lastmod>\n    <priority>0.8</priority>\n  </url>`);
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
    await fs.writeFile(path.join(outDir, 'sitemap.xml'), xml);
  }

  console.log(`  ${pc.green('✓')} Generated sitemap.xml (${Object.keys(pagesData).length} URLs)`);
}

function escXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

async function generateMarkdownMiddleware({ pageIds, outDir, versionConfig = null }) {
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

  const vercelConfig = {
    rewrites: [
      {
        source: '/:path*',
        has: [{ type: 'header', key: 'accept', value: '.*text/markdown.*' }],
        destination: '/:path*.md',
      },
    ],
  };

  await Promise.all([
    fs.writeFile(path.join(outDir, '_middleware.js'), middleware),
    fs.writeFile(path.join(outDir, 'vercel.json'), JSON.stringify(vercelConfig, null, 2) + '\n'),
  ]);
  console.log(`  ${pc.green('✓')} Generated _middleware.js + vercel.json (content negotiation for ${mdPaths.size} pages)`);
}

async function generateAgentJson({ config, pageIds, outDir, versionConfig = null }) {
  const baseUrl = (config.url || '').replace(/\/$/, '');
  const agent = {
    name: config.name || 'Documentation',
    description: config.description || '',
    docs: {
      llms_txt: baseUrl ? `${baseUrl}/llms.txt` : '/llms.txt',
      llms_full_txt: baseUrl ? `${baseUrl}/llms-full.txt` : '/llms-full.txt',
      search_index: baseUrl ? `${baseUrl}/search-index.json` : '/search-index.json',
      markdown_pattern: baseUrl ? `${baseUrl}/{slug}.md` : '/{slug}.md',
    },
    content_negotiation: {
      accept: 'text/markdown',
      description: 'Request any page URL with Accept: text/markdown to receive raw Markdown',
    },
    pages: pageIds.map(id => ({
      slug: id,
      markdown: baseUrl ? `${baseUrl}/${id}.md` : `/${id}.md`,
    })),
  };

  if (versionConfig) {
    agent.versions = versionConfig.list.map(v => v.version);
    agent.default_version = versionConfig.default;
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
