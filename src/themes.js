/** @typedef {{ preset: string, colors: Record<string, string> }} SiteTheme */

const CSS_VAR_KEYS = {
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
  fontSans: '--font-sans',
  fontMono: '--font-mono',
  radius: '--radius',
  radiusLg: '--radius-lg',
};

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

export function getSiteTheme(config) {
  const raw = config?.theme;
  if (!raw) return { preset: DEFAULT_THEME_PRESET, colors: {} };
  if (typeof raw === 'string') return { preset: raw, colors: {} };
  return {
    preset: raw.preset || DEFAULT_THEME_PRESET,
    colors: raw.colors && typeof raw.colors === 'object' && !Array.isArray(raw.colors) ? raw.colors : {},
  };
}

export function isValidThemePreset(preset) {
  return preset === DEFAULT_THEME_PRESET || Boolean(THEME_PRESETS[preset]);
}

export function listThemePresets() {
  return Object.entries(THEME_PRESETS).map(([id, theme]) => ({ id, label: theme.label }));
}

function varsBlock(vars) {
  return Object.entries(vars)
    .map(([key, value]) => `${CSS_VAR_KEYS[key] || `--${key}`}: ${value}`)
    .join('; ');
}

function normalizeColorKey(key) {
  if (CSS_VAR_KEYS[key]) return key;
  const camel = key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  return CSS_VAR_KEYS[camel] ? camel : null;
}

export function buildThemeCss(siteTheme) {
  const { preset, colors } = siteTheme;
  const blocks = [];

  for (const [id, theme] of Object.entries(THEME_PRESETS)) {
    if (id === DEFAULT_THEME_PRESET) continue;
    blocks.push(`html[data-theme="${id}"] { ${varsBlock(theme.dark)}; }`);
    blocks.push(`html.light[data-theme="${id}"] { ${varsBlock(theme.light)}; }`);
  }

  const customVars = Object.entries(colors)
    .map(([key, value]) => {
      const normalized = normalizeColorKey(key);
      if (!normalized || typeof value !== 'string' || !value.trim()) return null;
      return `${CSS_VAR_KEYS[normalized]}: ${value.trim()}`;
    })
    .filter(Boolean);

  if (customVars.length) {
    const selector = `html[data-theme="${preset}"]`;
    blocks.push(`${selector} { ${customVars.join('; ')}; }`);
    blocks.push(`html.light${selector.replace('html', '')} { ${customVars.join('; ')}; }`);
  }

  if (!blocks.length) return '';
  return `\n/* SITE THEMES */\n${blocks.join('\n')}\n`;
}

export function buildHtmlTag(siteTheme) {
  const preset = isValidThemePreset(siteTheme.preset) ? siteTheme.preset : DEFAULT_THEME_PRESET;
  const hasCustom = Object.keys(siteTheme.colors || {}).length > 0;
  if (preset === DEFAULT_THEME_PRESET && !hasCustom) return '<html lang="en">';
  return `<html lang="en" data-theme="${preset}">`;
}
