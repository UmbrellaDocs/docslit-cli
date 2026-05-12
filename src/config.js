import fs from 'fs-extra';
import path from 'path';
import git from 'isomorphic-git';
import nodeFs from 'node:fs';

export async function loadConfig(cwd) {
  const configPath = path.join(cwd, 'docslit.json');
  if (!await fs.pathExists(configPath)) {
    console.error(`  Error: docslit.json not found in ${cwd}`);
    console.error(`  Run "docslit init" to create a new project.`);
    process.exit(1);
  }
  const raw = await fs.readFile(configPath, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.error(`  Error: docslit.json is not valid JSON.`);
    process.exit(1);
  }
}

export function getAllPageIds(config) {
  const ids = [];
  function collect(pages) {
    for (const item of (pages || [])) {
      if (typeof item === 'string') ids.push(item);
      else if (item.pages) collect(item.pages);
    }
  }
  for (const group of (config.sidebar || [])) {
    collect(group.pages);
  }
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
    const oid = await git.resolveRef({ fs: nodeFs, dir, ref: branch });
    const { blob } = await git.readBlob({ fs: nodeFs, dir, oid, filepath: filePath });
    return new TextDecoder().decode(blob);
  } catch {
    return null;
  }
}

export async function getVersionSidebar(branch, dir) {
  const raw = await gitReadFile(branch, 'docslit.json', dir);
  if (!raw) return [];
  try {
    const config = JSON.parse(raw);
    return config.sidebar || [];
  } catch {
    return [];
  }
}

export async function getChangedDocs(defaultBranch, versionBranch, dir) {
  try {
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
