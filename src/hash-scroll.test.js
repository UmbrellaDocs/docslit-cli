import { describe, it, expect } from 'vitest';
import { buildAppFile } from './template.js';

describe('anchor links (#fragment) on static pages', () => {
  it('keeps the fragment on load, scrolls to it, and handles same-page hash changes without a reload', async () => {
    const js = await buildAppFile('static', { minify: false });
    expect(js).toContain("history.replaceState({page: preRenderedId}, '', location.pathname + location.hash);");
    expect(js).toContain('function _scrollToHash()');
    expect(js).toContain("window.addEventListener('hashchange', _scrollToHash)");
    expect(js).toMatch(/id === window\.__DOCSLIT_CURRENT_PAGE__ && location\.hash\) \{ _scrollToHash\(\); return; \}/);
  });
});
