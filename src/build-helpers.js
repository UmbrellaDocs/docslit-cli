/**
 * Shared helpers for the static build pipeline.
 */
import path from 'path';
import fs from 'fs-extra';
import { getOpenAPIConfig } from './config.js';
import { parseDoc } from './markdown.js';
import { buildStylesFile, buildComponentsFile, buildAppFile } from './template.js';
import { generateOgImages, ogColorsFromTheme } from './og-image.js';
import { isOgImageEnabled } from './build-options.js';
import { pageCacheKey, readPageCache, writePageCache } from './build-cache.js';

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

export async function writeSharedAssets(outDir, { minify, siteTheme }) {
  const [css, js, app] = await Promise.all([
    buildStylesFile({ minify, siteTheme }),
    buildComponentsFile('static', { minify }),
    buildAppFile('static', { minify }),
  ]);
  await Promise.all([
    fs.writeFile(path.join(outDir, 'docslit.css'), css),
    fs.writeFile(path.join(outDir, 'docslit.js'), js),
    fs.writeFile(path.join(outDir, 'docslit-app.js'), app),
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

export async function generateOgImagesForPages(jobs, { incremental = false } = {}) {
  if (!jobs.length) return 0;
  const count = await generateOgImages(jobs, { incremental });
  return count;
}

export async function writePageHtmlBatch(entries, renderPageFn) {
  await Promise.all(entries.map(async ([id, data]) => {
    const pageHtml = await renderPageFn(id, data);
    const destHtml = data.destHtml;
    await fs.ensureDir(path.dirname(destHtml));
    await fs.writeFile(destHtml, pageHtml);
  }));
}

export async function parsePageWithCache({ id, mdPath, raw, parseOpts, incremental }) {
  if (incremental) {
    const key = pageCacheKey({
      raw,
      docsRoot: parseOpts.docsRoot,
      pagePath: parseOpts.pagePath,
      globalAttributes: parseOpts.globalAttributes,
    });
    const cached = await readPageCache(key);
    if (cached) return { id, ...cached };
    const parsed = await parseDoc(raw, parseOpts);
    await writePageCache(key, {
      meta: parsed.meta,
      html: parsed.html,
      preprocessedMarkdown: parsed.preprocessedMarkdown,
    });
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
