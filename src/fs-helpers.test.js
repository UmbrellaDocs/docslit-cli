import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import nodeFs from 'node:fs';
import { mkdtemp, mkdir, readFile, readlink, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import git from 'isomorphic-git';
import { emptyDir, pathExists, readJson } from './fs-helpers.js';
import { getFileLastmod } from './git-dates.js';

const execFileAsync = promisify(execFile);
const cli = fileURLToPath(new URL('../bin/docslit.js', import.meta.url));
let dir;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'docslit-fs-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('filesystem helpers', () => {
  it('distinguishes missing paths from invalid arguments', async () => {
    expect(await pathExists(path.join(dir, 'missing'))).toBe(false);
    expect(await pathExists(dir)).toBe(true);
    await expect(pathExists(null)).rejects.toThrow();
  });

  it('creates or empties directories without removing the directory itself', async () => {
    const output = path.join(dir, 'output');
    await emptyDir(output);
    await mkdir(path.join(output, 'nested'));
    await writeFile(path.join(output, 'nested', 'file'), 'content');
    await emptyDir(output);
    expect(await readdir(output)).toEqual([]);
  });

  it('reads JSON with a BOM and identifies malformed files', async () => {
    const file = path.join(dir, 'data.json');
    await writeFile(file, '\uFEFF{"name":"docs"}');
    expect(await readJson(file)).toEqual({ name: 'docs' });
    await writeFile(file, '{invalid');
    await expect(readJson(file)).rejects.toThrow(file);
  });

  it('uses git history for last-modified dates', async () => {
    const file = path.join(dir, 'page.md');
    await git.init({ fs: nodeFs, dir, defaultBranch: 'main' });
    await writeFile(file, '# Page');
    await git.add({ fs: nodeFs, dir, filepath: 'page.md' });
    await git.commit({
      fs: nodeFs,
      dir,
      message: 'Add page',
      author: { name: 'Test', email: 'test@example.com', timestamp: 1577836800, timezoneOffset: 0 },
    });
    expect(await getFileLastmod(dir, 'page.md')).toBe('2020-01-01');
  });
});

describe('build filesystem behavior', () => {
  it('cleans normal builds and preserves files on incremental builds', async () => {
    await mkdir(path.join(dir, 'docs'));
    await mkdir(path.join(dir, 'components'));
    await mkdir(path.join(dir, 'dist'));
    await writeFile(path.join(dir, 'docslit.json'), JSON.stringify({
      name: 'Test',
      sidebar: [{ group: 'Guide', pages: ['intro'] }],
    }));
    await writeFile(path.join(dir, 'docs', 'intro.md'), '# Hello');
    await writeFile(path.join(dir, 'components', 'example.js'), 'export const value = 1;');
    if (process.platform !== 'win32') {
      await symlink('example.js', path.join(dir, 'components', 'linked.js'));
    }
    await writeFile(path.join(dir, 'dist', 'stale.txt'), 'stale');

    const runBuild = (...args) => execFileAsync(process.execPath, [
      cli, 'build', '--no-minify', '--no-og-images', ...args,
    ], { cwd: dir, timeout: 60000 });

    await runBuild();
    expect(await pathExists(path.join(dir, 'dist', 'stale.txt'))).toBe(false);
    expect(await readFile(path.join(dir, 'dist', 'components', 'example.js'), 'utf8'))
      .toBe('export const value = 1;');
    if (process.platform !== 'win32') {
      expect(await readlink(path.join(dir, 'dist', 'components', 'linked.js'))).toBe('example.js');
    }

    await writeFile(path.join(dir, 'dist', 'keep.txt'), 'keep');
    await runBuild('--incremental');
    expect(await readFile(path.join(dir, 'dist', 'keep.txt'), 'utf8')).toBe('keep');
    if (process.platform !== 'win32') {
      expect(await readlink(path.join(dir, 'dist', 'components', 'linked.js'))).toBe('example.js');
    }
  }, 120000);
});
