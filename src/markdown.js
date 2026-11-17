import matter from './frontmatter.js';
import { preprocessDoc, assertNoPreprocessErrors } from './preprocess.js';
import { renderMarkdown } from './unified.js';
import { ensureLangs } from './highlighter.js';
import { findMathErrors } from './math.js';
import { cleanNotationForMarkdown } from './code-meta.js';

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
    projectRoot: opts.projectRoot || null,
  });
  assertNoPreprocessErrors(preprocess);
  if (typeof opts.onWarning === 'function') {
    // Invalid TeX otherwise builds silently (a katex-error span). Line is body-relative
    // plus the frontmatter height; includes above the math can shift it slightly.
    const fmLines = rawContent.split('\n').length - body.split('\n').length;
    for (const e of findMathErrors(preprocess.content)) {
      opts.onWarning({ code: 'math-invalid', file: opts.pagePath || null, line: e.line + fmLines, message: `Invalid math: ${e.message}` });
    }
  }
  await ensureLangs(preprocess.content);
  const versionSlug = getVersionSlug(meta, opts);
  const renderMeta = {
    ...meta,
    ...(opts.pagePath ? { pagePath: opts.pagePath } : {}),
    ...(versionSlug ? { versionSlug } : {}),
  };
  const html = await renderMarkdown(preprocess.content, preprocess.passBlocks || [], renderMeta);
  const mdSource = cleanNotationForMarkdown(preprocess.agentContent ?? preprocess.content);
  const preprocessedMarkdown = Object.keys(meta || {}).length
    ? matter.stringify(mdSource, meta)
    : mdSource;
  return { meta, html, preprocess, preprocessedMarkdown };
}
