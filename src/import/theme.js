// Theme selection for imported projects. Kept in ONE place so the `theme`
// config shape is a one-function change.
import { isThemeName, isValidThemePreset, suggestName, allThemeIds, allPaletteIds } from '../themes.js';

/** Theme picked for each source platform when --theme is not given. */
export const DEFAULT_PRESET = { mintlify: 'peppermint', fern: 'frond', gitbook: 'folio' };

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
export function buildThemeConfig({ vendor, brand = {}, fonts = {}, themeOpt, report = () => {} }) {
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
  if (!hasBrand && !hasFonts) return pick || undefined;

  // The classic theme does not repair contrast; keep muted text readable on a custom dark background.
  if (!isTheme && dark && !dark.text3) dark = { ...dark, text3: '#8f8f8f' };

  const t = {};
  if (isTheme) t.name = pick;
  else if (pick) t.extends = pick;
  if (colors) t.colors = colors;
  if (light) t.light = light;
  if (dark) t.dark = dark;
  if (hasFonts) t.fonts = f;
  return t;
}
