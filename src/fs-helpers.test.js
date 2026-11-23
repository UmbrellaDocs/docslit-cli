import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import nodeFs from 'node:fs';
import { mkdtemp, mkdir, readFile, readlink, readdir, rename, rm, stat, symlink, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';
import git from 'isomorphic-git';
import { copyFileIfChanged, emptyDir, pathExists, readJson } from './fs-helpers.js';
import { getFileLastmod, getPageLastmods } from './git-dates.js';
import { detectEditUrl } from './config.js';

const execFileAsync = promisify(execFile);
const cli = fileURLToPath(new URL('../bin/docslit.js', import.meta.url));
const require = createRequire(import.meta.url);
let hasEsbuild;
try {
  require.resolve('esbuild');
  hasEsbuild = true;
} catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') throw error;
  hasEsbuild = false;
}
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

  it('compares large media by content, including same-sized changes', async () => {
    const source = path.join(dir, 'source');
    const dest = path.join(dir, 'dest');
    const data = Buffer.alloc(140000, 42);
    await writeFile(source, data);
    expect(await copyFileIfChanged(source, dest, true)).toBe(true);
    expect(await copyFileIfChanged(source, dest, true)).toBe(false);
    data[100000] = 43;
    await writeFile(source, data);
    expect(await copyFileIfChanged(source, dest, true)).toBe(true);
    expect(await readFile(dest)).toEqual(data);
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

  it('shares Git history work without changing individual dates or file fallbacks', async () => {
    await git.init({ fs: nodeFs, dir, defaultBranch: 'main' });
    await mkdir(path.join(dir, 'docs'));
    for (const name of ['first', 'second']) await writeFile(path.join(dir, 'docs', `${name}.md`), `# ${name}`);
    await git.add({ fs: nodeFs, dir, filepath: 'docs/first.md' });
    await git.add({ fs: nodeFs, dir, filepath: 'docs/second.md' });
    const author = { name: 'Test', email: 'test@example.com', timestamp: 1577836800, timezoneOffset: 0 };
    const base = await git.commit({ fs: nodeFs, dir, message: 'Base', author });
    await git.writeRef({ fs: nodeFs, dir, ref: 'refs/heads/side', value: base });
    await writeFile(path.join(dir, 'docs', 'first.md'), '# changed');
    await git.add({ fs: nodeFs, dir, filepath: 'docs/first.md' });
    await git.commit({ fs: nodeFs, dir, message: 'Main', author: { ...author, timestamp: 1577923200 } });
    await git.checkout({ fs: nodeFs, dir, ref: 'side' });
    await writeFile(path.join(dir, 'docs', 'second.md'), '# side');
    await git.add({ fs: nodeFs, dir, filepath: 'docs/second.md' });
    const side = await git.commit({ fs: nodeFs, dir, message: 'Side', author: { ...author, timestamp: 1578009600 } });
    await git.checkout({ fs: nodeFs, dir, ref: 'main' });
    await git.merge({ fs: nodeFs, dir, theirs: side, author: { ...author, timestamp: 1578096000 } });
    await writeFile(path.join(dir, 'docs', 'untracked.md'), '# untracked');
    const pages = { first: {}, second: {}, untracked: {}, missing: {} };
    const expected = {};
    for (const id of Object.keys(pages)) expected[id] = await getFileLastmod(dir, `docs/${id}.md`);
    expect(await getPageLastmods(dir, pages)).toEqual(expected);
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
    expect(await pathExists(path.join(dir, 'dist', 'flexsearch.iife.js'))).toBe(true);
    expect(await readFile(path.join(dir, 'dist', 'index.html'), 'utf8')).toContain('id="search-trigger"');
  }, 120000);

  it('caches included content and invalidates changes, missing files and unsafe symlinks', async () => {
    await mkdir(path.join(dir, 'docs', '_reusables'), { recursive: true });
    await writeFile(path.join(dir, 'docslit.json'), JSON.stringify({
      name: 'Test', editUrl: 'https://example.com/edit',
      sidebar: [{ group: 'Guide', pages: ['intro', 'second'] }],
      build: { ogImages: false, searchIndex: false, llmsTxt: false, mcp: false, sitemap: false },
    }));
    await writeFile(path.join(dir, 'docs', 'intro.md'), '# Hello\n\n<wc-include src="part.md" />');
    await writeFile(path.join(dir, 'docs', 'second.md'), '# Second\n\n<wc-include src="other.md" />');
    await writeFile(path.join(dir, 'docs', '_reusables', 'part.md'), 'First reusable content');
    await writeFile(path.join(dir, 'docs', '_reusables', 'other.md'), 'Unchanged secondary content');
    const runBuild = () => execFileAsync(process.execPath, [
      cli, 'build', '--no-minify', '--incremental',
    ], { cwd: dir, timeout: 60000 });
    await runBuild();
    expect(await readFile(path.join(dir, 'dist', 'intro.html'), 'utf8')).toContain('First reusable content');
    const cacheDir = path.join(dir, 'node_modules', '.cache', 'docslit', 'build', 'pages');
    const cacheFiles = await readdir(cacheDir);
    expect(cacheFiles).toHaveLength(2);
    const cacheEntries = await Promise.all(cacheFiles.map(async file => ({
      file: path.join(cacheDir, file),
      data: JSON.parse(await readFile(path.join(cacheDir, file), 'utf8')),
    })));
    const cachedPage = cacheEntries.find(entry => entry.data.preprocessedMarkdown.includes('First reusable content')).file;
    const otherCachedPage = cacheEntries.find(entry => entry.data.preprocessedMarkdown.includes('Unchanged secondary content')).file;
    const oldTime = new Date('2001-01-01T00:00:00Z');
    await utimes(cachedPage, oldTime, oldTime);
    await utimes(otherCachedPage, oldTime, oldTime);
    await runBuild();
    expect((await stat(cachedPage)).mtimeMs).toBe(oldTime.getTime());
    expect((await stat(otherCachedPage)).mtimeMs).toBe(oldTime.getTime());

    const part = path.join(dir, 'docs', '_reusables', 'part.md');
    await utimes(part, oldTime, oldTime);
    await writeFile(part, 'Other reusable content');
    await utimes(part, oldTime, oldTime);
    const { stdout } = await runBuild();
    const html = await readFile(path.join(dir, 'dist', 'intro.html'), 'utf8');
    expect(html).toContain('Other reusable content');
    expect(html).not.toContain('First reusable content');
    expect((await stat(otherCachedPage)).mtimeMs).toBe(oldTime.getTime());
    expect(stdout).toContain('previously generated optional files');
    for (const file of ['search-index.json', 'llms.txt', 'mcp-server.js', 'sitemap.xml', 'og']) {
      expect(await pathExists(path.join(dir, 'dist', file))).toBe(false);
    }
    await rm(part);
    await expect(runBuild()).rejects.toMatchObject({ stderr: expect.stringContaining('Include target not found') });
    if (process.platform !== 'win32') {
      const outside = path.join(dir, 'outside.md');
      await writeFile(outside, 'Other reusable content');
      await symlink(outside, part);
      await expect(runBuild()).rejects.toMatchObject({ stderr: expect.stringContaining('escapes docs/_reusables via symlink') });
    }
  }, 120000);

  it.skipIf(!hasEsbuild)('reuses minified assets and invalidates changed inputs and corrupt cache entries', async () => {
    await mkdir(path.join(dir, 'docs'));
    const config = {
      name: 'Test', editUrl: 'https://example.com/edit',
      sidebar: [{ group: 'Guide', pages: ['intro'] }],
    };
    const configFile = path.join(dir, 'docslit.json');
    await writeFile(configFile, JSON.stringify(config));
    await writeFile(path.join(dir, 'docs', 'intro.md'), '# Hello');
    const logFile = path.join(dir, 'transforms.log');
    const tracer = path.join(dir, 'trace.cjs');
    await writeFile(tracer, `
      const Module = require('node:module');
      const fs = require('node:fs');
      const original = Module.prototype.require;
      Module.prototype.require = function(id) {
        const result = original.apply(this, arguments);
        if (id !== 'esbuild') return result;
        return { ...result, version: process.env.TEST_ESBUILD_VERSION || result.version,
          transform(...args) {
            fs.appendFileSync(process.env.TEST_TRANSFORMS, args[1].loader + '\\n');
            return result.transform(...args);
          }
        };
      };
    `);
    await writeFile(logFile, '');
    const runBuild = (version = '', ...extra) => execFileAsync(process.execPath, [
      '--require', tracer, cli, 'build', '--incremental', '--no-og-images',
      '--no-search-index', '--no-llms-txt', '--no-mcp', '--no-sitemap', ...extra,
    ], { cwd: dir, timeout: 60000, env: { ...process.env, TEST_TRANSFORMS: logFile, TEST_ESBUILD_VERSION: version } });
    const transforms = async () => (await readFile(logFile, 'utf8')).trim().split('\n').filter(Boolean);

    await runBuild();
    const css = await readFile(path.join(dir, 'dist', 'docslit.css'), 'utf8');
    const js = await readFile(path.join(dir, 'dist', 'docslit.js'), 'utf8');
    const app = await readFile(path.join(dir, 'dist', 'docslit-app.js'), 'utf8');
    expect((await transforms()).sort()).toEqual(['css', 'js', 'js']);
    await runBuild();
    expect((await transforms()).length).toBe(3);
    expect(await readFile(path.join(dir, 'dist', 'docslit.css'), 'utf8')).toBe(css);
    expect(await readFile(path.join(dir, 'dist', 'docslit.js'), 'utf8')).toBe(js);
    expect(await readFile(path.join(dir, 'dist', 'docslit-app.js'), 'utf8')).toBe(app);

    config.theme = { colors: { accent: '#aabbcc' } };
    await writeFile(configFile, JSON.stringify(config));
    await runBuild();
    expect(await transforms()).toHaveLength(4);
    expect((await transforms())[3]).toBe('css');
    expect(await readFile(path.join(dir, 'dist', 'docslit.css'), 'utf8')).not.toBe(css);

    await runBuild('different-esbuild-version');
    expect(await transforms()).toHaveLength(7);
    const assetsDir = path.join(dir, 'node_modules', '.cache', 'docslit', 'build', 'assets');
    const currentCss = await readFile(path.join(dir, 'dist', 'docslit.css'), 'utf8');
    const files = await readdir(assetsDir);
    const entries = await Promise.all(files.map(async file => ({
      file, data: JSON.parse(await readFile(path.join(assetsDir, file), 'utf8')),
    })));
    const cssFiles = entries.filter(entry => entry.data.code === currentCss);
    expect(cssFiles).toHaveLength(2);
    for (const { file } of cssFiles) await writeFile(path.join(assetsDir, file), '{');
    const { stderr } = await runBuild('different-esbuild-version');
    expect(stderr).toContain('invalid minified asset cache');
    expect(await transforms()).toHaveLength(8);
    expect((await transforms())[7]).toBe('css');
    expect(await readFile(path.join(dir, 'dist', 'docslit.css'), 'utf8')).toBe(currentCss);
    await runBuild('different-esbuild-version', '--no-minify');
    expect(await transforms()).toHaveLength(8);
    expect(await readFile(path.join(dir, 'dist', 'docslit.css'), 'utf8')).not.toBe(currentCss);
  }, 120000);

  it('reuses unchanged rendered pages and updates affected outputs', async () => {
    await mkdir(path.join(dir, 'docs'));
    const config = {
      name: 'Test', editUrl: 'https://example.com/edit',
      sidebar: [{ group: 'Guide', pages: ['intro', 'second'] }],
    };
    const configFile = path.join(dir, 'docslit.json');
    await writeFile(configFile, JSON.stringify(config));
    await writeFile(path.join(dir, 'docs', 'intro.md'), '# Intro\n\nOriginal body');
    await writeFile(path.join(dir, 'docs', 'second.md'), '# Second\n\nUnchanged body');
    const runBuild = (...args) => execFileAsync(process.execPath, [
      cli, 'build', '--incremental', '--no-og-images', ...args,
    ], { cwd: dir, timeout: 60000 });
    await runBuild();
    const dist = path.join(dir, 'dist');
    const oldTime = new Date('2001-01-01T00:00:00Z');
    const stableFiles = ['intro.html', 'second.html', 'intro.md', 'second.md',
      'index.html', 'docslit.css', 'docslit.js', 'docslit-app.js', 'flexsearch.js', 'favicon-32x32.png',
      'llms.txt', 'llms-full.txt', 'search-index.json', 'mcp-server.js', '.well-known/agent.json',
      '_headers', '_middleware.js', 'functions/_middleware.js', 'vercel.json'];
    for (const file of stableFiles) await utimes(path.join(dist, file), oldTime, oldTime);
    const htmlCache = path.join(dir, 'node_modules', '.cache', 'docslit', 'build', 'html');
    expect(await readdir(htmlCache)).toHaveLength(2);
    const warm = await runBuild();
    for (const file of stableFiles) expect((await stat(path.join(dist, file))).mtimeMs).toBe(oldTime.getTime());
    expect(warm.stdout).toContain('Reused 2 cached pages');
    expect(warm.stdout).toContain('Reused cached documentation indexes');
    expect(await readdir(htmlCache)).toHaveLength(2);

    await writeFile(path.join(dist, 'search-index.json'), 'tampered');
    await rm(path.join(dist, 'llms.txt'));
    await runBuild();
    expect(await readFile(path.join(dist, 'search-index.json'), 'utf8')).toContain('Original body');
    expect(await readFile(path.join(dist, 'llms.txt'), 'utf8')).toContain('Intro');
    const generatorDir = path.join(dir, 'node_modules', '.cache', 'docslit', 'build', 'generators');
    const generatorFiles = await readdir(generatorDir);
    const { createHash } = await import('node:crypto');
    const code = '{}';
    await writeFile(path.join(generatorDir, generatorFiles[0]), JSON.stringify({
      code, hash: createHash('sha256').update(code).digest('hex'),
    }));
    const invalid = await runBuild();
    expect(invalid.stderr).toContain('invalid documentation index cache');

    await writeFile(path.join(dir, 'docs', 'intro.md'), '# Intro\n\nChanged body');
    await runBuild();
    expect(await readFile(path.join(dist, 'intro.html'), 'utf8')).toContain('Changed body');
    expect(await readFile(path.join(dist, 'index.html'), 'utf8')).toContain('content="0;url=/intro"');
    expect(await readFile(path.join(dist, 'search-index.json'), 'utf8')).toContain('Changed body');
    expect(await readFile(path.join(dist, 'llms-full.txt'), 'utf8')).toContain('Changed body');
    expect((await stat(path.join(dist, 'second.html'))).mtimeMs).toBe(oldTime.getTime());
    expect((await stat(path.join(dist, 'second.md'))).mtimeMs).toBe(oldTime.getTime());
    expect(await readdir(htmlCache)).toHaveLength(3);

    await writeFile(path.join(dist, 'second.html'), 'tampered');
    await rm(path.join(dist, 'intro.html'));
    await runBuild();
    expect(await readFile(path.join(dist, 'second.html'), 'utf8')).toContain('Unchanged body');
    expect(await readFile(path.join(dist, 'intro.html'), 'utf8')).toContain('Changed body');
    expect(await readdir(htmlCache)).toHaveLength(3);

    config.name = 'Updated site';
    await writeFile(configFile, JSON.stringify(config));
    await runBuild();
    expect(await readFile(path.join(dist, 'second.html'), 'utf8')).toContain('Updated site');
    expect(await readdir(htmlCache)).toHaveLength(5);

    await runBuild('--no-search-index');
    expect(await pathExists(path.join(dist, 'search-index.json'))).toBe(false);
    expect(await pathExists(path.join(dist, 'llms.txt'))).toBe(true);
    await runBuild('--no-llms-txt');
    expect(await pathExists(path.join(dist, 'llms.txt'))).toBe(false);
    expect(await pathExists(path.join(dist, 'search-index.json'))).toBe(true);
    await runBuild();
    expect(await pathExists(path.join(dist, 'llms.txt'))).toBe(true);
    expect(await pathExists(path.join(dist, 'search-index.json'))).toBe(true);
  }, 120000);

  it('removes only unchanged owned stale outputs, even after cleaning the build cache', async () => {
    await mkdir(path.join(dir, 'docs', 'nested'), { recursive: true });
    const config = {
      name: 'Test', url: 'https://docs.example.com', editUrl: 'https://example.com/edit',
      sidebar: [{ group: 'Guide', pages: ['intro', 'old', 'nested/old'] }],
    };
    const configFile = path.join(dir, 'docslit.json');
    await writeFile(configFile, JSON.stringify(config));
    for (const id of ['intro', 'old', 'nested/old']) await writeFile(path.join(dir, 'docs', `${id}.md`), `# ${id}`);
    const runBuild = (...args) => execFileAsync(process.execPath, [
      cli, 'build', '--incremental', '--no-minify', ...args,
    ], { cwd: dir, timeout: 60000 });
    await runBuild();
    const dist = path.join(dir, 'dist');
    await runBuild('--out', 'other', '--no-og-images');
    await mkdir(path.join(dir, 'docs', 'og'));
    await writeFile(path.join(dir, 'docs', 'og', 'old.png'), await readFile(path.join(dist, 'og', 'old.png')));
    await writeFile(path.join(dist, 'old.md'), 'user modified');
    await writeFile(path.join(dist, 'untracked.html'), 'user file');
    await mkdir(path.join(dir, 'node_modules', '.cache', 'docslit', 'other'), { recursive: true });
    await writeFile(path.join(dir, 'node_modules', '.cache', 'docslit', 'other', 'keep'), 'keep');
    await execFileAsync(process.execPath, [cli, 'cache', 'clean'], { cwd: dir });
    expect(await pathExists(path.join(dir, 'node_modules', '.cache', 'docslit', 'build'))).toBe(false);
    expect(await pathExists(path.join(dir, 'node_modules', '.cache', 'docslit', 'other', 'keep'))).toBe(true);
    config.sidebar[0].pages = ['intro'];
    await writeFile(configFile, JSON.stringify(config));
    const { stderr } = await runBuild('--no-og-images', '--no-search-index', '--no-llms-txt', '--no-mcp', '--no-sitemap');
    expect(stderr).toContain('preserving modified generated file');
    for (const file of ['old.html', 'nested/old.html', 'nested/old.md', 'og/nested--old.png', 'llms.txt', 'search-index.json', 'mcp-server.js', 'sitemap.xml']) {
      expect(await pathExists(path.join(dist, file)), file).toBe(false);
    }
    expect(await pathExists(path.join(dist, 'og', 'old.png'))).toBe(true);
    expect(await readFile(path.join(dist, 'old.md'), 'utf8')).toBe('user modified');
    expect(await readFile(path.join(dist, 'untracked.html'), 'utf8')).toBe('user file');
    expect(await pathExists(path.join(dist, 'index.html'))).toBe(true);
    expect(await pathExists(path.join(dir, 'other', 'old.html'))).toBe(true);
    await runBuild('--out', 'other', '--no-og-images');
    expect(await pathExists(path.join(dir, 'other', 'old.html'))).toBe(false);
  }, 120000);

  it.skipIf(process.platform === 'win32')('does not follow stale output paths through symlinks', async () => {
    await mkdir(path.join(dir, 'docs', 'nested'), { recursive: true });
    const config = { name: 'Test', editUrl: 'https://example.com/edit', sidebar: [{ group: 'Guide', pages: ['intro', 'nested/old'] }] };
    const configFile = path.join(dir, 'docslit.json');
    await writeFile(configFile, JSON.stringify(config));
    await writeFile(path.join(dir, 'docs', 'intro.md'), '# Intro');
    await writeFile(path.join(dir, 'docs', 'nested', 'old.md'), '# Old');
    const runBuild = () => execFileAsync(process.execPath, [
      cli, 'build', '--incremental', '--no-minify', '--no-og-images', '--no-search-index', '--no-llms-txt', '--no-mcp', '--no-sitemap',
    ], { cwd: dir, timeout: 60000 });
    await runBuild();
    const output = path.join(dir, 'dist', 'nested');
    const outside = path.join(dir, 'outside');
    await rename(output, outside);
    await symlink(outside, output, 'dir');
    config.sidebar[0].pages = ['intro'];
    await writeFile(configFile, JSON.stringify(config));
    await runBuild();
    expect(await pathExists(path.join(outside, 'old.html'))).toBe(true);
    expect(await pathExists(path.join(outside, 'old.md'))).toBe(true);
  }, 120000);

  it('updates incremental redirects without duplicating rules or deleting user content', async () => {
    await mkdir(path.join(dir, 'docs'));
    const config = {
      name: 'Test', editUrl: 'https://example.com/edit',
      sidebar: [{ group: 'Guide', pages: ['intro'] }], redirects: { '/old': '/intro' },
    };
    const configFile = path.join(dir, 'docslit.json');
    await writeFile(configFile, JSON.stringify(config));
    await writeFile(path.join(dir, 'docs', 'intro.md'), '# Intro');
    const runBuild = () => execFileAsync(process.execPath, [
      cli, 'build', '--incremental', '--no-minify', '--no-og-images', '--no-search-index', '--no-llms-txt', '--no-mcp', '--no-sitemap',
    ], { cwd: dir, timeout: 60000 });
    const redirectsFile = path.join(dir, 'dist', '_redirects');
    await runBuild();
    const first = await readFile(redirectsFile, 'utf8');
    await runBuild();
    expect(await readFile(redirectsFile, 'utf8')).toBe(first);
    config.redirects['/old'] = '/new';
    await writeFile(configFile, JSON.stringify(config));
    await runBuild();
    const updated = await readFile(redirectsFile, 'utf8');
    expect(updated).toContain('/old  /new  301');
    expect(updated).not.toContain('/old  /intro  301');
    delete config.redirects['/old'];
    await writeFile(configFile, JSON.stringify(config));
    await runBuild();
    expect(await pathExists(redirectsFile)).toBe(false);
    expect(await pathExists(path.join(dir, 'dist', 'old.html'))).toBe(false);

    config.redirects['/old'] = '/intro';
    await writeFile(configFile, JSON.stringify(config));
    await runBuild();
    await writeFile(redirectsFile, (await readFile(redirectsFile, 'utf8')) + '/custom /target 301\n');
    delete config.redirects['/old'];
    await writeFile(configFile, JSON.stringify(config));
    await runBuild();
    expect(await readFile(redirectsFile, 'utf8')).toContain('/custom /target 301');
  }, 120000);

  it('skips rendering on cache hits and invalidates shared rendering context', async () => {
    const helpers = new URL('./build-helpers.js', import.meta.url).href;
    const script = `
      import { writePageHtmlBatch } from ${JSON.stringify(helpers)};
      let renders = 0;
      const render = async (id, data) => { renders++; return id + data.html; };
      const entries = [['intro', { html: ' body', destHtml: 'page.html' }]];
      const context = { config: { name: 'Test' } };
      const build = () => writePageHtmlBatch(entries, render, { incremental: true, context });
      await build();
      await build();
      const warmRenders = renders;
      context.config.name = 'Changed';
      await build();
      context.config.announcement = { message: 'Hello' };
      await build();
      await build();
      console.log(JSON.stringify({ warmRenders, renders }));
    `;
    const { stdout } = await execFileAsync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: dir, timeout: 60000,
    });
    expect(JSON.parse(stdout)).toEqual({ warmRenders: 1, renders: 4 });
  }, 120000);

  it('creates OG workers on demand and replaces a failed worker for queued jobs', async () => {
    const tracer = path.join(dir, 'workers.cjs');
    await writeFile(tracer, `
      const { EventEmitter } = require('node:events');
      const threads = require('node:worker_threads');
      const os = require('node:os');
      global.workerCount = 0;
      os.cpus = () => Array(8).fill({});
      threads.Worker = class extends EventEmitter {
        constructor() { super(); global.workerCount++; }
        postMessage({ svg }) {
          queueMicrotask(() => {
            if (svg === 'fail') { this.emit('error', new Error('render failed')); this.emit('exit', 1); }
            else this.emit('message', { png: Buffer.from(svg) });
          });
        }
        terminate() { return Promise.resolve(0); }
      };
      require('node:module').syncBuiltinESMExports();
    `);
    const pool = new URL('./og-image-pool.js', import.meta.url).href;
    const script = `
      import { renderSvgToPng, shutdownOgImagePool } from ${JSON.stringify(pool)};
      await renderSvgToPng('one');
      const single = global.workerCount;
      await Promise.all(['a', 'b', 'c'].map(renderSvgToPng));
      const concurrent = global.workerCount;
      const results = await Promise.allSettled(['fail', 'a', 'b', 'c'].map(renderSvgToPng));
      console.log(JSON.stringify({ single, concurrent, replaced: global.workerCount, results: results.map(r => r.status) }));
      await shutdownOgImagePool();
    `;
    const { stdout } = await execFileAsync(process.execPath, ['--require', tracer, '--input-type=module', '-e', script], {
      cwd: dir, timeout: 60000,
    });
    expect(JSON.parse(stdout)).toEqual({
      single: 1, concurrent: 3, replaced: 4, results: ['rejected', 'fulfilled', 'fulfilled', 'fulfilled'],
    });
  });

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
    const config = {
      name: 'Test', editUrl: 'https://example.com/edit',
      sidebar: [{ group: 'Guide', pages: ['intro'] }],
      versions: { default: 'v1', list: [{ version: 'v1', branch: 'main' }, { version: 'v0', branch: 'old' }] },
    };
    await writeFile(path.join(dir, 'docslit.json'), JSON.stringify(config));
    await writeFile(path.join(dir, 'docs', 'intro.md'), '# Hello');
    await git.init({ fs: nodeFs, dir, defaultBranch: 'main' });
    await git.add({ fs: nodeFs, dir, filepath: 'docslit.json' });
    await git.add({ fs: nodeFs, dir, filepath: 'docs/intro.md' });
    const oid = await git.commit({ fs: nodeFs, dir, message: 'Docs', author: { name: 'Test', email: 'test@example.com' } });
    await git.writeRef({ fs: nodeFs, dir, ref: 'refs/heads/old', value: oid });
    const runBuild = () => execFileAsync(process.execPath, [
      cli, 'build', '--incremental', '--no-minify', '--no-og-images', '--no-search-index', '--no-llms-txt', '--profile',
    ], { cwd: dir, timeout: 60000 });
    const profiled = await runBuild();
    expect(profiled.stdout).toContain('Phase');
    expect(profiled.stdout).toContain('cleanup');
    for (const version of ['v1', 'v0']) {
      expect(await readFile(path.join(dir, 'dist', version, 'intro.html'), 'utf8')).not.toContain('id="search-trigger"');
      expect(await pathExists(path.join(dir, 'dist', version, 'search-index.json'))).toBe(false);
      expect(await pathExists(path.join(dir, 'dist', version, 'llms.txt'))).toBe(false);
    }
    const agent = JSON.parse(await readFile(path.join(dir, 'dist', '.well-known', 'agent.json'), 'utf8'));
    expect(agent.docs).not.toHaveProperty('llms_txt');
    expect(agent.docs).not.toHaveProperty('search_index');
    const oldTime = new Date('2001-01-01T00:00:00Z');
    for (const version of ['v1', 'v0']) await utimes(path.join(dir, 'dist', version, 'intro.html'), oldTime, oldTime);
    await runBuild();
    for (const version of ['v1', 'v0']) {
      expect((await stat(path.join(dir, 'dist', version, 'intro.html'))).mtimeMs).toBe(oldTime.getTime());
    }
    config.versions.list.pop();
    await writeFile(path.join(dir, 'docslit.json'), JSON.stringify(config));
    await runBuild();
    expect(await pathExists(path.join(dir, 'dist', 'v0', 'intro.html'))).toBe(false);
    expect(await pathExists(path.join(dir, 'dist', 'v0', 'index.html'))).toBe(false);
    expect(await pathExists(path.join(dir, 'dist', 'v1', 'index.html'))).toBe(true);
  }, 120000);
});
