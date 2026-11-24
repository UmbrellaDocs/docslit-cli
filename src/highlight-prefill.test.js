import { describe, expect, it } from 'vitest';
import { createHighlighter } from 'shiki';
import { collectFences, highlightInWorkers, shardByLanguage, LANG_COST } from './highlight-prefill.js';
import { THEMES, highlightKey, pageGrammars, renderHighlight } from './highlight-core.js';
import { highlightRequest } from './plugins/rehype-docslit-code.js';

describe('collectFences', () => {
  it('finds backtick and tilde fences with their language and meta', () => {
    const md = ['# T', '```js title="a.js" {2}', 'let a = 1;', 'let b = 2;', '```', '~~~py', 'x = 1', '~~~'].join('\n');
    expect(collectFences(md)).toEqual([
      { code: 'let a = 1;\nlet b = 2;', lang: 'js', meta: 'title="a.js" {2}' },
      { code: 'x = 1', lang: 'py', meta: '' },
    ]);
  });

  it('splits a glued line spec, strips the fence indentation inside list items', () => {
    const md = ['1. Step', '   ```ts{1}', '   const x = 1;', '     indented()', '   ```'].join('\n');
    expect(collectFences(md)).toEqual([{ code: 'const x = 1;\n  indented()', lang: 'ts', meta: '{1} ' }]);
  });

  it('keeps nested fences inside a longer fence as code', () => {
    const md = ['````md', '```js', 'a()', '```', '````'].join('\n');
    expect(collectFences(md)).toEqual([{ code: '```js\na()\n```', lang: 'md', meta: '' }]);
  });

  it('drops one leading newline, as the HTML parser does for <pre> content', () => {
    expect(collectFences('```js\n\n\nlet a\n```')[0].code).toBe('\nlet a');
  });

  it('skips fences without a language', () => {
    expect(collectFences('```\nplain\n```')).toEqual([]);
  });
});

describe('pageGrammars', () => {
  it('lists every fence language, including nested ones, and null without a top-level fence', () => {
    expect(pageGrammars('````md\n```rs\nfn main() {}\n```\n````').sort()).toEqual(['md', 'rs']);
    expect(pageGrammars('- item\n  ```js\n  a\n  ```')).toBeNull();
  });
});

describe('shardByLanguage', () => {
  it('keeps small languages whole and spreads the work', () => {
    const blocks = [['a'.repeat(10), 'js', []], ['b'.repeat(10), 'js', []], ['c'.repeat(10), 'py', []], ['d'.repeat(10), 'rb', []]];
    const shards = shardByLanguage(blocks, 3);
    expect(shards.flat()).toHaveLength(4);
    for (const s of shards) expect(new Set(s.map((b) => b[1])).size).toBe(1);
  });

  it('splits a language much bigger than a fair share', () => {
    const big = Array.from({ length: 40 }, (_, i) => [`x${i}`.repeat(LANG_COST / 20), 'js', []]);
    const shards = shardByLanguage(big, 4);
    expect(shards.length).toBeGreaterThan(1);
    expect(shards.flat()).toHaveLength(40);
  });
});

describe('highlightInWorkers', () => {
  it('produces exactly what the main-thread highlighter produces', async () => {
    const page = [
      '```js', 'const a = {{API_URL}}; // [!code highlight]', '```',
      '```ts', 'type N<T> = T[];', '```',
      '````md', '```rs', 'fn main() {}', '```', '````',
      '```nosuchlang', 'x', '```',
    ].join('\n');
    const grammars = pageGrammars(page);
    const blocks = collectFences(page).map((f) => highlightRequest(f.code, f.lang)).filter(Boolean).map((r) => [r.code, r.lang, grammars]);
    const results = new Map(await highlightInWorkers(blocks, 2));

    const h = await createHighlighter({ themes: THEMES, langs: grammars.filter((g) => g !== 'nosuchlang') });
    for (const [code, lang] of blocks) {
      const key = highlightKey(code, lang);
      if (lang === 'nosuchlang') { expect(results.has(key)).toBe(false); continue; } // left to the main thread
      expect(results.get(key)).toBe(renderHighlight(h, code, lang));
    }
    // embedded Rust is coloured because the page mentions ```rs
    expect(results.get(highlightKey('```rs\nfn main() {}\n```', 'md'))).toMatch(/fn<\/span>/);
  }, 30000);
});
