import path from 'path';
import fs from 'fs-extra';
import pc from 'picocolors';
import { loadSpec, getEndpoints } from './openapi.js';

function deriveOperationId(method, urlPath) {
  const parts = urlPath.split('/').filter(Boolean).map(p => {
    if (p.startsWith('{') && p.endsWith('}')) return 'By' + p[1].toUpperCase() + p.slice(2, -1);
    return p[0].toUpperCase() + p.slice(1);
  });
  return method.toLowerCase() + parts.join('');
}

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

function yamlValue(str) {
  if (!str) return '""';
  if (/[\n\r]/.test(str)) str = str.split(/\r?\n/)[0].trim();
  if (/[:#{}[\],&*?|>!'"%@`]/.test(str) || str.trim() !== str) {
    return `"${str.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return str;
}

function tagDisplayName(tag) {
  return tag
    .replace(/Service$/, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
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

  const docsDir = path.join(cwd, 'docs');
  const docsApiDir = path.join(docsDir, 'api');
  await fs.ensureDir(docsApiDir);

  // Build tag metadata from spec.tags
  const tagMeta = new Map();
  for (const t of (spec.tags || [])) {
    tagMeta.set(t.name, { displayName: t['x-displayName'] || t.name, description: t.description || '' });
  }

  const byTag = new Map();
  for (const ep of endpoints) {
    const tag = ep.tags[0] || 'Default';
    if (!byTag.has(tag)) byTag.set(tag, []);
    byTag.get(tag).push(ep);
  }

  let created = 0, skipped = 0;
  const pageIdsByTag = new Map();

  for (const [tag, eps] of byTag) {
    const tagPages = [];
    for (const ep of eps) {
      const opId = ep.operationId || deriveOperationId(ep.method, ep.path);

      if (newOnly && existingRefs.has(opId)) {
        console.log(`  ${pc.dim('○')} Skipped ${ep.operationId} — already documented`);
        skipped++;
        continue;
      }

      const slug = toSlug(opId);
      const title = ep.summary || toTitle(opId);
      const filePath = path.join(docsApiDir, `${slug}.md`);

      const pageEntry = { id: `api/${slug}`, title, method: ep.method };

      if (await fs.pathExists(filePath)) {
        console.log(`  ${pc.dim('○')} Skipped ${slug}.md — file already exists`);
        skipped++;
        tagPages.push(pageEntry);
        continue;
      }

      const description = ep.description || ep.summary || '';
      const frontmatter = [
        '---',
        `title: ${yamlValue(title)}`,
      ];
      if (description) frontmatter.push(`description: ${yamlValue(description)}`);
      frontmatter.push('layout: api');
      frontmatter.push('---');

      const content = `${frontmatter.join('\n')}\n\n# ${title}\n\n<wc-endpoint ref="${opId}">\n\n</wc-endpoint>\n`;

      await fs.writeFile(filePath, content);
      console.log(`  ${pc.green('✓')} Created api/${slug}.md — ${ep.method} ${ep.path}`);
      created++;
      tagPages.push(pageEntry);
    }
    pageIdsByTag.set(tag, tagPages);
  }

  // Generate intro page from spec.info
  const info = spec.info || {};
  const introPath = path.join(docsDir, 'introduction.md');
  if (info.title && !await fs.pathExists(introPath)) {
    const lines = ['---', `title: ${yamlValue(info.title)}`, '---', ''];
    lines.push(`# ${info.title}${info.version ? ` (${info.version})` : ''}`);
    lines.push('');
    const metaParts = [];
    if (info.contact?.email) metaParts.push(`E-mail: [${info.contact.email}](mailto:${info.contact.email})`);
    if (info.contact?.url) metaParts.push(`URL: [${info.contact.url}](${info.contact.url})`);
    if (info.license?.name) {
      const licenseText = info.license.url ? `[${info.license.name}](${info.license.url})` : info.license.name;
      metaParts.push(`License: ${licenseText}`);
    }
    if (metaParts.length) { lines.push(metaParts.join(' | ')); lines.push(''); }
    if (info.description) { lines.push(info.description); lines.push(''); }
    await fs.writeFile(introPath, lines.join('\n'));
    console.log(`  ${pc.green('✓')} Created introduction.md — API overview from spec info`);
    created++;
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

  // Build sidebar from x-tagGroups (if present) or flat API Reference
  const tagGroups = spec['x-tagGroups'];
  const allPageIds = Array.from(pageIdsByTag.values()).flat();

  // Remove default init-only groups from existing sidebar
  const initOnlyPages = new Set(['introduction', 'installation', 'quickstart']);
  const sidebar = (config.sidebar || []).filter(g => {
    if (g.group === 'API Reference') return false;
    if (tagGroups && tagMeta.size) {
      const matchesTag = Array.from(tagMeta.values()).some(t => t.displayName === g.group);
      if (matchesTag) return false;
    }
    return g.pages?.some(p => !initOnlyPages.has(p));
  });

  // Add intro page if it exists
  if (await fs.pathExists(path.join(docsDir, 'introduction.md'))) {
    const hasIntro = sidebar.some(g => g.pages?.includes('introduction'));
    if (!hasIntro) {
      sidebar.unshift({ group: info.title || 'Overview', pages: ['introduction'] });
    }
  }

  if (tagGroups && tagGroups.length) {
    for (const tg of tagGroups) {
      const groupPages = [];
      for (const tagName of (tg.tags || [])) {
        const pages = pageIdsByTag.get(tagName) || [];
        if (!pages.length) continue;
        const meta = tagMeta.get(tagName);
        const displayName = meta?.displayName || tagName;
        if ((tg.tags || []).length > 1) {
          groupPages.push({ group: displayName, pages });
        } else {
          groupPages.push(...pages);
        }
      }
      if (groupPages.length) {
        sidebar.push({ group: tg.name, pages: groupPages });
      }
    }
  } else if (pageIdsByTag.size > 1) {
    const groups = [];
    for (const [tag, pages] of pageIdsByTag) {
      if (!pages.length) continue;
      const meta = tagMeta.get(tag);
      const displayName = meta?.displayName || tagDisplayName(tag);
      groups.push({ group: displayName, pages });
    }
    if (groups.length) {
      sidebar.push({ group: 'API Reference', pages: groups });
    }
  } else {
    if (allPageIds.length) {
      sidebar.push({ group: 'API Reference', pages: allPageIds });
    }
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
