/**
 * Site and frontmatter redirect generation for static hosts.
 */
import path from 'path';
import fs from 'fs-extra';

function normalizeFrom(p) {
  let s = String(p || '').trim();
  if (!s.startsWith('/')) s = '/' + s;
  return s.replace(/\/+$/, '') || '/';
}

function normalizeTo(p, basePath = '') {
  if (/^https?:\/\//i.test(p)) return p;
  let s = String(p || '').trim();
  if (!s.startsWith('/')) s = '/' + s;
  const base = basePath && basePath !== '/' ? basePath.replace(/\/+$/, '') : '';
  if (base && !s.startsWith(base + '/') && s !== base) return base + s;
  return s;
}

export function collectRedirects(config, pagesData = {}, basePath = '') {
  const map = new Map();
  const site = config.redirects && typeof config.redirects === 'object' ? config.redirects : {};
  for (const [from, to] of Object.entries(site)) {
    map.set(normalizeFrom(from), normalizeTo(to, basePath));
  }
  for (const [id, page] of Object.entries(pagesData)) {
    const target = page?.meta?.redirect;
    if (typeof target === 'string' && target) {
      map.set(normalizeFrom('/' + id), normalizeTo(target, basePath));
    }
  }
  return [...map.entries()].map(([from, to]) => ({ from, to }));
}

function stubHtml(to) {
  const esc = String(to).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="refresh" content="0;url=${esc}">
  <link rel="canonical" href="${esc}">
  <title>Redirecting…</title>
  <script>location.replace(${JSON.stringify(to)});</script>
</head>
<body>
  <p>Redirecting to <a href="${esc}">${esc}</a>…</p>
</body>
</html>
`;
}

export async function writeRedirectArtifacts({ redirects, outDir, basePath = '' }) {
  if (!redirects.length) return { stubs: 0 };

  const netlify = [];
  const vercelRedirects = [];
  let stubs = 0;

  for (const { from, to } of redirects) {
    const fromPath = from === '/' ? '/index' : from;
    const rel = fromPath.replace(/^\//, '') + '.html';
    const dest = path.join(outDir, rel);
    await fs.ensureDir(path.dirname(dest));
    await fs.writeFile(dest, stubHtml(to));
    stubs++;

    const fromNetlify = basePath ? (basePath + from).replace(/\/+/g, '/') : from;
    netlify.push(`${fromNetlify}  ${to}  301`);
    vercelRedirects.push({ source: fromNetlify, destination: to, permanent: true });
  }

  const redirectsPath = path.join(outDir, '_redirects');
  let existing = '';
  if (await fs.pathExists(redirectsPath)) {
    existing = await fs.readFile(redirectsPath, 'utf8');
    if (existing && !existing.endsWith('\n')) existing += '\n';
  }
  await fs.writeFile(redirectsPath, existing + netlify.join('\n') + (netlify.length ? '\n' : ''));

  const vercelPath = path.join(outDir, 'vercel.json');
  let vercel = {};
  if (await fs.pathExists(vercelPath)) {
    try { vercel = JSON.parse(await fs.readFile(vercelPath, 'utf8')); } catch { vercel = {}; }
  }
  vercel.redirects = [...(vercel.redirects || []), ...vercelRedirects];
  await fs.writeFile(vercelPath, JSON.stringify(vercel, null, 2) + '\n');

  return { stubs };
}
