import { createHighlighter, bundledLanguages } from 'shiki';
import path from 'path';
import fs from 'node:fs/promises';
import { ensureDir } from './fs-helpers.js';
import { THEMES, STARTUP_LANGS, highlightKey, pageGrammars, renderHighlight } from './highlight-core.js';

let highlighter = null;
let initPromise = null;
let beforeExitRegistered = false;
const highlightCache = new Map();
let cacheDirty = 0;
// The disk cache is rewritten whole, so it is flushed once highlighting goes
// quiet (and on exit), never every N entries: that made a build with ~1,000
// code blocks spend more time serialising JSON than highlighting.
const FLUSH_DELAY_MS = 2000;
let flushTimer = null;
let flushing = null;


function getCachePath() {
  return path.join(process.cwd(), 'node_modules', '.cache', 'docslit', 'shiki.json');
}

let diskCacheLoaded = null;
function loadDiskCache() {
  if (!diskCacheLoaded) diskCacheLoaded = readDiskCache();
  return diskCacheLoaded;
}

async function readDiskCache() {
  try {
    const raw = await fs.readFile(getCachePath(), 'utf8');
    const obj = JSON.parse(raw);
    for (const [k, v] of Object.entries(obj)) {
      highlightCache.set(k, v);
    }
  } catch { /* no cache or corrupt */ }
}

async function saveDiskCache() {
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  if (flushing) await flushing;
  if (!cacheDirty) return;
  cacheDirty = 0;
  const json = JSON.stringify(Object.fromEntries(highlightCache));
  flushing = (async () => {
    const p = getCachePath();
    await ensureDir(path.dirname(p));
    await fs.writeFile(p, json);
    diskCacheWrites++;
  })();
  try { await flushing; } finally { flushing = null; }
}

/** Save FLUSH_DELAY_MS after the last new entry (keeps the dev server's cache fresh). Unref'd: never delays exit. */
function scheduleFlush() {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => { flushTimer = null; saveDiskCache().catch(() => {}); }, FLUSH_DELAY_MS);
  flushTimer.unref?.();
}

/** Persist new highlight results now. */
export function flushHighlightCache() {
  return saveDiskCache();
}

/** Load the on-disk cache (once) so callers can skip blocks highlighted by an earlier build. */
export async function loadHighlightCache() {
  await loadDiskCache();
}

/** True if (code, lang) is already highlighted in this process or the disk cache. */
export function isHighlightCached(code, lang) {
  return highlightCache.has(highlightKey(code, lang));
}

/** Add results computed elsewhere (highlight workers); they are persisted like any other entry. */
export function primeHighlightCache(entries) {
  let added = 0;
  for (const [key, value] of entries) {
    if (highlightCache.has(key)) continue;
    highlightCache.set(key, value);
    added++;
  }
  if (added) { cacheDirty += added; scheduleFlush(); }
  return added;
}

/** Number of disk-cache writes since start (for tests). */
export let diskCacheWrites = 0;

async function ensureHighlighter() {
  if (highlighter) return;
  if (!initPromise) {
    initPromise = (async () => {
      await loadDiskCache();
      highlighter = await createHighlighter({
        themes: THEMES,
        langs: STARTUP_LANGS,
      });
      if (!beforeExitRegistered) {
        beforeExitRegistered = true;
        process.on('beforeExit', () => { saveDiskCache().catch(() => {}); });
      }
    })();
  }
  await initPromise;
}

/** @deprecated Lazy — highlighter initializes on first code block. Kept for API compat. */
export async function initHighlighter() {
  return;
}

export async function ensureLangs(src) {
  const langs = pageGrammars(src);
  if (!langs) return;
  await ensureHighlighter();
  const loaded = highlighter.getLoadedLanguages();
  const needed = langs.filter((l) => !loaded.includes(l) && l in bundledLanguages);
  if (needed.length) {
    await Promise.all(needed.map(l => highlighter.loadLanguage(l)));
  }
}

export function highlight(code, lang) {
  if (!highlighter || !lang) return null;
  const key = highlightKey(code, lang);
  const cached = highlightCache.get(key);
  if (cached !== undefined) return cached;
  try {
    const result = renderHighlight(highlighter, code, lang);
    highlightCache.set(key, result);
    cacheDirty++;
    scheduleFlush();
    return result;
  } catch {
    highlightCache.set(key, null);
    return null;
  }
}

/**
 * Highlight `code` and return one HTML string per line (each `<span class="line">...</span>`),
 * or null when the language is unknown / not loaded. The strings contain no newline characters.
 */
export function highlightLines(code, lang) {
  const html = highlight(code, lang);
  if (html == null) return null;
  const lines = html.split('\n');
  const expected = String(code).split('\n').length;
  if (lines.length !== expected || !lines.every((l) => l.startsWith('<span class="line">'))) return null;
  return lines;
}
