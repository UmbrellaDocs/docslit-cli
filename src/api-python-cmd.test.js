import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { fileURLToPath } from 'url';
import { runApiPython, griffeModule, publicModules, applyApiConfig, GRIFFE_CANDIDATES } from './api-python-cmd.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BIN = path.join(HERE, '..', 'bin', 'docslit.js');
const FIXTURE = path.join(HERE, 'test-fixtures', 'api-python-cmd', 'tinylib.json');
const VENV_BIN = '/tmp/claude-0/-home-user/5bdcbc90-6720-54b2-959e-b6d552ee138a/scratchpad/apidocs/v/bin';
const dirs = [];
afterEach(async () => { while (dirs.length) await fs.remove(dirs.pop()); });

async function proj(config = { name: 'x', sidebar: [{ group: 'Guides', pages: ['a'] }] }, raw) {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'docslit-apipy-'));
  dirs.push(d);
  if (raw) await fs.writeFile(path.join(d, 'docslit.json'), raw);
  else await fs.writeJson(path.join(d, 'docslit.json'), config, { spaces: 2 });
  return d;
}
const cfg = (d) => fs.readJson(path.join(d, 'docslit.json'));

/** Fake runner: records calls; `available` is the launcher prefix (joined) that works. */
function fakeRunner(available, { dumpFail } = {}) {
  const calls = [];
  const run = async (file, args, opts) => {
    calls.push({ file, args, cwd: opts?.cwd });
    const line = [file, ...args].join(' ');
    if (args.at(-1) === '--version') {
      return line.startsWith(available + ' ') ? { code: 0, stdout: 'griffe 2', stderr: '' } : { code: 1, stdout: '', stderr: '', error: 'ENOENT' };
    }
    if (dumpFail) return { code: 1, stdout: '', stderr: 'boom: cannot import', };
    const out = args[args.indexOf('--output') + 1];
    await fs.copy(FIXTURE, path.join(opts.cwd, out));
    return { code: 0, stdout: '', stderr: '' };
  };
  return { run, calls };
}

describe('griffe invocation', () => {
  it('uses griffe on PATH first and builds the documented dump command', async () => {
    const d = await proj();
    const { run, calls } = fakeRunner('griffe');
    const r = await runApiPython(d, { pkg: 'tinylib' }, { run });
    expect(r.ok).toBe(true);
    expect(calls.map((c) => c.file)).toEqual(['griffe', 'griffe']);
    expect(calls[1].args).toEqual(['dump', 'tinylib', '--full', '--resolve-aliases', '--docstyle', 'google', '--search', '.', '--output', 'api/python/tinylib.json']);
    expect(calls[1].cwd).toBe(d);
    expect(await fs.pathExists(path.join(d, 'api/python/tinylib.json'))).toBe(true);
  });

  it('falls back through uvx, python3 -m, python -m in order', async () => {
    for (const [avail, probes] of [
      ['uvx griffe', ['griffe', 'uvx']],
      ['python3 -m griffe', ['griffe', 'uvx', 'python3']],
      ['python -m griffe', ['griffe', 'uvx', 'python3', 'python']],
    ]) {
      const d = await proj();
      const { run, calls } = fakeRunner(avail);
      const r = await runApiPython(d, { pkg: 'tinylib' }, { run });
      expect(r.ok, avail).toBe(true);
      expect(calls.slice(0, probes.length).map((c) => c.file)).toEqual(probes);
      expect(calls.at(-1).args).toContain('dump');
      expect(r.source).toBe(avail);
    }
    expect(GRIFFE_CANDIDATES).toHaveLength(4);
  });

  it('defaults --search to src when it exists; passes repeated --search and --docstyle', async () => {
    const d = await proj();
    await fs.ensureDir(path.join(d, 'src'));
    let f = fakeRunner('griffe');
    await runApiPython(d, { pkg: 'tinylib' }, { run: f.run });
    expect(f.calls.at(-1).args).toEqual(expect.arrayContaining(['--search', 'src']));
    f = fakeRunner('griffe');
    await runApiPython(d, { pkg: 'tinylib', docstyle: 'numpy', searches: ['a', 'b'] }, { run: f.run });
    const args = f.calls.at(-1).args;
    expect(args.join(' ')).toContain('--docstyle numpy --search a --search b --output');
  });

  it('uses python.docstringStyle from docslit.json when --docstyle is absent', async () => {
    const d = await proj({ name: 'x', python: { docstringStyle: 'sphinx' } });
    const f = fakeRunner('griffe');
    await runApiPython(d, { pkg: 'tinylib' }, { run: f.run });
    expect(f.calls.at(-1).args).toEqual(expect.arrayContaining(['--docstyle', 'sphinx']));
  });

  it('gives an install hint when no launcher works, and propagates stderr on failure', async () => {
    const d = await proj();
    const none = await runApiPython(d, { pkg: 'tinylib' }, { run: fakeRunner('nothing').run });
    expect(none.ok).toBe(false);
    expect(none.error).toContain('pip install griffe');
    expect(none.error).toContain('uv tool install griffe');
    const bad = await runApiPython(d, { pkg: 'tinylib' }, { run: fakeRunner('griffe', { dumpFail: true }).run });
    expect(bad.ok).toBe(false);
    expect(bad.error).toContain('boom: cannot import');
    expect((await cfg(d)).python).toBeUndefined();
  });

  it('rejects bad names, styles and a missing project', async () => {
    const d = await proj();
    expect((await runApiPython(d, { pkg: '../x' })).ok).toBe(false);
    expect((await runApiPython(d, { pkg: 'a', docstyle: 'rst' })).error).toContain('--docstyle');
    const empty = await fs.mkdtemp(path.join(os.tmpdir(), 'docslit-apipy-e-'));
    dirs.push(empty);
    expect((await runApiPython(empty, { pkg: 'a' })).error).toContain('docslit.json');
  });
});

describe('--from', () => {
  it('copies a valid dump and never runs griffe', async () => {
    const d = await proj();
    const calls = [];
    const r = await runApiPython(d, { pkg: 'tinylib', from: FIXTURE }, { run: async (...a) => { calls.push(a); return { code: 1, stdout: '', stderr: '' }; } });
    expect(r.ok).toBe(true);
    expect(calls).toEqual([]);
    expect(await fs.readFile(path.join(d, 'api/python/tinylib.json'), 'utf8')).toBe(await fs.readFile(FIXTURE, 'utf8'));
  });

  it('rejects non-JSON, non-Griffe JSON and the wrong package', async () => {
    const d = await proj();
    const w = async (name, text) => { const p = path.join(d, name); await fs.writeFile(p, text); return p; };
    expect((await runApiPython(d, { pkg: 'tinylib', from: await w('a.json', 'nope') })).error).toContain('not valid JSON');
    expect((await runApiPython(d, { pkg: 'tinylib', from: await w('b.json', '{"openapi":"3"}') })).error).toContain('not a Griffe dump');
    expect((await runApiPython(d, { pkg: 'tinylib', from: await w('c.json', '[]') })).ok).toBe(false);
    expect((await runApiPython(d, { pkg: 'other', from: FIXTURE })).ok).toBe(false);
    expect((await runApiPython(d, { pkg: 'tinylib', from: 'missing.json' })).error).toContain('Cannot read');
  });

  it('accepts a bare module object', () => {
    expect(griffeModule({ kind: 'module', members: {} }, 'x')).toBeTruthy();
    expect(griffeModule({ kind: 'module' }, 'x')).toBeNull();
  });
});

describe('docslit.json update', () => {
  it('adds the package once, sets docstringStyle, and preserves formatting and key order', async () => {
    const raw = '{\n    "$schema": "x",\n    "name": "Docs",\n    "theme": "peppermint",\n    "sidebar": ["a"]\n}\n';
    const d = await proj(null, raw);
    await runApiPython(d, { pkg: 'tinylib', from: FIXTURE, docstyle: 'numpy' });
    await runApiPython(d, { pkg: 'tinylib', from: FIXTURE });
    const text = await fs.readFile(path.join(d, 'docslit.json'), 'utf8');
    const c = JSON.parse(text);
    expect(c.python).toEqual({ packages: ['tinylib'], docstringStyle: 'numpy' });
    expect(Object.keys(c)).toEqual(['$schema', 'name', 'theme', 'sidebar', 'python']);
    expect(text.startsWith('{\n    "$schema": "x",\n    "name": "Docs",\n    "theme": "peppermint",\n    "sidebar": ["a"],')).toBe(true);
    expect(text.endsWith('\n')).toBe(true);
  });

  it('keeps existing python options and other packages', async () => {
    const d = await proj({ name: 'x', python: { packages: ['other'], options: { show_root_heading: true } } });
    await runApiPython(d, { pkg: 'tinylib', from: FIXTURE });
    expect((await cfg(d)).python).toEqual({ packages: ['other', 'tinylib'], options: { show_root_heading: true } });
  });
});

describe('--pages', () => {
  it('lists public modules only (no _private, no tests)', () => {
    const root = JSON.parse(fs.readFileSync(FIXTURE, 'utf8')).tinylib;
    expect(publicModules(root, 'tinylib')).toEqual(['tinylib', 'tinylib.core', 'tinylib.util']);
  });

  it('scaffolds pages, an index and the sidebar group; never overwrites', async () => {
    const d = await proj();
    await fs.ensureDir(path.join(d, 'docs/api/tinylib'));
    await fs.writeFile(path.join(d, 'docs/api/tinylib/core.md'), 'MINE');
    const r = await runApiPython(d, { pkg: 'tinylib', from: FIXTURE, pages: true });
    expect(r.pages.skipped).toEqual(['docs/api/tinylib/core.md']);
    expect(r.pages.written.sort()).toEqual(['docs/api/tinylib/index.md', 'docs/api/tinylib/tinylib.md', 'docs/api/tinylib/util.md']);
    expect(await fs.readFile(path.join(d, 'docs/api/tinylib/core.md'), 'utf8')).toBe('MINE');
    expect(await fs.readFile(path.join(d, 'docs/api/tinylib/util.md'), 'utf8')).toBe('---\ntitle: tinylib.util\n---\n\n::: tinylib.util\n');
    const idx = await fs.readFile(path.join(d, 'docs/api/tinylib/index.md'), 'utf8');
    expect(idx).toContain('[`tinylib.core`](/api/tinylib/core)');
    const c = await cfg(d);
    expect(c.sidebar.at(-1)).toEqual({ group: 'API reference', pages: ['api/tinylib/index', 'api/tinylib/tinylib', 'api/tinylib/core', 'api/tinylib/util'] });
    // second run: no duplicate group, everything skipped
    const r2 = await runApiPython(d, { pkg: 'tinylib', from: FIXTURE, pages: true });
    expect(r2.pages.written).toEqual([]);
    expect(r2.sidebar).toBe('present');
    expect((await cfg(d)).sidebar.filter((g) => g.group === 'API reference')).toHaveLength(1);
  });

  it('adds the group to the first tab when the config uses tabs', () => {
    const text = JSON.stringify({ name: 'x', tabs: [{ tab: 'Docs', sidebar: [{ group: 'G', pages: ['a'] }] }, { tab: 'Ref', sidebar: [] }] }, null, 2);
    const { text: out, sidebarChange } = applyApiConfig(text, { pkg: 'p', group: { group: 'API reference', pages: ['api/p/index'] } });
    const c = JSON.parse(out);
    expect(sidebarChange).toBe('added');
    expect(c.tabs[0].sidebar.map((g) => g.group)).toEqual(['G', 'API reference']);
    expect(c.tabs[1].sidebar).toEqual([]);
    expect(c.sidebar).toBeUndefined();
  });

  it('leaves sidebar "auto" alone', async () => {
    const d = await proj({ name: 'x', sidebar: 'auto' });
    const r = await runApiPython(d, { pkg: 'tinylib', from: FIXTURE, pages: true });
    expect(r.sidebar).toBe('auto');
    expect((await cfg(d)).sidebar).toBe('auto');
    expect(await fs.pathExists(path.join(d, 'docs/api/tinylib/index.md'))).toBe(true);
  });
});

describe('CLI', () => {
  const run = (args, cwd, env) => new Promise((resolve) => execFile('node', [BIN, ...args], { cwd, env: { ...process.env, ...env } }, (err, stdout, stderr) => resolve({ code: err ? err.code : 0, stdout, stderr })));

  it('--json reports the result via --from', async () => {
    const d = await proj();
    const r = await run(['api', 'python', 'tinylib', '--from', FIXTURE, '--pages', '--json'], d);
    expect(r.code).toBe(0);
    const j = JSON.parse(r.stdout);
    expect(j).toMatchObject({ ok: true, package: 'tinylib', json: 'api/python/tinylib.json', modules: ['tinylib', 'tinylib.core', 'tinylib.util'] });
    expect(j.pages.written).toHaveLength(4);
    expect(j.pages.skipped).toEqual([]);
  });

  it('errors on unknown subcommand and missing package', async () => {
    const d = await proj();
    expect((await run(['api', 'ruby'], d)).code).toBe(1);
    const r = await run(['api', 'python', '--json'], d);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.stdout).ok).toBe(false);
  });

  it.runIf(fs.existsSync(path.join(VENV_BIN, 'griffe')))('real end-to-end: runs the real griffe on a scratch package', async () => {
    const d = await proj();
    await fs.ensureDir(path.join(d, 'src', 'e2epkg'));
    await fs.writeFile(path.join(d, 'src/e2epkg/__init__.py'), '"""E2E."""\n\ndef hi(name: str) -> str:\n    """Say hi.\n\n    Args:\n        name: Who.\n    """\n    return name\n');
    await fs.writeFile(path.join(d, 'src/e2epkg/_hidden.py'), 'X = 1\n');
    const r = await run(['api', 'python', 'e2epkg', '--pages', '--json'], d, { PATH: `${VENV_BIN}:${process.env.PATH}` });
    expect(r.stderr).toBe('');
    const j = JSON.parse(r.stdout);
    expect(j.ok).toBe(true);
    expect(j.source).toBe('griffe');
    expect(j.modules).toEqual(['e2epkg']);
    const dump = await fs.readJson(path.join(d, 'api/python/e2epkg.json'));
    expect(dump.e2epkg.members.hi.docstring.value).toContain('Say hi.');
    expect((await cfg(d)).python.packages).toEqual(['e2epkg']);
  }, 60000);
});
