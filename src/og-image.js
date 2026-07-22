/**
 * Build-time Open Graph / Twitter card images (SVG → PNG via @resvg/resvg-js).
 */
import path from 'path';
import fs from 'fs-extra';

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

export async function generateOgImage({ title, siteName, colors, outFile }) {
  const svg = buildOgSvg({ title, siteName, colors });
  await fs.ensureDir(path.dirname(outFile));
  try {
    const { Resvg } = await import('@resvg/resvg-js');
    const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } });
    const png = resvg.render().asPng();
    await fs.writeFile(outFile, png);
    return true;
  } catch {
    await fs.writeFile(outFile.replace(/\.png$/, '.svg'), svg);
    return false;
  }
}

export function ogColorsFromTheme(siteTheme) {
  const colors = siteTheme?.colors || siteTheme?.light || {};
  return {
    bg: colors['--dl-bg'] || colors.bg || '#0f172a',
    accent: colors['--dl-accent'] || colors.accent || colors.primary || '#38bdf8',
    fg: colors['--dl-text'] || colors.text || '#f8fafc',
    muted: colors['--dl-text-muted'] || colors.muted || '#94a3b8',
  };
}
