import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { fileURLToPath } from 'url';
import { getComponentManifest } from './component-manifest.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const BIN = path.join(ROOT, 'bin', 'docslit.js');

function run(args, cwd) {
  return new Promise((resolve) => {
    execFile('node', [BIN, ...args], { cwd, timeout: 30000 }, (err, stdout, stderr) => {
      resolve({ code: err ? err.code : 0, stdout, stderr });
    });
  });
}

describe('docslit components', () => {
  it('--json prints the whole manifest and nothing else', async () => {
    const { code, stdout } = await run(['components', '--json'], ROOT);
    expect(code).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.length).toBe(getComponentManifest().length);
    expect(parsed.find((c) => c.tag === 'wc-callout').attributes.some((a) => a.name === 'type')).toBe(true);
  });

  it('--json <tag> prints one entry; unknown tag exits 1', async () => {
    const one = await run(['components', 'wc-tabs', '--json'], ROOT);
    expect(JSON.parse(one.stdout).tag).toBe('wc-tabs');
    const bad = await run(['components', 'wc-nope', '--json'], ROOT);
    expect(bad.code).toBe(1);
    expect(JSON.parse(bad.stdout).error).toMatch(/Unknown component/);
  });

  it('pretty list mentions categories and tags', async () => {
    const { stdout } = await run(['components'], ROOT);
    expect(stdout).toContain('wc-callout');
    expect(stdout).toContain('Layout');
    const detail = await run(['components', 'callout'], ROOT);
    expect(detail.stdout).toContain('Attributes');
    expect(detail.stdout).toContain('Example');
  });
});

describe('docslit schema', () => {
  it('prints the config and frontmatter schemas', async () => {
    const cfg = JSON.parse((await run(['schema'], ROOT)).stdout);
    expect(cfg.$id).toContain('docslit.schema.json');
    const fm = JSON.parse((await run(['schema', 'frontmatter'], ROOT)).stdout);
    expect(fm.properties.title).toBeTruthy();
    expect((await run(['schema', 'bogus'], ROOT)).code).toBe(1);
  });
});

describe('JSON schemas', () => {
  const read = (f) => fs.readJsonSync(path.join(ROOT, 'schema', f));

  it('parse and describe every known property', () => {
    for (const f of ['docslit.schema.json', 'frontmatter.schema.json']) {
      const s = read(f);
      expect(s.type).toBe('object');
      for (const [key, def] of Object.entries(s.properties)) {
        expect(def.description || def.$ref, `${f}:${key}`).toBeTruthy();
      }
    }
  });

  it('describes every top-level key of the docs repo docslit.json', () => {
    const docsConfig = path.join(ROOT, '..', 'docslit-docs', 'docslit.json');
    if (!fs.pathExistsSync(docsConfig)) return; // docs repo not checked out next to the CLI
    const known = new Set(Object.keys(read('docslit.schema.json').properties));
    const missing = Object.keys(fs.readJsonSync(docsConfig)).filter((k) => !known.has(k));
    expect(missing).toEqual([]);
  });

  it('accepts the generated init config and sidebar autogenerate forms (when ajv is available)', async () => {
    let Ajv;
    try { Ajv = (await import('ajv/dist/2020.js')).default; } catch { return; }
    const ajv = new Ajv({ strict: false, allErrors: true });
    const validate = ajv.compile(read('docslit.schema.json'));
    const ok = (cfg) => { const v = validate(cfg); if (!v) console.error(validate.errors); return v; };
    expect(ok({ $schema: 'x', name: 'a', sidebar: [{ group: 'G', pages: ['a', { id: 'b', title: 'B' }, { group: 'Sub', pages: ['c'] }] }] })).toBe(true);
    expect(ok({ sidebar: [{ group: 'G', autogenerate: 'guides' }] })).toBe(true);
    expect(ok({ sidebar: [{ group: 'G', autogenerate: { directory: 'guides', collapsed: true } }] })).toBe(true);
    expect(ok({ sidebar: 'auto' })).toBe(true);
    expect(ok({ name: 'a', versions: { default: '1', list: [{ version: '1', branch: 'main' }] }, analytics: { provider: 'plausible', domain: 'x.com' } })).toBe(true);
    expect(ok({ sidebar: 5 })).toBe(false);
    const docsConfig = path.join(ROOT, '..', 'docslit-docs', 'docslit.json');
    if (fs.pathExistsSync(docsConfig)) expect(ok(fs.readJsonSync(docsConfig))).toBe(true);
  });
});

describe('docslit init / new', () => {
  let tmp;
  beforeAll(async () => { tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'docslit-agent-')); });
  afterAll(async () => { await fs.remove(tmp); });

  it('init writes $schema as the first key and new --json works non-interactively', async () => {
    const init = await run(['init', 'proj'], tmp);
    expect(init.code).toBe(0);
    const proj = path.join(tmp, 'proj');
    const cfg = fs.readJsonSync(path.join(proj, 'docslit.json'));
    expect(Object.keys(cfg)[0]).toBe('$schema');
    expect(cfg.$schema).toBe('https://unpkg.com/docslit/schema/docslit.schema.json');

    const v = await run(['validate', proj, '--format', 'json'], tmp);
    const vr = JSON.parse(v.stdout);
    expect(vr.issues.some((i) => /\$schema/.test(i.message))).toBe(false);

    const created = await run(['new', 'guides/auth', '--title', 'Auth: setup', '--group', 'Guides', '--description', 'How to: log in', '--json'], proj);
    expect(created.code).toBe(0);
    expect(JSON.parse(created.stdout)).toEqual({ id: 'guides/auth', file: 'docs/guides/auth.md', sidebarUpdated: true, group: 'Guides' });
    const page = fs.readFileSync(path.join(proj, 'docs', 'guides', 'auth.md'), 'utf8');
    expect(page).toContain('description: \'How to: log in\'');
    const sidebar = fs.readJsonSync(path.join(proj, 'docslit.json')).sidebar;
    expect(sidebar.find((g) => g.group === 'Guides').pages).toContain('guides/auth');

    const again = await run(['new', 'guides/auth', '--json'], proj);
    expect(again.code).toBe(1);
    expect(JSON.parse(again.stdout).error).toMatch(/already exists/);
  });

  it('--help lists the new commands and flags', async () => {
    const { stdout } = await run(['--help'], ROOT);
    for (const s of ['docslit components', 'docslit schema', '--format <fmt>', '--description', '--position', '--tool']) expect(stdout).toContain(s);
  });
});
