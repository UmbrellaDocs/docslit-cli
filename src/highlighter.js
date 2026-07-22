import { createHighlighter, bundledLanguages } from 'shiki';
import path from 'path';
import fs from 'fs-extra';

let highlighter = null;
const highlightCache = new Map();
let cacheDirty = 0;
const FLUSH_THRESHOLD = 20;

const STARTUP_LANGS = ['javascript', 'typescript', 'bash', 'json', 'html', 'css', 'yaml'];

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
  await fs.ensureDir(path.dirname(p));
  await fs.writeFile(p, JSON.stringify(obj));
  cacheDirty = 0;
}

export async function initHighlighter() {
  await loadDiskCache();
  highlighter = await createHighlighter({
    themes: ['github-dark', 'github-light'],
    langs: STARTUP_LANGS,
  });
  process.on('beforeExit', () => { saveDiskCache().catch(() => {}); });
}

export async function ensureLangs(src) {
  if (!highlighter) return;
  const needed = new Set();
  const re = /^`{3,}(\S+)/gm;
  let m;
  while ((m = re.exec(src)) !== null) {
    const lang = m[1].toLowerCase();
    if (lang && !highlighter.getLoadedLanguages().includes(lang) && lang in bundledLanguages) {
      needed.add(lang);
    }
  }
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
