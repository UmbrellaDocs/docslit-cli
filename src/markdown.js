import { marked } from 'marked';
import matter from 'gray-matter';

marked.setOptions({ gfm: true, breaks: false });

export function parseDoc(rawContent) {
  const { data: meta, content: body } = matter(rawContent);
  const html = renderMarkdown(body);
  return { meta, html };
}

function renderMarkdown(src) {
  // Protect <wc-*> blocks from marked mangling
  const wcBlocks = [];
  const codeBlocks = [];

  // 1. Extract fenced code blocks
  let safe = src.replace(/```[\s\S]*?```/g, (m) => {
    codeBlocks.push(m);
    return `CODEBLOCK_${codeBlocks.length - 1}_END`;
  });

  // 2. Extract wc-* blocks (self-closing or paired)
  safe = safe.replace(/<wc-[^>]+(?:\/>|>[\s\S]*?<\/wc-[^>]+>)/g, (m) => {
    wcBlocks.push(m);
    return `WCBLOCK_${wcBlocks.length - 1}_END`;
  });

  // 3. Restore code blocks, parse markdown
  safe = safe.replace(/CODEBLOCK_(\d+)_END/g, (_, i) => codeBlocks[i]);
  let html = marked.parse(safe);

  // 4. Restore wc-* blocks
  html = html.replace(/WCBLOCK_(\d+)_END/g, (_, i) => wcBlocks[i]);

  return html;
}
