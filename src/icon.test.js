import { describe, it, expect } from 'vitest';
import { buildComponents } from './components/index.js';
import { getComponent } from './component-manifest.js';

// The wc-icon runtime ships as source text inside the components bundle; pull the
// name-normalising helper out of it and run it in isolation.
function loadResolveIcon() {
  const src = buildComponents();
  const brands = src.match(/const _FA_BRANDS = new Set\(\[[^\]]*\]\)/)[0];
  const start = src.indexOf('const _FA_STYLE');
  const end = src.indexOf('class WcIcon');
  expect(start).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(start);
  return new Function(`${brands}; const _ICONS = { zap: 1, check: 1 }; ${src.slice(start, end)}; return _resolveIcon;`)();
}

describe('wc-icon name resolution', () => {
  const resolve = loadResolveIcon();

  it('keeps built-in and bare Font Awesome names working', () => {
    expect(resolve('zap')).toMatchObject({ key: 'zap', style: '' });
    expect(resolve('github')).toMatchObject({ style: 'brands', slug: 'github' });
    expect(resolve('gear')).toMatchObject({ style: 'solid', slug: 'gear' });
  });

  it('normalises Font Awesome class strings (the form the manifest documents)', () => {
    expect(resolve('fa-brands fa-github')).toEqual({ key: 'brands/github', style: 'brands', slug: 'github' });
    expect(resolve('fa-solid fa-gear')).toEqual({ key: 'solid/gear', style: 'solid', slug: 'gear' });
    expect(resolve('fas fa-user fa-lg')).toMatchObject({ style: 'solid', slug: 'user' });
    expect(resolve('far fa-star')).toMatchObject({ style: 'regular', slug: 'star' });
    expect(resolve('fab fa-docker')).toMatchObject({ style: 'brands', slug: 'docker' });
    expect(resolve('fa-solid fa-circle-check fa-fw')).toMatchObject({ slug: 'circle-check' });
  });

  it('returns an empty result for nothing usable', () => {
    expect(resolve('').slug).toBe('');
    expect(resolve('fa-solid').slug).toBe('');
  });

  it('manifest documents what the component really accepts', () => {
    const name = getComponent('wc-icon').attributes.find((a) => a.name === 'name');
    expect(name.description).toMatch(/fa-brands fa-github/);
    expect(getComponent('wc-icon').description).toMatch(/network|CDN/i);
  });
});
