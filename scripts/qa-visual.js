#!/usr/bin/env node
/**
 * qa-visual: automated visual/accessibility sweep for a BUILT DocsLit site.
 *
 * Needs Playwright (not a dependency of docslit; install it yourself, locally or
 * globally: `npm i -D playwright && npx playwright install chromium`). A global
 * install is found automatically. Not part of `npm test`.
 *
 * Usage
 *   docslit build --out dist
 *   node scripts/qa-visual.js dist [options]
 *
 * Options
 *   --pages a,b,c      Page paths to visit ("/" and "/quickstart"). Default: "/" plus
 *                      the first --max-pages internal links found in the sidebar.
 *   --max-pages <n>    How many sidebar pages to auto-pick (default 5)
 *   --widths 1440,1100,820,390   Viewport widths (default those four)
 *   --modes light,dark           Colour modes (default both). The mode is applied the
 *                                way the site does: localStorage["docslit-theme"] + colorScheme.
 *   --out <dir>        Report directory (default: ./qa-report)
 *   --label <name>     Name used for screenshots/contact sheet (default: basename of the site dir)
 *   --no-shots         Do not write screenshots / contact sheets
 *   --no-states        Skip the interactive states (mobile drawer, search dialog, nav dropdown)
 *   --full             Full-page screenshots instead of the viewport
 *   --json             Print the JSON report to stdout instead of the summary
 *
 * What it records per page x width x mode (written to <out>/report.json):
 *   console    console.error + page errors + failed requests (external hosts are tagged
 *              "external": fonts/CDNs fail in an offline sandbox and are not counted)
 *   overflow   horizontal page overflow (scrollWidth > clientWidth) and elements that
 *              stick out of the viewport or their container (shadow DOM included)
 *   contrast   WCAG contrast of every visible text node against its effective
 *              background (axe-like: composites ancestor backgrounds, alpha and opacity;
 *              skips text over images and gradient-clipped text). AA: 4.5, large text 3
 *   focus      Tabs through the first 15 focusable elements (1440 + 390 only) and checks
 *              each shows a visible focus indicator (outline, box-shadow or a style change)
 * Exit code is 0 always; read the summary / report.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

const argv = process.argv.slice(2);
const flags = {};
const pos = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) {
    const k = a.slice(2);
    if (['no-shots', 'full', 'json', 'no-states'].includes(k)) flags[k] = true;
    else flags[k] = argv[++i];
  } else pos.push(a);
}
if (!pos[0] || flags.help) {
  console.error('usage: node scripts/qa-visual.js <built-site-dir> [--pages a,b] [--widths 1440,390] [--modes light,dark] [--out dir] [--label name] [--no-shots] [--full] [--json]');
  process.exit(pos[0] ? 0 : 2);
}
const SITE = path.resolve(pos[0]);
const OUT = path.resolve(flags.out || 'qa-report');
const LABEL = flags.label || path.basename(SITE);
const WIDTHS = (flags.widths || '1440,1100,820,390').split(',').map(Number);
const MODES = (flags.modes || 'light,dark').split(',');
const MAX_PAGES = Number(flags['max-pages'] || 5);

function loadPlaywright() {
  const req = createRequire(import.meta.url);
  try { return req('playwright'); } catch {}
  try {
    const root = execSync('npm root -g', { encoding: 'utf8' }).trim();
    return createRequire(path.join(root, 'x.js'))('playwright');
  } catch {}
  console.error('Playwright not found. Install it (npm i -D playwright && npx playwright install chromium).');
  process.exit(2);
}
const { chromium } = loadPlaywright();

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain', '.md': 'text/markdown', '.xml': 'application/xml', '.mp4': 'video/mp4' };
function serve(root) {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const cands = [p, p + '.html', path.join(p, 'index.html')];
    for (const c of cands) {
      const f = path.join(root, c);
      if (f.startsWith(root) && fs.existsSync(f) && fs.statSync(f).isFile()) {
        res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
        return fs.createReadStream(f).pipe(res);
      }
    }
    const nf = path.join(root, '404.html');
    res.writeHead(404, { 'content-type': 'text/html' });
    res.end(fs.existsSync(nf) ? fs.readFileSync(nf) : 'not found');
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r(server)));
}

// Everything below runs inside the page.
function pageSampler() {
  const out = { contrast: [], overflow: [], pageOverflow: null };
  const cv = document.createElement('canvas'); cv.width = cv.height = 1;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  const cache = new Map();
  function parse(c) {
    if (cache.has(c)) return cache.get(c);
    cx.clearRect(0, 0, 1, 1);
    cx.fillStyle = '#000'; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1);
    const d = cx.getImageData(0, 0, 1, 1).data;
    const a = d[3] / 255; // getImageData returns straight (un-premultiplied) channels
    const v = a > 0 ? [d[0], d[1], d[2], a] : [0, 0, 0, 0];
    cache.set(c, v); return v;
  }
  const over = (top, bot) => { const a = top[3]; return [top[0] * a + bot[0] * (1 - a), top[1] * a + bot[1] * (1 - a), top[2] * a + bot[2] * (1 - a), 1]; };
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
  const parentOf = (el) => el.parentElement || (el.getRootNode() instanceof ShadowRoot ? el.getRootNode().host : null);
  function sel(el) {
    const parts = [];
    let n = el, k = 0;
    while (n && k < 6) {
      let s = n.tagName ? n.tagName.toLowerCase() : '';
      if (n.id) s += '#' + n.id;
      else if (n.classList && n.classList.length) s += '.' + [...n.classList].slice(0, 2).join('.');
      parts.unshift(s);
      if (n.id) break;
      n = parentOf(n); k++;
    }
    return parts.join(' > ');
  }
  function effectiveBg(el) {
    const layers = [];
    let unknown = false;
    for (let n = el; n; n = parentOf(n)) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage && /url\(/.test(cs.backgroundImage) && !layers.some((l) => l[3] === 1)) { unknown = true; break; }
      const bg = parse(cs.backgroundColor);
      if (bg[3] > 0) { layers.push(bg); if (bg[3] === 1) break; }
    }
    let base = parse(getComputedStyle(document.documentElement).backgroundColor);
    if (base[3] < 1) base = over(base, [255, 255, 255, 1]);
    if (!layers.length || layers[layers.length - 1][3] < 1) layers.push(base);
    let acc = layers[layers.length - 1];
    for (let i = layers.length - 2; i >= 0; i--) acc = over(layers[i], acc);
    return { bg: acc, unknown };
  }
  function cumulativeOpacity(el) { let o = 1; for (let n = el; n; n = parentOf(n)) o *= parseFloat(getComputedStyle(n).opacity || '1'); return o; }
  function visible(el) {
    try { return el.checkVisibility({ checkOpacity: false, checkVisibilityCSS: true, contentVisibilityAuto: true }); } catch { return true; }
  }
  const vw = document.documentElement.clientWidth;
  const seen = new Set();
  function walk(root) {
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let node;
    while ((node = tw.nextNode())) {
      if (node.nodeType === 1) {
        if (node.shadowRoot) walk(node.shadowRoot);
        if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'svg', 'CANVAS'].includes(node.tagName)) { tw.nextSibling && 0; }
        continue;
      }
      const txt = node.nodeValue.trim();
      if (!txt || !/[\p{L}\p{N}]/u.test(txt)) continue; // skip pure punctuation/decoration
      const el = node.parentElement;
      if (!el || ['SCRIPT', 'STYLE', 'NOSCRIPT', 'TITLE'].includes(el.tagName)) continue;
      if (el.closest && el.closest('svg')) continue;
      if (!visible(el)) continue;
      const r = document.createRange(); r.selectNodeContents(node);
      const rect = r.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) continue;
      if (rect.right <= 0 || rect.left >= vw) continue; // off-canvas (closed drawer etc.)
      const cs = getComputedStyle(el);
      if (cs.webkitTextFillColor === 'rgba(0, 0, 0, 0)' || (cs.backgroundClip === 'text')) continue;
      if (el.disabled || (el.closest && el.closest('[disabled],[aria-disabled="true"]'))) continue;
      const { bg, unknown } = effectiveBg(el);
      if (unknown) continue;
      let fg = parse(cs.color);
      const op = cumulativeOpacity(el);
      if (op < 0.9) continue; // mid-fade / dimmed on purpose (disabled, transitions): not a contrast failure
      fg = [fg[0], fg[1], fg[2], fg[3] * op];
      const fgc = over(fg, bg);
      const rt = ratio(fgc, bg);
      const size = parseFloat(cs.fontSize), bold = parseInt(cs.fontWeight, 10) >= 700;
      const large = size >= 24 || (size >= 18.66 && bold);
      const need = large ? 3 : 4.5;
      if (rt < need - 0.01) {
        const key = sel(el) + '|' + fgc.map(Math.round) + '|' + bg.map(Math.round);
        if (seen.has(key)) continue; seen.add(key);
        out.contrast.push({ sel: sel(el), text: txt.slice(0, 40), ratio: +rt.toFixed(2), need, fg: 'rgb(' + fgc.slice(0, 3).map(Math.round) + ')', bg: 'rgb(' + bg.slice(0, 3).map(Math.round) + ')', size });
      }
    }
  }
  walk(document.body);
  // page-level overflow
  const de = document.documentElement;
  if (de.scrollWidth > de.clientWidth + 1) out.pageOverflow = { scrollWidth: de.scrollWidth, clientWidth: de.clientWidth };
  // element overflow
  const oseen = new Set();
  function clipped(el) {
    for (let n = parentOf(el); n && n !== document.documentElement; n = parentOf(n)) {
      const cs = getComputedStyle(n);
      if (cs.overflowX !== 'visible') return true;
    }
    return false;
  }
  function walkEls(root) {
    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot) walkEls(el.shadowRoot);
      if (!visible(el)) continue;
      const cs = getComputedStyle(el);
      if (cs.position === 'fixed' || cs.display === 'contents' || cs.display === 'inline') continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) continue;
      let why = null;
      if (rect.right > vw + 1 && rect.left < vw && !clipped(el)) why = 'past viewport by ' + Math.round(rect.right - vw) + 'px';
      else if (rect.left < -1 && rect.right > 0 && !clipped(el)) why = 'left of viewport by ' + Math.round(-rect.left) + 'px';
      else {
        const p = el.parentElement;
        if (p && cs.position !== 'absolute' && cs.position !== 'fixed') {
          const pcs = getComputedStyle(p);
          if (pcs.overflowX === 'visible' && pcs.display !== 'contents' && !pcs.display.includes('inline')) {
            const pr = p.getBoundingClientRect();
            if (pr.width > 4 && (rect.right > pr.right + 1.5 || rect.left < pr.left - 1.5) && !(pcs.display.includes('flex') && pcs.flexWrap === 'nowrap' && false)) {
              const flexCols = pcs.display.includes('flex') && pcs.flexDirection.startsWith('row');
              why = (flexCols ? 'row overflow ' : 'exceeds parent ') + Math.round(Math.max(rect.right - pr.right, pr.left - rect.left)) + 'px';
            }
          }
        }
      }
      if (why) { const k = sel(el); if (oseen.has(k)) continue; oseen.add(k); out.overflow.push({ sel: k, why, w: Math.round(rect.width) }); }
    }
  }
  walkEls(document);
  out.overflow = out.overflow.slice(0, 25);
  out.contrast = out.contrast.slice(0, 40);
  return out;
}

function focusProbe() {
  const deep = () => { let a = document.activeElement; while (a && a.shadowRoot && a.shadowRoot.activeElement) a = a.shadowRoot.activeElement; return a; };
  const el = deep();
  if (!el || el === document.body) return null;
  const cs = getComputedStyle(el);
  const outline = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0 && cs.outlineColor !== 'rgba(0, 0, 0, 0)';
  const shadow = cs.boxShadow !== 'none';
  const r = el.getBoundingClientRect();
  const parts = []; let n = el; for (let i = 0; i < 4 && n; i++) { parts.unshift(n.tagName.toLowerCase() + (n.id ? '#' + n.id : n.classList && n.classList.length ? '.' + n.classList[0] : '')); n = n.parentElement || (n.getRootNode() instanceof ShadowRoot ? n.getRootNode().host : null); }
  return { sel: parts.join(' > '), outline, shadow, style: [cs.backgroundColor, cs.borderColor, cs.color, cs.textDecorationLine, cs.transform].join('|'), visible: r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight, w: Math.round(r.width) };
}

async function applyMode(ctx, mode) {
  await ctx.addInitScript((m) => { try { localStorage.setItem('docslit-theme', m); } catch {} }, mode);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const shotDir = path.join(OUT, 'shots', LABEL);
  if (!flags['no-shots']) fs.mkdirSync(shotDir, { recursive: true });
  const server = await serve(SITE);
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch();
  const report = { label: LABEL, site: SITE, runs: [], totals: { console: 0, overflow: 0, contrast: 0, focus: 0, pageOverflow: 0, external: 0 } };

  // discover pages
  let pages = flags.pages ? flags.pages.split(',') : null;
  if (!pages) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const pg = await ctx.newPage();
    await pg.goto(base + '/', { waitUntil: 'load' }).catch(() => {});
    const links = await pg.evaluate(() => [...document.querySelectorAll('.sidebar-scroll a.sidebar-item[href]')].map((a) => a.getAttribute('href')));
    pages = ['/'];
    for (const l of links) { if (/^\//.test(l) && !pages.includes(l) && pages.length <= MAX_PAGES) pages.push(l); else if (!/^(https?:|#|mailto:)/.test(l) && !pages.includes('/' + l) && pages.length <= MAX_PAGES) pages.push('/' + l); }
    await ctx.close();
  }
  report.pages = pages;
  const baseHost = new URL(base).host;

  for (const mode of MODES) {
    for (const width of WIDTHS) {
      const height = width <= 480 ? 844 : width <= 900 ? 1100 : 900;
      const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, colorScheme: mode, isMobile: false });
      await applyMode(ctx, mode);
      for (const pagePath of pages) {
        const pg = await ctx.newPage();
        const run = { page: pagePath, width, mode, console: [], external: [], overflow: [], contrast: [], focus: [], focusChecked: 0, pageOverflow: null };
        pg.on('console', (m) => {
          if (m.type() !== 'error') return;
          const t = m.text(); const loc = m.location() && m.location().url;
          if (/Failed to load resource/.test(t)) { // network errors are recorded by the response/requestfailed hooks below (same host) or tagged external
            if (loc && !/^data:/.test(loc) && new URL(loc).host !== baseHost) run.external.push(t.slice(0, 120) + ' ' + loc.slice(0, 80));
            return;
          }
          if (/https?:\/\//.test(t) && !t.includes(baseHost)) { run.external.push(t.slice(0, 120)); return; } // CDN / third-party failures (offline sandbox)
          run.console.push(t.slice(0, 200));
        });
        pg.on('pageerror', (e) => run.console.push('pageerror: ' + String(e.message).slice(0, 200)));
        pg.on('requestfailed', (rq) => { const u = new URL(rq.url()); (u.host === baseHost ? run.console : run.external).push('requestfailed ' + rq.url().slice(0, 120)); });
        pg.on('response', (rs) => { const u = new URL(rs.url()); if (u.host === baseHost && rs.status() >= 400 && !/favicon|\.well-known/.test(u.pathname)) run.console.push(rs.status() + ' ' + u.pathname); });
        try {
          await pg.goto(base + pagePath, { waitUntil: 'load', timeout: 20000 });
          await pg.waitForTimeout(450);
          await pg.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
          const res = await pg.evaluate(pageSampler);
          run.overflow = res.overflow; run.contrast = res.contrast; run.pageOverflow = res.pageOverflow;
          if (!flags['no-shots']) {
            const name = pagePath.replace(/[^\w]+/g, '_').replace(/^_|_$/g, '') || 'index';
            await pg.screenshot({ path: path.join(shotDir, `${name}-${width}-${mode}.png`), fullPage: !!flags.full });
          }
          if ((width === 1440 || width === 390) && pagePath === pages[0] || (width === 1440 && pagePath === pages[1])) {
            await pg.evaluate(() => window.scrollTo(0, 0));
            await pg.mouse.move(0, 0);
            for (let i = 0; i < 15; i++) {
              await pg.keyboard.press('Tab');
              await pg.waitForTimeout(260); // let focus transitions (skip link slide-in) finish
              const f = await pg.evaluate(focusProbe);
              if (!f) continue;
              run.focusChecked++;
              // Hidden-by-design skip links are allowed to be off-screen until focused; they are visible once focused.
              if (!f.visible) { run.focus.push({ sel: f.sel, why: 'focused element not visible in viewport' }); continue; }
              if (!f.outline && !f.shadow && !/skip-link/.test(f.sel)) // the skip link is a filled pill that slides in: its appearance is the indicator
                 run.focus.push({ sel: f.sel, why: 'no outline/box-shadow' + ' (style change unchecked)' });
            }
          }
          // interactive states on the first page: mobile drawer / search dialog / nav dropdown (contrast sampled while open)
          if (pagePath === pages[0] && !flags['no-states']) {
            const states = [];
            if (width <= 1024) states.push(['drawer', async () => { await pg.click('.nav-menu-btn', { timeout: 2000 }); }]);
            states.push(['search', async () => { await pg.click('#search-trigger, .search-trigger', { timeout: 2000 }); await pg.keyboard.type('a'); }]);
            if (width > 1024) states.push(['dropdown', async () => { await pg.click('.nav-dropdown-btn', { timeout: 1500 }); }]);
            for (const [st, act] of states) {
              try {
                await pg.goto(base + pagePath, { waitUntil: 'load', timeout: 20000 });
                await pg.waitForTimeout(350);
                await act();
                await pg.waitForTimeout(450);
                const r2 = await pg.evaluate(pageSampler);
                for (const c of r2.contrast) run.contrast.push({ ...c, state: st });
                for (const o of r2.overflow) run.overflow.push({ ...o, state: st });
                if (!flags['no-shots']) await pg.screenshot({ path: path.join(shotDir, `state-${st}-${width}-${mode}.png`) });
              } catch { /* state not available on this site (no dropdown, no tabs...) */ }
            }
          }
        } catch (e) {
          run.console.push('navigation: ' + e.message.slice(0, 160));
        }
        await pg.close();
        report.runs.push(run);
        report.totals.console += run.console.length; report.totals.external += run.external.length;
        report.totals.overflow += run.overflow.length; report.totals.contrast += run.contrast.length;
        report.totals.focus += run.focus.length; report.totals.focusChecked = (report.totals.focusChecked || 0) + run.focusChecked; report.totals.pageOverflow += run.pageOverflow ? 1 : 0;
      }
      await ctx.close();
    }
  }

  // contact sheet(s): one per page, widths x modes
  if (!flags['no-shots']) {
    const ctx = await browser.newContext({ viewport: { width: 1800, height: 1000 } });
    for (const pagePath of pages) {
      const name = pagePath.replace(/[^\w]+/g, '_').replace(/^_|_$/g, '') || 'index';
      const tiles = [];
      for (const mode of MODES) for (const w of WIDTHS) {
        const f = path.join(shotDir, `${name}-${w}-${mode}.png`);
        if (fs.existsSync(f)) tiles.push({ w, mode, src: 'data:image/png;base64,' + fs.readFileSync(f).toString('base64') });
      }
      const html = `<body style="margin:0;background:#888;font:12px sans-serif;color:#fff"><div style="display:flex;flex-wrap:wrap;gap:8px;padding:8px">${tiles.map((t) => `<figure style="margin:0"><figcaption>${LABEL} ${pagePath} ${t.w}px ${t.mode}</figcaption><img src="${t.src}" style="width:${t.w >= 1100 ? 880 : t.w >= 800 ? 520 : 240}px;display:block;border:1px solid #000"></figure>`).join('')}</div></body>`;
      const pg = await ctx.newPage();
      await pg.setContent(html);
      await pg.waitForTimeout(150);
      await pg.screenshot({ path: path.join(shotDir, `sheet-${name}.png`), fullPage: true });
      await pg.close();
    }
    await ctx.close();
  }
  await browser.close();
  server.close();
  fs.writeFileSync(path.join(OUT, `report-${LABEL}.json`), JSON.stringify(report, null, 2));
  if (flags.json) return console.log(JSON.stringify(report, null, 2));
  const t = report.totals;
  console.log(`${LABEL}: ${report.runs.length} runs | console ${t.console} | page-overflow ${t.pageOverflow} | element-overflow ${t.overflow} | contrast ${t.contrast} | focus ${t.focus}/${t.focusChecked || 0} | external-failed ${t.external}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
