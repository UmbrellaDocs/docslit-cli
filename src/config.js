import fs from 'node:fs/promises';
import { pathExists } from './fs-helpers.js';
import path from 'path';
import nodeFs from 'node:fs';
import { expandAllSidebars, expandSidebarValue, expandTabsValue, hasTabAutogenerate, createFileListSource, hasAutogenerate } from './auto-sidebar.js';
import { applyNavigation, collectIds } from './navigation.js';

const _warned = new Set();
function warnOnce(msg) {
  if (_warned.has(msg)) return;
  _warned.add(msg);
  console.warn(`  Warning: ${msg}`);
}
import { setMathConfig } from './math.js';
import { initPythonApi } from './api-python/site.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

async function getGit() {
  const mod = await import('isomorphic-git');
  return mod.default;
}

export async function loadConfig(cwd) {
  const configPath = path.join(cwd, 'docslit.json');
  if (!await pathExists(configPath)) {
    console.error(`  Error: docslit.json not found in ${cwd}`);
    console.error(`  Run "docslit init" to create a new project.`);
    process.exit(1);
  }
  const raw = await fs.readFile(configPath, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    console.error(`  Error: docslit.json is not valid JSON.`);
    process.exit(1);
  }
  try {
    if (!parsed.attributes || typeof parsed.attributes !== 'object' || Array.isArray(parsed.attributes)) {
      parsed.attributes = {};
    }
    if (!parsed.editUrl) {
      parsed.editUrl = await detectEditUrl(cwd);
    }
    setMathConfig(parsed.math);
    await initPythonApi(parsed, cwd);
    return await expandAllSidebars(parsed, cwd, { warn: warnOnce });
  } catch (e) {
    console.error(`  Error: could not load docslit.json: ${e.message}`);
    process.exit(1);
  }
}

export async function detectEditUrl(dir) {
  try {
    if (!await pathExists(path.join(dir, '.git'))) return null;
    let remoteName;
    let url;
    let branch;
    try {
      const { stdout } = await execFileAsync('git', ['config', '--local', '--null', '--get-regexp', '^remote\\.(upstream|origin)\\.url$'], { cwd: dir });
      const remotes = stdout.split('\0').map(entry => entry.match(/^remote\.(upstream|origin)\.url\n([\s\S]*)$/)).filter(Boolean);
      const remote = remotes.find(r => r[1] === 'upstream') || remotes.find(r => r[1] === 'origin');
      if (!remote?.[2]) return null;
      [, remoteName, url] = remote;
      try {
        await execFileAsync('git', ['show-ref', '--verify', '--quiet', `refs/remotes/${remoteName}/main`], { cwd: dir });
        branch = 'main';
      } catch {
        branch = 'master';
      }
    } catch (error) {
      if (error.code !== 'ENOENT') return null;
      const git = await getGit();
      const remotes = await git.listRemotes({ fs: nodeFs, dir });
      const remote = remotes.find(r => r.remote === 'upstream') || remotes.find(r => r.remote === 'origin');
      if (!remote?.url) return null;
      remoteName = remote.remote;
      url = remote.url;
      try {
        await git.resolveRef({ fs: nodeFs, dir, ref: 'refs/remotes/' + remoteName + '/main' });
        branch = 'main';
      } catch {
        branch = 'master';
      }
    }
    url = url.replace(/^git@github\.com:/, 'https://github.com/');
    url = url.replace(/\.git$/, '');
    if (!url.includes('github.com')) return null;
    return `https://www.draftview.app/edit?url=${url}/blob/${branch}/docs`;
  } catch { return null; }
}

export function getAllPageIds(config) {
  const ids = [];
  for (const group of (config.sidebar || [])) ids.push(...collectIds([group]));
  return ids;
}

export function getOpenAPIConfig(config) {
  if (!config.openapi) return null;
  if (typeof config.openapi === 'string') {
    return { spec: config.openapi, overlay: null };
  }
  return { spec: config.openapi.spec || null, overlay: config.openapi.overlay || null };
}

export function getVersionConfig(config) {
  if (!config.versions || !config.versions.list || !config.versions.list.length) return null;
  return config.versions;
}

export async function gitReadFile(branch, filePath, dir) {
  try {
    const git = await getGit();
    const oid = await git.resolveRef({ fs: nodeFs, dir, ref: branch });
    const { blob } = await git.readBlob({ fs: nodeFs, dir, oid, filepath: path.posix.normalize(filePath.replace(/\\/g, '/')) });
    return new TextDecoder().decode(blob);
  } catch {
    return null;
  }
}

/**
 * Navigation of a version branch: { sidebar, tabs }. `sidebar` is always the flat list of
 * groups (derived from the tabs when the branch uses them); `tabs` is null for plain sidebars.
 */
export async function getVersionNavigation(branch, dir) {
  const empty = { sidebar: [], tabs: null };
  const raw = await gitReadFile(branch, 'docslit.json', dir);
  if (!raw) return empty;
  try {
    const config = JSON.parse(raw);
    const needsExpand = hasAutogenerate(config.sidebar) || hasTabAutogenerate(config.tabs);
    let source = null;
    if (needsExpand) {
      // Expand against the branch's git tree (docs/ at that ref).
      const oid = await git.resolveRef({ fs: nodeFs, dir, ref: branch });
      const files = (await git.listFiles({ fs: nodeFs, dir, ref: oid }))
        .filter((f) => f.startsWith('docs/')).map((f) => f.slice('docs/'.length));
      source = createFileListSource(files, (rel) => gitReadFile(branch, `docs/${rel}`, dir));
    }
    let sidebar = config.sidebar || [];
    if (hasAutogenerate(sidebar)) {
      const expanded = await expandSidebarValue(sidebar, source, { siteName: config.name, warn: warnOnce });
      sidebar = Array.isArray(expanded) ? expanded : [];
    }
    if (Array.isArray(config.tabs) && config.tabs.length) {
      let tabs = config.tabs;
      if (hasTabAutogenerate(tabs)) tabs = await expandTabsValue(tabs, source, { siteName: config.name, warn: warnOnce });
      const applied = applyNavigation({ ...config, sidebar, tabs }, { warn: warnOnce });
      return { sidebar: applied.sidebar || [], tabs: applied.tabs || null };
    }
    return { sidebar: Array.isArray(sidebar) ? sidebar : [], tabs: null };
  } catch {
    return empty;
  }
}

export async function getVersionSidebar(branch, dir) {
  return (await getVersionNavigation(branch, dir)).sidebar;
}

export async function getChangedDocs(defaultBranch, versionBranch, dir) {
  try {
    const git = await getGit();
    await git.resolveRef({ fs: nodeFs, dir, ref: defaultBranch });
    await git.resolveRef({ fs: nodeFs, dir, ref: versionBranch });
    const changed = [];
    await git.walk({
      fs: nodeFs,
      dir,
      trees: [git.TREE({ ref: defaultBranch }), git.TREE({ ref: versionBranch })],
      map: async function(filepath, [entryA, entryB]) {
        if (!filepath.startsWith('docs/')) return;
        if (!filepath.endsWith('.md')) return;
        const oidA = entryA ? await entryA.oid() : null;
        const oidB = entryB ? await entryB.oid() : null;
        if (oidA !== oidB) {
          changed.push(filepath.replace(/^docs\//, '').replace(/\.md$/, ''));
        }
      },
    });
    return changed;
  } catch {
    return [];
  }
}

export function hashAnnouncementMessage(message) {
  let h = 5381;
  for (let i = 0; i < message.length; i++) {
    h = ((h << 5) + h + message.charCodeAt(i)) >>> 0;
  }
  return h.toString(36);
}

function normalizeAnnouncement(announcement) {
  return {
    message: announcement.message,
    type: announcement.type || 'neutral',
    dismissible: announcement.dismissible !== false,
  };
}

/** Resolve site-wide announcement (version list entry overrides config-level). */
export function getAnnouncement(config, currentVersion = null, versionConfig = null) {
  const vc = versionConfig || config?.versions;
  if (currentVersion && vc?.list) {
    const entry = vc.list.find(v => v.version === currentVersion);
    if (entry?.announcement?.message) return normalizeAnnouncement(entry.announcement);
  }
  if (config?.announcement?.message) return normalizeAnnouncement(config.announcement);
  return null;
}
