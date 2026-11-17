/**
 * Build-time Open Graph / Twitter card images (SVG → PNG via @resvg/resvg-js).
 */
import path from 'path';
import fs from 'node:fs/promises';
import { ensureDir, writeFileIfChanged } from './fs-helpers.js';
import { renderSvgToPng } from './og-image-pool.js';
import {
  ogImageCacheKey,
  readOgImageCache,
  writeOgImageCache,
} from './build-cache.js';

function escXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function wrapTitle(title, maxLen = 42) {
  const words = String(title || '').split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > maxLen && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = (cur + ' ' + w).trim();
    }
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 3);
}

export function buildOgSvg({ title, siteName, colors = {} }) {
  const bg = colors.bg || '#0f172a';
  const accent = colors.accent || '#38bdf8';
  const fg = colors.fg || '#f8fafc';
  const muted = colors.muted || '#94a3b8';
  const lines = wrapTitle(title);
  const titleTspans = lines.map((line, i) =>
    `<tspan x="80" dy="${i === 0 ? 0 : 52}">${escXml(line)}</tspan>`
  ).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${escXml(bg)}"/>
      <stop offset="100%" stop-color="${escXml(accent)}" stop-opacity="0.35"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#g)"/>
  <rect x="0" y="0" width="16" height="630" fill="${escXml(accent)}"/>
  <text x="80" y="200" fill="${escXml(fg)}" font-family="system-ui,Segoe UI,sans-serif" font-size="48" font-weight="700">${titleTspans}</text>
  <text x="80" y="560" fill="${escXml(muted)}" font-family="system-ui,Segoe UI,sans-serif" font-size="28" font-weight="600">${escXml(siteName)}</text>
</svg>`;
}

async function renderAndWrite({ title, siteName, colors, outFile, incremental = false }) {
  const svg = buildOgSvg({ title, siteName, colors });
  await ensureDir(path.dirname(outFile));

  if (incremental) {
    const cacheKey = ogImageCacheKey({ title, siteName, colors });
    const cached = await readOgImageCache(cacheKey);
    if (cached) {
      await writeFileIfChanged(outFile, cached, true);
      return true;
    }
    try {
      const png = await renderSvgToPng(svg);
      await fs.writeFile(outFile, png);
      await writeOgImageCache(cacheKey, png);
      return true;
    } catch {
      await fs.writeFile(outFile.replace(/\.png$/, '.svg'), svg);
      return false;
    }
  }

  try {
    const png = await renderSvgToPng(svg);
    await fs.writeFile(outFile, png);
    return true;
  } catch {
    await fs.writeFile(outFile.replace(/\.png$/, '.svg'), svg);
    return false;
  }
}

export async function generateOgImage({ title, siteName, colors, outFile, incremental = false }) {
  return renderAndWrite({ title, siteName, colors, outFile, incremental });
}

/**
 * Batch-generate OG images using the worker pool.
 * @param {Array<{ title, siteName, colors, outFile }>} jobs
 * @param {{ incremental?: boolean }} opts
 * @returns {Promise<number>} count of successfully rendered PNGs
 */
export async function generateOgImages(jobs, { incremental = false } = {}) {
  if (!jobs.length) return 0;
  let count = 0;
  await Promise.all(jobs.map(async (job) => {
    const ok = await renderAndWrite({ ...job, incremental });
    if (ok) count++;
  }));
  return count;
}

export { shutdownOgImagePool } from './og-image-pool.js';

export function ogColorsFromTheme(siteTheme) {
  const colors = siteTheme?.colors || siteTheme?.light || {};
  return {
    bg: colors['--dl-bg'] || colors.bg || '#0f172a',
    accent: colors['--dl-accent'] || colors.accent || colors.primary || '#38bdf8',
    fg: colors['--dl-text'] || colors.text || '#f8fafc',
    muted: colors['--dl-text-muted'] || colors.muted || '#94a3b8',
  };
}
