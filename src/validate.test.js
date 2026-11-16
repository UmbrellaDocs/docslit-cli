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
