import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
import { findDirectives, initPythonApi, expandPythonApi, resolveAutorefs, writeObjectsInv, resetPythonApi, pythonApiFingerprint } from './site.js';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'test-fixtures', 'api-python');

describe('findDirectives', () => {
  it('finds directives with options, skips fenced code', () => {
    const d = findDirectives('Intro\n\n::: pkg.mod.Thing\n    options:\n      members: false\n      heading_level: 3\n\n```\n::: not.this\n```\n\n  ::: pkg.other\n');
    expect(d.map((x) => x.id)).toEqual(['pkg.mod.Thing', 'pkg.other']);
    expect(d[0].options).toEqual({ members: false, heading_level: 3 });
    expect(d[1].indent).toBe('  ');
  });
});

describe('site integration with a real Griffe dump', () => {
  let dir; let pkg; let firstClass;
  beforeAll(async () => {
    const files = (await fs.readdir(FIX)).filter((f) => f.endsWith('.json'));
    const file = files.includes('shapes.json') ? 'shapes.json' : files[0];
    const data = await fs.readJson(path.join(FIX, file));
    pkg = typeof data.kind === 'string' ? data.name : Object.keys(data)[0];
    const root = typeof data.kind === 'string' ? data : data[pkg];
    const members = Array.isArray(root.members) ? root.members : Object.values(root.members || {});
    firstClass = 'Circle'; // re-exported class (an alias at the package top level)
    void members;
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'docslit-pyapi-'));
    await fs.outputFile(path.join(dir, 'api', 'python', `${pkg}.json`), JSON.stringify(data));
    await fs.outputFile(path.join(dir, 'docs', 'reference.md'), `# Reference\n\n::: ${pkg}.${firstClass}\n    options:\n      show_root_heading: true\n`);
    await fs.outputFile(path.join(dir, 'docs', 'guide.md'), `# Guide\n\nSee [the class][${pkg}.${firstClass}] and [\`${pkg}.${firstClass}\`][], not [x][${pkg}.Missing].\n\n\`[keep][${pkg}.${firstClass}]\` in code.\n`);
    await initPythonApi({ python: { packages: [pkg, 'notgenerated'] } }, dir);
  });
  afterAll(async () => { resetPythonApi(); await fs.remove(dir); });

  it('expands a directive into rendered Markdown with anchors', () => {
    expect(firstClass).toBeTruthy();
    const out = expandPythonApi(`::: ${pkg}.${firstClass}\n    options:\n      show_root_heading: true\n`);
    expect(out).toContain(`id="${pkg}.${firstClass}"`);
    expect(out).not.toMatch(/^:::/m);
    expect(pythonApiFingerprint()).toMatch(/^[0-9a-f]{16}$/);
  });

  it('resolves autorefs across pages and warns on unknown ones', () => {
    const warned = [];
    const raw = `See [the class][${pkg}.${firstClass}] and [\`${pkg}.${firstClass}\`][], not [x][${pkg}.Missing].\n\n\`[keep][${pkg}.${firstClass}]\` in code.\n`;
    const out = resolveAutorefs(raw, { warn: (id) => warned.push(id) });
    expect(out).toContain(`[the class](/reference#${pkg}.${firstClass})`);
    expect(out).toContain(`[\`${pkg}.${firstClass}\`](/reference#${pkg}.${firstClass})`);
    expect(out).toContain('not x.');
    expect(out).toContain(`\`[keep][${pkg}.${firstClass}]\``);
    expect(warned).toEqual([`${pkg}.Missing`]);
  });

  it('keeps [`Name`][path] links intact next to other code spans in one table cell', () => {
    const id = `${pkg}.${firstClass}`;
    const out = resolveAutorefs(`| \`x\` | \`Callable[[\`[\`${firstClass}\`][${id}] \`\\|\` [\`${firstClass}\`][${id}]\`], int]\` |`);
    expect(out).toBe(`| \`x\` | \`Callable[[\`[\`${firstClass}\`](/reference#${id}) \`\\|\` [\`${firstClass}\`](/reference#${id})\`], int]\` |`);
  });

  it('shows a placeholder (and warns) when a package has no generated data', () => {
    const w = [];
    const out = expandPythonApi('::: notgenerated.thing\n', { warn: (x) => w.push(x.code) });
    expect(out).toContain('docslit api python notgenerated');
    expect(w).toEqual(['api-data-missing']);
  });

  it('writes a valid Sphinx v2 objects.inv', async () => {
    const out = path.join(dir, 'dist');
    const n = await writeObjectsInv(out, { project: 'Test' });
    expect(n).toBeGreaterThan(0);
    const buf = await fs.readFile(path.join(out, 'objects.inv'));
    const head = buf.toString('latin1').split('\n').slice(0, 4);
    expect(head[0]).toBe('# Sphinx inventory version 2');
    const body = zlib.inflateSync(buf.subarray(head.join('\n').length + 1)).toString();
    expect(body).toContain(`${pkg}.${firstClass} py:class 1 reference#${pkg}.${firstClass} -`);
  });
});

describe('re-exports resolve to the page rendering the canonical object', () => {
  let dir;
  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'docslit-pyapi-alias-'));
    await fs.copy(path.join(FIX, 'shapes.json'), path.join(dir, 'api', 'python', 'shapes.json'));
    await fs.outputFile(path.join(dir, 'docs', 'ref', 'core.md'), '# Core\n\n::: shapes._core\n');
    await initPythonApi({ python: { packages: ['shapes'] } }, dir);
  });
  afterAll(async () => { resetPythonApi(); await fs.remove(dir); });

  it('links shapes.Circle (alias) to the canonical anchor on the core page without warning', () => {
    const warned = [];
    const out = resolveAutorefs('See [`Circle`][shapes.Circle].', { warn: (id) => warned.push(id) });
    expect(out).toMatch(/\(\/ref\/core#shapes\.(_core\.)?Circle\)/);
    expect(warned).toEqual([]);
  });
});
