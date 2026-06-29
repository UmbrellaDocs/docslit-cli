import path from 'path';
import fs from 'fs-extra';
import http from 'node:http';
import pc from 'picocolors';
import express from 'express';
import { PDFDocument } from 'pdf-lib';
import { collectPageIds, toLabel } from './sidebar.js';

const PDF_MARGINS = { top: '1.5cm', right: '2cm', bottom: '1.5cm', left: '2cm' };

export function slugifyChapterId(title) {
  return String(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'chapter';
}

export function pdfPageFileName(id) {
  return id.replace(/\//g, '--');
}

export function resolvePdfOptions(config, { pdf = false, noPdf = false, pdfDir = null } = {}) {
  const raw = config.pdf || {};
  let enabled = raw.enabled === true;
  if (pdf) enabled = true;
  if (noPdf) enabled = false;

  const include = raw.include || {};
  return {
    enabled,
    strategy: raw.strategy || 'sidebar-groups',
    outputDir: pdfDir || raw.outputDir || 'pdf',
    include: {
      pages: include.pages !== false,
      chapters: include.chapters !== false,
      fullManual: include.fullManual !== false,
      apiReference: include.apiReference === true,
    },
    ignore: new Set(raw.ignore || []),
    manual: Array.isArray(raw.manual) ? raw.manual : [],
  };
}

function isApiPageId(id) {
  return id.startsWith('api/');
}

function filterPages(pageIds, pagesData, options) {
  const ignore = options.ignore;
  const includeApi = options.include.apiReference;
  return pageIds.filter((id) => {
    if (!pagesData[id]) return false;
    if (ignore.has(id)) return false;
    if (isApiPageId(id) && !includeApi) return false;
    return true;
  });
}

function chaptersFromSidebarGroups(config, pagesData, options) {
  const chapters = [];
  const usedIds = new Set();

  for (const group of config.sidebar || []) {
    const title = group.group || 'Docs';
    let baseId = group.id ? String(group.id) : slugifyChapterId(title);
    if (usedIds.has(baseId)) {
      let n = 2;
      while (usedIds.has(`${baseId}-${n}`)) n++;
      baseId = `${baseId}-${n}`;
    }
    usedIds.add(baseId);

    const pages = filterPages(collectPageIds(group.pages), pagesData, options);
    if (!pages.length) continue;
    chapters.push({ id: baseId, title, pages });
  }
  return chapters;
}

function chaptersFromFolders(pagesData, options) {
  const groups = new Map();
  for (const id of Object.keys(pagesData)) {
    if (options.ignore.has(id)) continue;
    if (isApiPageId(id) && !options.include.apiReference) continue;
    const segment = id.includes('/') ? id.split('/')[0] : 'docs';
    if (!groups.has(segment)) groups.set(segment, []);
    groups.get(segment).push(id);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([segment, pages]) => ({
      id: slugifyChapterId(segment),
      title: toLabel(segment),
      pages: pages.sort(),
    }));
}

function chaptersFromManual(manual, pagesData, options) {
  const chapters = [];
  for (const entry of manual) {
    if (!entry || !entry.id || !Array.isArray(entry.pages)) continue;
    const pages = filterPages(entry.pages, pagesData, options);
    if (!pages.length) continue;
    chapters.push({
      id: String(entry.id),
      title: entry.title || toLabel(entry.id),
      pages,
    });
  }
  return chapters;
}

export function getChapterManifest(config, pagesData, options) {
  let chapters;
  if (options.strategy === 'manual') {
    chapters = chaptersFromManual(options.manual, pagesData, options);
  } else if (options.strategy === 'folders') {
    chapters = chaptersFromFolders(pagesData, options);
  } else {
    chapters = chaptersFromSidebarGroups(config, pagesData, options);
  }

  const pageToChapter = {};
  for (const ch of chapters) {
    for (const pageId of ch.pages) {
      pageToChapter[pageId] = ch.id;
    }
  }

  return { chapters, pageToChapter };
}

export function buildPdfManifest({ options, chapters, pageToChapter, pagesData }) {
  const base = `${options.outputDir.replace(/\\/g, '/')}/`;
  const manifest = {
    base,
    pages: {},
    chapters: [],
    pageToChapter,
    fullManual: null,
  };

  if (options.include.pages) {
    for (const id of Object.keys(pagesData)) {
      if (options.ignore.has(id)) continue;
      const file = `${base}pages/${pdfPageFileName(id)}.pdf`;
      manifest.pages[id] = file;
    }
  }

  if (options.include.chapters) {
    manifest.chapters = chapters.map((ch) => ({
      id: ch.id,
      title: ch.title,
      file: `${base}${ch.id}.pdf`,
      pages: ch.pages,
    }));
  }

  if (options.include.fullManual && chapters.length) {
    manifest.fullManual = { file: `${base}full-manual.pdf` };
  }

  return manifest;
}

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    console.error(`\n  ${pc.red('Error:')} PDF generation requires Playwright in your project:\n`);
    console.error(`    ${pc.cyan('npm install -D playwright')}`);
    console.error(`    ${pc.cyan('npx playwright install chromium')}`);
    console.error(`\n  Then re-run: ${pc.cyan('docslit build --pdf')}\n`);
    process.exit(1);
  }
}

function startStaticServer(outDir) {
  const app = express();
  app.use(express.static(outDir, { extensions: ['html'] }));
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

function elapsed(start) {
  return `${((performance.now() - start) / 1000).toFixed(1)}s`;
}

async function pdfFromUrl(page, url, destPath, label) {
  const t0 = performance.now();
  process.stdout.write(`    ${pc.dim('→')} ${label}: navigating...`);
  await page.goto(url, { waitUntil: 'load', timeout: 30_000 });
  await page.waitForTimeout(500);
  process.stdout.write(` rendering...`);
  await page.pdf({
    path: destPath,
    format: 'A4',
    printBackground: true,
    margin: PDF_MARGINS,
  });
  const stat = await fs.stat(destPath);
  process.stdout.write(` ${pc.green('done')} ${formatBytes(stat.size)} (${elapsed(t0)})\n`);
  return stat.size;
}

function formatBytes(b) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

async function mergePdfs(inputPaths, outputPath, label) {
  const t0 = performance.now();
  process.stdout.write(`    ${pc.dim('→')} ${label}: merging ${inputPaths.length} PDFs...`);
  const merged = await PDFDocument.create();
  for (const inputPath of inputPaths) {
    const bytes = await fs.readFile(inputPath);
    const doc = await PDFDocument.load(bytes);
    const pages = await merged.copyPages(doc, doc.getPageIndices());
    for (const p of pages) merged.addPage(p);
  }
  const pdfBytes = await merged.save();
  await fs.writeFile(outputPath, pdfBytes);
  process.stdout.write(` ${pc.green('done')} ${formatBytes(pdfBytes.length)} (${elapsed(t0)})\n`);
  return pdfBytes.length;
}

export async function generatePdfs({ outDir, config, pagesData, pdfOptions }) {
  if (!pdfOptions.enabled) return null;
  const t0 = performance.now();

  const pdfRoot = path.join(outDir, pdfOptions.outputDir);
  const pagesDir = path.join(pdfRoot, 'pages');
  await fs.ensureDir(pagesDir);

  const { chapters, pageToChapter } = getChapterManifest(config, pagesData, pdfOptions);
  const manifest = buildPdfManifest({
    options: pdfOptions,
    chapters,
    pageToChapter,
    pagesData,
  });

  const allPageIds = Object.keys(pagesData).filter((id) => {
    if (pdfOptions.ignore.has(id)) return false;
    if (isApiPageId(id) && !pdfOptions.include.apiReference) return false;
    return true;
  });

  const pageJobs = allPageIds.map((id) => ({
    id,
    label: `page: ${id}`,
    urlPath: `${id}.html`,
    dest: path.join(pagesDir, `${pdfPageFileName(id)}.pdf`),
  }));

  console.log(`\n  ${pc.bold('PDF')} generating ${pageJobs.length} page PDF${pageJobs.length !== 1 ? 's' : ''}...`);

  const tServer = performance.now();
  process.stdout.write(`    ${pc.dim('→')} starting local server...`);
  const { server, baseUrl } = await startStaticServer(outDir);
  console.log(` ${pc.green('ready')} at ${baseUrl} (${elapsed(tServer)})`);

  const tBrowser = performance.now();
  process.stdout.write(`    ${pc.dim('→')} launching browser...`);
  const playwright = await loadPlaywright();
  const browser = await playwright.chromium.launch({ headless: true });
  const context = await browser.newContext({ colorScheme: 'light' });
  const page = await context.newPage();
  console.log(` ${pc.green('ready')} (${elapsed(tBrowser)})`);

  let totalBytes = 0;
  try {
    for (const job of pageJobs) {
      const size = await pdfFromUrl(page, `${baseUrl}/${job.urlPath}`, job.dest, job.label);
      totalBytes += size;
    }
  } finally {
    process.stdout.write(`    ${pc.dim('→')} closing browser & server...`);
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
    console.log(` ${pc.green('done')}`);
  }

  let chapterCount = 0;
  if (pdfOptions.include.chapters && chapters.length) {
    console.log(`\n  ${pc.bold('PDF')} merging chapter PDFs...`);
    for (const chapter of chapters) {
      const inputPaths = chapter.pages.map(
        (pageId) => path.join(pagesDir, `${pdfPageFileName(pageId)}.pdf`)
      );
      const outputPath = path.join(pdfRoot, `${chapter.id}.pdf`);
      const size = await mergePdfs(inputPaths, outputPath, `chapter: ${chapter.title}`);
      totalBytes += size;
      chapterCount++;
    }
  }

  if (pdfOptions.include.fullManual && chapters.length) {
    console.log(`\n  ${pc.bold('PDF')} merging full docs...`);
    const allChapterPageIds = [...new Set(chapters.flatMap((ch) => ch.pages))];
    const inputPaths = allChapterPageIds.map(
      (pageId) => path.join(pagesDir, `${pdfPageFileName(pageId)}.pdf`)
    );
    const outputPath = path.join(pdfRoot, 'full-manual.pdf');
    const size = await mergePdfs(inputPaths, outputPath, 'full docs');
    totalBytes += size;
  }

  if (!pdfOptions.include.pages) {
    await fs.remove(pagesDir);
  }

  await fs.writeFile(path.join(pdfRoot, 'manifest.json'), JSON.stringify(manifest, null, 2));

  const parts = [];
  if (chapterCount) parts.push(`${chapterCount} chapter${chapterCount !== 1 ? 's' : ''}`);
  if (pdfOptions.include.pages) parts.push(`${pageJobs.length} page${pageJobs.length !== 1 ? 's' : ''}`);
  if (manifest.fullManual) parts.push('full docs');
  console.log(`  ${pc.green('✓')} PDF: ${parts.join(', ')} — ${formatBytes(totalBytes)} total (${elapsed(t0)})`);

  return manifest;
}
