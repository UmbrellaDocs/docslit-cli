import fs from 'fs-extra';
import path from 'path';
import pc from 'picocolors';
import {
  buildBrandThemeTemplate,
  BRAND_THEME_EXAMPLE_FILENAME,
  listThemePresets,
  listThemeVariables,
  listThemes,
  listPalettes,
  listDesignTokens,
  themeTokenValues,
  resolveSiteThemeSync,
  isThemeName,
  isValidPalette,
  canonicalThemeId,
  suggestName,
  allThemeIds,
  allPaletteIds,
  THEMES,
  RADIUS_NAMES,
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
  await fs.ensureDir(path.dirname(outPath));
  await fs.writeFile(outPath, JSON.stringify(template, null, 2) + '\n');

  let updatedConfig = false;
  if (await fs.pathExists(configPath)) {
    try {
      const text = await fs.readFile(configPath, 'utf8');
      const config = JSON.parse(text);
      if (!config.theme) {
        const rel = path.relative(cwd, outPath).split(path.sep).join('/');
        await fs.writeFile(configPath, patchTopLevelKey(text, 'theme', `./${rel}`, detectIndent(text), INSERT_AFTER));
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
  console.log(`\n  ${pc.bold('Themes:')}   ${allThemeIds().filter((t) => t !== 'classic').join(', ')}`);
  console.log(`  ${pc.bold('Palettes:')} ${allPaletteIds().join(', ')}`);
  console.log(`  ${pc.dim('Set "name" (a theme) and/or "palette" in the theme file to start from a built-in look, then override brand colours.')}\n`);
}

/** Machine-readable theme catalogue (`docslit theme list --json`). */
export function themeCatalog(config = null) {
  const current = config ? resolveSiteThemeSync(config) : null;
  return {
    themes: listThemes(),
    palettes: listPalettes(),
    radius: RADIUS_NAMES,
    appearance: ['system', 'light', 'dark'],
    current: current ? { theme: current.themeName, palette: current.paletteId, custom: current.isCustom, appearance: current.appearance, strict: current.strict } : null,
    config: {
      shape: '"theme": "<theme>" | "<palette>" | "./theme.json" | { name, palette, colors, dark, light, fonts, radius, appearance, strict }',
      note: 'theme = the look (layout, type, shape); palette = colours. Any theme works with any palette and with custom colours.',
    },
  };
}

export function themeList(args = [], config = null) {
  const json = args.includes('--json');
  if (json) {
    console.log(JSON.stringify(themeCatalog(config), null, 2));
    return;
  }
  const current = config ? resolveSiteThemeSync(config) : null;
  console.log(`\n  ${pc.bold('DocsLit')} — themes ${pc.dim('(the look: layout, type, shape)')}\n`);
  for (const t of listThemes()) {
    const mark = current && current.themeName === t.id ? pc.green(' *') : '  ';
    console.log(`${mark}${pc.cyan(t.id.padEnd(11))} ${t.description}`);
    console.log(`  ${' '.repeat(11)} ${pc.dim(`signature palette: ${t.palette}`)}`);
  }
  console.log(`\n  ${pc.bold('Palettes')} ${pc.dim('(colours; work with every theme)')}\n`);
  for (const p of listPalettes()) {
    const mark = current && current.paletteId === p.id ? pc.green(' *') : '  ';
    console.log(`${mark}${pc.cyan(p.id.padEnd(11))} ${p.description}`);
  }
  console.log(`\n  ${pc.bold('Use one')}`);
  console.log(`  ${pc.dim('docslit theme use peppermint')}                  ${pc.dim('# set the theme (with its signature palette)')}`);
  console.log(`  ${pc.dim('docslit theme use peppermint --palette ocean')}  ${pc.dim('# theme + palette')}`);
  console.log(`  ${pc.dim('docslit dev --theme-picker')}                    ${pc.dim('# try every theme and palette live')}`);
  console.log(`\n  ${pc.bold('Custom variables')} (use in theme file "colors", "dark", or "light"):\n`);
  for (const v of listThemeVariables()) {
    console.log(`  ${pc.cyan(v.key.padEnd(14))} ${v.description}`);
  }
  console.log('');
}

/** `docslit theme tokens [--json] [--theme <id>]` — the design-token reference with current values. */
export function themeTokens(args = [], config = null) {
  const json = args.includes('--json');
  const ti = args.indexOf('--theme');
  const id = ti >= 0 ? args[ti + 1] : (config ? resolveSiteThemeSync(config).themeName : 'default');
  if (!isThemeName(id)) {
    console.error(pc.red(`  Unknown theme "${id}". Themes: ${allThemeIds().join(', ')}`));
    process.exit(1);
  }
  const values = themeTokenValues(id);
  const tokens = listDesignTokens().map((t) => ({
    name: t.name, group: t.group, description: t.description, default: t.default, light: t.light ?? null,
    value: values[t.name].value, overridden: values[t.name].overridden,
  }));
  if (json) {
    console.log(JSON.stringify({
      theme: canonicalThemeId(id),
      usage: 'Override per site with a theme file or a stylesheet referenced by the "css" key in docslit.json, e.g. `html { --h1-size: 2.5rem; }`. Colours live in palettes (docslit theme list).',
      tokens,
    }, null, 2));
    return;
  }
  console.log(`\n  ${pc.bold('DocsLit')} — design tokens for theme ${pc.cyan(canonicalThemeId(id))}\n`);
  let group = '';
  for (const t of tokens) {
    if (t.group !== group) { group = t.group; console.log(`  ${pc.bold(group.toUpperCase())}`); }
    const val = t.overridden ? pc.green(t.value) : pc.dim(t.value);
    console.log(`  ${pc.cyan(t.name.padEnd(24))} ${val}  ${pc.dim('- ' + t.description)}`);
  }
  console.log('');
}

// ── theme use ───────────────────────────────────────────────────────────────

const INSERT_AFTER = ['$schema', 'name', 'description', 'url', 'logo', 'favicon'];

function detectIndent(text) {
  const m = /^([ \t]+)"/m.exec(text);
  return m ? m[1] : '  ';
}

/**
 * Pure: set the theme/palette in docslit.json text, preserving indentation, key order, trailing newline
 * and every other key. Existing theme objects keep their overrides (colors, fonts, ...).
 */
export function applyThemeToConfigText(text, { theme, palette } = {}) {
  const config = JSON.parse(text);
  const indent = detectIndent(text);
  const trailing = /\n$/.test(text) ? '\n' : '';
  const cur = config.theme;
  const curObj = cur && typeof cur === 'object' && !Array.isArray(cur) ? { ...cur } : null;
  const curTheme = typeof cur === 'string' ? (isThemeName(cur) ? canonicalThemeId(cur) : null)
    : curObj ? (isThemeName(curObj.theme) ? curObj.theme : (isThemeName(curObj.name) ? curObj.name : null)) : null;
  const nextTheme = theme || curTheme || 'default';
  let next;
  if (curObj) {
    next = curObj;
    if (theme) {
      // switching theme: take the new theme's signature palette unless one is requested (colours/fonts/overrides stay)
      if (!palette) { delete next.palette; delete next.extends; delete next.preset; }
      const { name: oldName, ...rest } = next;
      const keepName = oldName && !isThemeName(oldName) ? oldName : null; // a free brand label stays as "name", the theme id goes to "theme"
      next = keepName ? { name: keepName, theme: nextTheme, ...(({ theme: _t, ...r }) => r)(rest) } : { name: nextTheme, ...(({ theme: _t, ...r }) => r)(rest) };
    }
    if (palette) { next.palette = palette; delete next.extends; delete next.preset; }
  } else if (palette) {
    next = nextTheme === 'default' && !theme ? palette : { name: nextTheme, palette };
    if (typeof next === 'object' && nextTheme === 'default') next = { name: 'default', palette };
  } else {
    next = nextTheme;
  }
  // `default` theme + a stock palette keeps the legacy one-liner
  if (next && typeof next === 'object' && Object.keys(next).length === 2 && next.name === 'default' && next.palette) next = next.palette;
  if (next && typeof next === 'object' && Object.keys(next).length === 1 && next.name) next = next.name; // nothing left to customise: plain string
  return patchTopLevelKey(text, 'theme', next, indent, INSERT_AFTER);
}

/** Index just past a JSON string literal that starts at i. */
function skipString(t, i) {
  for (i++; i < t.length; i++) { if (t[i] === '\\') i++; else if (t[i] === '"') return i + 1; }
  return i;
}
/** Top-level entries of a JSON object text: [{ key, keyStart, valStart, valEnd }]. */
function topLevelEntries(t) {
  const out = [];
  let i = t.indexOf('{') + 1; let depth = 0;
  while (i < t.length) {
    const c = t[i];
    if (/\s|,/.test(c)) { i++; continue; }
    if (c === '}') break;
    if (c !== '"') throw new Error('unexpected JSON');
    const keyStart = i; const keyEnd = skipString(t, i);
    const key = JSON.parse(t.slice(keyStart, keyEnd));
    i = keyEnd; while (/\s|:/.test(t[i])) i++;
    const valStart = i;
    if (t[i] === '"') i = skipString(t, i);
    else if (t[i] === '{' || t[i] === '[') {
      depth = 0;
      for (; i < t.length; i++) {
        if (t[i] === '"') { i = skipString(t, i) - 1; continue; }
        if (t[i] === '{' || t[i] === '[') depth++;
        else if (t[i] === '}' || t[i] === ']') { depth--; if (depth === 0) { i++; break; } }
      }
    } else { while (i < t.length && !/[,}\s]/.test(t[i])) i++; }
    out.push({ key, keyStart, valStart, valEnd: i });
  }
  return out;
}

/**
 * Pure text edit of one top-level key of a JSON object: only that value (or one new line) changes, so
 * formatting, inline arrays, key order and every other key stay byte-for-byte.
 */
export function patchTopLevelKey(text, key, value, indent = '  ', insertAfter = []) {
  const entries = topLevelEntries(text);
  if (!entries.length) return JSON.stringify({ [key]: value }, null, indent) + (/\n$/.test(text) ? '\n' : '');
  const json = JSON.stringify(value, null, indent).replace(/\n/g, '\n' + indent);
  const hit = entries.find((e) => e.key === key);
  if (hit) return text.slice(0, hit.valStart) + json + text.slice(hit.valEnd);
  const anchor = [...entries].reverse().find((e) => insertAfter.includes(e.key));
  const line = `${JSON.stringify(key)}: ${json}`;
  if (anchor) return text.slice(0, anchor.valEnd) + `,\n${indent}${line}` + text.slice(anchor.valEnd);
  const open = text.indexOf('{') + 1;
  return text.slice(0, open) + `\n${indent}${line}${','}` + text.slice(open);
}

export async function themeUse(args) {
  const positional = args.filter((a) => !a.startsWith('--'));
  const pi = args.indexOf('--palette');
  const paletteFlag = pi >= 0 ? args[pi + 1] : undefined;
  const target = positional.find((a) => a !== paletteFlag);
  if (!target && !paletteFlag) {
    console.error(pc.red('  Usage: docslit theme use <theme> [--palette <palette>]'));
    console.error(pc.dim(`         themes: ${listThemes().map((t) => t.id).join(', ')}`));
    process.exit(1);
  }
  let theme; let palette = paletteFlag;
  if (target) {
    if (isThemeName(target)) theme = canonicalThemeId(target);
    else if (isValidPalette(target) && !palette) palette = target;
    else {
      const near = suggestName(target, [...allThemeIds().filter((t) => t !== 'classic'), ...allPaletteIds()]);
      console.error(pc.red(`  Unknown theme "${target}".${near ? ` Did you mean "${near}"?` : ''}`));
      console.error(pc.dim(`  Themes: ${allThemeIds().filter((t) => t !== 'classic').join(', ')}`));
      console.error(pc.dim(`  Palettes: ${allPaletteIds().join(', ')}`));
      process.exit(1);
    }
  }
  if (palette && !isValidPalette(palette)) {
    const near = suggestName(palette, allPaletteIds());
    console.error(pc.red(`  Unknown palette "${palette}".${near ? ` Did you mean "${near}"?` : ''}`));
    console.error(pc.dim(`  Palettes: ${allPaletteIds().join(', ')}`));
    process.exit(1);
  }
  const configPath = path.join(process.cwd(), 'docslit.json');
  if (!await fs.pathExists(configPath)) {
    console.error(pc.red('  docslit.json not found. Run `docslit init` first.'));
    process.exit(1);
  }
  const text = await fs.readFile(configPath, 'utf8');
  let updated;
  try {
    updated = applyThemeToConfigText(text, { theme, palette });
  } catch (e) {
    console.error(pc.red(`  Could not update docslit.json: ${e.message}`));
    process.exit(1);
  }
  await fs.writeFile(configPath, updated);
  const resolved = resolveSiteThemeSync(JSON.parse(updated));
  console.log(`\n  ${pc.green('✓')} docslit.json: theme ${pc.cyan(resolved.themeName)}, palette ${pc.cyan(resolved.paletteId)}`);
  console.log(`  ${pc.dim('Preview: docslit dev   (add --theme-picker to try others live)')}\n`);
}

export async function theme(args) {
  const sub = args[0];
  let config = null;
  try {
    const p = path.join(process.cwd(), 'docslit.json');
    if (await fs.pathExists(p)) config = await fs.readJson(p);
  } catch { /* ignore: theme list works without a project */ }
  if (sub === 'init') {
    await themeInit(args.slice(1));
  } else if (sub === 'list' || sub === 'presets' || sub === 'palettes') {
    themeList(args.slice(1), config);
  } else if (sub === 'use' || sub === 'set') {
    await themeUse(args.slice(1));
  } else if (sub === 'tokens') {
    themeTokens(args.slice(1), config);
  } else {
    console.error(pc.red('  Usage: docslit theme list [--json]                     — themes, palettes and variables'));
    console.error(pc.dim('         docslit theme use <theme> [--palette <palette>] — set the theme in docslit.json'));
    console.error(pc.dim('         docslit theme tokens [--json] [--theme <id>]    — design-token reference'));
    console.error(pc.dim('         docslit theme init [file]                       — scaffold a brand theme file'));
    process.exit(1);
  }
}
