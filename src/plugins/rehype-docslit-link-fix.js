/**
 * Rehype plugin that rewrites relative `<a>` hrefs to be site-root-relative.
 *
 * In a versioned docs site, Markdown links like `[foo](getting-started/quickstart)`
 * render as plain HTML `<a>` tags with the original Markdown path. Without rewriting,
 * browsers resolve them against the current page URL, producing double-segment paths:
 *   /0.1/getting-started/introduction + getting-started/quickstart
 *     → /0.1/getting-started/getting-started/quickstart  ❌
 *
 * Resolves each href against the current page directory (from `meta.pagePath`), then
 * prepends `/{versionSlug}/`. Also rewrites `<a href>` inside raw HTML nodes produced
 * by `rehypeDocslitWcContent` (e.g. `<wc-update>`, `<wc-field>`).
 */

const HREF_ATTR_RE = /(\shref=)(["'])([^"']+)\2/gi;

export function getPageDir(pagePath) {
  if (!pagePath) return '';
  let p = String(pagePath).split('@')[0].replace(/\\/g, '/');
  if (p.startsWith('docs/')) {
    p = p.slice(5);
  } else {
    const docsIdx = p.indexOf('/docs/');
    if (docsIdx >= 0) p = p.slice(docsIdx + 6);
  }
  if (p.endsWith('.md')) p = p.slice(0, -3);
  const slash = p.lastIndexOf('/');
  return slash >= 0 ? p.slice(0, slash + 1) : '';
}

export function isRelativePath(href) {
  if (!href || typeof href !== 'string') return false;
  if (href.startsWith('#')) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return false;
  if (href.startsWith('//')) return false;
  return true;
}

function splitHref(href) {
  let path = href;
  let query = '';
  let hash = '';
  const hashIdx = href.indexOf('#');
  if (hashIdx !== -1) {
    hash = href.slice(hashIdx);
    path = href.slice(0, hashIdx);
  }
  const queryIdx = path.indexOf('?');
  if (queryIdx !== -1) {
    query = path.slice(queryIdx);
    path = path.slice(0, queryIdx);
  }
  return { path, query, hash };
}

function normalizeSitePath(pathPart) {
  const segments = pathPart.split('/').filter(Boolean);
  const out = [];
  for (const seg of segments) {
    if (seg === '.') continue;
    if (seg === '..') {
      out.pop();
      continue;
    }
    out.push(seg);
  }
  return out.join('/');
}

export function resolveDocLink(href, pageDir = '') {
  const { path, query, hash } = splitHref(href);
  if (!path) return href;

  let combined;
  if (path.startsWith('/')) {
    combined = path.slice(1);
  } else if (path.startsWith('./') || path.startsWith('../') || path === '.' || path === '..') {
    combined = `${pageDir}${path}`;
  } else if (path.includes('/')) {
    // DocsLit page id from site root, e.g. getting-started/quickstart
    combined = path;
  } else {
    // Same-directory sibling, e.g. logo or installation
    combined = `${pageDir}${path}`;
  }
  return `${normalizeSitePath(combined)}${query}${hash}`;
}

function isAssetPath(pathPart) {
  const last = (pathPart.split('/').pop() || '').split('?')[0];
  return /\.[a-z0-9]{2,8}$/i.test(last);
}

export function rewriteHref(href, prefix, pageDir = '') {
  if (!isRelativePath(href)) return href;
  const { path } = splitHref(href);
  if (path.startsWith('/') && isAssetPath(path)) return href;
  return `${prefix}${resolveDocLink(href, pageDir)}`;
}

function shouldRewriteElementHref(node) {
  if (node.type !== 'element' || node.properties?.href == null) return false;
  if (node.tagName === 'a') return true;
  return Boolean(node.tagName?.startsWith('wc-'));
}

function rewriteHrefInHtml(html, prefix, pageDir) {
  return html.replace(HREF_ATTR_RE, (match, pre, quote, href) => {
    const rewritten = rewriteHref(href, prefix, pageDir);
    return rewritten === href ? match : `${pre}${quote}${rewritten}${quote}`;
  });
}

export default function rehypeDocslitLinkFix(meta = {}) {
  return function transformer(tree) {
    if (!meta?.versionSlug) return;

    const prefix = `/${String(meta.versionSlug)}/`;
    const pageDir = getPageDir(meta.pagePath);

    for (const node of tree.children) {
      rewriteNode(node, prefix, pageDir);
    }
  };
}

function rewriteNode(node, prefix, pageDir) {
  if (node.type === 'raw' && typeof node.value === 'string') {
    node.value = rewriteHrefInHtml(node.value, prefix, pageDir);
    return;
  }

  if (shouldRewriteElementHref(node)) {
    const href = node.properties.href;
    if (isRelativePath(href)) {
      node.properties.href = rewriteHref(href, prefix, pageDir);
    }
  }

  if (node.children && Array.isArray(node.children)) {
    for (const child of node.children) {
      rewriteNode(child, prefix, pageDir);
    }
  }
}
