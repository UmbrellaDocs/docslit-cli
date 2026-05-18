import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeRaw from 'rehype-raw';
import rehypeStringify from 'rehype-stringify';

import rehypeDocslitWcPreserve from './plugins/rehype-docslit-wc-preserve.js';
import rehypeDocslitWcContent from './plugins/rehype-docslit-wc-content.js';
import rehypeDocslitCode from './plugins/rehype-docslit-code.js';
import rehypeDocslitVars from './plugins/rehype-docslit-vars.js';

import { rewriteMdxTags } from './mdx-bridge.js';

let processor;

function getProcessor() {
  if (!processor) {
    processor = unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkRehype, { allowDangerousHtml: true })
      .use(rehypeRaw)
      .use(rehypeDocslitWcPreserve)
      .use(rehypeDocslitWcContent)
      .use(rehypeDocslitCode)
      .use(rehypeDocslitVars)
      .use(rehypeStringify, { allowDangerousHtml: true });
  }
  return processor;
}

function escapeHtml(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function renderMarkdown(src, passBlocks = []) {
  // Shield fenced code blocks from MDX tag rewriting (the original pipeline
  // extracted them as CODEBLOCK placeholders before rewriteMdxTags ran).
  const fences = [];
  let shielded = src.replace(/^(`{3,})[^\n]*\n[\s\S]*?^\1\s*$/gm, (m) => {
    fences.push(m);
    return `\x00FENCE${fences.length - 1}\x00`;
  });

  // Shield hand-written <wc-code-block>...</wc-code-block> so parse5 doesn't
  // normalize their content (e.g. self-closing tags like <wc-button />).
  const codeBlocks = [];
  shielded = shielded.replace(
    /<wc-code-block([^>]*)>([\s\S]*?)<\/wc-code-block>/g,
    (_, attrs, content) => {
      codeBlocks.push({ attrs, content });
      return `DOCSLIT_WCCODE_${codeBlocks.length - 1}_END`;
    },
  );

  shielded = rewriteMdxTags(shielded);

  // Restore fences before unified parsing (remark-parse handles them natively)
  shielded = shielded.replace(/\x00FENCE(\d+)\x00/g, (_, i) => fences[Number(i)]);

  const proc = getProcessor();
  const file = proc.processSync(shielded);
  let html = String(file);

  // Restore hand-written wc-code-block elements (strip <p> wrappers)
  html = html.replace(
    /(?:<p>)?DOCSLIT_WCCODE_(\d+)_END(?:<\/p>)?/g,
    (_, i) => {
      const { attrs, content } = codeBlocks[Number(i)];
      return `<wc-code-block${attrs}>${content}</wc-code-block>`;
    },
  );

  html = html.replace(/DOCSLIT_PASSBLOCK_(\d+)_END/g, (_, i) =>
    escapeHtml(passBlocks[Number(i)] || ''),
  );

  return html;
}
