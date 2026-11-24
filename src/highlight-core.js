// Shiki settings shared by the main-thread highlighter (src/highlighter.js) and
// the highlight workers (src/workers/highlight-worker.js). Both must produce
// byte-identical HTML for the same (code, lang), so everything that affects the
// output lives here.

export const THEMES = ['github-dark', 'github-light'];
export const STARTUP_LANGS = ['javascript', 'typescript', 'bash', 'json', 'html', 'css', 'yaml'];

/** Cache key for one highlighted block. */
export function highlightKey(code, lang) {
  return lang + '\0' + code;
}

/** "js{1,3}" -> "js", lower-cased: the name used to load a grammar. */
export function grammarName(lang) {
  return String(lang || '').replace(/\{.*$/, '').toLowerCase();
}

/** Highlight with a ready Shiki highlighter; returns the inner HTML of <code>, or null. Throws for unknown languages. */
export function renderHighlight(highlighter, code, lang) {
  const html = highlighter.codeToHtml(code, {
    lang,
    themes: { dark: THEMES[0], light: THEMES[1] },
    defaultColor: 'dark',
  });
  const match = html.match(/<code>([\s\S]*)<\/code>/);
  return match ? match[1] : null;
}

/**
 * Grammars a page needs, as ensureLangs() loads them: every fence language in the source
 * (nested fences included, so embedded code is coloured), hand-written wc-code-block /
 * wc-code-tab languages, and mdx for Markdown fences that show wc-* markup.
 * Returns null when the page has no top-level backtick fence (ensureLangs then loads nothing).
 */
export function pageGrammars(src) {
  if (!/^`{3,}(\S+)/m.test(src)) return null;
  const out = new Set();
  let m;
  const re = /^[ \t]*(?:`{3,}|~{3,})([^\s`]+)/gm;
  while ((m = re.exec(src)) !== null) out.add(grammarName(m[1]));
  const attrRe = /<wc-code-(?:block|tab)\b[^>]*?\blanguage\s*=\s*["']([^"']+)["']/g;
  while ((m = attrRe.exec(src)) !== null) out.add(grammarName(m[1]));
  if (/<wc-/.test(src) && /^[ \t]*(?:`{3,}|~{3,})(?:markdown|md)?[ \t]*$/m.test(src)) out.add('mdx');
  out.delete('');
  return [...out];
}
