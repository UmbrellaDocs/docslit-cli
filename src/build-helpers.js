/**
 * Shared helpers for the static build pipeline.
 */
import path from 'path';
import fs from 'node:fs/promises';
import { serialize } from 'node:v8';
import { ensureDir, writeFileIfChanged } from './fs-helpers.js';
import { getOpenAPIConfig } from './config.js';
import { parseDoc } from './markdown.js';
import { buildStylesFile, buildComponentsFile, buildAppFile } from './template.js';
import { generateOgImages, ogColorsFromTheme } from './og-image.js';
import { isOgImageEnabled } from './build-options.js';
import { contentHash, pageCacheKey, readPageCache, writePageCache, readRenderedPageCache, writeRenderedPageCache } from './build-cache.js';

export function createBuildProfiler(enabled) {
  if (!enabled) {
    return { start() {}, end() {}, log() {} };
  }
  const phases = {};
  let stack = [];
  return {
    start(name) {
      stack.push({ name, t: performance.now() });
    },
    end(name) {
      const frame = stack.pop();
      if (frame && frame.name === name) {
        phases[name] = (phases[name] || 0) + (performance.now() - frame.t);
      }
    },
    log() {
      const entries = Object.entries(phases).sort((a, b) => b[1] - a[1]);
      if (!entries.length) return;
      console.log(`\n  ${'Phase'.padEnd(16)} Time`);
      for (const [name, ms] of entries) {
        console.log(`  ${name.padEnd(16)} ${(ms / 1000).toFixed(2)}s`);
      }
      console.log('');
    },
  };
}

export async function loadOpenApiIfNeeded(config, cwd) {
  const openapiConfig = getOpenAPIConfig(config);
  if (!openapiConfig?.spec) return { specData: null, apiMeta: null, resolveSpecRefs: null, buildApiPageMarkdown: null };
  try {
    const openapi = await import('./openapi.js');
    const spec = await openapi.loadSpec(
      path.resolve(cwd, openapiConfig.spec),
      openapiConfig.overlay ? path.resolve(cwd, openapiConfig.overlay) : null,
    );
    return {
      specData: openapi.getEndpoints(spec),
      apiMeta: openapi.getApiMeta(spec),
      resolveSpecRefs: openapi.resolveSpecRefs,
      buildApiPageMarkdown: openapi.buildApiPageMarkdown,
    };
  } catch (e) {
    return { specData: null, apiMeta: null, resolveSpecRefs: null, buildApiPageMarkdown: null, error: e };
  }
}

export async function buildSharedAssets({ minify, siteTheme, incremental }) {
  return Promise.all([
    buildStylesFile({ minify, siteTheme, incremental }),
    buildComponentsFile('static', { minify, incremental }),
    buildAppFile('static', { minify, incremental }),
  ]);
}

export async function writeSharedAssets(outDir, options) {
  const [css, js, app] = await buildSharedAssets(options);
  await Promise.all([
    writeFileIfChanged(path.join(outDir, 'docslit.css'), css, options.incremental),
    writeFileIfChanged(path.join(outDir, 'docslit.js'), js, options.incremental),
    writeFileIfChanged(path.join(outDir, 'docslit-app.js'), app, options.incremental),
  ]);
}

export function collectOgJobs(pagesData, { buildOptions, siteName, ogColors, outDir, toLabel }) {
  if (!buildOptions.ogImages) return [];
  const jobs = [];
  for (const [id, { meta }] of Object.entries(pagesData)) {
    if (!isOgImageEnabled(buildOptions, meta)) continue;
    const safeId = id.replace(/\//g, '--');
    jobs.push({
      title: meta.title || toLabel(id),
      siteName,
      colors: ogColors,
      outFile: path.join(outDir, 'og', `${safeId}.png`),
    });
  }
  return jobs;
}

export async function generateOgImagesForPages(jobs, { incremental = false, onOutput = null } = {}) {
  if (!jobs.length) return 0;
  const count = await generateOgImages(jobs, { incremental, onOutput });
  return count;
}

let rendererFingerprint;
async function getRendererFingerprint() {
  if (!rendererFingerprint) {
    const files = ['template.js', 'build.js', 'build-helpers.js', 'build-options.js', 'sidebar.js', 'config.js', 'themes.js', 'agent-docs.js', 'site-config.js', 'i18n.js'];
    const contents = await Promise.all(files.map(file => fs.readFile(new URL(`./${file}`, import.meta.url), 'utf8')));
    rendererFingerprint = contentHash(contents.join('\0'));
  }
  return rendererFingerprint;
}

export async function writePageHtmlBatch(entries, renderPageFn, { incremental = false, context = {} } = {}) {
  const hasAnnouncement = context.config?.announcement || context.versionConfig?.list?.some(entry => entry.announcement);
  const useCache = incremental && !hasAnnouncement;
  const contextHash = useCache
    ? contentHash(serialize([await getRendererFingerprint(), renderPageFn.toString(), context]))
    : null;
  let reused = 0;
  await Promise.all(entries.map(async ([id, data]) => {
    const { destHtml, ...pageData } = data;
    const key = useCache ? contentHash(serialize([contextHash, id, pageData])) : null;
    let pageHtml = key ? await readRenderedPageCache(key) : null;
    if (pageHtml === null) {
      pageHtml = await renderPageFn(id, data);
      if (key) await writeRenderedPageCache(key, pageHtml);
    } else reused++;
    await ensureDir(path.dirname(destHtml));
    await writeFileIfChanged(destHtml, pageHtml, incremental);
  }));
  return { reused };
}

async function dependenciesMatch(dependencies, docsRoot) {
  if (!Array.isArray(dependencies)) return false;
  if (!dependencies.length) return true;
  const root = path.resolve(docsRoot, '_reusables');
  try {
    const realRoot = await fs.realpath(root);
    for (const dep of dependencies) {
      if (!dep || typeof dep.path !== 'string' || typeof dep.hash !== 'string'
        || !dep.path.startsWith(root + path.sep)) return false;
      const realTarget = await fs.realpath(dep.path);
      if (!realTarget.startsWith(realRoot + path.sep)) return false;
      if (contentHash(await fs.readFile(dep.path, 'utf8')) !== dep.hash) return false;
    }
    return true;
  } catch (error) {
    if (['ENOENT', 'ENOTDIR', 'ELOOP'].includes(error.code)) return false;
    throw error;
  }
}

let parserFingerprintPromise;
function getParserFingerprint() {
  if (!parserFingerprintPromise) {
    parserFingerprintPromise = (async () => {
      const files = ['markdown.js', 'preprocess.js', 'frontmatter.js', 'unified.js', 'mdx-bridge.js', 'asciidoc-table.js', 'highlighter.js'];
      const plugins = await fs.readdir(new URL('./plugins/', import.meta.url));
      files.push(...plugins.filter(file => file.endsWith('.js')).sort().map(file => `plugins/${file}`));
      const contents = await Promise.all(files.map(file => fs.readFile(new URL(`./${file}`, import.meta.url), 'utf8')));
      return contentHash(contents.join('\0'));
    })();
  }
  return parserFingerprintPromise;
}

export async function parsePageWithCache({ id, mdPath, raw, parseOpts, incremental }) {
  if (incremental && !parseOpts.readFile && !parseOpts.pathExists && parseOpts.strictFsSafety !== false && !parseOpts.onDependencyRead) {
    const key = pageCacheKey({
      raw,
      docsRoot: parseOpts.docsRoot,
      pagePath: parseOpts.pagePath,
      globalAttributes: parseOpts.globalAttributes,
      versionSlug: parseOpts.versionSlug,
      parserFingerprint: await getParserFingerprint(),
    });
    const cached = await readPageCache(key);
    if (cached?.cacheVersion === 1 && cached.meta && typeof cached.meta === 'object'
      && typeof cached.html === 'string' && typeof cached.preprocessedMarkdown === 'string'
      && await dependenciesMatch(cached.dependencies, parseOpts.docsRoot)) {
      return { id, meta: cached.meta, html: cached.html, preprocessedMarkdown: cached.preprocessedMarkdown };
    }
    const snapshots = new Map();
    const parsed = await parseDoc(raw, {
      ...parseOpts,
      onDependencyRead(file, content) {
        const hash = contentHash(content);
        if (snapshots.has(file) && snapshots.get(file) !== hash) snapshots.set(file, null);
        else if (!snapshots.has(file)) snapshots.set(file, hash);
      },
    });
    if ([...snapshots.values()].every(Boolean)) {
      await writePageCache(key, {
        cacheVersion: 1,
        dependencies: [...snapshots].map(([file, hash]) => ({ path: file, hash })),
        meta: parsed.meta,
        html: parsed.html,
        preprocessedMarkdown: parsed.preprocessedMarkdown,
      });
    }
    return { id, ...parsed };
  }
  const parsed = await parseDoc(raw, parseOpts);
  return { id, ...parsed };
}

export function getOgImagePath(buildOptions, meta, id) {
  if (!isOgImageEnabled(buildOptions, meta)) return null;
  const safeId = id.replace(/\//g, '--');
  return `og/${safeId}.png`;
}

export { ogColorsFromTheme };
