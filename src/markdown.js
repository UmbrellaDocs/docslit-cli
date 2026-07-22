import matter from './frontmatter.js';
import { preprocessDoc, assertNoPreprocessErrors } from './preprocess.js';
import { renderMarkdown } from './unified.js';
import { ensureLangs } from './highlighter.js';

function getVersionSlug(meta, opts) {
  if (meta?.versionSlug) return String(meta.versionSlug);
  if (opts.versionSlug) return String(opts.versionSlug);
  const version = opts.globalAttributes?.DOCSLIT_VERSION;
  if (version && version !== 'unversioned') return String(version);
  return null;
}

export async function parseDoc(rawContent, opts = {}) {
  const { data: meta, content: body } = matter(rawContent);
  const preprocess = await preprocessDoc({
    rawBody: body,
    docsRoot: opts.docsRoot || '',
    pagePath: opts.pagePath || null,
    globalAttributes: opts.globalAttributes || {},
    pageAttributes: meta.attributes || {},
    readFile: opts.readFile,
    pathExists: opts.pathExists,
    strictFsSafety: opts.strictFsSafety !== false,
  });
  assertNoPreprocessErrors(preprocess);
  await ensureLangs(preprocess.content);
  const versionSlug = getVersionSlug(meta, opts);
  const renderMeta = {
    ...meta,
    ...(opts.pagePath ? { pagePath: opts.pagePath } : {}),
    ...(versionSlug ? { versionSlug } : {}),
  };
  const html = await renderMarkdown(preprocess.content, preprocess.passBlocks || [], renderMeta);
  const preprocessedMarkdown = Object.keys(meta || {}).length
    ? matter.stringify(preprocess.content, meta)
    : preprocess.content;
  return { meta, html, preprocess, preprocessedMarkdown };
}
