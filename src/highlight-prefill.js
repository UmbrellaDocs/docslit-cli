// Parallel pre-highlighting.
//
// Syntax highlighting (Shiki, one core) is the largest part of the parse phase
// on code-heavy sites. Before pages are parsed, this scans every page for fenced
// code blocks, highlights the ones not cached yet in worker threads, and puts
// the results in the highlight cache under the same key highlight() uses. The
// page parse then finds them there.
//
// It never changes output: a block the scan does not see (code from an include,
// a hand-written <wc-code-block>) or one a worker could not highlight is simply
// highlighted on the main thread, as before.
//
// DOCSLIT_HIGHLIGHT_WORKERS=0 turns it off; a number sets the worker count.

import os from 'os';
import { Worker } from 'worker_threads';
import { highlightRequest, splitGluedLang } from './plugins/rehype-docslit-code.js';
import { highlightKey, pageGrammars } from './highlight-core.js';
import { isHighlightCached, loadHighlightCache, primeHighlightCache } from './highlighter.js';

const workerUrl = new URL('./workers/highlight-worker.js', import.meta.url);

// Work is estimated as bytes of code plus a fixed cost per language: Shiki compiles a
// grammar's regular expressions on first use, separately in every thread, and that is a
// large share of the cost on small sites (a 76-byte Markdown block can take 100+ ms cold).
export const LANG_COST = 20000;
/** Below this estimated work, starting workers costs more than it saves. */
export const MIN_WORK = 250000;

function estimate(blocks) {
  return new Set(blocks.map((b) => b[1])).size * LANG_COST + blocks.reduce((n, b) => n + b[0].length, 0);
}

const FENCE_OPEN = /^([ \t]*)(`{3,}|~{3,})(.*)$/;

/** Strip up to `n` leading spaces (a fence's own indentation, as CommonMark does). */
function dedent(line, n) {
  let i = 0;
  while (i < n && line[i] === ' ') i++;
  return line.slice(i);
}

/**
 * Fenced code blocks in a Markdown document: [{ code, lang, meta }].
 * Mirrors what the Markdown parser gives the code plugin for ordinary fences
 * (including fences indented inside list items). Fences in blockquotes and
 * fences without a language are skipped: they are rare or never highlighted.
 */
export function collectFences(markdown) {
  const lines = String(markdown).split(/\r?\n/);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const m = FENCE_OPEN.exec(lines[i]);
    if (!m) continue;
    const [, indentStr, fence, infoRaw] = m;
    if (fence[0] === '`' && infoRaw.includes('`')) continue; // not a fence (inline code)
    const indent = indentStr.replace(/\t/g, '    ').length;
    const info = infoRaw.trim();
    const body = [];
    let j = i + 1;
    for (; j < lines.length; j++) {
      const c = lines[j].trim();
      if (c.startsWith(fence[0].repeat(fence.length)) && /^(`{3,}|~{3,})$/.test(c) && c[0] === fence[0]) break;
      body.push(dedent(lines[j], indent));
    }
    i = j;
    if (!info) continue;
    const [first, ...rest] = info.split(/\s+/);
    const { lang, meta } = splitGluedLang(first, rest.join(' '));
    // rehype-raw re-parses the HTML with parse5, which (per the HTML spec) drops one newline
    // at the start of <pre> content: the code plugin never sees it, so neither may the key.
    out.push({ code: body.join('\n').replace(/^\n/, ''), lang, meta });
  }
  return out;
}

/**
 * Unique, not-yet-cached highlight requests for a set of Markdown sources:
 * [[code, lang, grammars], ...]. `grammars` is what the main thread would have loaded
 * for that page (embedded code in a block is coloured only when its grammar is loaded).
 */
export async function pendingRequests(sources) {
  await loadHighlightCache();
  const seen = new Set();
  const out = [];
  for (const src of sources) {
    const grammars = pageGrammars(src);
    if (!grammars) continue; // the main thread loads no grammars for such pages: leave them to it
    for (const f of collectFences(src)) {
      const req = highlightRequest(f.code, f.lang);
      if (!req) continue;
      const key = highlightKey(req.code, req.lang);
      if (seen.has(key) || isHighlightCached(req.code, req.lang)) continue;
      seen.add(key);
      out.push([req.code, req.lang, grammars]);
    }
  }
  return out;
}

function workerCount(blocks) {
  const env = process.env.DOCSLIT_HIGHLIGHT_WORKERS;
  if (env !== undefined && env !== '') return Math.max(0, Number(env) || 0);
  if (estimate(blocks) < MIN_WORK) return 0;
  const cores = typeof os.availableParallelism === 'function' ? os.availableParallelism() : os.cpus().length;
  return Math.max(0, Math.min(cores, 8));
}

/**
 * Split blocks into `size` shards, keeping each language on as few workers as possible so
 * its grammar is compiled once or a few times. A language bigger than a fair share of the
 * work is split into several chunks (each pays the compile again, but runs in parallel).
 * Chunks are placed largest first on the least-loaded shard (LPT).
 */
export function shardByLanguage(blocks, size) {
  const groups = new Map();
  for (const b of blocks) {
    if (!groups.has(b[1])) groups.set(b[1], []);
    groups.get(b[1]).push(b);
  }
  const bytes = (g) => g.reduce((n, b) => n + b[0].length, 0);
  const fair = estimate(blocks) / size;
  const chunks = [];
  for (const g of groups.values()) {
    const c = LANG_COST + bytes(g);
    // only split clearly oversized languages: each extra part compiles the grammar again
    const parts = c > 1.5 * fair ? Math.min(size, Math.ceil(c / fair)) : 1;
    if (parts === 1) { chunks.push(g); continue; }
    const per = bytes(g) / parts;
    let cur = [], n = 0;
    for (const b of g) {
      cur.push(b); n += b[0].length;
      if (n >= per && chunks.length < 64) { chunks.push(cur); cur = []; n = 0; }
    }
    if (cur.length) chunks.push(cur);
  }
  const cost = (c) => LANG_COST + bytes(c);
  const shards = Array.from({ length: size }, () => ({ load: 0, blocks: [] }));
  for (const c of chunks.sort((x, y) => cost(y) - cost(x))) {
    const target = shards.reduce((min, sh) => (sh.load < min.load ? sh : min), shards[0]);
    target.load += cost(c);
    target.blocks.push(...c);
  }
  return shards.map((sh) => sh.blocks).filter((x) => x.length);
}

/** Highlight [[code, lang, grammars], ...] in up to `size` workers; resolves with [[key, html], ...]. */
export function highlightInWorkers(blocks, size) {
  const shards = shardByLanguage(blocks, size);
  const results = [];
  return new Promise((resolve) => {
    let pending = shards.length;
    if (!pending) { resolve(results); return; }
    for (const shard of shards) {
      const w = new Worker(workerUrl, { type: 'module' });
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        w.terminate();
        if (--pending === 0) resolve(results);
      };
      w.on('message', (msg) => {
        if (msg.ready) w.postMessage({ id: 0, blocks: shard });
        else { if (msg.results) results.push(...msg.results); finish(); }
      });
      // a failed worker just loses its shard: those blocks are highlighted on the main thread
      w.on('error', finish);
      w.on('exit', finish);
    }
  });
}

/**
 * Pre-highlight the code blocks of `sources` (Markdown strings) in parallel.
 * Returns { blocks, workers, primed } for reporting; a no-op when there is little to do.
 */
export async function prefillHighlights(sources) {
  const blocks = await pendingRequests(sources);
  const size = workerCount(blocks);
  if (!size || !blocks.length) return { blocks: blocks.length, workers: 0, primed: 0 };
  const results = await highlightInWorkers(blocks, size);
  return { blocks: blocks.length, workers: size, primed: primeHighlightCache(results) };
}
