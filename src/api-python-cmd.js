/**
 * docslit api python <package> [--docstyle google|numpy|sphinx] [--search <dir>]... [--from <file.json>] [--pages] [--json]
 *
 * Creates (or refreshes) the Griffe JSON dump that backs the Python API reference
 * (`api/python/<package>.json`), registers the package in docslit.json `python.packages`
 * and optionally scaffolds one `::: module` page per public module. Python is only
 * needed here, never at build time.
 */
import fs from 'fs-extra';
import path from 'path';
import { execFile } from 'child_process';
import pc from 'picocolors';
import { patchTopLevelKey } from './theme-cmd.js';

export const DOCSTYLES = ['google', 'numpy', 'sphinx'];
const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/;

/** Griffe launchers to try, in order. */
export const GRIFFE_CANDIDATES = [
  ['griffe'],
  ['uvx', 'griffe'],
  ['python3', '-m', 'griffe'],
  ['python', '-m', 'griffe'],
];

export const INSTALL_HINT = 'Install Griffe with `pip install griffe` or `uv tool install griffe`, or pass --from <file.json> with an existing dump.';

/** Default runner: never rejects; resolves { code, stdout, stderr, error }. */
export function defaultRunner(file, args, opts = {}) {
  return new Promise((resolve) => {
    execFile(file, args, { ...opts, maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({
        code: err ? (typeof err.code === 'number' ? err.code : 1) : 0,
        stdout: String(stdout || ''),
        stderr: String(stderr || ''),
        error: err && typeof err.code === 'string' ? err.code : undefined,
      });
    });
  });
}

/** First candidate whose `--version` probe succeeds, or null. */
export async function detectGriffe(run, cwd) {
  for (const cand of GRIFFE_CANDIDATES) {
    const [file, ...pre] = cand;
    const r = await run(file, [...pre, '--version'], { cwd, timeout: 120000 });
    if (r.code === 0 && !r.error) return cand;
  }
  return null;
}

export function griffeDumpArgs(pkg, { docstyle, searches, output }) {
  const a = ['dump', pkg, '--full', '--resolve-aliases', '--docstyle', docstyle];
  for (const s of searches) a.push('--search', s);
  a.push('--output', output);
  return a;
}

/** The module object of a Griffe dump (wrapped as `{ pkg: module }` or bare), or null. */
export function griffeModule(data, pkg) {
  const isMod = (m) => m && typeof m === 'object' && !Array.isArray(m) && m.kind === 'module' && m.members && typeof m.members === 'object';
  if (isMod(data)) return data;
  if (data && typeof data === 'object' && !Array.isArray(data) && isMod(data[pkg])) return data[pkg];
  return null;
}

/** Public module paths (dotted) of a dump, root first. Skips _private modules and tests. */
export function publicModules(root, pkg) {
  const out = [];
  const skip = (n) => n.startsWith('_') || /^(tests?|conftest)$/.test(n) || /^test_/.test(n) || /_tests?$/.test(n);
  const walk = (mod, p) => {
    out.push(p);
    for (const [name, m] of Object.entries(mod.members || {})) {
      if (!m || m.kind !== 'module' || skip(name)) continue;
      walk(m, `${p}.${name}`);
    }
  };
  walk(root, pkg);
  return out;
}

function detectIndent(text) {
  const m = /^([ \t]+)"/m.exec(text);
  return m ? m[1] : '  ';
}

function hasGroup(items, name) {
  return Array.isArray(items) && items.some((g) => g && typeof g === 'object' && g.group === name);
}

/** Pure: new docslit.json text with the package, docstyle and (optionally) the sidebar group. */
export function applyApiConfig(text, { pkg, docstyle, group }) {
  const config = JSON.parse(text);
  const indent = detectIndent(text);
  let out = text;
  const py = config.python && typeof config.python === 'object' && !Array.isArray(config.python) ? { ...config.python } : {};
  const pkgs = Array.isArray(py.packages) ? [...py.packages] : [];
  if (!pkgs.includes(pkg)) pkgs.push(pkg);
  py.packages = pkgs;
  if (docstyle) py.docstringStyle = docstyle;
  const last = Object.keys(config).filter((k) => k !== 'python').at(-1);
  out = patchTopLevelKey(out, 'python', py, indent, last ? [last] : []);
  let sidebarChange = null;
  if (group) {
    if (Array.isArray(config.tabs) && config.tabs.length) {
      const tab = config.tabs.find((t) => t && Array.isArray(t.sidebar)) || null;
      const first = config.tabs[0];
      const anyHas = config.tabs.some((t) => t && hasGroup(t.sidebar, group.group));
      if (anyHas) sidebarChange = 'present';
      else if (first && (Array.isArray(first.sidebar) || first.sidebar === undefined) && !first.href) {
        const tabs = JSON.parse(JSON.stringify(config.tabs));
        tabs[0].sidebar = [...(tabs[0].sidebar || []), group];
        out = patchTopLevelKey(out, 'tabs', tabs, indent, []);
        sidebarChange = 'added';
      } else if (tab) {
        const tabs = JSON.parse(JSON.stringify(config.tabs));
        const i = config.tabs.indexOf(tab);
        tabs[i].sidebar = [...tabs[i].sidebar, group];
        out = patchTopLevelKey(out, 'tabs', tabs, indent, []);
        sidebarChange = 'added';
      } else sidebarChange = 'unsupported';
    } else if (config.sidebar === 'auto') {
      sidebarChange = 'auto';
    } else if (hasGroup(config.sidebar, group.group)) {
      sidebarChange = 'present';
    } else {
      out = patchTopLevelKey(out, 'sidebar', [...(Array.isArray(config.sidebar) ? config.sidebar : []), group], indent, ['name', 'url']);
      sidebarChange = 'added';
    }
  }
  return { text: out, sidebarChange };
}

async function writeIfAbsent(abs, rel, content, report) {
  if (await fs.pathExists(abs)) { report.skipped.push(rel); return; }
  await fs.ensureDir(path.dirname(abs));
  await fs.writeFile(abs, content);
  report.written.push(rel);
}

/** Scaffold docs/api/<pkg>/... pages. Returns { written, skipped, pageIds }. */
export async function scaffoldPages(dir, pkg, modules) {
  const report = { written: [], skipped: [], pageIds: [] };
  const base = path.join('docs', 'api', pkg);
  const idOf = (mod) => (mod === pkg ? pkg : mod.slice(pkg.length + 1).split('.').join('/'));
  const items = [];
  for (const mod of modules) {
    const id = `api/${pkg}/${idOf(mod)}`;
    const rel = path.join(base, ...idOf(mod).split('/')) + '.md';
    await writeIfAbsent(path.join(dir, rel), rel, `---\ntitle: ${mod}\n---\n\n::: ${mod}\n`, report);
    report.pageIds.push(id);
    items.push({ mod, id });
  }
  const index = `---\ntitle: ${pkg} API reference\n---\n\nModules of \`${pkg}\`:\n\n${items.map((i) => `- [\`${i.mod}\`](/${i.id})`).join('\n')}\n`;
  const idxRel = path.join(base, 'index.md');
  await writeIfAbsent(path.join(dir, idxRel), idxRel, index, report);
  report.pageIds.unshift(`api/${pkg}/index`);
  return report;
}

function parseArgs(args) {
  const o = { searches: [], pages: false, json: false, errors: [] };
  const positional = [];
  const val = (i, flag) => {
    const v = args[i + 1];
    if (v === undefined || v.startsWith('--')) { o.errors.push(`${flag} needs a value`); return undefined; }
    return v;
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--docstyle') { o.docstyle = val(i, a); i++; }
    else if (a === '--search') { const v = val(i, a); if (v !== undefined) o.searches.push(v); i++; }
    else if (a === '--from') { o.from = val(i, a); i++; }
    else if (a === '--pages') o.pages = true;
    else if (a === '--json') o.json = true;
    else if (a.startsWith('--')) o.errors.push(`Unknown option ${a}`);
    else positional.push(a);
  }
  o.sub = positional[0];
  o.pkg = positional[1];
  if (positional.length > 2) o.errors.push(`Unexpected argument ${positional[2]}`);
  return o;
}

/**
 * Programmatic entry. `run` is injectable (default: child_process.execFile).
 * Returns { ok, error?, ...result }; never exits the process.
 */
export async function runApiPython(dir, opts, { run = defaultRunner } = {}) {
  const { pkg, from, pages = false, searches = [] } = opts;
  const fail = (error) => ({ ok: false, error });
  if (!pkg) return fail('Please provide a package name, e.g. `docslit api python mypkg`.');
  if (!NAME_RE.test(pkg)) return fail(`Invalid package name "${pkg}": use the importable dotted name (letters, digits, underscores).`);
  if (opts.docstyle && !DOCSTYLES.includes(opts.docstyle)) return fail(`Unknown --docstyle "${opts.docstyle}". Use one of: ${DOCSTYLES.join(', ')}.`);

  const configPath = path.join(dir, 'docslit.json');
  if (!await fs.pathExists(configPath)) return fail('docslit.json not found. Run this inside a DocsLit project (`docslit init` creates one).');
  const configText = await fs.readFile(configPath, 'utf8');
  let config;
  try { config = JSON.parse(configText); } catch (e) { return fail(`docslit.json is not valid JSON: ${e.message}`); }

  const docstyle = opts.docstyle || config.python?.docstringStyle || 'google';
  if (!DOCSTYLES.includes(docstyle)) return fail(`docslit.json python.docstringStyle "${docstyle}" is not one of: ${DOCSTYLES.join(', ')}.`);
  const rel = path.posix.join('api', 'python', `${pkg}.json`);
  const outAbs = path.join(dir, rel);
  let launcher = null;

  if (from) {
    const src = path.resolve(dir, from);
    let text;
    try { text = await fs.readFile(src, 'utf8'); } catch { return fail(`Cannot read --from file ${from}.`); }
    let data;
    try { data = JSON.parse(text); } catch (e) { return fail(`${from} is not valid JSON: ${e.message}`); }
    if (!griffeModule(data, pkg)) return fail(`${from} is not a Griffe dump for "${pkg}": expected a top-level module object (kind "module" with members), as written by \`griffe dump ${pkg}\`.`);
    await fs.ensureDir(path.dirname(outAbs));
    if (path.resolve(src) !== path.resolve(outAbs)) await fs.writeFile(outAbs, text);
  } else {
    launcher = await detectGriffe(run, dir);
    if (!launcher) return fail(`Griffe was not found (tried griffe, uvx griffe, python3 -m griffe, python -m griffe). ${INSTALL_HINT}`);
    const search = searches.length ? searches : [await fs.pathExists(path.join(dir, 'src')) ? 'src' : '.'];
    await fs.ensureDir(path.dirname(outAbs));
    const [file, ...pre] = launcher;
    const r = await run(file, [...pre, ...griffeDumpArgs(pkg, { docstyle, searches: search, output: rel })], { cwd: dir });
    if (r.code !== 0 || r.error) {
      const detail = (r.stderr || r.stdout || '').trim();
      return fail(`griffe dump failed for "${pkg}" (exit ${r.code}).${detail ? `\n${detail}` : ''}`);
    }
    let data;
    try { data = JSON.parse(await fs.readFile(outAbs, 'utf8')); } catch { return fail(`griffe produced no valid JSON at ${rel}.`); }
    if (!griffeModule(data, pkg)) return fail(`griffe output ${rel} does not contain a module named "${pkg}".`);
  }

  const root = griffeModule(await fs.readJson(outAbs), pkg);
  const modules = publicModules(root, pkg);

  let pageReport = { written: [], skipped: [], pageIds: [] };
  let group = null;
  if (pages) {
    pageReport = await scaffoldPages(dir, pkg, modules);
    group = { group: 'API reference', pages: pageReport.pageIds };
  }
  const applied = applyApiConfig(configText, { pkg, docstyle: opts.docstyle, group });
  if (applied.text !== configText) await fs.writeFile(configPath, applied.text);

  return {
    ok: true,
    package: pkg,
    json: rel,
    docstyle,
    source: from ? 'from' : launcher.join(' '),
    modules,
    pages: { written: pageReport.written, skipped: pageReport.skipped },
    sidebar: pages ? applied.sidebarChange : null,
  };
}

export async function apiCmd(args) {
  const sub = args[0];
  if (sub !== 'python') {
    console.error(`  ${pc.red('Error:')} ${sub ? `Unknown api subcommand "${sub}".` : 'Missing api subcommand.'}\n`);
    console.error('  Usage: docslit api python <package> [--docstyle google|numpy|sphinx] [--search <dir>]... [--from <file.json>] [--pages] [--json]\n');
    process.exit(1);
  }
  const o = parseArgs(args);
  if (o.errors.length) {
    console.error(`  ${pc.red('Error:')} ${o.errors[0]}\n`);
    console.error('  Usage: docslit api python <package> [--docstyle google|numpy|sphinx] [--search <dir>]... [--from <file.json>] [--pages] [--json]\n');
    process.exit(1);
  }
  const res = await runApiPython(process.cwd(), o);
  if (o.json) {
    console.log(JSON.stringify(res.ok ? res : { ok: false, error: res.error }, null, 2));
    if (!res.ok) process.exit(1);
    return;
  }
  if (!res.ok) {
    console.error(`\n  ${pc.red('Error:')} ${res.error.replace(/\n/g, '\n  ')}\n`);
    process.exit(1);
  }
  console.log(`\n  ${pc.green('✓')} ${res.json} ${pc.dim(`(${res.modules.length} modules, ${res.source === 'from' ? 'copied' : `via ${res.source}`})`)}`);
  console.log(`  ${pc.green('✓')} docslit.json: python.packages includes ${pc.cyan(res.package)}`);
  for (const p of res.pages.written) console.log(`  ${pc.green('+')} ${p}`);
  for (const p of res.pages.skipped) console.log(`  ${pc.yellow('=')} ${p} ${pc.dim('(exists, skipped)')}`);
  if (res.sidebar === 'added') console.log(`  ${pc.green('✓')} sidebar: added "API reference"`);
  else if (res.sidebar === 'auto' || res.sidebar === 'unsupported') console.log(pc.dim('  Sidebar not changed (auto or unsupported layout): add the api/ pages by hand if needed.'));
  console.log(pc.dim(`  Use "::: ${res.package}.<module>" in any page to render an object.\n`));
}
