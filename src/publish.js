import { readFileSync, existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import pc from 'picocolors';
import { zipSync } from 'fflate';
import { requireAuth, bearer, authHint, getFlag } from './cloud-auth.js';

export async function publish(args) {
  // Credentials: DOCSLIT_TOKEN env var or the stored login (exits with a hint when neither exists)
  const { token, apiUrl } = requireAuth();

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
  // Note: `versions` is intentionally not sent — versioned docs are already part of the build output, and
  // the server ignores that field.
  formData.append(
    'site',
    new Blob([zipBuffer], { type: 'application/zip' }),
    'site.zip',
  );

  let result;
  try {
    const res = await fetch(`${apiUrl}/cloud/publish`, {
      method: 'POST',
      headers: bearer(token),
      body: formData,
    });
    result = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error(pc.red(`  ✗ Publish failed: ${result.error || res.statusText}`));
      const hint = authHint(res.status);
      if (hint) console.error(pc.dim(`  ${hint}`));
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
  for (const w of result.warnings ?? []) console.log(pc.yellow(`  ! ${w}`));

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


