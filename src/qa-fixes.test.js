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
