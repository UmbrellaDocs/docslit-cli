import fs from 'fs-extra';
import path from 'path';
import pc from 'picocolors';
import {
  buildBrandThemeTemplate,
  BRAND_THEME_EXAMPLE_FILENAME,
  listThemePresets,
  listThemeVariables,
} from './themes.js';

export async function themeInit(args) {
  const cwd = process.cwd();
  const outName = args[0] || BRAND_THEME_EXAMPLE_FILENAME;
  const outPath = path.resolve(cwd, outName);
  const configPath = path.join(cwd, 'docslit.json');

  if (await fs.pathExists(outPath)) {
    console.error(pc.red(`  Error: ${outName} already exists.`));
    process.exit(1);
  }

  const template = buildBrandThemeTemplate();
  await fs.writeFile(outPath, JSON.stringify(template, null, 2) + '\n');

  let updatedConfig = false;
  if (await fs.pathExists(configPath)) {
    try {
      const config = await fs.readJson(configPath);
      if (!config.theme) {
        config.theme = `./${outName}`;
        await fs.writeFile(configPath, JSON.stringify(config, null, 2) + '\n');
        updatedConfig = true;
      }
    } catch {
      console.log(pc.yellow(`  ! Could not update docslit.json — add "theme": "./${outName}" manually.`));
    }
  }

  console.log(`\n  ${pc.bold('DocsLit')} — brand theme scaffolded\n`);
  console.log(`  ${pc.green('✓')} Created ${pc.cyan(outName)}`);
  if (updatedConfig) {
    console.log(`  ${pc.green('✓')} Updated ${pc.cyan('docslit.json')} with theme reference`);
  } else {
    console.log(`  ${pc.dim('Add to docslit.json:')} "theme": "./${outName}"`);
  }
  console.log(`\n  ${pc.bold('Built-in presets:')} ${listThemePresets().map(t => t.id).join(', ')}`);
  console.log(`  ${pc.dim('Set "extends" in the theme file to start from a preset, then override brand colors.')}\n`);
}

export function themeList() {
  console.log(`\n  ${pc.bold('DocsLit')} — theme presets\n`);
  for (const { id, label } of listThemePresets()) {
    console.log(`  ${pc.cyan(id.padEnd(10))} ${label}`);
  }
  console.log(`\n  ${pc.bold('Custom variables')} (use in theme file "colors", "dark", or "light"):\n`);
  for (const v of listThemeVariables()) {
    console.log(`  ${pc.cyan(v.key.padEnd(14))} ${v.description}`);
  }
  console.log('');
}

export async function theme(args) {
  const sub = args[0];
  if (sub === 'init') {
    await themeInit(args.slice(1));
  } else if (sub === 'list' || sub === 'presets') {
    themeList();
  } else {
    console.error(pc.red('  Usage: docslit theme init [file]  — scaffold a brand theme file'));
    console.error(pc.dim('         docslit theme list         — show presets and variables'));
    process.exit(1);
  }
}
