import { describe, it, expect, beforeAll } from 'vitest';
import { parseDoc } from './markdown.js';
import { initHighlighter } from './highlighter.js';
import { buildComponents } from './components/index.js';

describe('code block rendering', () => {
  beforeAll(async () => { await initHighlighter(); }, 30000);

  it('does not make shiki .line spans display:block (newlines between them would double the spacing)', () => {
    const src = buildComponents();
    expect(src).not.toMatch(/\.line\s*\{[^}]*display\s*:\s*block/);
    // The inline-span contract the CSS relies on: shiki separates lines with real "\n" text.
    expect(src).toMatch(/\.line span/);
  });

  it('highlighted output separates lines with newline characters and has no phantom last line', async () => {
    const { html } = await parseDoc('```js\nconst a = 1;\nconst b = 2;\n```\n');
    const inner = html.match(/<wc-code-block[^>]*>([\s\S]*)<\/wc-code-block>/)[1];
    expect((inner.match(/class="line"/g) || []).length).toBe(2);
    expect(inner).toMatch(/<\/span>\n<span class="line">/);
    expect(inner).not.toMatch(/\n<span class="line"><\/span>$/);
  });

  it('carries fenced-code info-string attributes (filename, linenumbers) through to the component', async () => {
    const { html } = await parseDoc('```js filename="app.js" linenumbers="true"\nx\n```\n');
    expect(html).toMatch(/<wc-code-block language="js" filename="app\.js" linenumbers="true" highlighted>/);
  });
});
