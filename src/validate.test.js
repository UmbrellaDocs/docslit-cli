import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { fileURLToPath } from 'url';
import { runValidation } from './validate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BIN = path.join(__dirname, '..', 'bin', 'docslit.js');

function run(args, cwd) {
  return new Promise((resolve) => {
    execFile('node', [BIN, ...args], { cwd, timeout: 30000 }, (err, stdout, stderr) => {
      resolve({ code: err ? err.code : 0, stdout, stderr });
    });
  });
}

describe('runValidation', () => {
  let dir;
  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'docslit-validate-'));
    await fs.ensureDir(path.join(dir, 'docs'));
    await fs.writeJson(path.join(dir, 'docslit.json'), {
      $schema: 'https://unpkg.com/docslit/schema/docslit.schema.json',
      name: 'Fixture',
      sidebar: [{ group: 'Guide', pages: ['index', 'broken', 'ghost'] }],
    });
    await fs.writeFile(path.join(dir, 'docs', 'index.md'),
      '---\ntitle: Home\n---\n\n# Home\n\nSee [missing](does-not-exist).\n');
    await fs.writeFile(path.join(dir, 'docs', 'broken.md'),
      '---\ntitle: Broken\n---\n\n# Broken\n\n<wc-bogus-widget>hi</wc-bogus-widget>\n');
    await fs.writeFile(path.join(dir, 'docs', 'orphan.md'), '---\ntitle: Orphan\n---\n\n# Orphan\n');
    // docs/ghost.md intentionally missing
  });
  afterAll(async () => { await fs.remove(dir); });

  it('returns a structured result without printing or exiting', async () => {
    const r = await runValidation(dir);
    expect(r.ok).toBe(false);
    expect(r.summary.pages).toBe(3);
    expect(r.summary.errors).toBeGreaterThanOrEqual(2);
    expect(r.summary.errors + r.summary.warnings + r.summary.infos).toBe(r.issues.length);
    for (const i of r.issues) {
      expect(['error', 'warning', 'info']).toContain(i.level);
      expect(i.code).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(i.code).not.toBe('other');
      expect(typeof i.message).toBe('string');
      expect('file' in i).toBe(true);
    }
  });

  it('reports a broken link with file, line and fix', async () => {
    const r = await runValidation(dir);
    const issue = r.issues.find((i) => i.code === 'broken-link');
    expect(issue).toMatchObject({ level: 'error', file: path.join('docs', 'index.md') });
    expect(typeof issue.line).toBe('number');
    expect(issue.fix).toBeTruthy();
  });

  it('reports a sidebar slug with no file', async () => {
    const r = await runValidation(dir);
    const issue = r.issues.find((i) => i.code === 'sidebar-missing-file');
    expect(issue).toMatchObject({ level: 'error', file: 'docslit.json' });
    expect(issue.fix).toContain('docs/ghost.md');
  });

  it('reports unknown components and orphan pages', async () => {
    const r = await runValidation(dir);
    expect(r.issues.find((i) => i.code === 'unknown-component')).toMatchObject({
      level: 'warning', file: path.join('docs', 'broken.md'),
    });
    expect(r.issues.find((i) => i.code === 'orphan-page')).toMatchObject({ level: 'info' });
  });

  it('strict mode fails on warnings only', async () => {
    const clean = await fs.mkdtemp(path.join(os.tmpdir(), 'docslit-validate-strict-'));
    try {
      await fs.ensureDir(path.join(clean, 'docs'));
      await fs.writeJson(path.join(clean, 'docslit.json'), { name: 'x', sidebar: [{ group: 'G', pages: ['a'] }] });
      await fs.writeFile(path.join(clean, 'docs', 'a.md'), '---\ntitle: A\n---\n\n<wc-nope>x</wc-nope>\n');
      expect((await runValidation(clean)).ok).toBe(true);
      expect((await runValidation(clean, { strict: true })).ok).toBe(false);
    } finally { await fs.remove(clean); }
  });

  it('does not complain about a $schema key', async () => {
    const r = await runValidation(dir);
    expect(r.issues.some((i) => /\$schema/.test(i.message))).toBe(false);
  });

  it('reports a missing directory as an issue', async () => {
    const r = await runValidation(path.join(dir, 'nope'));
    expect(r.ok).toBe(false);
    expect(r.issues[0].code).toBe('directory-not-found');
  });

  it('CLI --format json prints only the JSON object and exits 1', async () => {
    const { code, stdout } = await run(['validate', dir, '--format', 'json']);
    expect(code).toBe(1);
    const parsed = JSON.parse(stdout);
    expect(parsed.ok).toBe(false);
    expect(parsed.summary.pages).toBe(3);
    expect(Array.isArray(parsed.issues)).toBe(true);
    expect(stdout).not.toMatch(/\u001b\[/);
  });
});

describe('runValidation line numbers', () => {
  it('reports whole-file line numbers (frontmatter included)', async () => {
    const d = await fs.mkdtemp(path.join(os.tmpdir(), 'docslit-validate-lines-'));
    try {
      await fs.ensureDir(path.join(d, 'docs'));
      await fs.writeJson(path.join(d, 'docslit.json'), { name: 'x', sidebar: [{ group: 'G', pages: ['a'] }] });
      // Lines: 1 ---, 2 title, 3 description, 4 ---, 5 blank, 6 h1, 7 blank,
      // 8 broken link, 9 blank, 10 image, 11 blank, 12 unknown component, 13 blank, 14 href
      await fs.writeFile(path.join(d, 'docs', 'a.md'), [
        '---', 'title: A', 'description: d', '---', '',
        '# A', '',
        'See [x](nope).', '',
        '![img](./missing.png)', '',
        '<wc-bogus>hi</wc-bogus>', '',
        '<a href="nope2">y</a>', '',
      ].join('\n'));
      const r = await runValidation(d);
      const line = (code) => r.issues.find((i) => i.code === code)?.line;
      expect(line('broken-link')).toBe(8);
      expect(line('missing-asset')).toBe(10);
      expect(line('unknown-component')).toBe(12);
      expect(r.issues.filter((i) => i.code === 'broken-href').map((i) => i.line)).toContain(14);
    } finally { await fs.remove(d); }
  });
});

describe('runValidation include/variable line numbers', () => {
  it('reports whole-file lines for wc-include and variable placeholder issues', async () => {
    const d = await fs.mkdtemp(path.join(os.tmpdir(), 'docslit-validate-vars-'));
    try {
      await fs.ensureDir(path.join(d, 'docs'));
      await fs.writeJson(path.join(d, 'docslit.json'), { name: 'x', sidebar: [{ group: 'G', pages: ['a'] }] });
      // 1 ---, 2 title, 3 description, 4 tags, 5 ---, 6 blank, 7 h1, 8 blank,
      // 9 include (missing target), 10 blank, 11 undefined variable
      await fs.writeFile(path.join(d, 'docs', 'a.md'), [
        '---', 'title: A', 'description: d', 'tags: [a, b]', '---', '',
        '# A', '',
        '<wc-include src="_reusables/missing.md" />', '',
        'Hello {{NOPE}}', '',
      ].join('\n'));
      const r = await runValidation(d);
      expect(r.issues.find((i) => i.code === 'include-target-missing')?.line).toBe(9);
      expect(r.issues.find((i) => i.code === 'var-undefined')?.line).toBe(11);
    } finally { await fs.remove(d); }
  });
});

describe('validate: component markup, assets, vars, code imports, math, CLI', () => {
  let dir;
  const write = (rel, text) => fs.outputFile(path.join(dir, rel), text);
  const pageList = [];
  const page = async (slug, body, fm = 'title: T') => {
    pageList.push(slug);
    await write(`docs/${slug}.md`, `---\n${fm}\n---\n\n${body}\n`);
    await fs.writeJson(path.join(dir, 'docslit.json'), { name: 'F', sidebar: [{ group: 'G', pages: pageList }], ...(dir.extra || {}) });
  };

  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'docslit-validate2-'));
    await fs.ensureDir(path.join(dir, 'docs'));
    await write('images/real.png', 'x');
    await write('docs/shot.png', 'x');
    await write('components/widget.js', "customElements.define('wc-widget', class extends HTMLElement {});\n");
    await write('components/wc-fancy-box.js', 'export {};\n');
    await write('src/code.js', 'a\nb\nc\n');
    await page('markup',
      [
        '<wc-callout type="warnning" colour="red">',
        'hi',
        '</wc-callout>',
        '',
        '```html',
        '<wc-callout>',
        'inside a fence',
        '</wc-callout>',
        '</wc-callout>',
        '```',
        '',
        '<wc-tabs>',
        '<wc-tab title="x">a</wc-tab>',
        '</wc-tabs>',
        '',
        '<wc-schema type="U">',
        '<wc-field name="id" type="string">Id</wc-field>',
        '</wc-schema>',
        '',
        '<wc-var name="X" value="1" />',
        '',
        '<wc-widget>custom</wc-widget> <wc-fancy-box>custom 2</wc-fancy-box>',
        '',
        '<wc-steps>',
        '<wc-step title="a">',
        'never closed',
        '</wc-steps>',
      ].join('\n'));
    await page('assets', [
      '![md missing](images/nope.png)',
      '![ok bare](images/real.png)',
      '![ok docs](shot.png)',
      '![ok abs](/images/real.png)',
      '<img src="rel/nope2.png" alt="x">',
      '![remote](https://example.com/a.png)',
    ].join('\n'));
    await page('vars', [
      'Runtime: <wc-var name="DOMAIN" default="docs.example.com"></wc-var> -> {{DOMAIN}}',
      '',
      'Build: <wc-var name="BUILD" value="1" /> {{BUILD}}',
      '',
      'Undefined: {{NOPE}}',
    ].join('\n'));
    await page('imports', [
      '```js file="src/missing.js"', '```', '',
      '```js file="src/code.js" region="nope"', '```', '',
      '```js file="src/code.js" lines="9-10"', '```', '',
      '```js file="../outside.js"', '```',
    ].join('\n'));
    await page('math', 'Good $$x^2$$ and bad $$\\foo{x}$$ here.\n\n```math\n\\frac{1}{\n```');
  });
  afterAll(async () => { await fs.remove(dir); });

  const forFile = (r, name) => r.issues.filter((i) => i.file === path.join('docs', `${name}.md`));

  it('reports attribute/value/nesting/unclosed issues with codes, levels, fix and whole-file lines', async () => {
    const r = await runValidation(dir);
    const issues = forFile(r, 'markup');
    const by = (code) => issues.filter((i) => i.code === code);

    expect(by('invalid-attribute-value')).toHaveLength(1);
    expect(by('invalid-attribute-value')[0]).toMatchObject({ level: 'warning', line: 5 });
    expect(by('invalid-attribute-value')[0].fix).toMatch(/warning/);
    expect(by('unknown-attribute').map((i) => i.level)).toEqual(['warning', 'warning']);
    expect(by('unknown-attribute')[0].line).toBe(5);
    expect(by('unknown-attribute')[0].fix).toBeTruthy();
    expect(by('missing-required-attribute')).toHaveLength(1);
    expect(by('unclosed-tag')).toHaveLength(1);
    expect(by('unclosed-tag')[0]).toMatchObject({ level: 'error', line: 29 });
    // Nothing from the fenced block, wc-schema > wc-field, compile-time wc-var, or custom components.
    expect(by('unexpected-closing-tag')).toEqual([]);
    expect(by('invalid-parent')).toEqual([]);
    expect(by('self-closing-syntax')).toEqual([]);
    expect(issues.filter((i) => i.code === 'unknown-component')).toEqual([]);
    expect(issues.some((i) => i.code === 'other')).toBe(false);
  });

  it('checks Markdown and HTML images once each, including bare relative paths', async () => {
    const r = await runValidation(dir);
    const missing = forFile(r, 'assets').filter((i) => i.code === 'missing-asset');
    expect(missing.map((i) => i.message.match(/"(.+?)"/)[1]).sort()).toEqual(['images/nope.png', 'rel/nope2.png']);
    expect(missing.every((i) => i.level === 'error' && i.fix)).toBe(true);
  });

  it('treats runtime <wc-var default> as defining {{VAR}}', async () => {
    const r = await runValidation(dir);
    const undefinedVars = forFile(r, 'vars').filter((i) => i.code === 'var-undefined');
    expect(undefinedVars.map((i) => i.message)).toEqual(['Undefined variable "{{NOPE}}"']);
  });

  it('gives code-import failures specific codes and fixes', async () => {
    const r = await runValidation(dir);
    const imports = forFile(r, 'imports');
    expect(imports.map((i) => i.code)).toEqual([
      'code-import-missing-file', 'code-import-missing-region', 'code-import-invalid-lines', 'code-import-outside-project',
    ]);
    expect(imports.every((i) => i.level === 'error' && i.fix && i.line)).toBe(true);
    expect(imports[0].line).toBe(5);
  });

  it('reports invalid TeX as math-invalid warnings with the KaTeX message and line', async () => {
    const r = await runValidation(dir);
    const m = forFile(r, 'math').filter((i) => i.code === 'math-invalid');
    expect(m).toHaveLength(2);
    expect(m[0]).toMatchObject({ level: 'warning', line: 5 });
    expect(m[0].message).toMatch(/Undefined control sequence: \\foo/);
    expect(m[0].message).not.toMatch(/\u0332/);
    expect(m[1].line).toBe(7);
    expect(m[0].fix).toBeTruthy();
  });

  it('CLI: github format prints only annotations; unknown --format and unknown flags are rejected', async () => {
    const gh = await run(['validate', '--format', 'github'], dir);
    expect(gh.stdout.split('\n').filter(Boolean).every((l) => l.startsWith('::'))).toBe(true);
    expect(gh.stdout).not.toMatch(/Validating/);
    expect(gh.stdout).toMatch(/title=math-invalid/);

    const bad = await run(['validate', '--format', 'xml'], dir);
    expect(bad.code).toBe(1);
    expect(bad.stderr).toMatch(/Unknown format: xml/);
    expect(bad.stdout).toBe('');

    const flag = await run(['validate', '--bogus'], dir);
    expect(flag.code).toBe(1);
    expect(flag.stderr).toMatch(/Unknown option.*--bogus/);

    const eq = await run(['validate', '--format=json'], dir);
    expect(() => JSON.parse(eq.stdout)).not.toThrow();
  });

  it('CLI: lint rejects --fix and unknown formats', async () => {
    const fix = await run(['lint', '--fix'], dir);
    expect(fix.code).toBe(1);
    expect(fix.stderr).toMatch(/Unknown option.*--fix/);
    const fmt = await run(['lint', '--format', 'xml'], dir);
    expect(fmt.code).toBe(1);
    expect(fmt.stderr).toMatch(/Unknown format: xml/);
  });
});
