// Theme selection for imported projects. Kept in ONE place so the final `theme`
// config shape (owned by the themes work) is a one-function change.
import { isValidThemePreset } from '../themes.js';

export const DEFAULT_PRESET = { mintlify: 'peppermint', fern: 'frond', gitbook: null };

/**
 * @param {{ vendor: string, brand: {light?: Record<string,string>, dark?: Record<string,string>, colors?: Record<string,string>}, fonts?: Record<string,string>,
 *           themeOpt?: string|null|false, report?: Function }} o
 * @returns the value for docslit.json `theme` (or undefined)
 */
export function buildThemeConfig({ vendor, brand = {}, fonts = {}, themeOpt, report = () => {} }) {
  let preset = themeOpt === false ? null : (themeOpt || DEFAULT_PRESET[vendor] || null);
  if (preset && !isValidThemePreset(preset)) {
    report('info', 'theme-preset-unavailable', `Theme preset "${preset}" is not available in this DocsLit version; the default theme with the source brand colours was used.`, {
      fix: `Set "theme": { "extends": "${preset}" } in docslit.json once the preset is installed.` });
    preset = null;
  }
  const hasBrand = Object.keys(brand.light || {}).length || Object.keys(brand.dark || {}).length || Object.keys(brand.colors || {}).length;
  const hasFonts = Object.keys(fonts).length;
  if (!hasBrand && !hasFonts) return preset || undefined;
  const t = {};
  if (preset) t.extends = preset;
  // keep muted text readable on the (possibly custom) dark background
  if (!brand.dark?.text3 && !preset) brand = { ...brand, dark: { ...(brand.dark || {}), text3: '#8f8f8f' } };
  if (brand.colors && Object.keys(brand.colors).length) t.colors = brand.colors;
  if (brand.light && Object.keys(brand.light).length) t.light = brand.light;
  if (brand.dark && Object.keys(brand.dark).length) t.dark = brand.dark;
  if (hasFonts) t.fonts = fonts;
  return t;
}
