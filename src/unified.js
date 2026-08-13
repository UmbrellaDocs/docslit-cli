import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeRaw from 'rehype-raw';
import rehypeSlug from 'rehype-slug';
import rehypeStringify from 'rehype-stringify';

import rehypeDocslitWcPreserve from './plugins/rehype-docslit-wc-preserve.js';
import rehypeDocslitAsciidocTable from './plugins/rehype-docslit-asciidoc-table.js';
import rehypeDocslitWcContent from './plugins/rehype-docslit-wc-content.js';
import rehypeDocslitCode from './plugins/rehype-docslit-code.js';
import rehypeDocslitVars from './plugins/rehype-docslit-vars.js';
import rehypeDocslitLinkFix from './plugins/rehype-docslit-link-fix.js';
import rehypeDocslitImages from './plugins/rehype-docslit-images.js';

import { rewriteMdxTags } from './mdx-bridge.js';
import { asciidocTableToHtml } from './asciidoc-table.js';

/**
 * Parse a raw HTML attribute string into a plain object.
 * e.g. ` cols="1,2" options="header"` → { cols: '1,2', options: 'header' }
 */
function parseHtmlAttrString(attrStr = '') {
  const out = {};
  const re = /([:@\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m;
  while ((m = re.exec(attrStr))) {
    const key = m[1];
    const val = m[2] ?? m[3] ?? m[4];
    out[key] = val === undefined ? '' : val;
  }
  return out;
}

/**
 * Build a fresh unified pipeline. Each call returns an independent processor
 * because unified freezes processors after they are used as part of `.use()`
 * chains — reusing the same instance across renders causes "Cannot call `data`
 * on a frozen processor" errors.
 */
function getProcessor(meta = {}) {
  const imageOpts = {};
  if (meta.docsDir) imageOpts.docsDir = meta.docsDir;
  if (meta.cwd) imageOpts.cwd = meta.cwd;

  return unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeSlug)
    .use(rehypeDocslitWcPreserve)
    .use(rehypeDocslitAsciidocTable)
    .use(rehypeDocslitWcContent)
    .use(rehypeDocslitCode)
    .use(rehypeDocslitVars)
    .use(rehypeDocslitImages, imageOpts)
    .use(rehypeDocslitLinkFix, meta)
    .use(rehypeStringify, { allowDangerousHtml: true });
}

function escapeHtml(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Render Markdown → HTML using the unified pipeline.
 *
 * @param {string} src - Raw Markdown string.
 * @param {Array<{tag: string, html: string}>} [passBlocks=[]] - Extra block-level
 *   content injected during preprocessing (e.g. TOC, component templates).
 * @param {object} [meta={}] - Optional metadata for plugins — `versionSlug` and
 *   `pagePath` are consumed by `rehypeDocslitLinkFix`.
 */
export async function renderMarkdown(src, passBlocks = [], meta = {}) {
  // Shield fenced code blocks from MDX tag rewriting (the original pipeline
  // extracted them as CODEBLOCK placeholders before rewriteMdxTags ran).
  const fences = [];
  let shielded = src.replace(/^(`{3,})[^\n]*\n[\s\S]*?^\1\s*$/gm, (m) => {
    fences.push(m);
    return `\x00FENCE${fences.length - 1}\x00`;
  });

  // Shield inline code that contains < or > so rehype-raw/parse5 does not
  // promote `` `<wc-foo>` `` to real elements inside HTML blocks (e.g. <wc-update>).
  // Use placeholders instead of HTML entities — entities would be escaped again
  // by rehype-stringify and display as literal &lt;…&gt;.
  const inlineCodes = [];
  shielded = shielded.replace(/`([^`\n]+)`/g, (m, inner) => {
    if (!/[<>]/.test(inner)) return m;
    inlineCodes.push(inner);
    return `DOCSLIT_INLINECODE_${inlineCodes.length - 1}_END`;
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

  // Shield AsciiDoc tables so blank lines / pipes aren't eaten by GFM tables
  // or HTML-block interruption rules before rehype can process them.
  const asciidocTables = [];
  shielded = shielded.replace(
    /<wc-asciidoc-table([^>]*)>([\s\S]*?)<\/wc-asciidoc-table>/gi,
    (_, attrs, content) => {
      asciidocTables.push({ attrs, content });
      return `DOCSLIT_ASCIIDOC_TABLE_${asciidocTables.length - 1}_END`;
    },
  );

  shielded = rewriteMdxTags(shielded);

  // Restore fences before unified parsing (remark-parse handles them natively)
  shielded = shielded.replace(/\x00FENCE(\d+)\x00/g, (_, i) => fences[Number(i)]);

  const proc = getProcessor(meta);
  const file = await proc.process(shielded);
  let html = String(file);

  // Restore shielded inline code as real <code> with a single HTML escape pass
  html = html.replace(
    /(?:<code>)?DOCSLIT_INLINECODE_(\d+)_END(?:<\/code>)?/g,
    (_, i) => `<code>${escapeHtml(inlineCodes[Number(i)])}</code>`,
  );
  // Placeholders that sat in text nodes (e.g. inside <wc-update> before
  // rehypeDocslitWcContent reparse) may appear without a wrapping <code>.
  html = html.replace(
    /DOCSLIT_INLINECODE_(\d+)_END/g,
    (_, i) => `<code>${escapeHtml(inlineCodes[Number(i)])}</code>`,
  );

  // Restore hand-written wc-code-block elements (strip <p> wrappers)
  html = html.replace(
    /(?:<p>)?DOCSLIT_WCCODE_(\d+)_END(?:<\/p>)?/g,
    (_, i) => {
      const { attrs, content } = codeBlocks[Number(i)];
      return `<wc-code-block${attrs}>${content}</wc-code-block>`;
    },
  );

  // Restore AsciiDoc tables and render them (shielded content bypasses rehype).
  html = html.replace(
    /(?:<p>)?DOCSLIT_ASCIIDOC_TABLE_(\d+)_END(?:<\/p>)?/g,
    (_, i) => {
      const { attrs, content } = asciidocTables[Number(i)];
      const tableHtml = asciidocTableToHtml(content, parseHtmlAttrString(attrs));
      return `<wc-asciidoc-table${attrs}>${tableHtml}</wc-asciidoc-table>`;
    },
  );

  html = html.replace(/DOCSLIT_PASSBLOCK_(\d+)_END/g, (_, i) =>
    escapeHtml(passBlocks[Number(i)] || ''),
  );

  return html;
}
