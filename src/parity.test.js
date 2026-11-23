import { describe, it, expect } from 'vitest';
import { resolveIcon, suggestIcon, checkIcons, renderIconSvg } from './icons.js';
import { evaluateConditionals } from './conditional.js';
import { renderMarkdown } from './unified.js';
import { checkMarkup } from './markup-check.js';

describe('icons (build time)', () => {
  it('resolves Lucide, Font Awesome, aliases, emoji and URLs', () => {
    expect(resolveIcon('rocket').kind).toBe('svg');
    expect(resolveIcon('fa-brands fa-github').source).toMatch(/fa/);
    expect(resolveIcon('lucide:zap').source).toBe('lucide');
    expect(resolveIcon('cog').kind).toBe('svg');
    expect(resolveIcon('warning').kind).toBe('svg');
    expect(resolveIcon('💡').kind).toBe('emoji');
    expect(resolveIcon('/img/a.svg').kind).toBe('img');
    expect(renderIconSvg('rocket')).toMatch(/^<svg /);
  });
  it('suggests the nearest name for unknown icons', () => {
    expect(resolveIcon('rockett')).toMatchObject({ kind: 'unknown', suggestion: 'rocket' });
    expect(suggestIcon('zzzzzzzzzz')).toBeNull();
    expect(checkIcons('<wc-card icon="rockett">x</wc-card>')[0].suggestion).toBe('rocket');
    expect(checkMarkup('<wc-card title="t" icon="rockett">x</wc-card>').issues.some((i) => i.code === 'unknown-icon')).toBe(true);
  });
  it('inlines icons in rendered HTML with no CDN reference', async () => {
    const html = await renderMarkdown('<wc-card title="a" icon="rocket">x</wc-card>\n\n<wc-icon name="fa-brands fa-github"></wc-icon>');
    expect(html).toContain('slot="icon"');
    expect(html).toContain('<svg');
    expect(html).not.toMatch(/jsdelivr/);
  });
});

describe('wc-if conditional content', () => {
  const ctx = { version: '2.0', locale: 'en', attributes: { PLAN: 'pro', EMPTY: '' } };
  const run = (src, mode = 'html', c = ctx) => evaluateConditionals(src, c, mode).content;
  it('filters by version, attribute, locale and not', () => {
    expect(run('<wc-if version="2.0">A</wc-if>')).toContain('A');
    expect(run('<wc-if version="1.0">A</wc-if>')).not.toContain('A');
    expect(run('<wc-if attr="PLAN" equals="pro">A</wc-if>')).toContain('A');
    expect(run('<wc-if attr="PLAN" not-equals="pro">A</wc-if>')).not.toContain('A');
    expect(run('<wc-if attr="EMPTY">A</wc-if>')).not.toContain('A');
    expect(run('<wc-if locale="fr">A</wc-if>')).not.toContain('A');
    expect(run('<wc-if locale="fr" not>A</wc-if>')).toContain('A');
  });
  it('splits audience: humans vs agents', () => {
    const src = '<wc-if for="agents">AG</wc-if><wc-if for="humans">HU</wc-if>';
    expect(run(src, 'html')).toMatch(/HU/);
    expect(run(src, 'html')).not.toMatch(/AG/);
    expect(run(src, 'agent')).toMatch(/AG/);
    expect(run(src, 'agent')).not.toMatch(/HU/);
  });
  it('handles nesting and ignores code', () => {
    expect(run('<wc-if version="2.0">x<wc-if version="1.0">y</wc-if>z</wc-if>')).toMatch(/x\s*z/);
    expect(run('`<wc-if version="1.0">`')).toContain('<wc-if');
    expect(evaluateConditionals('<wc-if version="2.0">x', ctx).warnings.length).toBe(1);
  });
});

describe('component build-time structure', () => {
  it('turns step titles into light-DOM headings and tags', async () => {
    const html = await renderMarkdown('<wc-steps title-size="h3">\n<wc-step title="Install">\n\nRun it.\n\n</wc-step>\n</wc-steps>');
    expect(html).toContain('<h3 slot="title"');
  });
  it('marks images inside links as no-zoom and upgrades video iframes', async () => {
    const html = await renderMarkdown('[![a](/a.png)](https://x.test)\n\n<iframe src="https://www.youtube.com/embed/abcdefghijk"></iframe>');
    expect(html).toContain('no-zoom');
    expect(html).toContain('<wc-embed');
  });
});
