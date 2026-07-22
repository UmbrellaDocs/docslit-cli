/**
 * docslit new <page-id> — scaffold a markdown page and optionally append to sidebar.
 */
import path from 'path';
import fs from 'fs-extra';
import pc from 'picocolors';
import { loadConfig } from './config.js';

function toTitle(id) {
  const base = id.split('/').pop() || id;
  return base.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function newPage(args = []) {
  const cwd = process.cwd();
  const pageId = args.find((a) => !a.startsWith('--'));
  if (!pageId) {
    console.error('  Usage: docslit new <page-id> [--title "Title"] [--group "Group"]\n');
    process.exit(1);
  }

  let title = null;
  let group = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--title' && args[i + 1]) title = args[++i];
    if (args[i] === '--group' && args[i + 1]) group = args[++i];
  }
  title = title || toTitle(pageId);

  const file = path.join(cwd, 'docs', `${pageId}.md`);
  if (await fs.pathExists(file)) {
    console.error(`  ${pc.red('✗')} Page already exists: docs/${pageId}.md\n`);
    process.exit(1);
  }

  await fs.ensureDir(path.dirname(file));
  const content = `---
title: ${title}
description: 
---

# ${title}

`;
  await fs.writeFile(file, content);
  console.log(`  ${pc.green('✓')} Created docs/${pageId}.md`);

  const configPath = path.join(cwd, 'docslit.json');
  if (await fs.pathExists(configPath)) {
    const config = await loadConfig(cwd);
    const sidebar = config.sidebar || [];
    const groupName = group || 'Pages';
    let entry = sidebar.find((g) => g.group === groupName);
    if (!entry) {
      entry = { group: groupName, pages: [] };
      sidebar.push(entry);
    }
    if (!entry.pages.includes(pageId)) {
      entry.pages.push(pageId);
      config.sidebar = sidebar;
      await fs.writeFile(configPath, JSON.stringify(config, null, 2) + '\n');
      console.log(`  ${pc.green('✓')} Added to sidebar group "${groupName}"`);
    }
  }

  console.log(`\n  Edit the page, then run ${pc.cyan('docslit dev')}.\n`);
}
