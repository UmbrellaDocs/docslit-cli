/**
 * Lightweight i18n: docs/ default + docs.fr/, docs.ja/ locale trees.
 */
import path from 'path';
import fs from 'fs-extra';

export function getI18nConfig(config) {
  const i18n = config.i18n;
  if (!i18n || typeof i18n !== 'object') {
    return { enabled: false, defaultLocale: 'en', locales: ['en'] };
  }
  const defaultLocale = i18n.defaultLocale || 'en';
  const locales = Array.isArray(i18n.locales) && i18n.locales.length
    ? i18n.locales
    : [defaultLocale];
  return {
    enabled: locales.length > 1,
    defaultLocale,
    locales,
    labels: i18n.labels || {},
  };
}

/** Locale content root: docs/ for default, docs.fr/ for fr, etc. */
export function localeDocsDir(cwd, locale, defaultLocale) {
  if (!locale || locale === defaultLocale) return path.join(cwd, 'docs');
  return path.join(cwd, `docs.${locale}`);
}

export function localeUrlPrefix(locale, defaultLocale, basePath = '') {
  const base = basePath || '';
  if (!locale || locale === defaultLocale) return base;
  return `${base}/${locale}`;
}

export function getSidebarForLocale(config, locale, defaultLocale) {
  if (!locale || locale === defaultLocale) return config.sidebar || [];
  if (config[`sidebar.${locale}`]) return config[`sidebar.${locale}`];
  if (config.sidebars && config.sidebars[locale]) return config.sidebars[locale];
  return config.sidebar || [];
}

export async function discoverLocales(cwd, i18n) {
  if (!i18n.enabled) return [i18n.defaultLocale];
  const found = new Set([i18n.defaultLocale]);
  for (const locale of i18n.locales) {
    if (locale === i18n.defaultLocale) continue;
    const dir = localeDocsDir(cwd, locale, i18n.defaultLocale);
    if (await fs.pathExists(dir)) found.add(locale);
  }
  return [...found];
}

export function buildLocaleSwitcherHtml({ i18n, currentLocale, basePath = '', pageId = '', offline = false }) {
  if (!i18n.enabled || i18n.locales.length < 2) return '';
  const options = i18n.locales.map((loc) => {
    const label = i18n.labels[loc] || loc.toUpperCase();
    const prefix = localeUrlPrefix(loc, i18n.defaultLocale, basePath);
    const href = `${prefix}/${pageId || ''}`.replace(/\/+/g, '/').replace(/\/$/, '') || (prefix || '/');
    const selected = loc === currentLocale ? ' selected' : '';
    return `<option value="${href}"${selected}>${label}</option>`;
  }).join('');
  const onchange = offline ? '' : ' onchange="if(this.value)location.href=this.value"';
  return `<select class="locale-switcher" aria-label="Language"${onchange}>${options}</select>`;
}

export function buildHreflangTags({ i18n, config, pageId, basePath = '' }) {
  if (!i18n.enabled) return '';
  const baseUrl = (config.url || '').replace(/\/$/, '');
  if (!baseUrl) return '';
  return i18n.locales.map((loc) => {
    const prefix = localeUrlPrefix(loc, i18n.defaultLocale, basePath);
    const href = `${baseUrl}${prefix}/${pageId}`;
    return `<link rel="alternate" hreflang="${loc}" href="${href}">`;
  }).join('\n  ') + `\n  <link rel="alternate" hreflang="x-default" href="${baseUrl}${localeUrlPrefix(i18n.defaultLocale, i18n.defaultLocale, basePath)}/${pageId}">`;
}
