/**
 * Worker thread: highlight batches of code blocks with the same Shiki settings
 * as the main thread (src/highlight-core.js), so results can be merged into the
 * main highlight cache.
 *
 * in:  { id, blocks: [[code, lang, grammars], ...] }   grammars: what the main
 *       thread loads for the block's page, so embedded code is coloured the same
 * out: { id, results: [[key, html], ...] }   (blocks that fail are left out:
 *       the main thread highlights those itself, exactly as before)
 */
import { parentPort } from 'worker_threads';
import { createHighlighter, bundledLanguages } from 'shiki';
import { THEMES, STARTUP_LANGS, highlightKey, grammarName, renderHighlight } from '../highlight-core.js';

const highlighter = await createHighlighter({ themes: THEMES, langs: STARTUP_LANGS });
const loaded = new Set(highlighter.getLoadedLanguages());

async function ensureLangs(names) {
  const missing = names.map(grammarName).filter((n) => n && !loaded.has(n) && n in bundledLanguages);
  if (!missing.length) return;
  await Promise.all(missing.map((n) => highlighter.loadLanguage(n)));
  for (const l of highlighter.getLoadedLanguages()) loaded.add(l);
}

parentPort.on('message', async ({ id, blocks }) => {
  const results = [];
  for (const [code, lang, grammars = []] of blocks) {
    try {
      await ensureLangs([lang, ...grammars]);
      results.push([highlightKey(code, lang), renderHighlight(highlighter, code, lang)]);
    } catch { /* unknown language etc.: leave it to the main thread */ }
  }
  parentPort.postMessage({ id, results });
});
parentPort.postMessage({ ready: true });
