import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { addPageToSidebar } from './new-page.js';

const BIN = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'docslit.js');

function run(args, cwd) {
  return new Promise((resolve) => {
    const proc = spawn('node', [BIN, ...args], { cwd });
    let stdout = ''; let stderr = '';
    proc.stdout.on('data', (d) => (stdout += d));
    proc.stderr.on('data', (d) => (stderr += d));
    proc.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

describe('addPageToSidebar / docslit new --position', () => {
  let dir;
  const sidebar = () => fs.readJson(path.join(dir, 'docslit.json')).then((c) => c.sidebar);
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'docslit-newpage-'));
    await fs.outputJson(path.join(dir, 'docslit.json'), {
      name: 'N',
      sidebar: [
        { group: 'Start', pages: ['intro', 'install'] },
        { group: 'Guides', pages: ['guides/a', { group: 'Advanced', pages: ['guides/adv/x', { id: 'guides/adv/y' }] }] },
      ],
    });
  });
  afterEach(() => fs.remove(dir));

  it('inserts at a 1-based position in an explicit top-level group', async () => {
    await addPageToSidebar(dir, 'quick', { group: 'Start', position: 2 });
    expect((await sidebar())[0].pages).toEqual(['intro', 'quick', 'install']);
  });

  it('appends when the position is out of range or missing', async () => {
    await addPageToSidebar(dir, 'p1', { group: 'Start', position: 99 });
    await addPageToSidebar(dir, 'p2', { group: 'Start' });
    expect((await sidebar())[0].pages).toEqual(['intro', 'install', 'p1', 'p2']);
  });

  it('finds nested sub-groups by name, with a position', async () => {
    const r = await addPageToSidebar(dir, 'guides/adv/z', { group: 'Advanced', position: 1 });
    expect(r).toMatchObject({ sidebarUpdated: true, group: 'Advanced' });
    expect((await sidebar())[1].pages[1].pages).toEqual(['guides/adv/z', 'guides/adv/x', { id: 'guides/adv/y' }]);
    expect((await sidebar()).map((g) => g.group)).toEqual(['Start', 'Guides']); // no stray new group
  });

  it('infers the innermost group from sibling pages in nested sub-groups', async () => {
    const r = await addPageToSidebar(dir, 'guides/adv/w', { inferGroup: true });
    expect(r.group).toBe('Advanced');
    expect((await sidebar())[1].pages[1].pages.at(-1)).toBe('guides/adv/w');
    const r2 = await addPageToSidebar(dir, 'guides/b', { inferGroup: true });
    expect(r2.group).toBe('Guides');
  });

  it('does not list a page twice, including pages given as { id } objects', async () => {
    const r = await addPageToSidebar(dir, 'guides/adv/y', { group: 'Start' });
    expect(r).toMatchObject({ sidebarUpdated: false, group: 'Advanced' });
  });

  it('CLI: new --position writes sidebar_position AND inserts at that position in the group', async () => {
    const r = await run(['new', 'quick', '--group', 'Start', '--position', '2', '--json'], dir);
    expect(r.code, r.stderr).toBe(0);
    expect(JSON.parse(r.stdout)).toMatchObject({ id: 'quick', sidebarUpdated: true, group: 'Start' });
    expect((await sidebar())[0].pages).toEqual(['intro', 'quick', 'install']);
    expect(await fs.readFile(path.join(dir, 'docs/quick.md'), 'utf8')).toMatch(/sidebar_position: 2/);
  });
});

describe('docslit deploy --out', () => {
  it('points every recipe, the middleware lookup and the one-liners at --out', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'docslit-deploy-'));
    try {
      await fs.outputJson(path.join(dir, 'docslit.json'), { name: 'D', sidebar: [] });
      await fs.outputFile(path.join(dir, 'public', 'functions', '_middleware.js'), '// mw\n');
      const r = await run(['deploy', '--cloudflare', '--netlify', '--github-pages', '--out', 'public'], dir);
      expect(r.code, r.stderr).toBe(0);
      expect(await fs.readFile(path.join(dir, 'wrangler.toml'), 'utf8')).toMatch(/directory = "\.\/public"/);
      const netlify = await fs.readFile(path.join(dir, 'netlify.toml'), 'utf8');
      expect(netlify).toMatch(/publish = "public"/);
      expect(netlify).toMatch(/npx docslit build --out public/);
      const wf = await fs.readFile(path.join(dir, '.github/workflows/docslit.yml'), 'utf8');
      expect(wf).toMatch(/path: public/);
      expect(wf).toMatch(/npx docslit build --out public/);
      expect(await fs.readFile(path.join(dir, 'functions/_middleware.js'), 'utf8')).toBe('// mw\n');
      expect(r.stdout).toMatch(/wrangler pages deploy public/);
      expect(r.stdout).not.toMatch(/ dist\b/);

      const dflt = await run(['deploy', '--cloudflare'], dir);
      expect(dflt.code).toBe(0);
      expect(await fs.readFile(path.join(dir, 'wrangler.toml'), 'utf8')).toMatch(/directory = "\.\/dist"/);
    } finally {
      await fs.remove(dir);
    }
  });
});
