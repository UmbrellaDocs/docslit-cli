import matter from 'gray-matter';
import { preprocessDoc, assertNoPreprocessErrors } from './preprocess.js';
import { renderMarkdown } from './unified.js';
import { ensureLangs } from './highlighter.js';

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
  const html = renderMarkdown(preprocess.content, preprocess.passBlocks || []);
  const preprocessedMarkdown = Object.keys(meta || {}).length
    ? matter.stringify(preprocess.content, meta)
    : preprocess.content;
  return { meta, html, preprocess, preprocessedMarkdown };
}
