import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { extractCode, expandCodeImports } from './code-import.js';
import { parseDoc } from './markdown.js';

let root;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'docslit-codeimp-'));
  await fs.ensureDir(path.join(root, 'docs'));
  await fs.outputFile(path.join(root, 'examples/server.js'), [
    "import http from 'http';",
    '',
    '// #region routes',
    'function routes(app) {',
    "  app.get('/', () => 'hi');",
    '}',
    '// #endregion',
    '',
    'export default routes;',
    '',
  ].join('\n'));
  await fs.outputFile(path.join(root, 'examples/job.py'), 'x = 1\n# region setup\nif x:\n    y = 2\n# endregion setup\n');
});
afterEach(() => fs.remove(root));

const run = (md) => expandCodeImports(md, { projectRoot: root, pagePath: 'docs/p.md' });

describe('extractCode', () => {
  const text = 'a\n  b\n  c\nd\n';
  it('extracts lines and dedents', () => {
    expect(extractCode(text, { lines: '2-3' }).code).toBe('b\nc');
    expect(extractCode(text, { lines: '4' }).code).toBe('d');
    expect(extractCode(text, { lines: '3-' }).code).toBe('  c\nd'.replace(/^ {2}/, '  '));
    expect(extractCode(text, { lines: '1,4' }).code).toBe('a\nd');
  });
  it('reports out-of-range and invalid lines', () => {
    expect(extractCode(text, { lines: '3-99' }).error).toMatch(/out of range \(file has 4 lines\)/);
    expect(extractCode(text, { lines: '9' }).error).toMatch(/out of range/);
    expect(extractCode(text, { lines: 'abc' }).error).toMatch(/Invalid lines/);
    expect(extractCode(text, { lines: '3-2' }).error).toMatch(/out of range/);
  });
  it('extracts regions with various comment prefixes and strips markers', () => {
    expect(extractCode('x\n// #region a\n  1\n  2\n// #endregion\n', { region: 'a' }).code).toBe('1\n2');
    expect(extractCode('# region a\n1\n# endregion a\n', { region: 'a' }).code).toBe('1');
    expect(extractCode('<!-- #region a -->\n<b/>\n<!-- #endregion -->\n', { region: 'a' }).code).toBe('<b/>');
    expect(extractCode('/* #region a */\n1\n/* #endregion */\n', { region: 'a' }).code).toBe('1');
    expect(extractCode('-- region a\n1\n-- endregion\n', { region: 'a' }).code).toBe('1');
  });
  it('handles nested regions and removes inner markers', () => {
    const t = '// #region outer\n1\n// #region inner\n2\n// #endregion\n3\n// #endregion\n';
    expect(extractCode(t, { region: 'outer' }).code).toBe('1\n2\n3');
    expect(extractCode(t, { region: 'inner' }).code).toBe('2');
  });
  it('errors on missing/unterminated region and lines+region', () => {
    expect(extractCode('a', { region: 'zz' }).error).toMatch(/not found/);
    expect(extractCode('// #region a\n1\n', { region: 'a' }).error).toMatch(/no matching endregion/);
    expect(extractCode('a', { region: 'a', lines: '1' }).error).toMatch(/either/);
  });
  it('strips markers from whole-file imports', () => {
    expect(extractCode('// #region a\nx\n// #endregion\n', {}).code).toBe('x');
  });
});

describe('expandCodeImports', () => {
  it('imports a whole file, inferring language', async () => {
    const r = await run('Intro\n\n```file="examples/job.py" region="setup"\n```\n\nEnd');
    expect(r.errors).toEqual([]);
    expect(r.content).toBe('Intro\n\n```python\nif x:\n    y = 2\n```\n\nEnd');
    expect(r.dependencies).toEqual([path.join(root, 'examples/job.py')]);
  });

  it('keeps explicit language and other meta, drops file/lines/region', async () => {
    const r = await run('```ts filename="srv.ts" file="examples/server.js" lines="1"\n```');
    expect(r.content).toBe('```ts filename="srv.ts"\nimport http from \'http\';\n```');
  });

  it('imports a region and replaces placeholder body', async () => {
    const r = await run('```js file="examples/server.js" region="routes"\nold\n```');
    expect(r.content).toBe("```js\nfunction routes(app) {\n  app.get('/', () => 'hi');\n}\n```");
  });

  it('leaves fences without file= and nested example fences alone', async () => {
    const md = '````md\n```js file="examples/server.js"\n```\n````\n\n```js filename="x"\nconst a = 1;\n```';
    const r = await run(md);
    expect(r.content).toBe(md);
    expect(r.errors).toEqual([]);
  });

  it('lengthens the fence when code contains fences', async () => {
    await fs.outputFile(path.join(root, 'ex.md'), '```js\nx\n```\n');
    const r = await run('```md file="ex.md"\n```');
    expect(r.content.startsWith('````md\n```js')).toBe(true);
    expect(r.content.endsWith('\n````')).toBe(true);
  });

  it('reports missing file, region, and out-of-range lines with line numbers', async () => {
    const r = await run('a\n\n```js file="nope.js"\n```\n```js file="examples/server.js" region="zz"\n```\n```js file="examples/server.js" lines="1-99"\n```');
    expect(r.errors.map((e) => [e.line, e.message])).toEqual([
      [3, 'Code import file not found: nope.js'],
      [5, 'Region "zz" not found in examples/server.js'],
      [7, expect.stringMatching(/out of range.*in examples\/server\.js/)],
    ]);
  });

  it('blocks traversal, absolute-path escape, and protected paths', async () => {
    await fs.outputFile(path.join(os.tmpdir(), 'docslit-outside.txt'), 'secret');
    for (const f of ['../docslit-outside.txt', 'examples/../../x', '.env', '.git/config', 'node_modules/a/b.js']) {
      const r = await run(`\`\`\`txt file="${f}"\n\`\`\``);
      expect(r.errors).toHaveLength(1);
      expect(r.content).toContain('file=');
    }
  });

  it('blocks symlink escape', async () => {
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'docslit-out-'));
    await fs.writeFile(path.join(outside, 's.txt'), 'secret');
    await fs.symlink(path.join(outside, 's.txt'), path.join(root, 'link.txt'));
    const r = await run('```txt file="link.txt"\n```');
    expect(r.errors[0].message).toMatch(/symlink/);
    expect(r.content).not.toContain('secret');
    await fs.remove(outside);
  });
});

describe('parseDoc integration', () => {
  it('embeds real code in html and preprocessedMarkdown (no directive fast-path skip)', async () => {
    const md = '---\ntitle: T\n---\n\n```js file="examples/server.js" region="routes"\n```\n';
    const out = await parseDoc(md, { docsRoot: path.join(root, 'docs'), pagePath: 'docs/p.md' });
    expect(out.preprocessedMarkdown).toContain("app.get('/', () => 'hi');");
    expect(out.preprocessedMarkdown).not.toContain('file=');
    expect(out.html).toContain('routes');
    expect(out.preprocess.dependencies).toContain(path.join(root, 'examples/server.js'));
  });

  it('throws a build error for a missing import', async () => {
    await expect(parseDoc('```js file="missing.js"\n```', { docsRoot: path.join(root, 'docs'), pagePath: 'docs/p.md' }))
      .rejects.toThrow(/not found/);
  });

  it('does not expand {{VARS}} inside imported code', async () => {
    await fs.outputFile(path.join(root, 'tpl.js'), 'const s = "{{NAME}}";\n');
    const out = await parseDoc('```js file="tpl.js"\n```', { docsRoot: path.join(root, 'docs'), globalAttributes: { NAME: 'x' } });
    expect(out.preprocessedMarkdown).toContain('{{NAME}}');
  });
});
