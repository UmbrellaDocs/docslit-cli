import { readFileSync, existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import pc from 'picocolors';
import { zipSync } from 'fflate';

const CONFIG_PATH = path.join(os.homedir(), '.docslit', 'config.json');

export async function publish(args) {
  // Load CLI config (requires login first)
  if (!existsSync(CONFIG_PATH)) {
    console.error(pc.red('  ✗ Not logged in. Run: docslit login --email you@example.com --name "Your Name"'));
    process.exit(1);
  }

  let cliConfig;
  try {
    cliConfig = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    console.error(pc.red('  ✗ Config file corrupted. Run: docslit login'));
    process.exit(1);
  }

  const { token, apiUrl } = cliConfig;

  // Load docslit.json
  const docsConfigPath = path.resolve('docslit.json');
  if (!existsSync(docsConfigPath)) {
    console.error(pc.red('  ✗ No docslit.json found. Run: docslit init first.'));
    process.exit(1);
  }

  let docsConfig;
  try {
    docsConfig = JSON.parse(readFileSync(docsConfigPath, 'utf8'));
  } catch {
    console.error(pc.red('  ✗ docslit.json is not valid JSON.'));
    process.exit(1);
  }

  // Determine project slug
  const flagProject = getFlag(args, '--project');
  const configProject = docsConfig.cloud?.project;
  const autoSlug = slugify(docsConfig.name || 'my-docs');
  const projectSlug = flagProject || configProject || autoSlug;

  const distDir = getFlag(args, '--out') || 'dist';
  const forceBuild = args.includes('--build') || !existsSync(distDir);

  if (forceBuild) {
    console.log(pc.dim('  Building docs…'));
    const { build } = await import('./build.js');
    await build({ out: distDir, offline: false });
    console.log('');
  }

  // Verify dist/ has content
  const distFiles = await readdir(distDir).catch(() => []);
  if (distFiles.length === 0) {
    console.error(pc.red(`  ✗ Build output directory "${distDir}" is empty.`));
    process.exit(1);
  }

  console.log(`  ${pc.dim('Publishing')} ${pc.bold(projectSlug)}${pc.dim('…')}`);

  const fileMap = await buildFileMap(distDir);
  const uncompressed = Object.values(fileMap).reduce((n, [d]) => n + d.length, 0);
  const zipBuffer = Buffer.from(zipSync(fileMap));
  console.log(pc.dim(`  Packaged ${formatBytes(zipBuffer.length)} (${formatBytes(uncompressed)} uncompressed)`));

  // Upload via multipart/form-data
  const formData = new FormData();
  formData.append('project', projectSlug);
  formData.append('name', docsConfig.name || projectSlug);
  if (docsConfig.versions) {
    formData.append('versions', JSON.stringify(docsConfig.versions));
  }
  formData.append(
    'site',
    new Blob([zipBuffer], { type: 'application/zip' }),
    'site.zip',
  );

  let result;
  try {
    const res = await fetch(`${apiUrl}/cloud/publish`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    result = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error(pc.red(`  ✗ Publish failed: ${result.error || res.statusText}`));
      process.exit(1);
    }
  } catch (e) {
    console.error(pc.red(`  ✗ Network error: ${e.message}`));
    process.exit(1);
  }

  console.log('');
  console.log(pc.green('  ✓ Published successfully!'));
  console.log('');
  console.log(`  ${pc.bold('URL:')}     ${pc.cyan(result.url)}`);
  console.log(`  ${pc.bold('Project:')} ${result.projectSlug}`);
  console.log(`  ${pc.bold('Deploy:')}  ${result.deployId}`);

  // Suggest adding cloud config to docslit.json if not already set
  if (!configProject && !flagProject) {
    console.log('');
    console.log(pc.dim('  Tip: add this to docslit.json to lock in the project slug:'));
    console.log(pc.dim(`    "cloud": { "project": "${projectSlug}" }`));
  }

  console.log('');
}

async function buildFileMap(dir, prefix = '') {
  const map = {};
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    const key = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) Object.assign(map, await buildFileMap(full, key));
    else map[key] = [readFileSync(full), { level: 6 }];
  }
  return map;
}

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFlag(args, flag) {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : null;
}

