import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  resolveSiteThemeSync, resolveSiteTheme, buildThemeCss, buildHtmlTag, parseThemeConfig, PALETTES, THEME_PRESETS, EXTRA_PALETTES,
  THEMES, THEME_ALIASES, listThemes, listPalettes, diagnoseTheme, suggestName, contrastIssues, themeTokenValues, listDesignTokens,
  isThemeName, isValidPalette,
} from './themes.js';
import { applyThemeToConfigText } from './theme-cmd.js';
import { renderShell, renderPage, buildStylesFile } from './template.js';
import { runValidation } from './validate.js';
import {
  parseColor, toHex, contrastRatio, toOklch, fromOklch, ensureContrast, onColor, tonalPalettes, tonalScheme, tonalColor, relativeLuminance,
} from './color.js';
import { TOKENS, buildBaseTokensCss } from './theme-tokens.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const golden = JSON.parse(fs.readFileSync(path.join(here, 'test-fixtures', 'legacy-theme-golden.json'), 'utf8'));

// The configs captured in the golden file BEFORE the theme system was extended (see legacy-theme-golden.json).
const LEGACY_CONFIGS = {
  none: undefined,
  ...Object.fromEntries(Object.keys(THEME_PRESETS).map((k) => ['preset-' + k, { theme: k }])),
  objExtends: { theme: { extends: 'ocean', colors: { accent: '#ff0066' } } },
  objPreset: { theme: { preset: 'slate', dark: { bg: '#000' }, light: { surface: '#eee' } } },
  objNamed: { theme: { name: 'Acme Brand', extends: 'violet', colors: { accent: '#123456', accentLight: '#abcdef' }, fonts: { sans: 'Foo, sans-serif', mono: 'Bar, monospace', radius: '4px', radiusLg: '8px' } } },
  objReserved: { theme: { id: 'ocean', colors: { accent: '#00ff00' } } },
  objKebab: { theme: { colors: { 'accent-light': '#fff', 'sidebar-bg': '#111' } } },
  objEmpty: { theme: {} },
};

describe('legacy theme configs render exactly as before', () => {
  for (const [key, cfg] of Object.entries(LEGACY_CONFIGS)) {
    it(`${key}: palettes, CSS variables and <html> tag are unchanged`, () => {
      const r = resolveSiteThemeSync(cfg);
      const g = golden[key];
      expect({ id: r.id, basePreset: r.basePreset, dark: r.dark, light: r.light, isCustom: r.isCustom })
        .toEqual({ id: g.resolved.id, basePreset: g.resolved.basePreset, dark: g.resolved.dark, light: g.resolved.light, isCustom: g.resolved.isCustom });
      expect(buildThemeCss(r)).toBe(g.css);
      expect(buildHtmlTag(r, 'en')).toBe(g.html);
    });
  }
});

describe('theme / palette resolution', () => {
  it('theme ids and palette ids never collide', () => {
    const themes = Object.keys(THEMES);
    for (const t of themes) expect(Object.keys(PALETTES)).not.toContain(t);
    expect(themes).toEqual(expect.arrayContaining(['default', 'classic', 'peppermint', 'frond', 'tonal', 'folio', 'ledger']));
  });
  it('a theme name selects the theme with its signature palette', () => {
    const r = resolveSiteThemeSync({ theme: 'peppermint' });
    expect(r.themeName).toBe('peppermint');
    expect(r.paletteId).toBe('mint');
    expect(r.id).toBe('mint');
    expect(r.isCustom).toBe(false);
  });
  it('a palette name keeps the classic look (backwards compatible)', () => {
    const r = resolveSiteThemeSync({ theme: 'ocean' });
    expect(r.themeName).toBe('default');
    expect(r.paletteId).toBe('ocean');
  });
  it('classic is an alias of default', () => {
    expect(resolveSiteThemeSync({ theme: 'classic' }).themeName).toBe('default');
  });
  it('object form: name + palette + overrides', () => {
    const r = resolveSiteThemeSync({ theme: { name: 'frond', palette: 'ocean', colors: { accent: '#d946ef' }, radius: 'lg', appearance: 'dark', strict: true } });
    expect(r.themeName).toBe('frond');
    expect(r.paletteId).toBe('ocean');
    expect(r.isCustom).toBe(true);
    expect(r.light.accent).toBe('#d946ef');
    expect(r.appearance).toBe('dark');
    expect(r.strict).toBe(true);
    expect(r.light.radius).toBe('12px');
  });
  it('a free-form name stays a brand label, a theme can be set with "theme"', () => {
    const r = resolveSiteThemeSync({ theme: { name: 'Acme Brand', theme: 'folio', extends: 'slate' } });
    expect(r.themeName).toBe('folio');
    expect(r.paletteId).toBe('slate');
  });
  it('legacy extends can name a theme', () => {
    expect(resolveSiteThemeSync({ theme: { extends: 'tonal' } }).themeName).toBe('tonal');
  });
  it('user colours override theme and palette; unset keys are derived accessibly', () => {
    const r = resolveSiteThemeSync({ theme: { name: 'peppermint', colors: { accent: '#e11d48' } } });
    expect(r.light.accent).toBe('#e11d48');
    expect(contrastRatio(r.light.accentLight, r.light.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(r.dark.accentLight, r.dark.bg)).toBeGreaterThanOrEqual(4.5);
  });
  it('tonal derives surfaces from the brand accent', () => {
    const a = resolveSiteThemeSync({ theme: { name: 'tonal', colors: { accent: '#0a7d52' } } });
    const b = resolveSiteThemeSync({ theme: { name: 'tonal', colors: { accent: '#b3261e' } } });
    expect(a.light.bg).not.toBe(b.light.bg);
    expect(a.light.accent).toBe('#0a7d52');
  });
  it('themed <html> carries the theme name and palette', () => {
    expect(buildHtmlTag(resolveSiteThemeSync({ theme: 'peppermint' }), 'fr')).toBe('<html lang="fr" data-theme-name="peppermint" data-theme="mint">');
    expect(buildHtmlTag(resolveSiteThemeSync({ theme: { name: 'tonal', strict: true } }))).toContain('data-strict="true"');
  });
  it('extra palettes are only emitted when selected', () => {
    expect(buildThemeCss(resolveSiteThemeSync({ theme: 'ocean' }))).not.toContain('data-theme="mint"');
    expect(buildThemeCss(resolveSiteThemeSync({ theme: 'mint' }))).toContain('html[data-theme="mint"]');
  });
  it('non-default themes emit token blocks and a palette pair only for themselves', () => {
    const css = buildThemeCss(resolveSiteThemeSync({ theme: 'frond' }));
    expect(css).toContain('html[data-theme-name="frond"] {');
    expect(css).toContain('html[data-theme-name="frond"][data-theme="ink"]');
    expect(css).not.toContain('html[data-theme-name="peppermint"]');
  });
  it('picker mode includes every theme and palette', () => {
    const css = buildThemeCss({ ...resolveSiteThemeSync({ theme: 'peppermint' }), picker: true }, { all: true });
    for (const t of listThemes().map((x) => x.id).filter((x) => x !== 'default')) expect(css).toContain(`html[data-theme-name="${t}"] {`);
    expect(css).toContain('html[data-theme-name="tonal"][data-theme="rose"]');
  });
  it('listThemes / listPalettes describe everything', () => {
    expect(listThemes().map((t) => t.id)).toEqual(['default', 'peppermint', 'frond', 'tonal', 'folio', 'ledger']);
    for (const t of listThemes()) { expect(t.description.length).toBeGreaterThan(20); expect(isValidPalette(t.palette)).toBe(true); }
    expect(listPalettes().length).toBe(Object.keys(PALETTES).length);
    expect(Object.keys(EXTRA_PALETTES)).toEqual(expect.arrayContaining(['mint', 'ink', 'paper', 'steel', 'iris']));
  });
  it('legacy theme file loading still works and may name a theme', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dl-theme-'));
    fs.writeFileSync(path.join(dir, 'b.json'), JSON.stringify({ name: 'peppermint', palette: 'forest', colors: { accent: '#0a7d52' } }));
    const r = await resolveSiteTheme({ theme: './b.json' }, dir);
    expect(r.themeName).toBe('peppermint');
    expect(r.paletteId).toBe('forest');
    expect(r.light.accent).toBe('#0a7d52');
  });
  it('token reference lists defaults and per-theme values', () => {
    expect(TOKENS.length).toBeGreaterThan(100);
    const v = themeTokenValues('peppermint');
    expect(v['--radius-lg'].overridden).toBe(true);
    expect(themeTokenValues('default')['--h1-size'].value).toBe('3rem');
    expect(listDesignTokens().find((t) => t.name === '--nav-bg').light).toBeTruthy();
    expect(buildBaseTokensCss()).toContain('--h1-size: 3rem');
  });
});

describe('colour utility', () => {
  it('parses and formats colours', () => {
    expect(parseColor('#0af')).toEqual({ r: 0, g: 170, b: 255, a: 1 });
    expect(parseColor('rgba(1, 105, 111, .25)')).toEqual({ r: 1, g: 105, b: 111, a: 0.25 });
    expect(parseColor('nope')).toBe(null);
    expect(toHex({ r: 1, g: 105, b: 111 })).toBe('#01696f');
  });
  it('computes WCAG contrast', () => {
    expect(contrastRatio('#000', '#fff')).toBeCloseTo(21, 1);
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 1);
    expect(contrastRatio('rgba(0,0,0,.5)', '#ffffff')).toBeCloseTo(contrastRatio('#808080', '#ffffff'), 1);
  });
  it('round-trips OKLCH', () => {
    for (const c of ['#01696f', '#e11d48', '#6750a4', '#ffffff', '#101010']) {
      const back = toHex(fromOklch(toOklch(c)));
      expect(contrastRatio(back, c)).toBeLessThan(1.03);
    }
  });
  it('ensureContrast repairs minimally and keeps passing colours', () => {
    expect(ensureContrast('#111111', '#ffffff')).toBe('#111111');
    const fixed = ensureContrast('#9a9a9a', ['#ffffff'], 4.5);
    expect(contrastRatio(fixed, '#ffffff')).toBeGreaterThanOrEqual(4.5);
    const onDark = ensureContrast('#555555', ['#0a0a0a', '#111111'], 4.5);
    expect(contrastRatio(onDark, '#111111')).toBeGreaterThanOrEqual(4.5);
    expect(relativeLuminance(onDark)).toBeGreaterThan(relativeLuminance('#555555'));
  });
  it('onColor picks the readable text colour', () => {
    expect(onColor('#0b7d52')).toBe('#ffffff');
    expect(onColor('#2bc486')).toBe('#000000');
  });
  it('tonal palettes: tone is CIE L*, so tone gaps give predictable contrast', () => {
    const p = tonalPalettes('#6750a4');
    expect(p.primary(0)).toBe('#000000');
    expect(p.primary(100)).toBe('#ffffff');
    // luminance rises monotonically with tone
    let prev = -1;
    for (const t of [10, 20, 30, 40, 50, 60, 70, 80, 90, 95]) {
      const y = relativeLuminance(p.primary(t));
      expect(y).toBeGreaterThan(prev);
      prev = y;
    }
    // L* 40 vs L* 90+ is comfortably AA for text
    expect(contrastRatio(p.primary(40), p.neutral(98))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(p.primary(80), p.neutral(6))).toBeGreaterThanOrEqual(4.5);
    // hue is preserved
    const h0 = toOklch('#6750a4').h; const h1 = toOklch(p.primary(50)).h;
    expect(Math.abs(h0 - h1)).toBeLessThan(12);
  });
  it('tonal schemes follow the seed and stay accessible in both modes', () => {
    for (const seed of ['#6750a4', '#0b7d52', '#b3261e', '#1d4ed8', '#3f3f46']) {
      for (const mode of ['light', 'dark']) {
        const s = tonalScheme(seed, mode);
        expect(contrastRatio(s.text, s.bg)).toBeGreaterThanOrEqual(7);
        expect(contrastRatio(s.text2, s.bg)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(s.text3, s.surface2)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(s.accent, s.bg)).toBeGreaterThanOrEqual(3);
        expect(contrastRatio(s.onAccent, s.accent)).toBeGreaterThanOrEqual(4.5);
      }
    }
    expect(tonalColor(250, 0.12, 50)).toMatch(/^#[0-9a-f]{6}$/);
  });
});

// Contrast over every theme x palette x mode (WCAG 2.2 AA). The classic theme keeps the legacy palettes
// byte-identical, so their known shortfalls are listed explicitly: the list may only shrink.
const CLASSIC_LEGACY_KNOWN_FAILURES = new Set([
  'teal/light/text3/surface',
  'teal/light/text3/surface2',
  'teal/light/text3/sidebar',
  'teal/dark/text3/bg',
  'teal/dark/text3/surface',
  'teal/dark/text3/surface2',
  'teal/dark/text3/sidebar',
  'teal/dark/accent/surface',
  'ocean/light/text3/surface2',
  'ocean/light/text3/sidebar',
  'ocean/dark/text3/bg',
  'ocean/dark/text3/surface',
  'ocean/dark/text3/surface2',
  'ocean/dark/text3/sidebar',
  'forest/light/text3/bg',
  'forest/light/text3/surface',
  'forest/light/text3/surface2',
  'forest/light/text3/sidebar',
  'forest/dark/text3/surface2',
  'forest/dark/onAccent',
  'slate/light/text3/surface2',
  'slate/light/text3/sidebar',
  'slate/dark/text3/bg',
  'slate/dark/text3/surface',
  'slate/dark/text3/surface2',
  'slate/dark/text3/sidebar',
  'slate/dark/accent/bg',
  'slate/dark/accent/surface',
  'violet/dark/text3/surface2',
  'rose/dark/text3/surface2',
  'amber/dark/onAccent',
  'graphite/light/text3/surface2',
  'graphite/light/text3/sidebar',
  'graphite/dark/text3/bg',
  'graphite/dark/text3/surface',
  'graphite/dark/text3/surface2',
  'graphite/dark/text3/sidebar',
  'graphite/dark/onAccent'
]);

function checks(p) {
  return [
    ['text/bg', p.text, p.bg, 4.5], ['text/surface', p.text, p.surface, 4.5],
    ['text2/bg', p.text2, p.bg, 4.5], ['text2/surface', p.text2, p.surface, 4.5], ['text2/sidebar', p.text2, p.sidebarBg, 4.5],
    ['text3/bg', p.text3, p.bg, 4.5], ['text3/surface', p.text3, p.surface, 4.5], ['text3/surface2', p.text3, p.surface2, 4.5], ['text3/sidebar', p.text3, p.sidebarBg, 4.5],
    ['link/bg', p.accentLight, p.bg, 4.5], ['link/surface', p.accentLight, p.surface, 4.5], ['link/surface2', p.accentLight, p.surface2, 4.5],
    ['accent/bg', p.accent, p.bg, 3], ['accent/surface', p.accent, p.surface, 3], // UI + focus ring
    ['code', p.codeText, p.codeBg, 4.5],
    ['onAccent', p.onAccent || '#ffffff', p.accent, 4.5],
  ];
}

describe('WCAG AA contrast: theme x palette x mode', () => {
  const themeIds = Object.keys(THEMES).filter((t) => !THEME_ALIASES[t]);
  for (const t of themeIds) {
    it(`${t}: every palette, both modes`, () => {
      const failures = [];
      for (const pid of Object.keys(PALETTES)) {
        const r = resolveSiteThemeSync({ theme: { name: t, palette: pid } });
        for (const mode of ['light', 'dark']) {
          for (const [name, fg, bg, min] of checks(r[mode])) {
            if (!(contrastRatio(String(fg), String(bg)) >= min)) failures.push(`${pid}/${mode}/${name}`);
          }
        }
      }
      if (t === 'default') {
        const fresh = failures.filter((f) => !CLASSIC_LEGACY_KNOWN_FAILURES.has(f));
        expect(fresh).toEqual([]);
      } else {
        expect(failures).toEqual([]);
      }
    });
  }
  it('user brand colours on a themed site: derived colours stay accessible', () => {
    for (const accent of ['#e11d48', '#f59e0b', '#14b8a6', '#8b5cf6', '#facc15']) {
      for (const t of ['peppermint', 'frond', 'tonal', 'folio', 'ledger']) {
        const r = resolveSiteThemeSync({ theme: { name: t, colors: { accent } } });
        for (const mode of ['light', 'dark']) {
          expect(contrastRatio(r[mode].accentLight, r[mode].bg)).toBeGreaterThanOrEqual(4.5);
          expect(contrastRatio(r[mode].text3, r[mode].bg)).toBeGreaterThanOrEqual(4.5);
          expect(contrastRatio(r[mode].onAccent, r[mode].accent)).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });
  it('contrastIssues reports explicit low-contrast overrides', () => {
    const r = resolveSiteThemeSync({ theme: { name: 'peppermint', colors: { text3: '#dddddd' } } });
    const found = contrastIssues(r);
    expect(found.some((f) => f.pair.startsWith('muted text') && f.mode === 'light')).toBe(true);
  });
});

describe('diagnostics and validate', () => {
  it('unknown theme names get a nearest-name suggestion and a stable code', () => {
    const d = diagnoseTheme({ theme: 'peppermnt' });
    expect(d[0].code).toBe('theme-unknown');
    expect(d[0].message).toContain('Did you mean "peppermint"');
    expect(diagnoseTheme({ theme: 'oceann' })[0].message).toContain('"ocean"');
    expect(diagnoseTheme({ theme: 'zzzzzz' })[0].message).not.toContain('Did you mean');
  });
  it('known names, files and brand labels produce no diagnostics', () => {
    expect(diagnoseTheme({ theme: 'peppermint' })).toEqual([]);
    expect(diagnoseTheme({ theme: 'ocean' })).toEqual([]);
    expect(diagnoseTheme({ theme: './brand-theme.json' })).toEqual([]);
    expect(diagnoseTheme({ theme: { name: 'Acme Brand', colors: { accent: '#123456' } } })).toEqual([]);
  });
  it('object form validation', () => {
    expect(diagnoseTheme({ theme: { palette: 'oceann' } })[0].code).toBe('theme-unknown-palette');
    expect(diagnoseTheme({ theme: { theme: 'tonl' } })[0].code).toBe('theme-unknown-theme');
    expect(diagnoseTheme({ theme: { extends: 'nope' } })[0].code).toBe('theme-unknown-preset');
    expect(diagnoseTheme({ theme: { appearance: 'sepia' } })[0].code).toBe('theme-appearance-invalid');
    expect(diagnoseTheme({ theme: { strict: 'yes' } })[0].code).toBe('theme-strict-invalid');
    expect(diagnoseTheme({ theme: { radius: 'huge' } })[0].code).toBe('theme-radius-invalid');
    expect(diagnoseTheme({ theme: { radius: '6px' } })).toEqual([]);
    expect(diagnoseTheme({ theme: { name: 'peppermnt' } })[0].code).toBe('theme-name-typo');
  });
  it('suggestName', () => {
    expect(suggestName('ledgr', ['ledger', 'frond'])).toBe('ledger');
    expect(suggestName('purple', ['violet', 'rose'])).toBe(null);
  });
  async function project(theme, extra = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dl-val-'));
    fs.mkdirSync(path.join(dir, 'docs'));
    fs.writeFileSync(path.join(dir, 'docs', 'a.md'), '---\ntitle: A\n---\n\n# A\n');
    fs.writeFileSync(path.join(dir, 'docslit.json'), JSON.stringify({ name: 'T', sidebar: [{ group: 'G', pages: ['a'] }], theme, ...extra }));
    return dir;
  }
  it('runValidation reports an unknown theme as an error with a suggestion', async () => {
    const { issues } = await runValidation(await project('tonall'));
    const i = issues.find((x) => x.code === 'theme-unknown');
    expect(i.level).toBe('error');
    expect(i.fix).toContain('tonal');
  });
  it('runValidation accepts every theme and palette', async () => {
    for (const t of [...Object.keys(THEMES), ...Object.keys(PALETTES)]) {
      const { issues } = await runValidation(await project(t));
      expect(issues.filter((x) => /^theme-/.test(x.code))).toEqual([]);
    }
  });
  it('runValidation warns about low-contrast explicit colours', async () => {
    const { issues } = await runValidation(await project({ name: 'peppermint', colors: { text2: '#e5e5e5' } }));
    expect(issues.some((x) => x.code === 'theme-low-contrast' && x.level === 'warning')).toBe(true);
  });
});

describe('theme use (docslit.json editing)', () => {
  const base = '{\n    "$schema": "x",\n    "name": "Docs",\n    "description": "d",\n    "sidebar": [\n        { "group": "G", "pages": ["a"] }\n    ]\n}\n';
  it('adds a theme after name/description, preserving indentation, other keys and trailing newline', () => {
    const out = applyThemeToConfigText(base, { theme: 'peppermint' });
    const j = JSON.parse(out);
    expect(j.theme).toBe('peppermint');
    expect(Object.keys(j)).toEqual(['$schema', 'name', 'description', 'theme', 'sidebar']);
    expect(out.startsWith('{\n    "$schema"')).toBe(true);
    expect(out.endsWith('}\n')).toBe(true);
    expect(j.sidebar).toEqual([{ group: 'G', pages: ['a'] }]);
  });
  it('keeps a missing trailing newline missing', () => {
    expect(applyThemeToConfigText(base.trimEnd(), { theme: 'frond' }).endsWith('\n')).toBe(false);
  });
  it('theme + palette creates the object form', () => {
    const j = JSON.parse(applyThemeToConfigText(base, { theme: 'tonal', palette: 'ocean' }));
    expect(j.theme).toEqual({ name: 'tonal', palette: 'ocean' });
  });
  it('replaces a string theme in place and keeps key order', () => {
    const j1 = applyThemeToConfigText('{"name":"x","theme":"ocean","sidebar":[]}', { theme: 'frond' });
    expect(Object.keys(JSON.parse(j1))).toEqual(['name', 'theme', 'sidebar']);
    expect(JSON.parse(j1).theme).toBe('frond');
  });
  it('keeps brand colours, fonts and other overrides of an object theme', () => {
    const src = JSON.stringify({ name: 'x', theme: { name: 'Acme', extends: 'slate', colors: { accent: '#123456' }, fonts: { sans: 'Foo' } } });
    const j = JSON.parse(applyThemeToConfigText(src, { theme: 'peppermint', palette: 'ocean' })).theme;
    expect(j.colors).toEqual({ accent: '#123456' });
    expect(j.fonts).toEqual({ sans: 'Foo' });
    expect(j.theme).toBe('peppermint');
    expect(j.name).toBe('Acme');
    expect(j.palette).toBe('ocean');
    expect(j.extends).toBeUndefined();
    const r = resolveSiteThemeSync(JSON.parse(applyThemeToConfigText(src, { theme: 'peppermint', palette: 'ocean' })));
    expect(r.themeName).toBe('peppermint');
    expect(r.paletteId).toBe('ocean');
  });
  it('a palette only keeps the current theme', () => {
    const j = JSON.parse(applyThemeToConfigText('{"name":"x","theme":"frond"}', { palette: 'rose' }));
    expect(j.theme).toEqual({ name: 'frond', palette: 'rose' });
  });
  it('the classic theme with a stock palette uses the legacy one-liner', () => {
    expect(JSON.parse(applyThemeToConfigText('{"name":"x"}', { theme: 'default', palette: 'ocean' })).theme).toBe('ocean');
  });
  it('invalid JSON throws', () => {
    expect(() => applyThemeToConfigText('{nope', { theme: 'frond' })).toThrow();
  });
});

describe('generated pages', () => {
  const sidebar = [{ group: 'G', pages: ['intro'] }];
  const themed = (theme, extra = {}) => ({ name: 'T', sidebar, theme, ...extra });
  it('every theme renders a shell with its attributes, tokens and font link', async () => {
    for (const t of listThemes().map((x) => x.id)) {
      const cfg = themed(t);
      const html = await renderShell({ config: cfg, mode: 'dev', port: 3000 });
      if (t === 'default') expect(html).not.toContain('data-theme-name');
      else {
        expect(html).toContain(`data-theme-name="${t}"`);
        expect(html).toContain(`html[data-theme-name="${t}"] {`);
      }
      expect(html).toContain('color-scheme: dark');
      expect(html).toContain('--h1-size: 3rem');
    }
    expect(await renderShell({ config: themed('tonal'), mode: 'dev', port: 3000 })).toContain('family=Roboto');
    expect(await renderShell({ config: themed('default'), mode: 'dev', port: 3000 })).toContain('family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');
  });
  it('offline builds carry no remote font links but keep system fallbacks in every theme stack', async () => {
    const html = await renderShell({ config: themed('folio'), mode: 'static', offline: true });
    expect(html).not.toContain('fonts.googleapis.com');
    expect(THEMES.folio.fonts.heading).toContain('Georgia');
    expect(THEMES.tonal.fonts.sans).toContain('system-ui');
    expect(THEMES.ledger.fonts.sans).toContain('sans-serif');
  });
  it('the theme init script runs first in <head>, sets mode and theme-color, honours appearance and strict', async () => {
    const html = await renderShell({ config: themed({ name: 'peppermint', appearance: 'light', strict: true }), mode: 'dev', port: 3000 });
    const head = html.slice(0, html.indexOf('</head>'));
    expect(head.indexOf('docslit-theme')).toBeGreaterThan(-1);
    expect(head.indexOf('docslit-theme')).toBeLessThan(head.indexOf('<style>'));
    expect(head).toContain('D="light"');
    expect(head).toContain('S=true');
    expect(head).toContain('theme-color');
    expect(html).toContain('data-strict="true"');
    const legacy = await renderShell({ config: themed('ocean'), mode: 'dev', port: 3000 });
    expect(legacy).toContain('D="legacy"');
    expect(legacy).toContain("S=false");
  });
  it('the picker is never rendered unless enabled', async () => {
    expect(await renderShell({ config: themed('frond'), mode: 'dev', port: 3000 })).not.toContain('dl-picker');
    const on = await renderShell({ config: themed('frond', { themePicker: true }), mode: 'dev', port: 3000 });
    expect(on).toContain('id="dl-picker"');
    expect(on).toContain('data-theme-name="tonal"][data-theme="iris"]');
    expect(on).toContain('family=Source+Serif+4');
  });
  it('static pages link the shared stylesheet that contains the theme', async () => {
    const css = await buildStylesFile({ siteTheme: resolveSiteThemeSync({ theme: 'ledger' }) });
    expect(css).toContain('html[data-theme-name="ledger"]');
    expect(css).toContain('IBM Plex Sans');
  });
  it('renderPage output for a themed site is valid and mentions the palette', async () => {
    const html = await renderPage({ config: themed('peppermint'), id: 'intro', meta: { title: 'Intro' }, html: '<h1>Intro</h1><p>x</p>' });
    expect(html).toContain('data-theme-name="peppermint" data-theme="mint"');
  });
});
