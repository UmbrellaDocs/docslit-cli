import { createHighlighter, bundledLanguages } from 'shiki';
import path from 'path';
import fs from 'node:fs/promises';
import { ensureDir } from './fs-helpers.js';

let highlighter = null;
let initPromise = null;
let beforeExitRegistered = false;
const highlightCache = new Map();
let cacheDirty = 0;
const FLUSH_THRESHOLD = 20;

const STARTUP_LANGS = ['javascript', 'typescript', 'bash', 'json', 'html', 'css', 'yaml'];
const CODE_BLOCK_RE = /^`{3,}(\S+)/gm;

function getCachePath() {
  return path.join(process.cwd(), 'node_modules', '.cache', 'docslit', 'shiki.json');
}

async function loadDiskCache() {
  try {
    const raw = await fs.readFile(getCachePath(), 'utf8');
    const obj = JSON.parse(raw);
    for (const [k, v] of Object.entries(obj)) {
      highlightCache.set(k, v);
    }
  } catch { /* no cache or corrupt */ }
}

async function saveDiskCache() {
  if (!cacheDirty) return;
  const obj = {};
  for (const [k, v] of highlightCache) {
    obj[k] = v;
  }
  const p = getCachePath();
  await ensureDir(path.dirname(p));
  await fs.writeFile(p, JSON.stringify(obj));
  cacheDirty = 0;
}

async function ensureHighlighter() {
  if (highlighter) return;
  if (!initPromise) {
    initPromise = (async () => {
      await loadDiskCache();
      highlighter = await createHighlighter({
        themes: ['github-dark', 'github-light'],
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
  CODE_BLOCK_RE.lastIndex = 0;
  if (!CODE_BLOCK_RE.test(src)) return;

  await ensureHighlighter();
  const needed = new Set();
  const want = (raw) => {
    // "js{1,3}" (no space before the line spec) -> "js"
    const lang = String(raw || '').replace(/\{.*$/, '').toLowerCase();
    if (lang && !highlighter.getLoadedLanguages().includes(lang) && lang in bundledLanguages) needed.add(lang);
  };
  let m;
  const re = /^[ \t]*(?:`{3,}|~{3,})([^\s`]+)/gm;
  while ((m = re.exec(src)) !== null) want(m[1]);
  // hand-written <wc-code-block language="x"> / <wc-code-tab language="x">
  const attrRe = /<wc-code-(?:block|tab)\b[^>]*?\blanguage\s*=\s*["']([^"']+)["']/g;
  while ((m = attrRe.exec(src)) !== null) want(m[1]);
  // markdown / unlabelled fences that show wc-* markup are highlighted as mdx
  if (/<wc-/.test(src) && /^[ \t]*(?:`{3,}|~{3,})(?:markdown|md)?[ \t]*$/m.test(src)) want('mdx');
  if (needed.size) {
    await Promise.all([...needed].map(l => highlighter.loadLanguage(l)));
  }
}

export function highlight(code, lang) {
  if (!highlighter || !lang) return null;
  const key = lang + '\0' + code;
  const cached = highlightCache.get(key);
  if (cached !== undefined) return cached;
  try {
    const html = highlighter.codeToHtml(code, {
      lang,
      themes: { dark: 'github-dark', light: 'github-light' },
      defaultColor: 'dark',
    });
    const match = html.match(/<code>([\s\S]*)<\/code>/);
    const result = match ? match[1] : null;
    highlightCache.set(key, result);
    cacheDirty++;
    if (cacheDirty >= FLUSH_THRESHOLD) saveDiskCache().catch(() => {});
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
