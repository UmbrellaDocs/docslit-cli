import { describe, it, expect } from 'vitest';
import { applyNavigation } from './navigation.js';
import { buildNavState, renderTabsBar, NAV_RUNTIME_JS, NAV_RULES_CSS } from './nav-chrome.js';
import { componentPageCss } from './components/page-css.js';
import fs from 'fs';

const tabs = [{ tab: 'A', sidebar: [{ group: 'G', pages: ['a'] }] }, { tab: 'B', sidebar: [{ group: 'H', pages: ['b'] }] }];
const bar = (layout) => {
  const config = applyNavigation({ name: 'X', tabs, ...(layout ? { layout } : {}) });
  return renderTabsBar(buildNavState({ config, activePageId: 'a' }));
};

describe('tab bar: explicit layout.tabsStyle is marked so themes can honour it', () => {
  it('marks data-style-set only when the config sets tabsStyle', () => {
    expect(bar()).not.toContain('data-style-set');
    expect(bar({ tabsStyle: 'pill' })).toContain('data-style="pill" data-style-set');
    expect(bar({ tabsStyle: 'underline' })).toContain('data-style-set');
  });
  it('peppermint pills yield to an explicit tabsStyle', async () => {
    const { THEMES } = await import('./theme-defs.js');
    const css = THEMES.peppermint.css;
    expect(css).toContain(':not([data-style-set])');
    expect(css).not.toMatch(/^& \.nav-tab\b/m);
  });
});

describe('dev server: noindex robots meta', () => {
  it('the client runtime toggles <meta name="robots"> from the page info', () => {
    expect(NAV_RUNTIME_JS).toContain("meta[name=\"robots\"]");
    expect(NAV_RUNTIME_JS).toContain('i.noindex');
  });
  it('dev.js sends noindex with every page payload', () => {
    const src = fs.readFileSync(new URL('./dev.js', import.meta.url), 'utf8');
    expect((src.match(/noindex: isNoindexMeta\(meta\)/g) || []).length).toBe(3);
  });
});

describe('component spacing that the global reset would otherwise erase', () => {
  it('page css sets host spacing for wc-image / wc-responses / wc-api-examples / wc-playground', () => {
    for (const tag of ['wc-image', 'wc-responses', 'wc-api-examples', 'wc-playground']) expect(componentPageCss).toContain(tag);
  });
});

describe('sidebar group root links', () => {
  it('reset the item margin so a root group title lines up with its siblings', () => {
    expect(NAV_RULES_CSS).toMatch(/\.sidebar-group-root, \.sidebar-group-root\.sidebar-item \{\s*display: inline; margin: 0;/);
  });
});

// ── CLI bug fixes reported by the docs pass ──────────────────────────────────
import os from 'os';
import path from 'path';
import fsx from 'fs-extra';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { checkPageNavigation } from './nav-validate.js';
import { resolveLayoutName } from './navigation.js';
import { applyThemeToConfigText, patchTopLevelKey } from './theme-cmd.js';
import { buildThemeConfig, describeTheme } from './import/theme.js';
import { runImport } from './import.js';
import { getComponent } from './component-manifest.js';
import { runValidation } from './validate.js';
import { parseDoc } from './markdown.js';

const BIN = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'docslit.js');
const run = (args, cwd) => new Promise((resolve) => {
  const p = spawn('node', [BIN, ...args], { cwd }); let out = '';
  p.stdout.on('data', (d) => (out += d)); p.stderr.on('data', (d) => (out += d));
  p.on('close', (code) => resolve({ code, out }));
});

describe('layout: changelog / blog / post / landing / centre', () => {
  it('are known layouts (no "Unknown page layout" warning) and render as guide / full / center', () => {
    for (const l of ['changelog', 'blog', 'post', 'landing', 'centre']) {
      expect(checkPageNavigation({ layout: l }, null).map((d) => d.code)).not.toContain('frontmatter-invalid-layout');
    }
    expect(resolveLayoutName('changelog')).toBe('guide');
    expect(resolveLayoutName('landing')).toBe('full');
    expect(resolveLayoutName('centre')).toBe('center');
    expect(checkPageNavigation({ layout: 'nope' }, null)[0].fix).toMatch(/changelog, blog, post/);
  });
  it('are in the frontmatter schema enum', () => {
    const schema = JSON.parse(fsx.readFileSync(new URL('../schema/frontmatter.schema.json', import.meta.url), 'utf8'));
    for (const l of ['changelog', 'blog', 'post', 'landing', 'centre']) expect(schema.properties.layout.enum).toContain(l);
  });
});

describe('docs.json schema: icons.library', () => {
  it('is declared', () => {
    const schema = JSON.parse(fsx.readFileSync(new URL('../schema/docslit.schema.json', import.meta.url), 'utf8'));
    expect(schema.properties.icons.properties.library.enum).toEqual(['auto', 'lucide', 'fontawesome']);
  });
});

describe('theme use keeps formatting and resets the palette', () => {
  const text = '{\n  "name": "X",\n  "tags": ["a", "b"],\n  "sidebar": [{ "group": "G", "pages": ["a"] }]\n}\n';
  it('only the theme line changes (inline arrays and key order survive)', () => {
    const out = applyThemeToConfigText(text, { theme: 'ledger' });
    expect(out).toBe('{\n  "name": "X",\n  "theme": "ledger",\n  "tags": ["a", "b"],\n  "sidebar": [{ "group": "G", "pages": ["a"] }]\n}\n');
    expect(applyThemeToConfigText(out, { theme: 'tonal' })).toContain('"theme": "tonal",\n  "tags": ["a", "b"]');
  });
  it('switching theme drops the previous palette (signature palette) unless --palette is given; brand colours stay', () => {
    const a = applyThemeToConfigText(text, { theme: 'peppermint', palette: 'ocean' });
    expect(JSON.parse(a).theme).toEqual({ name: 'peppermint', palette: 'ocean' });
    const b = JSON.parse(applyThemeToConfigText(a, { theme: 'ledger' }));
    expect(b.theme).toBe('ledger');
    const withColours = JSON.stringify({ name: 'X', theme: { name: 'peppermint', palette: 'ocean', colors: { accent: '#e11d48' } } }, null, 2);
    expect(JSON.parse(applyThemeToConfigText(withColours, { theme: 'frond' })).theme).toEqual({ name: 'frond', colors: { accent: '#e11d48' } });
    expect(JSON.parse(applyThemeToConfigText(withColours, { theme: 'frond', palette: 'rose' })).theme).toEqual({ name: 'frond', colors: { accent: '#e11d48' }, palette: 'rose' });
  });
  it('patchTopLevelKey handles strings with braces and empty objects', () => {
    expect(JSON.parse(patchTopLevelKey('{"a":"}{","b":[1,{"c":2}]}', 'theme', 'x'))).toEqual({ a: '}{', theme: 'x', b: [1, { c: 2 }] });
    expect(JSON.parse(patchTopLevelKey('{}\n', 'theme', 'x'))).toEqual({ theme: 'x' });
  });
});

describe('theme init creates missing folders and lists themes + palettes', () => {
  it('docslit theme init themes/acme.json', async () => {
    const dir = await fsx.mkdtemp(path.join(os.tmpdir(), 'dl-ti-'));
    try {
      await fsx.writeFile(path.join(dir, 'docslit.json'), '{\n  "name": "X",\n  "tags": ["a"]\n}\n');
      const r = await run(['theme', 'init', 'themes/acme.json'], dir);
      expect(r.code, r.out).toBe(0);
      expect(await fsx.pathExists(path.join(dir, 'themes', 'acme.json'))).toBe(true);
      expect(r.out).toMatch(/Themes:.*peppermint.*ledger/);
      expect(r.out).toMatch(/Palettes:.*mint.*iris/);
      const cfg = await fsx.readFile(path.join(dir, 'docslit.json'), 'utf8');
      expect(cfg).toContain('"theme": "./themes/acme.json"');
      expect(cfg).toContain('"tags": ["a"]');
    } finally { await fsx.remove(dir); }
  }, 30000);
});

describe('image icons stay plain <img> (not unsized wc-image)', () => {
  it('wc-icon src, wc-card/wc-button/wc-callout icon URLs', async () => {
    const { html } = await parseDoc('<wc-icon src="https://x.test/a.png"></wc-icon>\n\n<wc-card title="C" icon="https://x.test/c.png">x</wc-card>\n\n<wc-button icon="/logo.png" href="/">B</wc-button>\n\n<wc-callout icon="https://x.test/d.png">hi</wc-callout>\n\n![pic](https://x.test/photo.png)\n', {});
    expect(html).not.toMatch(/<wc-image[^>]*(a|c|d)\.png/);
    expect(html).not.toMatch(/<wc-image[^>]*logo\.png/);
    expect(html).toMatch(/<img[^>]*c\.png/);
    expect(html).toMatch(/<wc-image[^>]*photo\.png/); // ordinary content images still get the lightbox
  });
  it('manifest: wc-icon name is optional (src alternative); wc-download href optional (sources); wc-code-tab for; ids', () => {
    expect(getComponent('wc-icon').attributes.find((a) => a.name === 'name').required).toBeFalsy();
    expect(getComponent('wc-download').attributes.find((a) => a.name === 'href').required).toBeFalsy();
    expect(getComponent('wc-code-tab').attributes.map((a) => a.name)).toContain('for');
    for (const t of ['wc-accordion', 'wc-tab', 'wc-step', 'wc-update']) expect(getComponent(t).attributes.map((a) => a.name)).toContain('id');
  });
});

describe('importer: Mintlify appearance + heading font', () => {
  it('maps appearance / strict and the heading font; describes the theme readably', async () => {
    const t = buildThemeConfig({ vendor: 'mintlify', brand: { colors: { accent: '#e11d48' } }, fonts: { fontSans: '"Inter", sans-serif', fontHeading: '"Space Grotesk", sans-serif' }, appearance: 'dark', strict: true });
    expect(t).toMatchObject({ name: 'peppermint', appearance: 'dark', strict: true, fonts: { sans: expect.any(String), heading: expect.stringContaining('Space Grotesk') } });
    expect(describeTheme(t)).toBe('peppermint, brand colours from source, fonts Inter / Space Grotesk, dark mode (locked)');
    expect(describeTheme('folio')).toBe('folio');
    const tmp = await fsx.mkdtemp(path.join(os.tmpdir(), 'dl-imp-app-'));
    try {
      const src = path.join(tmp, 'src');
      await fsx.outputFile(path.join(src, 'docs.json'), JSON.stringify({ name: 'A', colors: { primary: '#e11d48' }, appearance: { default: 'light', strict: true }, fonts: { body: { family: 'Inter' }, heading: { family: 'Lora' } }, navigation: { pages: ['index'] } }));
      await fsx.outputFile(path.join(src, 'index.mdx'), '---\ntitle: Home\n---\n\nHi\n');
      const r = await runImport({ sourceDir: src, outDir: path.join(tmp, 'out'), fetchText: null });
      const cfg = await fsx.readJson(path.join(tmp, 'out', 'docslit.json'));
      expect(cfg.theme).toMatchObject({ appearance: 'light', strict: true, fonts: { heading: expect.stringContaining('Lora') } });
      expect(r.items.some((i) => i.code === 'config-unmapped' && /appearance|fonts\.heading/.test(i.message))).toBe(false);
      expect(await fsx.readFile(path.join(tmp, 'out', 'MIGRATION.md'), 'utf8')).toMatch(/- Theme: peppermint, brand colours from source, fonts .*Lora.*, light mode \(locked\)/);
    } finally { await fsx.remove(tmp); }
  }, 60000);
});

describe('validate: project custom components', () => {
  it('a component in components/ is known for live use and for fenced examples', async () => {
    const dir = await fsx.mkdtemp(path.join(os.tmpdir(), 'dl-cc-'));
    try {
      await fsx.outputFile(path.join(dir, 'components', 'wc-status.js'), "class S extends HTMLElement {}\ncustomElements.define('wc-status', S);\n");
      await fsx.outputJson(path.join(dir, 'docslit.json'), { name: 'X', sidebar: [{ group: 'G', pages: ['index'] }] });
      await fsx.outputFile(path.join(dir, 'docs', 'index.md'), '---\ntitle: T\n---\n\nLive: <wc-status type="up">Operational</wc-status>\n\n<wc-steps>\n<wc-step title="Use it">\n\n```markdown\nStatus: <wc-status type="up">OK</wc-status>\n```\n\n</wc-step>\n</wc-steps>\n');
      const r = await runValidation(dir);
      expect(r.issues.filter((i) => /Unknown component|wc-status/.test(i.message))).toEqual([]);
    } finally { await fsx.remove(dir); }
  });
});
