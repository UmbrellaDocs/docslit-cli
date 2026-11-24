import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as hl from './highlighter.js';

describe('highlight disk cache', () => {
  const cwd = process.cwd();
  let dir;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'docslit-hl-'));
    process.chdir(dir);
  });

  afterAll(() => {
    process.chdir(cwd);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('does not rewrite the cache file while highlighting, and writes it once on flush', async () => {
    await hl.ensureLangs('```js\nlet a = 1;\n```');
    for (let i = 0; i < 200; i++) {
      expect(hl.highlight(`const value${i} = ${i};`, 'js')).toContain('value');
    }
    expect(hl.diskCacheWrites).toBe(0);

    await hl.flushHighlightCache();
    expect(hl.diskCacheWrites).toBe(1);
    const cache = JSON.parse(fs.readFileSync(path.join(dir, 'node_modules/.cache/docslit/shiki.json'), 'utf8'));
    expect(Object.keys(cache)).toHaveLength(200);

    // Nothing new: a second flush is a no-op.
    await hl.flushHighlightCache();
    expect(hl.diskCacheWrites).toBe(1);
  });
});
