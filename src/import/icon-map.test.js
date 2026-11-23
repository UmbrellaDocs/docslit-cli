import { describe, it, expect } from 'vitest';
import { resolveIcon } from '../icons.js';
import { convertPymdown } from './pymdown.js';
import { mkdocsFrontmatter } from './mkdocs.js';
import { MDI_TABLE, OCTICON_TABLE, BRAND_ALIASES, MDI_LANGUAGE, mapMdi, mapOcticon, mapSimple, mapFontAwesome, mapFrontmatterIcon } from './icon-map.js';

const conv = (src) => convertPymdown(src, {
  exts: new Set(), readSnippet: () => null, report: () => {}, count: () => {}, macros: { enabled: false },
}).body;

const target = (t) => { const m = /^(brands|regular|solid):(.+)$/.exec(t); return m ? `fa-${m[1]} fa-${m[2]}` : t; };

describe('icon-map: tables only point at bundled icons', () => {
  it.each([['MDI', MDI_TABLE], ['Octicons', OCTICON_TABLE]])('every %s target resolves', (_n, table) => {
    const bad = Object.entries(table).filter(([, t]) => resolveIcon(target(t)).kind !== 'svg');
    expect(bad).toEqual([]);
  });
  it('every brand alias and language target resolves in Font Awesome brands', () => {
    const bad = Object.entries(BRAND_ALIASES).filter(([, t]) => t && resolveIcon(`fa-brands fa-${t}`).kind !== 'svg');
    expect(bad).toEqual([]);
    expect(Object.values(MDI_LANGUAGE).filter((t) => resolveIcon(t).kind !== 'svg')).toEqual([]);
  });
});

describe('icon-map: conversions', () => {
  it('Material (MDI) names: table, suffix rules, size suffixes, brand prefixes', () => {
    expect(mapMdi('information-outline')).toEqual({ name: 'info', type: null });
    expect(mapMdi('alert')).toEqual({ name: 'triangle-alert', type: null });
    expect(mapMdi('close')).toEqual({ name: 'x', type: null });
    expect(mapMdi('check-all')).toEqual({ name: 'check-check', type: null });
    expect(mapMdi('file-document-outline')).toEqual({ name: 'file-text', type: null });
    expect(mapMdi('arrow-top-left')).toEqual({ name: 'arrow-up-left', type: null });
    expect(mapMdi('plus-circle-outline')).toEqual({ name: 'circle-plus', type: null });
    expect(mapMdi('arrow-right-bold-circle')).toEqual({ name: 'arrow-right', type: null });
    expect(mapMdi('lightbulb-on-20')).toEqual({ name: 'lightbulb', type: null });
    expect(mapMdi('language-python')).toEqual({ name: 'python', type: 'brands' });
    expect(mapMdi('microsoft-windows')).toEqual({ name: 'windows', type: 'brands' });
  });
  it('does not map to a misleading icon', () => {
    expect(mapMdi('flag-plus')).toBeNull();
    expect(mapMdi('account-question-outline')).toBeNull();
    expect(mapMdi('material-design')).toBeNull();
    expect(mapSimple('target')).toBeNull();
  });
  it('Octicons', () => {
    expect(mapOcticon('mark-github-16')).toEqual({ name: 'github', type: null });
    expect(mapOcticon('arrow-right-24')).toEqual({ name: 'arrow-right', type: null });
    expect(mapOcticon('three-bars-16')).toEqual({ name: 'menu', type: null });
    expect(mapOcticon('codescan-16')).toEqual({ name: 'scan-search', type: null });
    expect(mapOcticon('heart-fill-24')).toEqual({ name: 'heart', type: null });
  });
  it('Simple Icons use Font Awesome brands', () => {
    expect(mapSimple('stackoverflow')).toEqual({ name: 'stack-overflow', type: 'brands' });
    expect(mapSimple('github')).toEqual({ name: 'github', type: 'brands' });
    expect(mapSimple('nodedotjs')).toEqual({ name: 'node-js', type: 'brands' });
    expect(mapSimple('cloudflarepages')).toEqual({ name: 'cloudflare', type: 'brands' });
    expect(mapSimple('materialformkdocs')).toBeNull();
  });
  it('Font Awesome keeps the style', () => {
    expect(mapFontAwesome('brands', 'github')).toEqual({ name: 'github', type: 'brands' });
    expect(mapFontAwesome('regular', 'face-laugh-wink')).toEqual({ name: 'face-laugh-wink', type: 'regular' });
    expect(mapFontAwesome('solid', 'terminal')).toEqual({ name: 'terminal', type: null });
  });
  it('shortcodes in pages', () => {
    const out = conv(':material-check-all: :octicons-mark-github-16: :simple-stackoverflow: :fontawesome-brands-python: :material-flag-plus:');
    expect(out).toContain('<wc-icon name="check-check"></wc-icon>');
    expect(out).toContain('<wc-icon name="github"></wc-icon>');
    expect(out).toContain('<wc-icon name="stack-overflow" icon-type="brands"></wc-icon>');
    expect(out).toContain('<wc-icon name="python" icon-type="brands"></wc-icon>');
    expect(out).not.toContain(':material-');
  });
});

describe('icon-map: front matter icons', () => {
  it('maps the icon: value', () => {
    expect(mapFrontmatterIcon('material/information-outline')).toBe('info');
    expect(mapFrontmatterIcon('octicons/mark-github-16')).toBe('github');
    expect(mapFrontmatterIcon('fontawesome/brands/github')).toBe('github');
    expect(mapFrontmatterIcon('simple/stackoverflow')).toBe('stack-overflow');
    expect(mapFrontmatterIcon('material/not-a-real-icon-xyz')).toBeNull();
    expect(mkdocsFrontmatter({ icon: 'material/file-tree' }).icon).toBe('folder-tree');
    expect(mkdocsFrontmatter({ icon: 'material/not-a-real-icon-xyz' }).icon).toBeUndefined();
  });
});
