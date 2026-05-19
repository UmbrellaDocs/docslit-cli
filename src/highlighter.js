import { createHighlighter, bundledLanguages } from 'shiki';

let highlighter = null;
const highlightCache = new Map();

const STARTUP_LANGS = ['javascript', 'typescript', 'bash', 'json', 'html', 'css', 'yaml'];

export async function initHighlighter() {
  highlighter = await createHighlighter({
    themes: ['github-dark', 'github-light'],
    langs: STARTUP_LANGS,
  });
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
    return result;
  } catch {
    highlightCache.set(key, null);
    return null;
  }
}
