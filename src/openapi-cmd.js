import path from 'path';
import fs from 'fs-extra';
import pc from 'picocolors';
import { loadSpec, getEndpoints } from './openapi.js';

function toSlug(operationId) {
  return operationId
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
}

function toTitle(operationId) {
  return operationId
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/^./, c => c.toUpperCase());
}

export async function openapiScaffold(args) {
  const specPath = args.find(a => !a.startsWith('--'));
  if (!specPath) {
    console.error(`  ${pc.red('Error:')} Please provide a spec file path.\n`);
    console.error(`  Usage: docslit openapi scaffold <spec.yaml> [--overlay <overlay.yaml>] [--new-only]\n`);
    process.exit(1);
  }

  const overlayPath = getFlag(args, '--overlay');
  const newOnly = args.includes('--new-only');
  const cwd = process.cwd();

  console.log(`\n  ${pc.bold('DocsLit')} OpenAPI scaffold\n`);

  let spec;
  try {
    spec = await loadSpec(path.resolve(cwd, specPath), overlayPath ? path.resolve(cwd, overlayPath) : null);
  } catch (e) {
    console.error(`  ${pc.red('Error:')} ${e.message}`);
    process.exit(1);
  }

  const endpoints = getEndpoints(spec);
  if (!endpoints.length) {
    console.log(`  ${pc.yellow('⚠')} No endpoints found in spec`);
    process.exit(0);
  }

  console.log(`  Found ${pc.cyan(endpoints.length)} endpoint${endpoints.length !== 1 ? 's' : ''} in spec\n`);

  let existingRefs = new Set();
  if (newOnly) {
    const docsDir = path.join(cwd, 'docs');
    if (await fs.pathExists(docsDir)) {
      existingRefs = await scanExistingRefs(docsDir);
      console.log(`  ${pc.dim(`Found ${existingRefs.size} existing ref(s) in docs/`)}\n`);
    }
  }

  const docsApiDir = path.join(cwd, 'docs', 'api');
  await fs.ensureDir(docsApiDir);

  const byTag = new Map();
  for (const ep of endpoints) {
    const tag = ep.tags[0] || 'Default';
    if (!byTag.has(tag)) byTag.set(tag, []);
    byTag.get(tag).push(ep);
  }

  let created = 0, skipped = 0;
  const pageIds = [];

  for (const [tag, eps] of byTag) {
    for (const ep of eps) {
      if (!ep.operationId) {
        console.log(`  ${pc.yellow('!')} Skipped ${ep.method} ${ep.path} — no operationId`);
        skipped++;
        continue;
      }

      if (newOnly && existingRefs.has(ep.operationId)) {
        console.log(`  ${pc.dim('○')} Skipped ${ep.operationId} — already documented`);
        skipped++;
        continue;
      }

      const slug = toSlug(ep.operationId);
      const title = toTitle(ep.operationId);
      const filePath = path.join(docsApiDir, `${slug}.md`);

      if (await fs.pathExists(filePath)) {
        console.log(`  ${pc.dim('○')} Skipped ${slug}.md — file already exists`);
        skipped++;
        pageIds.push(`api/${slug}`);
        continue;
      }

      const description = ep.description || ep.summary || '';
      const frontmatter = [
        '---',
        `title: ${title}`,
      ];
      if (description) frontmatter.push(`description: ${description}`);
      frontmatter.push('layout: api');
      frontmatter.push('---');

      const content = `${frontmatter.join('\n')}\n\n<wc-endpoint ref="${ep.operationId}">\n\n</wc-endpoint>\n`;

      await fs.writeFile(filePath, content);
      console.log(`  ${pc.green('✓')} Created api/${slug}.md — ${ep.method} ${ep.path}`);
      created++;
      pageIds.push(`api/${slug}`);
    }
  }

  // Update docslit.json
  const configPath = path.join(cwd, 'docslit.json');
  let config = {};
  if (await fs.pathExists(configPath)) {
    config = await fs.readJson(configPath);
  }

  // Set openapi config
  if (overlayPath) {
    config.openapi = { spec: specPath, overlay: overlayPath };
  } else {
    config.openapi = specPath;
  }

  // Add/update API Reference sidebar group
  const sidebar = config.sidebar || [];
  const existingApiGroup = sidebar.find(g => g.group === 'API Reference');
  if (existingApiGroup) {
    const existingSet = new Set(existingApiGroup.pages);
    for (const id of pageIds) {
      if (!existingSet.has(id)) existingApiGroup.pages.push(id);
    }
  } else {
    sidebar.push({ group: 'API Reference', pages: pageIds });
  }
  config.sidebar = sidebar;

  await fs.writeJson(configPath, config, { spaces: 2 });

  // Report
  const div = pc.dim('─'.repeat(50));
  console.log(`\n${div}`);
  console.log(`  ${pc.green(pc.bold(`${created} page${created !== 1 ? 's' : ''} created`))}${skipped ? pc.dim(`, ${skipped} skipped`) : ''}`);
  if (created) {
    console.log(`  ${pc.dim('Updated docslit.json with openapi config + API Reference sidebar')}`);
    console.log(`\n  ${pc.cyan('Next steps:')}`);
    console.log(`    1. Edit the generated pages in docs/api/`);
    console.log(`    2. Run ${pc.cyan('docslit dev')} to preview`);
    console.log(`    3. Run ${pc.cyan('docslit build')} to generate static site`);
  }
  console.log('');
}

async function scanExistingRefs(docsDir) {
  const refs = new Set();
  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        await walk(full);
      } else if (/\.(md|mdx)$/.test(e.name)) {
        const content = await fs.readFile(full, 'utf8');
        const re = /<wc-endpoint[^>]*ref="([^"]+)"/g;
        let m;
        while ((m = re.exec(content)) !== null) {
          refs.add(m[1]);
        }
      }
    }
  }
  await walk(docsDir);
  return refs;
}

function getFlag(args, flag) {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : null;
}
