import { pathExists, readJson } from './fs-helpers.js';
import path from 'path';
import { THEMES, THEME_ALIASES, canonicalThemeId, themeSelector, deriveTonal } from './theme-defs.js';
import { buildBaseTokensCss, listTokens } from './theme-tokens.js';
import { parseColor, hex, over, ensureContrast, onColor, withAlpha, contrastRatio, tonalScheme } from './color.js';

/** @typedef {{
 *   id: string,
 *   basePreset: string,
 *   dark: Record<string, string>,
 *   light: Record<string, string>,
 *   isCustom: boolean,
 * }} ResolvedSiteTheme */

export const CSS_VAR_KEYS = {
  bg: '--bg',
  surface: '--surface',
  surface2: '--surface2',
  surface3: '--surface3',
  border: '--border',
  border2: '--border2',
  text: '--text',
  text2: '--text2',
  text3: '--text3',
  accent: '--accent',
  accentLight: '--accent-light',
  accentDim: '--accent-dim',
  accentDim2: '--accent-dim2',
  sidebarBg: '--sidebar-bg',
  codeBg: '--code-bg',
  codeText: '--code-text',
  onAccent: '--on-accent',
  fontSans: '--font-sans',
  fontMono: '--font-mono',
  radius: '--radius',
  radiusLg: '--radius-lg',
};

export const THEME_VAR_DOCS = [
  { key: 'accent', description: 'Primary brand color — links, active nav, buttons' },
  { key: 'accentLight', description: 'Lighter/darker accent for hover and emphasis' },
  { key: 'accentDim', description: 'Translucent accent for subtle backgrounds' },
  { key: 'accentDim2', description: 'Slightly stronger translucent accent' },
  { key: 'bg', description: 'Page background' },
  { key: 'surface', description: 'Card and panel background' },
  { key: 'surface2', description: 'Secondary surface (inputs, chips)' },
  { key: 'surface3', description: 'Tertiary surface (hover states)' },
  { key: 'border', description: 'Default border color' },
  { key: 'border2', description: 'Stronger border color' },
  { key: 'text', description: 'Primary text' },
  { key: 'text2', description: 'Secondary text' },
  { key: 'text3', description: 'Muted text' },
  { key: 'sidebarBg', description: 'Sidebar background' },
  { key: 'codeBg', description: 'Code block background' },
  { key: 'codeText', description: 'Code block text' },
  { key: 'onAccent', description: 'Text colour on filled accent surfaces (buttons)' },
  { key: 'fontSans', description: 'Body font stack' },
  { key: 'fontMono', description: 'Monospace font stack' },
  { key: 'radius', description: 'Default border radius' },
  { key: 'radiusLg', description: 'Large border radius' },
];

export const THEME_PRESETS = {
  teal: {
    label: 'Teal',
    dark: {
      bg: '#0a0a0a', surface: '#111', surface2: '#1a1a1a', surface3: '#222',
      border: '#2a2a2a', border2: '#3a3a3a',
      text: '#f0f0f0', text2: '#a0a0a0', text3: '#666',
      accent: '#01696f', accentLight: '#4f98a3',
      accentDim: 'rgba(1,105,111,.15)', accentDim2: 'rgba(1,105,111,.25)',
      sidebarBg: '#0f0f0f', codeBg: '#161616', codeText: '#e2e8f0',
    },
    light: {
      bg: '#ffffff', surface: '#f8f8f8', surface2: '#f0f0f0', surface3: '#e8e8e8',
      border: '#e2e2e2', border2: '#d0d0d0',
      text: '#0f0f0f', text2: '#555', text3: '#737373',
      accent: '#01696f', accentLight: '#015e63',
      accentDim: 'rgba(1,105,111,.08)', accentDim2: 'rgba(1,105,111,.15)',
      sidebarBg: '#f5f5f5', codeBg: '#f6f8fa', codeText: '#24292f',
    },
  },
  ocean: {
    label: 'Ocean',
    dark: {
      bg: '#07111f', surface: '#0c1929', surface2: '#132337', surface3: '#1a2d47',
      border: '#243b53', border2: '#334e68',
      text: '#f0f4f8', text2: '#9fb3c8', text3: '#627d98',
      accent: '#2563eb', accentLight: '#60a5fa',
      accentDim: 'rgba(37,99,235,.15)', accentDim2: 'rgba(37,99,235,.28)',
      sidebarBg: '#0a1628', codeBg: '#0f1d32', codeText: '#e2e8f0',
    },
    light: {
      bg: '#ffffff', surface: '#f8fafc', surface2: '#f1f5f9', surface3: '#e2e8f0',
      border: '#cbd5e1', border2: '#94a3b8',
      text: '#0f172a', text2: '#475569', text3: '#64748b',
      accent: '#1d4ed8', accentLight: '#1e40af',
      accentDim: 'rgba(29,78,216,.08)', accentDim2: 'rgba(29,78,216,.16)',
      sidebarBg: '#f1f5f9', codeBg: '#f8fafc', codeText: '#1e293b',
    },
  },
  forest: {
    label: 'Forest',
    dark: {
      bg: '#071210', surface: '#0f1f1a', surface2: '#152a23', surface3: '#1c352c',
      border: '#264036', border2: '#355447',
      text: '#ecfdf5', text2: '#a7c4b5', text3: '#6b8f7d',
      accent: '#059669', accentLight: '#34d399',
      accentDim: 'rgba(5,150,105,.15)', accentDim2: 'rgba(5,150,105,.28)',
      sidebarBg: '#0c1a15', codeBg: '#12241d', codeText: '#d1fae5',
    },
    light: {
      bg: '#ffffff', surface: '#f7fdf9', surface2: '#ecfdf5', surface3: '#d1fae5',
      border: '#a7f3d0', border2: '#6ee7b7',
      text: '#064e3b', text2: '#047857', text3: '#059669',
      accent: '#047857', accentLight: '#065f46',
      accentDim: 'rgba(4,120,87,.08)', accentDim2: 'rgba(4,120,87,.16)',
      sidebarBg: '#ecfdf5', codeBg: '#f0fdf4', codeText: '#14532d',
    },
  },
  slate: {
    label: 'Slate',
    dark: {
      bg: '#09090b', surface: '#18181b', surface2: '#27272a', surface3: '#3f3f46',
      border: '#3f3f46', border2: '#52525b',
      text: '#fafafa', text2: '#a1a1aa', text3: '#71717a',
      accent: '#52525b', accentLight: '#a1a1aa',
      accentDim: 'rgba(82,82,91,.2)', accentDim2: 'rgba(82,82,91,.32)',
      sidebarBg: '#111113', codeBg: '#1c1c1f', codeText: '#e4e4e7',
    },
    light: {
      bg: '#ffffff', surface: '#fafafa', surface2: '#f4f4f5', surface3: '#e4e4e7',
      border: '#e4e4e7', border2: '#d4d4d8',
      text: '#18181b', text2: '#52525b', text3: '#71717a',
      accent: '#3f3f46', accentLight: '#27272a',
      accentDim: 'rgba(63,63,70,.08)', accentDim2: 'rgba(63,63,70,.16)',
      sidebarBg: '#f4f4f5', codeBg: '#fafafa', codeText: '#27272a',
    },
  },
  violet: {
    label: 'Violet',
    dark: {
      bg: '#0f0a1a', surface: '#1a1228', surface2: '#241a35', surface3: '#2e2242',
      border: '#3d2f57', border2: '#4c3a6b',
      text: '#f5f3ff', text2: '#c4b5fd', text3: '#8b7cb3',
      accent: '#7c3aed', accentLight: '#a78bfa',
      accentDim: 'rgba(124,58,237,.15)', accentDim2: 'rgba(124,58,237,.28)',
      sidebarBg: '#140e22', codeBg: '#1c1430', codeText: '#ede9fe',
    },
    light: {
      bg: '#ffffff', surface: '#faf5ff', surface2: '#f3e8ff', surface3: '#e9d5ff',
      border: '#d8b4fe', border2: '#c084fc',
      text: '#2e1065', text2: '#6b21a8', text3: '#7e22ce',
      accent: '#6d28d9', accentLight: '#5b21b6',
      accentDim: 'rgba(109,40,217,.08)', accentDim2: 'rgba(109,40,217,.16)',
      sidebarBg: '#f5f3ff', codeBg: '#faf5ff', codeText: '#3b0764',
    },
  },
  rose: {
    label: 'Rose',
    dark: {
      bg: '#14080c', surface: '#1f0f15', surface2: '#2a151e', surface3: '#351b27',
      border: '#4a2535', border2: '#5c3042',
      text: '#fff1f2', text2: '#fda4af', text3: '#b86b7a',
      accent: '#e11d48', accentLight: '#fb7185',
      accentDim: 'rgba(225,29,72,.15)', accentDim2: 'rgba(225,29,72,.28)',
      sidebarBg: '#1a0a11', codeBg: '#241018', codeText: '#ffe4e6',
    },
    light: {
      bg: '#ffffff', surface: '#fff1f2', surface2: '#ffe4e6', surface3: '#fecdd3',
      border: '#fda4af', border2: '#fb7185',
      text: '#4c0519', text2: '#9f1239', text3: '#be123c',
      accent: '#be123c', accentLight: '#9f1239',
      accentDim: 'rgba(190,18,60,.08)', accentDim2: 'rgba(190,18,60,.16)',
      sidebarBg: '#fff1f2', codeBg: '#fff5f6', codeText: '#881337',
    },
  },
  amber: {
    label: 'Amber',
    dark: {
      bg: '#120d05', surface: '#1c1508', surface2: '#261c0c', surface3: '#302310',
      border: '#453510', border2: '#5c4615',
      text: '#fffbeb', text2: '#fcd34d', text3: '#b08d2e',
      accent: '#d97706', accentLight: '#fbbf24',
      accentDim: 'rgba(217,119,6,.15)', accentDim2: 'rgba(217,119,6,.28)',
      sidebarBg: '#181006', codeBg: '#221a0a', codeText: '#fef3c7',
    },
    light: {
      bg: '#ffffff', surface: '#fffbeb', surface2: '#fef3c7', surface3: '#fde68a',
      border: '#fcd34d', border2: '#fbbf24',
      text: '#451a03', text2: '#92400e', text3: '#b45309',
      accent: '#b45309', accentLight: '#92400e',
      accentDim: 'rgba(180,83,9,.08)', accentDim2: 'rgba(180,83,9,.16)',
      sidebarBg: '#fffbeb', codeBg: '#fffdf5', codeText: '#78350f',
    },
  },
  graphite: {
    label: 'Graphite',
    dark: {
      bg: '#000000', surface: '#0a0a0a', surface2: '#141414', surface3: '#1f1f1f',
      border: '#2e2e2e', border2: '#404040',
      text: '#ffffff', text2: '#b3b3b3', text3: '#737373',
      accent: '#ffffff', accentLight: '#e5e5e5',
      accentDim: 'rgba(255,255,255,.1)', accentDim2: 'rgba(255,255,255,.18)',
      sidebarBg: '#050505', codeBg: '#111111', codeText: '#f5f5f5',
    },
    light: {
      bg: '#ffffff', surface: '#fafafa', surface2: '#f5f5f5', surface3: '#ebebeb',
      border: '#e5e5e5', border2: '#d4d4d4',
      text: '#0a0a0a', text2: '#525252', text3: '#737373',
      accent: '#171717', accentLight: '#262626',
      accentDim: 'rgba(23,23,23,.06)', accentDim2: 'rgba(23,23,23,.12)',
      sidebarBg: '#f5f5f5', codeBg: '#fafafa', codeText: '#171717',
    },
  },
};

export const DEFAULT_THEME_PRESET = 'teal';

/**
 * Additional palettes that ship with the new themes. They are kept apart from THEME_PRESETS so the
 * stylesheet of existing sites (which embeds every preset) stays byte-identical; they are emitted only
 * when selected (or when the theme picker is on).
 */
export const EXTRA_PALETTES = {
  mint: {
    label: 'Mint',
    description: 'Fresh emerald on soft green-tinted neutrals (Peppermint signature)',
    dark: {
      bg: '#0b100e', surface: '#111815', surface2: '#17201c', surface3: '#1e2a24',
      border: '#1f2c26', border2: '#2d3f36',
      text: '#eaf4ee', text2: '#a5b8ad', text3: '#84988c',
      accent: '#2bc486', accentLight: '#4fd8a1',
      onAccent: '#06140d',
      accentDim: 'rgba(43,196,134,.12)', accentDim2: 'rgba(43,196,134,.2)',
      sidebarBg: '#0b100e', codeBg: '#0f1613', codeText: '#dcebe3',
    },
    light: {
      bg: '#ffffff', surface: '#f7faf8', surface2: '#eff5f1', surface3: '#e3ece7',
      border: '#e3eae6', border2: '#cbd8d1',
      text: '#0f1a15', text2: '#43524a', text3: '#5d6d64',
      accent: '#0b7d52', accentLight: '#0a7048',
      accentDim: 'rgba(11,125,82,.08)', accentDim2: 'rgba(11,125,82,.14)',
      sidebarBg: '#ffffff', codeBg: '#f4f8f6', codeText: '#1b2a22',
    },
  },
  ink: {
    label: 'Ink',
    description: 'Monochrome zinc surfaces with a single green accent (Frond signature)',
    dark: {
      bg: '#09090b', surface: '#111113', surface2: '#18181b', surface3: '#232327',
      border: '#27272a', border2: '#3a3a40',
      text: '#fafafa', text2: '#b4b4bc', text3: '#8b8b95',
      accent: '#22c55e', accentLight: '#4ade80',
      onAccent: '#04120a',
      accentDim: 'rgba(34,197,94,.12)', accentDim2: 'rgba(34,197,94,.2)',
      sidebarBg: '#09090b', codeBg: '#101012', codeText: '#e4e4e7',
    },
    light: {
      bg: '#ffffff', surface: '#fafafa', surface2: '#f4f4f5', surface3: '#e9e9ec',
      border: '#e4e4e7', border2: '#d0d0d6',
      text: '#09090b', text2: '#46464f', text3: '#62626d',
      accent: '#15803d', accentLight: '#166534',
      accentDim: 'rgba(21,128,61,.08)', accentDim2: 'rgba(21,128,61,.14)',
      sidebarBg: '#ffffff', codeBg: '#f7f7f8', codeText: '#18181b',
    },
  },
  paper: {
    label: 'Paper',
    description: 'Warm paper and ink with a terracotta accent (Folio signature)',
    dark: {
      bg: '#161410', surface: '#1d1a15', surface2: '#25211b', surface3: '#2e2922',
      border: '#302b23', border2: '#443d31',
      text: '#efe9dc', text2: '#bdb5a3', text3: '#978f7d',
      accent: '#d9783c', accentLight: '#eb9a66',
      onAccent: '#1c0e05',
      accentDim: 'rgba(217,120,60,.13)', accentDim2: 'rgba(217,120,60,.22)',
      sidebarBg: '#161410', codeBg: '#1b1813', codeText: '#e8e1d2',
    },
    light: {
      bg: '#fdfcf9', surface: '#f7f4ed', surface2: '#f0ece2', surface3: '#e6e0d2',
      border: '#e6e1d5', border2: '#d3cbb9',
      text: '#24211b', text2: '#4a4539', text3: '#675f50',
      accent: '#a4491a', accentLight: '#8f3f16',
      accentDim: 'rgba(164,73,26,.07)', accentDim2: 'rgba(164,73,26,.13)',
      sidebarBg: '#fdfcf9', codeBg: '#f6f2ea', codeText: '#2b2720',
    },
  },
  steel: {
    label: 'Steel',
    description: 'Cool slate neutrals with an indigo accent (Ledger signature)',
    dark: {
      bg: '#0a1220', surface: '#0f1a2d', surface2: '#15233a', surface3: '#1c2d49',
      border: '#1f3050', border2: '#2d4268',
      text: '#e8eef7', text2: '#a9b8cf', text3: '#8396b3',
      accent: '#7c83ff', accentLight: '#a5abff',
      onAccent: '#0b0d33',
      accentDim: 'rgba(124,131,255,.14)', accentDim2: 'rgba(124,131,255,.24)',
      sidebarBg: '#0d1727', codeBg: '#0d1829', codeText: '#dbe5f5',
    },
    light: {
      bg: '#ffffff', surface: '#f6f8fb', surface2: '#eef2f7', surface3: '#e3e9f1',
      border: '#e3e8ee', border2: '#cdd5df',
      text: '#14243b', text2: '#3d4f66', text3: '#566a82',
      accent: '#4f46e5', accentLight: '#4338ca',
      accentDim: 'rgba(79,70,229,.07)', accentDim2: 'rgba(79,70,229,.13)',
      sidebarBg: '#f6f8fb', codeBg: '#f6f8fb', codeText: '#1a2b42',
    },
  },
};
// Iris: Material-style violet, generated from a seed (tonal surfaces); the Tonal theme signature.
{
  const seed = '#6750a4';
  const mk = (mode) => {
    const t = tonalScheme(seed, mode);
    return {
      bg: t.bg, surface: t.surface, surface2: t.surface2, surface3: t.surface3, border: t.border, border2: t.border2,
      text: t.text, text2: t.text2, text3: t.text3, accent: t.accent, accentLight: t.accent,
      accentDim: withAlpha(parseColor(t.container), mode === 'dark' ? 0.55 : 0.7), accentDim2: t.secondaryContainer,
      sidebarBg: t.sidebarBg, codeBg: t.codeBg, codeText: t.codeText, onAccent: t.onAccent,
    };
  };
  EXTRA_PALETTES.iris = { label: 'Iris', description: 'Violet generated from a seed colour with tonal surfaces (Tonal signature)', dark: mk('dark'), light: mk('light') };
}

/** Every palette: stock presets first, then the ones added with the themes. */
export const PALETTES = { ...THEME_PRESETS, ...EXTRA_PALETTES };

const RESERVED_IDS = new Set([...Object.keys(PALETTES), ...Object.keys(THEMES), 'custom']);

export const DEFAULT_THEME = 'default';

export function isValidThemePreset(preset) {
  return preset === DEFAULT_THEME_PRESET || Boolean(PALETTES[preset]);
}
export const isValidPalette = isValidThemePreset;
export const isThemeName = (name) => typeof name === 'string' && Object.prototype.hasOwnProperty.call(THEMES, name);

export function listThemePresets() {
  return Object.entries(THEME_PRESETS).map(([id, theme]) => ({ id, label: theme.label }));
}

/** Palettes (stock + new) with descriptions and the accent swatches. */
const STOCK_PALETTE_DESCRIPTIONS = {
  teal: 'Deep teal accent on neutral greys (the classic default)',
  ocean: 'Blue accent on cool navy-slate surfaces',
  forest: 'Green accent on deep green surfaces',
  slate: 'Neutral zinc greys with a quiet grey accent',
  violet: 'Violet accent on purple-tinted surfaces',
  rose: 'Rose-red accent on warm pink-tinted surfaces',
  amber: 'Amber accent on warm sand surfaces',
  graphite: 'Pure black and white, near-monochrome',
};
export function listPalettes() {
  return Object.entries(PALETTES).map(([id, p]) => ({
    id, label: p.label, description: p.description || STOCK_PALETTE_DESCRIPTIONS[id] || `${p.label} palette`, stock: Boolean(THEME_PRESETS[id]),
    accent: { light: p.light.accent, dark: p.dark.accent },
  }));
}

/** Themes (canonical ids only) with descriptions and signature palettes. */
export function listThemes() {
  return Object.values(THEMES).filter((t) => !THEME_ALIASES[t.id]).map((t) => ({
    id: t.id, label: t.label, description: t.description, palette: t.palette,
    fonts: { sans: t.fonts.sans || null, heading: t.fonts.heading || null, mono: t.fonts.mono || null },
    aliases: Object.entries(THEME_ALIASES).filter(([, v]) => v === t.id).map(([k]) => k),
  }));
}

export function listThemeVariables() {
  return THEME_VAR_DOCS;
}

/** Design-token reference (for `docslit theme tokens`). */
export function listDesignTokens() {
  return listTokens();
}

/** Resolved token values (explicit overrides of a theme on top of the defaults), for agents and docs. */
export function themeTokenValues(themeId = DEFAULT_THEME) {
  const def = THEMES[canonicalThemeId(themeId)] || THEMES.default;
  const out = {};
  for (const t of listTokens()) out[t.name] = { value: def.tokens[t.name] ?? t.default, overridden: def.tokens[t.name] !== undefined, default: t.default };
  return out;
}

/** @deprecated Use resolveSiteTheme — kept for simple preset-only lookups */
export function getSiteTheme(config) {
  const resolved = resolveSiteThemeSync(config);
  return {
    preset: resolved.basePreset,
    colors: {},
    id: resolved.id,
    isCustom: resolved.isCustom,
  };
}

const isPlainObject = (v) => v && typeof v === 'object' && !Array.isArray(v);
const objOr = (v) => (isPlainObject(v) ? v : {});
const APPEARANCES = ['system', 'light', 'dark'];

function emptySpec() {
  return {
    basePreset: undefined, palette: undefined, themeName: undefined, file: null, id: null,
    colors: {}, dark: {}, light: {}, fonts: {}, appearance: undefined, strict: false, radius: undefined,
  };
}

/** Classify one `name`/`preset`/`extends`/`palette` value into a theme or a palette. */
function classify(value) {
  if (typeof value !== 'string') return null;
  if (isThemeName(value)) return { kind: 'theme', id: canonicalThemeId(value) };
  if (isValidThemePreset(value)) return { kind: 'palette', id: value };
  return null;
}

export function parseThemeConfig(config) {
  const raw = config?.theme;
  const spec = emptySpec();
  spec.picker = config?.themePicker === true;
  if (!raw) return { ...spec, basePreset: DEFAULT_THEME_PRESET };
  if (typeof raw === 'string') {
    const c = classify(raw);
    if (c?.kind === 'theme') return { ...spec, themeName: c.id, id: raw, presetOnly: true };
    if (c?.kind === 'palette') return { ...spec, basePreset: raw, palette: raw, id: raw, presetOnly: true };
    return { ...spec, basePreset: DEFAULT_THEME_PRESET, file: raw };
  }
  if (isPlainObject(raw)) return specFromObject(raw, spec);
  return { ...spec, basePreset: DEFAULT_THEME_PRESET };
}

function specFromObject(raw, spec = emptySpec()) {
  // A theme is named via `theme` (explicit) or `name` when it matches a theme id; otherwise `name` is a free brand label.
  let themeName = isThemeName(raw.theme) ? canonicalThemeId(raw.theme) : undefined;
  let nameIsTheme = false;
  if (!themeName && isThemeName(raw.name)) { themeName = canonicalThemeId(raw.name); nameIsTheme = true; }
  let palette;
  const legacyBase = raw.extends || raw.preset;
  if (typeof raw.palette === 'string') palette = raw.palette;
  if (!palette && legacyBase) {
    const c = classify(legacyBase);
    if (c?.kind === 'theme') themeName = themeName || c.id;
    else palette = legacyBase;
  }
  return {
    ...spec,
    themeName,
    palette,
    basePreset: palette || DEFAULT_THEME_PRESET,
    file: raw.file || null,
    id: raw.id || (raw.name && !nameIsTheme ? slugifyThemeId(raw.name) : null),
    colors: objOr(raw.colors), dark: objOr(raw.dark), light: objOr(raw.light), fonts: objOr(raw.fonts),
    appearance: APPEARANCES.includes(raw.appearance) ? raw.appearance : undefined,
    strict: raw.strict === true,
    radius: typeof raw.radius === 'string' || typeof raw.radius === 'number' ? String(raw.radius) : undefined,
    rawAppearance: raw.appearance,
  };
}

export function resolveSiteThemeSync(config) {
  return resolveFromSpec(parseThemeConfig(config));
}

export async function resolveSiteTheme(config, cwd = process.cwd()) {
  const parsed = parseThemeConfig(config);
  if (!parsed.file) return resolveFromSpec(parsed);
  const fileSpec = await loadThemeFile(parsed.file, cwd);
  return resolveFromSpec({ ...parsed, ...stripUndefined(fileSpec), file: null });
}

const stripUndefined = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

export async function loadThemeFile(filePath, cwd) {
  const resolved = path.resolve(cwd, filePath);
  if (!await pathExists(resolved)) {
    throw new Error(`Theme file not found: ${filePath}`);
  }
  let data;
  try {
    data = await readJson(resolved);
  } catch (e) {
    throw new Error(`Theme file is not valid JSON (${filePath}): ${e.message}`);
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`Theme file must be a JSON object: ${filePath}`);
  }
  const s = specFromObject(data);
  return {
    themeName: s.themeName,
    palette: s.palette,
    basePreset: data.palette || data.extends || data.preset ? s.basePreset : undefined,
    id: data.id || (data.name && !isThemeName(data.name) ? slugifyThemeId(data.name) : slugifyThemeId(path.basename(filePath, path.extname(filePath)))),
    colors: s.colors, dark: s.dark, light: s.light, fonts: s.fonts,
    appearance: s.appearance, strict: s.strict || undefined, radius: s.radius,
  };
}

const RADIUS_SCALES = {
  none: { radius: '0px', radiusLg: '0px', 'r-xs': '0px', 'r-sm': '0px', 'r-md': '0px', 'r-lg': '0px', 'r-xl': '0px' },
  sm: { radius: '4px', radiusLg: '6px', 'r-xs': '2px', 'r-sm': '3px', 'r-md': '4px', 'r-lg': '6px', 'r-xl': '6px' },
  md: { radius: '8px', radiusLg: '12px', 'r-xs': '4px', 'r-sm': '6px', 'r-md': '8px', 'r-lg': '10px', 'r-xl': '12px' },
  lg: { radius: '12px', radiusLg: '18px', 'r-xs': '6px', 'r-sm': '9px', 'r-md': '12px', 'r-lg': '16px', 'r-xl': '18px' },
  xl: { radius: '16px', radiusLg: '24px', 'r-xs': '8px', 'r-sm': '12px', 'r-md': '16px', 'r-lg': '20px', 'r-xl': '24px' },
  full: { radius: '999px', radiusLg: '28px', 'r-xs': '12px', 'r-sm': '16px', 'r-md': '20px', 'r-lg': '24px', 'r-xl': '28px' },
};
export const RADIUS_NAMES = Object.keys(RADIUS_SCALES);

function radiusVars(value) {
  if (value == null || value === '') return {};
  if (RADIUS_SCALES[value]) return { ...RADIUS_SCALES[value] };
  if (/^\d+(\.\d+)?(px|rem|em)$/.test(value) || /^\d+$/.test(value)) {
    const v = /^\d+$/.test(value) ? `${value}px` : value;
    return { radius: v, radiusLg: `calc(${v} * 1.5)`, 'r-xs': `calc(${v} * .5)`, 'r-sm': `calc(${v} * .75)`, 'r-md': v, 'r-lg': `calc(${v} * 1.25)`, 'r-xl': `calc(${v} * 1.5)` };
  }
  return {};
}

function resolveFromSpec(spec) {
  const themeName = spec.themeName && THEMES[spec.themeName] ? canonicalThemeId(spec.themeName) : DEFAULT_THEME;
  const def = THEMES[themeName];
  const isDefaultTheme = themeName === DEFAULT_THEME;
  const paletteId = spec.palette && PALETTES[spec.palette] ? spec.palette
    : (spec.basePreset && PALETTES[spec.basePreset] ? spec.basePreset : def.palette);
  const basePreset = isValidThemePreset(paletteId) ? paletteId : DEFAULT_THEME_PRESET;
  const base = PALETTES[basePreset];
  const shared = normalizeThemeVars(spec.colors);
  const darkOverrides = normalizeThemeVars(spec.dark);
  const lightOverrides = normalizeThemeVars(spec.light);
  const fontVars = { ...normalizeFonts(spec.fonts), ...normalizeThemeVars(radiusVars(spec.radius)) };

  const hasOverrides = Boolean(spec.file)
    || Object.keys(shared).length > 0
    || Object.keys(darkOverrides).length > 0
    || Object.keys(lightOverrides).length > 0
    || Object.keys(fontVars).length > 0;

  const common = {
    themeName, basePreset, paletteId: basePreset, picker: Boolean(spec.picker),
    appearance: spec.appearance ?? def.appearance ?? null,
    strict: Boolean(spec.strict),
    spec: { shared, darkOverrides, lightOverrides, fontVars },
  };

  // Backwards-compatible path: classic theme, stock/extra palette, no brand overrides.
  if (isDefaultTheme && spec.presetOnly && !hasOverrides) {
    return { ...common, id: basePreset, dark: { ...base.dark }, light: { ...base.light }, isCustom: false };
  }

  let dark; let light;
  if (isDefaultTheme) {
    dark = mergePalette(base.dark, shared, darkOverrides, fontVars);
    light = mergePalette(base.light, shared, lightOverrides, fontVars);
    dark = applyAccentDefaults(dark, darkOverrides, shared, 'dark');
    light = applyAccentDefaults(light, lightOverrides, shared, 'light');
  } else {
    dark = composePalette(def, basePreset, 'dark', shared, darkOverrides, fontVars);
    light = composePalette(def, basePreset, 'light', shared, lightOverrides, fontVars);
  }

  let id = spec.id || (hasOverrides ? 'custom' : basePreset);
  if (RESERVED_IDS.has(id) && hasOverrides && id !== 'custom') id = `brand-${id}`;
  if (!isDefaultTheme && !hasOverrides) id = basePreset;
  if (isDefaultTheme && !hasOverrides) id = basePreset;

  return { ...common, id, dark, light, isCustom: hasOverrides };
}

function mergePalette(base, ...overlays) {
  return overlays.reduce((acc, layer) => ({ ...acc, ...layer }), { ...base });
}

function normalizeThemeVars(vars) {
  if (!vars || typeof vars !== 'object') return {};
  const out = {};
  for (const [key, value] of Object.entries(vars)) {
    if (typeof value !== 'string' || !value.trim()) continue;
    const normalized = normalizeColorKey(key);
    if (normalized) out[normalized] = value.trim();
  }
  return out;
}

function normalizeFonts(fonts) {
  if (!fonts || typeof fonts !== 'object') return {};
  const out = {};
  if (typeof fonts.sans === 'string' && fonts.sans.trim()) out.fontSans = fonts.sans.trim();
  if (typeof fonts.mono === 'string' && fonts.mono.trim()) out.fontMono = fonts.mono.trim();
  if (typeof fonts.heading === 'string' && fonts.heading.trim()) out['font-heading'] = fonts.heading.trim();
  if (typeof fonts.radius === 'string' && fonts.radius.trim()) out.radius = fonts.radius.trim();
  if (typeof fonts.radiusLg === 'string' && fonts.radiusLg.trim()) out.radiusLg = fonts.radiusLg.trim();
  return out;
}

const EXTRA_VAR_KEYS = /^(r-(xs|sm|md|lg|xl|pill)|font-heading)$/;
function normalizeColorKey(key) {
  if (CSS_VAR_KEYS[key]) return key;
  const camel = key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  if (CSS_VAR_KEYS[camel]) return camel;
  if (EXTRA_VAR_KEYS.test(key)) return key;
  return null;
}

function slugifyThemeId(value) {
  const slug = String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return slug || 'custom';
}

function hexToRgb(hexStr) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hexStr).trim());
  if (!m) return null;
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}

function applyAccentDefaults(palette, modeOverrides, shared, mode) {
  const accentChanged = Boolean(modeOverrides.accent || shared.accent);
  if (!accentChanged) return palette;
  const accent = modeOverrides.accent || shared.accent || palette.accent;
  const out = { ...palette, accent };
  const rgb = hexToRgb(accent);
  if (!rgb) return out;
  if (!(modeOverrides.accentDim || shared.accentDim)) {
    const a = mode === 'light' ? 0.08 : 0.15;
    out.accentDim = `rgba(${rgb.r},${rgb.g},${rgb.b},${a})`;
  }
  if (!(modeOverrides.accentDim2 || shared.accentDim2)) {
    const a = mode === 'light' ? 0.16 : 0.25;
    out.accentDim2 = `rgba(${rgb.r},${rgb.g},${rgb.b},${a})`;
  }
  return out;
}

// ── Palette composition for the new themes ──────────────────────────────────────────────────────

const TEXT_KEYS = ['text', 'text2', 'text3'];

/**
 * Layer a palette for one mode in a non-default theme:
 * palette -> theme derivation/tuning -> user overrides -> WCAG repair of everything the user did not set.
 * Explicit user colours are respected as given (validate warns when they are low contrast).
 */
export function composePalette(def, paletteId, mode, shared = {}, modeOverrides = {}, fontVars = {}) {
  const base = PALETTES[paletteId][mode];
  const explicit = { ...shared, ...modeOverrides };
  let pal = { ...base };
  const userAccent = explicit.accent;
  if (userAccent) pal = applyAccentDefaults(pal, modeOverrides, shared, mode);
  if (def.derive === 'tonal') {
    const seed = userAccent || PALETTES[paletteId].light.accent;
    const parsed = parseColor(seed);
    if (parsed) {
      const derived = deriveTonal(pal, mode, hex(parsed));
      // user-set keys are re-applied below, so derived values never clobber them
      pal = { ...pal, ...derived };
      if (userAccent) { pal.accent = mode === 'dark' ? derived.accent : (modeOverrides.accent || shared.accent); pal.accentLight = pal.accent; }
    }
  }
  if (def.tune) pal = def.tune(pal, mode);
  for (const [k, v] of Object.entries(explicit)) pal[k] = v;
  if (userAccent && def.derive !== 'tonal') pal = { ...applyAccentDefaults(pal, modeOverrides, shared, mode), ...explicit };
  pal = repairPalette(pal, explicit);
  return { ...pal, ...fontVars };
}

/** Make derived/unset colours meet WCAG 2.2 AA (4.5:1 text, 3:1 accent UI). */
export function repairPalette(pal, explicit = {}) {
  const out = { ...pal };
  const solid = (c, bg) => over(parseColor(c) || { r: 0, g: 0, b: 0, a: 1 }, bg);
  const bgs = [out.bg, out.surface, out.surface2, out.sidebarBg].filter(Boolean).map(parseColor).filter(Boolean);
  if (!bgs.length) return out;
  if (!explicit.text) out.text = ensureContrast(out.text, bgs, 7);
  for (const k of ['text2', 'text3']) if (!explicit[k]) out[k] = ensureContrast(out[k], bgs, 4.5);
  const tinted = [];
  for (const dim of [out.accentDim, out.accentDim2]) {
    if (!dim) continue;
    const d = parseColor(dim);
    if (d) tinted.push(solid(dim, parseColor(out.sidebarBg || out.bg)), solid(dim, parseColor(out.bg)));
  }
  if (!explicit.accentLight && out.accentLight) out.accentLight = ensureContrast(out.accentLight, [...bgs, ...tinted], 4.5);
  if (!explicit.accent && out.accent) out.accent = ensureContrast(out.accent, bgs.slice(0, 2), 3);
  if (!explicit.onAccent && out.accent) {
    out.onAccent = onColor(out.accent);
    if (contrastRatio(out.onAccent, out.accent) < 4.5 && !explicit.accent) {
      out.accent = ensureContrast(out.accent, [parseColor(out.onAccent)], 4.5);
    }
  }
  if (out.codeBg && out.codeText && !explicit.codeText) out.codeText = ensureContrast(out.codeText, [parseColor(out.codeBg)], 7);
  return out;
}

// ── CSS output ──────────────────────────────────────────────────────────────────────────────────

function varsBlock(vars) {
  return Object.entries(vars)
    .map(([key, value]) => `${CSS_VAR_KEYS[key] || `--${key}`}: ${value}`)
    .join('; ');
}

/** Rules shared by every non-default theme: readable chrome text and the high-contrast tweak. */
const COMMON_THEME_CSS = `
html[data-theme-name] .nav-ext-link { color: var(--text2); }
html[data-theme-name] .nav-ext-link:hover { color: var(--text); background: var(--surface2); }
html[data-theme-name] .locale-switcher { border-color: var(--border2); color: var(--text2); }
:where(html[data-theme-name]) .locale-switcher {
  height: 34px; padding: 0 28px 0 10px; background-color: var(--surface2); border-radius: var(--radius); font-family: var(--font-sans); font-size: 13px; font-weight: 500; cursor: pointer;
  appearance: none; -webkit-appearance: none; background-repeat: no-repeat; background-position: right 10px center;
  background-image: url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23666' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
}
html[data-theme-name] .locale-switcher:hover { background-color: var(--surface3); }
html[data-theme-name] .sidebar-mobile-extras .nav-ext-link { border-color: var(--border2); }
html[data-theme-name] .docs-content a:not(.heading-anchor) { text-decoration-thickness: 1px; }
html[data-theme-name] .sidebar-item:focus-visible, html[data-theme-name] .sidebar-link:focus-visible { border-radius: var(--sb-item-radius); outline-offset: -2px; }
html[data-theme-name] .nav-tab:focus-visible { border-radius: var(--r-sm, 6px); }
@media (prefers-contrast: more) {
  html[data-theme-name][data-theme], html.light[data-theme-name][data-theme] {
    --border: color-mix(in srgb, var(--text) 45%, var(--bg)); --border2: color-mix(in srgb, var(--text) 62%, var(--bg));
    --text2: color-mix(in srgb, var(--text) 94%, var(--bg)); --text3: color-mix(in srgb, var(--text) 82%, var(--bg));
    --link-underline-color: currentColor; --focus-w: 3px;
  }
}`;

function themeTokenCss(def) {
  const sel = themeSelector(def.id);
  const tok = { ...def.tokens };
  if (def.fonts.sans) tok['--font-sans'] = def.fonts.sans;
  if (def.fonts.heading) tok['--font-heading'] = def.fonts.heading;
  if (def.fonts.mono) tok['--font-mono'] = def.fonts.mono;
  const decl = (o) => Object.entries(o).map(([k, v]) => `${k}: ${v}`).join('; ');
  const out = [`${sel} { ${decl(tok)}; }`];
  if (def.light) out.push(`html.light${sel.slice(4)} { ${decl(def.light)}; }`);
  if (def.dark) out.push(`html:not(.light)${sel.slice(4)} { ${decl(def.dark)}; }`);
  if (def.css) out.push(def.css.trim().replace(/&/g, sel));
  return out.join('\n');
}

function pairBlocks(themeId, paletteKey, dark, light) {
  const sel = `html[data-theme-name="${themeId}"][data-theme="${paletteKey}"]`;
  const selLight = `html.light[data-theme-name="${themeId}"][data-theme="${paletteKey}"]`;
  return [`${sel} { ${varsBlock(dark)}; }`, `${selLight} { ${varsBlock(light)}; }`];
}

/** Variants for the theme picker: every theme x every palette (raw palettes, no brand overrides). */
function pickerBlocks(resolved) {
  const blocks = [];
  for (const def of Object.values(THEMES)) {
    if (THEME_ALIASES[def.id] || def.id === DEFAULT_THEME) continue;
    for (const pid of Object.keys(PALETTES)) {
      const dark = composePalette(def, pid, 'dark');
      const light = composePalette(def, pid, 'light');
      blocks.push(...pairBlocks(def.id, pid, dark, light));
    }
  }
  return blocks;
}

/**
 * Stylesheet fragment for the resolved theme.
 * @param {object} resolved  result of resolveSiteTheme
 * @param {{ all?: boolean }} [opts]  all: include every theme and palette (theme picker)
 */
export function buildThemeCss(resolved, opts = {}) {
  const blocks = [];
  const isDefaultTheme = !resolved.themeName || resolved.themeName === DEFAULT_THEME;

  // palettes (legacy attribute: data-theme="<palette>")
  const stock = Object.entries(THEME_PRESETS);
  if (isDefaultTheme || opts.all) {
    for (const [id, theme] of stock) {
      if (id === DEFAULT_THEME_PRESET) continue;
      blocks.push(`html[data-theme="${id}"] { ${varsBlock(theme.dark)}; }`);
      blocks.push(`html.light[data-theme="${id}"] { ${varsBlock(theme.light)}; }`);
    }
  }
  if (opts.all) {
    for (const [id, p] of Object.entries(EXTRA_PALETTES)) {
      blocks.push(`html[data-theme="${id}"] { ${varsBlock(p.dark)}; }`);
      blocks.push(`html.light[data-theme="${id}"] { ${varsBlock(p.light)}; }`);
    }
  } else if (isDefaultTheme && EXTRA_PALETTES[resolved.id] && !resolved.isCustom) {
    const p = EXTRA_PALETTES[resolved.id];
    blocks.push(`html[data-theme="${resolved.id}"] { ${varsBlock(p.dark)}; }`);
    blocks.push(`html.light[data-theme="${resolved.id}"] { ${varsBlock(p.light)}; }`);
  }

  if (isDefaultTheme) {
    if (resolved.isCustom) {
      blocks.push(`html[data-theme="${resolved.id}"] { ${varsBlock(resolved.dark)}; }`);
      blocks.push(`html.light[data-theme="${resolved.id}"] { ${varsBlock(resolved.light)}; }`);
    }
  } else {
    // themes: token blocks + the palette pair for the active theme
    const active = THEMES[resolved.themeName];
    blocks.push(themeTokenCss(active));
    blocks.push(...pairBlocks(resolved.themeName, resolved.id, resolved.dark, resolved.light));
    blocks.push(COMMON_THEME_CSS.trim());
  }

  if (opts.all) {
    for (const def of Object.values(THEMES)) {
      if (THEME_ALIASES[def.id] || def.id === DEFAULT_THEME || def.id === resolved.themeName) continue;
      blocks.push(themeTokenCss(def));
    }
    blocks.push(...pickerBlocks(resolved));
    if (isDefaultTheme) blocks.push(COMMON_THEME_CSS.trim());
    if (!isDefaultTheme && resolved.isCustom) {
      // the site's own brand colours stay selectable under every theme in the picker
      blocks.push(`html[data-theme="${resolved.id}"] { ${varsBlock(resolved.dark)}; }`);
      blocks.push(`html.light[data-theme="${resolved.id}"] { ${varsBlock(resolved.light)}; }`);
    }
  }

  if (!blocks.length) return '';
  return `\n/* SITE THEMES */\n${blocks.join('\n')}\n`;
}

/** Base token declarations + colour-scheme. Emitted once, before the theme blocks. */
export function buildBaseTokens() {
  return `${buildBaseTokensCss()}:root { color-scheme: dark; }\nhtml.light { color-scheme: light; }\n`;
}

export function buildHtmlTag(resolved, lang = 'en') {
  const safeLang = lang || 'en';
  const isDefaultTheme = !resolved.themeName || resolved.themeName === DEFAULT_THEME;
  const extra = [];
  if (!isDefaultTheme) extra.push(`data-theme-name="${resolved.themeName}"`);
  if (resolved.strict) extra.push('data-strict="true"');
  if (isDefaultTheme) {
    if (!resolved.isCustom && resolved.id === DEFAULT_THEME_PRESET) return `<html lang="${safeLang}"${extra.length ? ' ' + extra.join(' ') : ''}>`;
    return `<html lang="${safeLang}" data-theme="${resolved.id}"${extra.length ? ' ' + extra.join(' ') : ''}>`;
  }
  return `<html lang="${safeLang}" data-theme-name="${resolved.themeName}" data-theme="${resolved.id}"${resolved.strict ? ' data-strict="true"' : ''}>`;
}

/**
 * Google Fonts stylesheet URL for the active theme (null for the classic theme, which keeps its own link).
 * With the theme picker every theme's families are requested.
 */
export function themeGoogleFontsHref(resolved) {
  const defs = resolved?.picker
    ? Object.values(THEMES).filter((t) => !THEME_ALIASES[t.id] && t.fonts.google)
    : [THEMES[resolved?.themeName || DEFAULT_THEME]].filter((t) => t?.fonts?.google);
  if (!defs.length) return null;
  const seen = new Map();
  for (const d of defs) for (const spec of d.fonts.google) seen.set(spec.split(':')[0], spec);
  if (resolved?.picker) { seen.set('Inter', 'Inter:wght@400;500;600;700;800'); seen.set('JetBrains+Mono', 'JetBrains+Mono:wght@400;500;600'); }
  return `https://fonts.googleapis.com/css2?${[...seen.values()].map((f) => `family=${f}`).join('&')}&display=swap`;
}

/** Metric-matched fallback @font-face rules for the active theme's web fonts. */
export function themeFontFaces(resolved) {
  const defs = resolved?.picker ? Object.values(THEMES).filter((t) => !THEME_ALIASES[t.id]) : [THEMES[resolved?.themeName || DEFAULT_THEME]];
  const seen = new Set();
  const out = [];
  for (const d of defs) for (const f of d?.fonts?.fallbacks || []) {
    if (seen.has(f.family)) continue;
    seen.add(f.family);
    out.push(`@font-face { font-family: '${f.family}'; src: local('${f.local}'); size-adjust: ${f.sizeAdjust}; ascent-override: ${f.ascent}; descent-override: ${f.descent}; line-gap-override: 0%; }`);
  }
  return out.join('\n');
}

/** Layout defaults a theme contributes (user `layout` keys win). */
export function themeLayoutDefaults(config) {
  try {
    const name = parseThemeConfig(config).themeName;
    return (name && THEMES[name]?.layout) || {};
  } catch {
    return {};
  }
}

/** theme id -> signature palette id (used by the picker runtime). */
export function themeSignatures() {
  return Object.fromEntries(Object.values(THEMES).map((t) => [t.id, t.palette]));
}

/** Colours for <meta name="theme-color"> in each mode. */
export function themeColors(resolved) {
  return { dark: resolved.dark?.bg || '#0a0a0a', light: resolved.light?.bg || '#ffffff' };
}

export function buildBrandThemeTemplate({ name = 'Acme Brand', extendsPreset = 'slate', accent = '#003366', accentLight = '#0066cc' } = {}) {
  return {
    name,
    extends: extendsPreset,
    colors: {
      accent,
      accentLight,
    },
    dark: {
      accent: accentLight,
    },
    fonts: {
      sans: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      mono: "'JetBrains Mono', 'Fira Code', monospace",
    },
  };
}

export const BRAND_THEME_EXAMPLE_FILENAME = 'brand-theme.json';

export function defaultBrandThemePath() {
  return BRAND_THEME_EXAMPLE_FILENAME;
}

// ── Diagnostics (pure; validate.js adds the filesystem checks) ──────────────────────────────────

function editDistance(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return dp[a.length][b.length];
}

/** Closest candidate to `name` (case-insensitive) or null when nothing is reasonably near. */
export function suggestName(name, candidates) {
  const n = String(name).toLowerCase();
  let best = null; let bestD = Infinity;
  for (const c of candidates) {
    const d = c.startsWith(n) || n.startsWith(c) ? 1 : editDistance(n, c);
    if (d < bestD) { best = c; bestD = d; }
  }
  return bestD <= Math.max(2, Math.floor(n.length / 3)) ? best : null;
}

export const allThemeIds = () => Object.keys(THEMES);
export const allPaletteIds = () => Object.keys(PALETTES);

/** A string that points at a theme file rather than naming a theme/palette. */
export function looksLikeThemeFile(value) {
  return typeof value === 'string' && (/[\\/]/.test(value) || /\.(json|jsonc)$/i.test(value));
}

/**
 * Validate the shape of `config.theme` without touching the filesystem.
 * Returns [{ level, message, code, fix }] with stable codes.
 */
export function diagnoseTheme(config) {
  const out = [];
  const raw = config?.theme;
  if (raw == null) return out;
  const names = [...allThemeIds().filter((t) => !THEME_ALIASES[t]), ...allPaletteIds()];
  const themeList = allThemeIds().filter((t) => !THEME_ALIASES[t]).join(', ');
  const paletteList = allPaletteIds().join(', ');
  const unknown = (what, value, list, code, pool) => {
    const near = suggestName(value, pool);
    out.push({
      level: 'error', code,
      message: `Unknown theme ${what} "${value}".${near ? ` Did you mean "${near}"?` : ''} Available ${what === 'palette' ? 'palettes' : what === 'preset' ? 'palettes' : 'themes'}: ${list}`,
      fix: near ? `Use "${near}" (see \`docslit theme list\`)` : 'Run `docslit theme list` and use a listed name',
    });
  };
  if (typeof raw === 'string') {
    if (!classify(raw) && !looksLikeThemeFile(raw)) {
      const near = suggestName(raw, names);
      out.push({
        level: 'error', code: 'theme-unknown',
        message: `Unknown theme "${raw}".${near ? ` Did you mean "${near}"?` : ''} Themes: ${themeList}. Palettes: ${paletteList}. (A path ending in .json is read as a theme file.)`,
        fix: near ? `Use "${near}" (see \`docslit theme list\`)` : 'Run `docslit theme list` and use a listed theme or palette name',
      });
    }
    return out;
  }
  if (!isPlainObject(raw)) return out;
  if (raw.theme != null && !isThemeName(raw.theme)) unknown('theme', raw.theme, themeList, 'theme-unknown-theme', allThemeIds());
  if (raw.palette != null && !isValidThemePreset(raw.palette)) unknown('palette', raw.palette, paletteList, 'theme-unknown-palette', allPaletteIds());
  for (const key of ['extends', 'preset']) {
    const v = raw[key];
    if (v != null && !classify(v)) unknown('preset', v, paletteList, 'theme-unknown-preset', allPaletteIds());
  }
  if (typeof raw.name === 'string' && !isThemeName(raw.name)) {
    const near = suggestName(raw.name, allThemeIds().filter((t) => !THEME_ALIASES[t]));
    if (near && editDistance(raw.name.toLowerCase(), near) <= 2) {
      out.push({ level: 'warning', code: 'theme-name-typo', message: `theme.name "${raw.name}" is not a theme id. Did you mean "${near}"? (Any other name is treated as a brand label.)`, fix: `Use "name": "${near}" to select that theme` });
    }
  }
  if (raw.appearance != null && !APPEARANCES.includes(raw.appearance)) {
    out.push({ level: 'error', code: 'theme-appearance-invalid', message: `theme.appearance must be "system", "light" or "dark" (got ${JSON.stringify(raw.appearance)})`, fix: 'Use "system", "light" or "dark"' });
  }
  if (raw.strict != null && typeof raw.strict !== 'boolean') {
    out.push({ level: 'error', code: 'theme-strict-invalid', message: 'theme.strict must be true or false', fix: 'Use "strict": true to hide the light/dark toggle' });
  }
  if (raw.radius != null && Object.keys(radiusVars(String(raw.radius))).length === 0) {
    out.push({ level: 'error', code: 'theme-radius-invalid', message: `theme.radius "${raw.radius}" is not valid. Use ${RADIUS_NAMES.join(', ')} or a length like "6px"`, fix: `Use one of ${RADIUS_NAMES.join(', ')} or a length such as "6px"` });
  }
  return out;
}

/** WCAG checks of the colours the resolved theme will actually use. Returns [{ mode, pair, ratio, min }]. */
export function contrastIssues(resolved) {
  const found = [];
  for (const mode of ['light', 'dark']) {
    const p = resolved[mode];
    const checks = [
      ['text on background', p.text, p.bg, 4.5], ['secondary text on background', p.text2, p.bg, 4.5], ['muted text on background', p.text3, p.bg, 4.5],
      ['link (accentLight) on background', p.accentLight, p.bg, 4.5], ['accent on background (focus ring, UI)', p.accent, p.bg, 3],
      ['code text on code background', p.codeText, p.codeBg, 4.5],
    ];
    for (const [pair, fg, bg, min] of checks) {
      const ratio = contrastRatio(String(fg || ''), String(bg || ''));
      if (Number.isFinite(ratio) && ratio < min) found.push({ mode, pair, ratio: Math.round(ratio * 100) / 100, min });
    }
  }
  return found;
}

export { THEMES, THEME_ALIASES, canonicalThemeId };
