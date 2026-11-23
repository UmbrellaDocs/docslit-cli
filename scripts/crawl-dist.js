#!/usr/bin/env node
/**
 * Crawl a built docslit site the way a search engine does: resolve every
 * <a href> in every HTML file against that page's URL and report targets that
 * do not exist in the output folder.
 *
 *   node scripts/crawl-dist.js dist [--base /docs] [--file]
 *
 * --base   the basePath the site is served under (default "/")
 * --file   resolve as file:// URLs (offline builds): no pretty URLs, no index fallback
 *
 * Pages are crawled at their pretty URL (/guide/setup for guide/setup.html), as
 * static hosts serve them, and also at the .html URL (static hosts and offline
 * builds expose both). Pretty URLs resolve to <path>.html, <path>/index.html or
 * the exact file. External links, fragments, mailto: and javascript: are skipped.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ORIGIN = 'https://crawl.invalid';

function walkHtml(dir, rel = '') {
  const out = [];
  for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) {
      if (e.name === 'vendor' || e.name === 'functions' || e.name === 'node_modules') continue;
      out.push(...walkHtml(dir, r));
    } else if (e.name.endsWith('.html')) out.push(r);
  }
  return out;
}

function hrefsOf(html) {
  // Ignore <template> and <script> bodies: they hold client-side markup, not crawlable links.
  const body = html.replace(/<script\b[\s\S]*?<\/script>/gi, '').replace(/<template\b[\s\S]*?<\/template>/gi, '');
  const out = [];
  for (const m of body.matchAll(/<a\b[^>]*?\shref\s*=\s*("([^"]*)"|'([^']*)')/gi)) {
    out.push((m[2] ?? m[3]).replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"'));
  }
  const base = /<base\b[^>]*\shref\s*=\s*"([^"]*)"/i.exec(body)?.[1] ?? null;
  return { hrefs: out, base };
}

function skip(href) {
  return !href || href.startsWith('#') || /^(mailto|tel|javascript|data):/i.test(href);
}

/** Does a site path (no basePath, no leading slash) exist in dist? */
function existsHttp(dist, rel) {
  const clean = decodeURIComponent(rel).replace(/\/+$/, '');
  const candidates = clean === '' ? ['index.html'] : [clean, `${clean}.html`, `${clean}/index.html`];
  return candidates.some((c) => {
    const p = path.join(dist, c);
    return fs.existsSync(p) && fs.statSync(p).isFile();
  });
}

export function crawlDist(dist, { base = '/', file = false } = {}) {
  dist = path.resolve(dist);
  const basePath = '/' + base.replace(/^\/+|\/+$/g, '');
  const prefix = basePath === '/' ? '' : basePath;
  const broken = [];
  let checked = 0;

  for (const rel of walkHtml(dist)) {
    const html = fs.readFileSync(path.join(dist, rel), 'utf8');
    const { hrefs, base: baseHref } = hrefsOf(html);
    // URLs a crawler can reach this page at.
    const pageUrls = [];
    if (file) pageUrls.push(pathToFileURL(path.join(dist, rel)).href);
    else {
      pageUrls.push(`${ORIGIN}${prefix}/${rel}`);
      if (rel === 'index.html') pageUrls.push(`${ORIGIN}${prefix}/`);
      else if (rel.endsWith('/index.html')) pageUrls.push(`${ORIGIN}${prefix}/${rel.slice(0, -'index.html'.length)}`);
      else pageUrls.push(`${ORIGIN}${prefix}/${rel.slice(0, -'.html'.length)}`);
    }
    for (const pageUrl of pageUrls) {
      const docBase = baseHref ? new URL(baseHref, pageUrl).href : pageUrl;
      for (const href of hrefs) {
        if (skip(href)) continue;
        let u;
        try { u = new URL(href, docBase); } catch { broken.push({ page: pageUrl, href, target: '(invalid URL)' }); continue; }
        if (file) {
          if (u.protocol !== 'file:') continue;
          checked++;
          const p = fileURLToPath(u);
          if (!(fs.existsSync(p) && fs.statSync(p).isFile())) broken.push({ page: pageUrl, href, target: p });
          continue;
        }
        if (u.origin !== ORIGIN) continue;
        checked++;
        if (prefix && u.pathname !== prefix && !u.pathname.startsWith(prefix + '/')) {
          broken.push({ page: pageUrl, href, target: u.pathname + ' (outside basePath)' });
          continue;
        }
        const siteRel = u.pathname.slice(prefix.length).replace(/^\/+/, '');
        if (!existsHttp(dist, siteRel)) broken.push({ page: pageUrl, href, target: u.pathname });
      }
    }
  }
  return { broken, checked };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const dist = args.find((a) => !a.startsWith('--')) || 'dist';
  const bi = args.indexOf('--base');
  const { broken, checked } = crawlDist(dist, { base: bi >= 0 ? args[bi + 1] : '/', file: args.includes('--file') });
  for (const b of broken) console.log(`BROKEN  ${b.page}  ->  ${b.href}  (${b.target})`);
  console.log(`${checked} links checked, ${broken.length} broken`);
  process.exit(broken.length ? 1 : 0);
}
