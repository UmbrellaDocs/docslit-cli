/**
 * The site root. When the first page is not "index", index.html is a redirect to it;
 * when the first page IS "index" (most sites), index.html must stay the page itself,
 * not a redirect to itself.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const BIN = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'docslit.js');

function project(files, config) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'docslit-root-'));
  for (const [rel, text] of Object.entries(files)) {
    fs.outputFileSync(path.join(dir, 'docs', rel), text);
  }
  fs.writeJsonSync(path.join(dir, 'docslit.json'), { name: 'Root', url: 'https://example.com', ...config });
  const res = spawnSync('node', [BIN, 'build'], { cwd: dir, encoding: 'utf8' });
  if (res.status !== 0) throw new Error(`build failed:\n${res.stdout}\n${res.stderr}`);
  return dir;
}

const page = (title, body) => `---\ntitle: ${title}\ndescription: ${title} page used by the root index tests, long enough to pass.\n---\n\n# ${title}\n\n${body}\n`;

describe('root index.html', () => {
  const dirs = [];
  afterAll(() => { for (const d of dirs) fs.removeSync(d); });

  it('is the home page itself when the first page is "index"', () => {
    const dir = project({ 'index.md': page('Welcome', 'Home page body text.'), 'guide.md': page('Guide', 'Guide text.') }, { sidebar: ['index', 'guide'] });
    dirs.push(dir);
    const html = fs.readFileSync(path.join(dir, 'dist', 'index.html'), 'utf8');
    expect(html).toContain('Home page body text.');
    expect(html).not.toContain('http-equiv="refresh"');
  });

  it('redirects to the first page when it is something else', () => {
    const dir = project({ 'start.md': page('Start', 'Start text.'), 'guide.md': page('Guide', 'Guide text.') }, { sidebar: ['start', 'guide'] });
    dirs.push(dir);
    const html = fs.readFileSync(path.join(dir, 'dist', 'index.html'), 'utf8');
    expect(html).toContain('http-equiv="refresh"');
    expect(html).toContain('url=/start');
  });
});
