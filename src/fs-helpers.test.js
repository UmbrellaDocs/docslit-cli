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
import { detectEditUrl } from './config.js';

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

  it('detects GitHub edit URLs, preferring upstream and its main ref', async () => {
    await git.init({ fs: nodeFs, dir, defaultBranch: 'main' });
    await git.addRemote({ fs: nodeFs, dir, remote: 'origin', url: 'https://github.com/acme/origin.git' });
    await git.addRemote({ fs: nodeFs, dir, remote: 'upstream', url: 'git@github.com:acme/upstream.git' });
    await writeFile(path.join(dir, 'page.md'), '# Page');
    await git.add({ fs: nodeFs, dir, filepath: 'page.md' });
    const oid = await git.commit({
      fs: nodeFs, dir, message: 'Add page',
      author: { name: 'Test', email: 'test@example.com' },
    });
    await git.writeRef({ fs: nodeFs, dir, ref: 'refs/remotes/upstream/main', value: oid });
    const expected = 'https://www.draftview.app/edit?url=https://github.com/acme/upstream/blob/main/docs';
    expect(await detectEditUrl(dir)).toBe(expected);
    const configModule = new URL('./config.js', import.meta.url).href;
    const { stdout } = await execFileAsync(process.execPath, [
      '--input-type=module', '-e',
      `import { detectEditUrl } from ${JSON.stringify(configModule)}; console.log(await detectEditUrl(process.cwd()));`,
    ], { cwd: dir, env: { ...process.env, PATH: dir } });
    expect(stdout.trim()).toBe(expected);
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

  it('honors generator opt-outs without advertising unavailable features', async () => {
    await mkdir(path.join(dir, 'docs'));
    await writeFile(path.join(dir, 'docslit.json'), JSON.stringify({
      name: 'Test', url: 'https://docs.example.com', editUrl: 'https://example.com/edit',
      sidebar: [{ group: 'Guide', pages: ['intro'] }],
    }));
    await writeFile(path.join(dir, 'docs', 'intro.md'), '# Hello\n\nWorld');
    const runBuild = (...args) => execFileAsync(process.execPath, [
      cli, 'build', '--no-minify', '--no-og-images', ...args,
    ], { cwd: dir, timeout: 60000 });

    await runBuild();
    expect(await pathExists(path.join(dir, 'dist', 'search-index.json'))).toBe(true);
    expect(await pathExists(path.join(dir, 'dist', 'llms.txt'))).toBe(true);
    expect(await readFile(path.join(dir, 'dist', 'intro.html'), 'utf8')).toContain('id="search-trigger"');
    expect(await readFile(path.join(dir, 'dist', 'mcp-server.js'), 'utf8')).toContain("name: 'search_docs'");

    await runBuild('--no-search-index', '--no-llms-txt');
    for (const file of ['search-index.json', 'flexsearch.js', 'llms.txt', 'llms-full.txt']) {
      expect(await pathExists(path.join(dir, 'dist', file))).toBe(false);
    }
    const html = await readFile(path.join(dir, 'dist', 'intro.html'), 'utf8');
    expect(html).not.toContain('id="search-trigger"');
    expect(html).not.toContain('id="search-overlay"');
    expect(html).not.toContain('llms.txt');
    expect(await readFile(path.join(dir, 'dist', 'intro.md'), 'utf8')).not.toContain('llms.txt');
    expect(await readFile(path.join(dir, 'dist', 'robots.txt'), 'utf8')).not.toContain('llms.txt');
    const agent = JSON.parse(await readFile(path.join(dir, 'dist', '.well-known', 'agent.json'), 'utf8'));
    expect(agent.docs).not.toHaveProperty('search_index');
    expect(agent.docs).not.toHaveProperty('llms_txt');
    expect(await readFile(path.join(dir, 'dist', 'mcp-server.js'), 'utf8')).not.toContain("name: 'search_docs'");
    await execFileAsync(process.execPath, ['--check', path.join(dir, 'dist', 'mcp-server.js')]);

    await runBuild('--offline', '--no-search-index', '--no-llms-txt');
    expect(await pathExists(path.join(dir, 'dist', 'search-index.js'))).toBe(true);
    expect(await pathExists(path.join(dir, 'dist', 'flexsearch.js'))).toBe(true);
    expect(await readFile(path.join(dir, 'dist', 'index.html'), 'utf8')).toContain('id="search-trigger"');
  }, 120000);

  it('rebuilds included content on incremental builds and reports preserved outputs', async () => {
    await mkdir(path.join(dir, 'docs', '_reusables'), { recursive: true });
    await writeFile(path.join(dir, 'docslit.json'), JSON.stringify({
      name: 'Test', editUrl: 'https://example.com/edit',
      sidebar: [{ group: 'Guide', pages: ['intro'] }],
      build: { ogImages: false, searchIndex: false, llmsTxt: false, mcp: false, sitemap: false },
    }));
    await writeFile(path.join(dir, 'docs', 'intro.md'), '# Hello\n\n<wc-include src="part.md" />');
    await writeFile(path.join(dir, 'docs', '_reusables', 'part.md'), 'First reusable content');
    const runBuild = () => execFileAsync(process.execPath, [
      cli, 'build', '--no-minify', '--incremental',
    ], { cwd: dir, timeout: 60000 });
    await runBuild();
    expect(await readFile(path.join(dir, 'dist', 'intro.html'), 'utf8')).toContain('First reusable content');
    await writeFile(path.join(dir, 'docs', '_reusables', 'part.md'), 'Updated reusable content');
    const { stdout } = await runBuild();
    const html = await readFile(path.join(dir, 'dist', 'intro.html'), 'utf8');
    expect(html).toContain('Updated reusable content');
    expect(html).not.toContain('First reusable content');
    expect(stdout).toContain('previously generated optional files');
    for (const file of ['search-index.json', 'llms.txt', 'mcp-server.js', 'sitemap.xml', 'og']) {
      expect(await pathExists(path.join(dir, 'dist', file))).toBe(false);
    }
  }, 120000);

  it('runs the warm-minimal benchmark against a project after an untimed warm-up', async () => {
    await mkdir(path.join(dir, 'docs'));
    await writeFile(path.join(dir, 'docslit.json'), JSON.stringify({
      name: 'Test', editUrl: 'https://example.com/edit',
      sidebar: [{ group: 'Guide', pages: ['intro'] }],
    }));
    await writeFile(path.join(dir, 'docs', 'intro.md'), '# Hello');
    const benchmark = fileURLToPath(new URL('../scripts/benchmark-build.js', import.meta.url));
    const { stdout } = await execFileAsync(process.execPath, [
      benchmark, 'warm-minimal', '--project', dir, '--out', 'bench-output', '--runs', '1',
    ], { cwd: dir, timeout: 60000 });
    expect(stdout).toContain('Warming incremental cache (not timed)');
    expect(stdout).toContain('Average:');
    for (const file of ['og', 'search-index.json', 'llms.txt', 'mcp-server.js', 'sitemap.xml']) {
      expect(await pathExists(path.join(dir, 'bench-output', file))).toBe(false);
    }
  }, 120000);

  it('avoids loading optional tooling for a plain minimal build', async () => {
    await mkdir(path.join(dir, 'docs'));
    await writeFile(path.join(dir, 'docslit.json'), JSON.stringify({
      name: 'Test', sidebar: [{ group: 'Guide', pages: ['intro'] }],
    }));
    await writeFile(path.join(dir, 'docs', 'intro.md'), '# Hello');
    const tracer = path.join(dir, 'trace.mjs');
    await writeFile(tracer, `
      import { registerHooks } from 'node:module';
      registerHooks({ resolve(specifier, context, nextResolve) {
        if (specifier.endsWith('/src/build.js')) process.stderr.write('BUILD LOADED\\n');
        if (/^(isomorphic-git|@redocly\\/openapi-core|pdf-lib|express)(\\/|$)/.test(specifier)) {
          process.stderr.write('OPTIONAL: ' + specifier + '\\n');
        }
        return nextResolve(specifier, context);
      } });
    `);
    const { stderr } = await execFileAsync(process.execPath, [
      '--import', tracer, cli, 'build', '--no-minify', '--no-og-images', '--no-search-index',
      '--no-llms-txt', '--no-mcp', '--no-sitemap',
    ], { cwd: dir, timeout: 60000 });
    expect(stderr).toContain('BUILD LOADED');
    expect(stderr).not.toContain('OPTIONAL:');
  }, 120000);

  it('applies generator opt-outs to versioned pages and metadata', async () => {
    await mkdir(path.join(dir, 'docs'));
    await writeFile(path.join(dir, 'docslit.json'), JSON.stringify({
      name: 'Test', editUrl: 'https://example.com/edit',
      sidebar: [{ group: 'Guide', pages: ['intro'] }],
      versions: { default: 'v1', list: [{ version: 'v1', branch: 'main' }, { version: 'v0', branch: 'old' }] },
    }));
    await writeFile(path.join(dir, 'docs', 'intro.md'), '# Hello');
    await git.init({ fs: nodeFs, dir, defaultBranch: 'main' });
    await git.add({ fs: nodeFs, dir, filepath: 'docslit.json' });
    await git.add({ fs: nodeFs, dir, filepath: 'docs/intro.md' });
    const oid = await git.commit({ fs: nodeFs, dir, message: 'Docs', author: { name: 'Test', email: 'test@example.com' } });
    await git.writeRef({ fs: nodeFs, dir, ref: 'refs/heads/old', value: oid });
    await execFileAsync(process.execPath, [
      cli, 'build', '--no-minify', '--no-og-images', '--no-search-index', '--no-llms-txt',
    ], { cwd: dir, timeout: 60000 });
    for (const version of ['v1', 'v0']) {
      expect(await readFile(path.join(dir, 'dist', version, 'intro.html'), 'utf8')).not.toContain('id="search-trigger"');
      expect(await pathExists(path.join(dir, 'dist', version, 'search-index.json'))).toBe(false);
      expect(await pathExists(path.join(dir, 'dist', version, 'llms.txt'))).toBe(false);
    }
    const agent = JSON.parse(await readFile(path.join(dir, 'dist', '.well-known', 'agent.json'), 'utf8'));
    expect(agent.docs).not.toHaveProperty('llms_txt');
    expect(agent.docs).not.toHaveProperty('search_index');
  }, 120000);
});
