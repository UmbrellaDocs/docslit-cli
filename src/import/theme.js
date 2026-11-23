// Theme selection for imported projects. Kept in ONE place so the `theme`
// config shape is a one-function change.
import { isThemeName, isValidThemePreset, suggestName, allThemeIds, allPaletteIds } from '../themes.js';

/** Theme picked for each source platform when --theme is not given. */
export const DEFAULT_PRESET = { mintlify: 'peppermint', fern: 'frond', gitbook: 'folio', mkdocs: 'default' };

const FONT_KEYS = { fontSans: 'sans', fontHeading: 'heading', fontMono: 'mono', sans: 'sans', heading: 'heading', mono: 'mono' };

function normalizeFonts(fonts) {
  const out = {};
  for (const [k, v] of Object.entries(fonts || {})) {
    if (FONT_KEYS[k] && typeof v === 'string' && v.trim()) out[FONT_KEYS[k]] = v;
  }
  return out;
}

/**
 * Build the docslit.json `theme` value for an imported site.
 * `themeOpt`: a theme or palette name from --theme, `false` for --no-theme, or
 * null/undefined to use the platform default. Source brand colours and fonts are
 * layered on top, so the imported site keeps its brand in the chosen look.
 * @returns the value for docslit.json `theme` (or undefined for the plain default)
 */
export function buildThemeConfig({ vendor, brand = {}, fonts = {}, appearance, strict, themeOpt, report = () => {} }) {
  let pick = themeOpt === false ? null : (themeOpt || DEFAULT_PRESET[vendor] || null);
  if (pick && !isThemeName(pick) && !isValidThemePreset(pick)) {
    const known = [...allThemeIds(), ...allPaletteIds()];
    const near = suggestName ? suggestName(pick, known) : null;
    report('warning', 'theme-unknown', `Unknown theme "${pick}"; the default theme was used.`, {
      fix: near ? `Did you mean "${near}"? Run \`docslit theme list\` to see every theme and palette.` : 'Run `docslit theme list` to see every theme and palette.' });
    pick = null;
  }
  const isTheme = pick && isThemeName(pick);
  const f = normalizeFonts(fonts);
  const colors = brand.colors && Object.keys(brand.colors).length ? brand.colors : null;
  const light = brand.light && Object.keys(brand.light).length ? brand.light : null;
  let dark = brand.dark && Object.keys(brand.dark).length ? brand.dark : null;
  const hasBrand = Boolean(colors || light || dark);
  const hasFonts = Object.keys(f).length > 0;
  const appearanceOk = ['system', 'light', 'dark'].includes(appearance) ? appearance : null;
  const strictOk = strict === true;
  if (!hasBrand && !hasFonts && !appearanceOk && !strictOk) return pick || undefined;

  // The classic theme does not repair contrast; keep muted text readable on a custom dark background.
  if (!isTheme && dark && !dark.text3) dark = { ...dark, text3: '#8f8f8f' };

  const t = {};
  if (isTheme) t.name = pick;
  else if (pick) t.extends = pick;
  else if (appearanceOk || strictOk) t.name = 'default';
  if (colors) t.colors = colors;
  if (light) t.light = light;
  if (dark) t.dark = dark;
  if (hasFonts) t.fonts = f;
  if (appearanceOk) t.appearance = appearanceOk;
  if (strictOk) t.strict = true;
  return t;
}

/** One readable line for a docslit.json `theme` value (import summary + MIGRATION.md). */
export function describeTheme(theme) {
  if (theme == null || theme === false) return 'default';
  if (typeof theme === 'string') return theme;
  const base = theme.name && isThemeName(theme.name) ? theme.name : (theme.theme || theme.extends || theme.preset || theme.name || 'default');
  const parts = [String(base)];
  if (theme.palette) parts.push(`${theme.palette} palette`);
  if (theme.colors || theme.light || theme.dark) parts.push('brand colours from source');
  const fonts = theme.fonts ? [...new Set(Object.values(theme.fonts).map((v) => String(v).split(',')[0].replace(/["']/g, '').trim()).filter(Boolean))] : [];
  if (fonts.length) parts.push(`fonts ${fonts.join(' / ')}`);
  if (theme.appearance) parts.push(`${theme.appearance} mode${theme.strict ? ' (locked)' : ' by default'}`);
  else if (theme.strict) parts.push('colour mode locked');
  return parts.join(', ');
}
