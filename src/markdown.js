import { marked } from 'marked';
import matter from 'gray-matter';
import { rewriteMdxTags } from './mdx-bridge.js';

marked.setOptions({ gfm: true, breaks: false });

const renderer = new marked.Renderer();
renderer.code = function ({ text, lang }) {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const langAttr = lang ? ` language="${lang}"` : '';
  return `<wc-code-block${langAttr}>${escaped}</wc-code-block>\n`;
};
marked.use({ renderer });

export function parseDoc(rawContent) {
  const { data: meta, content: body } = matter(rawContent);
  const html = renderMarkdown(body);
  return { meta, html };
}

// Detect block-level markdown — decides between marked.parse vs parseInline.
const BLOCK_RE = /CODEBLOCK_\d+_END|^#{1,6} |^[|]|^[-*+] |^```/m;

// ── Stack-based balanced-tag extractor ────────────────────────────────────
// Returns array of {match, index, end} for every top-level wc-* block in src.
// Handles recursive same-tag nesting (e.g. wc-dir inside wc-dir) correctly.
function extractOuterWcBlocks(src) {
  const results = [];
  // Match both open tags (<wc-foo ...>) and close tags (</wc-foo>)
  const TOKEN = /<(\/?)(wc-[a-z][a-z0-9-]*)(\s[^>]*?)?\s*(\/?)>/g;
  let m;
  let stack = []; // [{name, start}]

  while ((m = TOKEN.exec(src)) !== null) {
    const [full, slash, rawName, , selfClose] = m;
    const name = rawName.trim();

    if (selfClose === '/') {
      // Self-closing <wc-foo /> — only capture if stack is empty (top-level)
      if (stack.length === 0) {
        results.push({ match: full, index: m.index, end: m.index + full.length });
      }
      continue;
    }

    if (slash === '/') {
      // Closing tag
      const top = stack[stack.length - 1];
      if (top && top.name === name) {
        stack.pop();
        if (stack.length === 0) {
          const end = m.index + full.length;
          results.push({ match: src.slice(top.start, end), index: top.start, end });
        }
      }
    } else {
      // Opening tag
      if (stack.length === 0) {
        stack.push({ name, start: m.index });
      } else {
        stack.push({ name, start: m.index });
      }
    }
  }
  return results;
}

// ── Recursive markdown renderer for wc-* content ─────────────────────────
// Handles:
//   wc-code-* → returned verbatim (raw source display)
//   Container (has nested wc-* children) → recursively render children,
//       then also run marked.parse on surrounding text
//   Leaf (no nested wc-* children) → run marked.parse or parseInline on content
function processWcBlock(raw, codeBlocks) {
  // Leave code components untouched
  if (/^<wc-code/.test(raw)) return raw;

  // Self-closing — convert to open+close pair (HTML custom elements ignore />)
  if (/\/>$/.test(raw.trimEnd())) {
    const nameMatch = raw.match(/<(wc-[a-z][a-z0-9-]*)/);
    return nameMatch ? raw.trimEnd().replace(/\s*\/>$/, `></${nameMatch[1]}>`) : raw;
  }

  // Split into open-tag / content / close-tag
  const openEnd = raw.indexOf('>') + 1;
  const closeStart = raw.lastIndexOf('</');
  if (closeStart <= openEnd) return raw; // malformed, pass through
  const open = raw.slice(0, openEnd);
  const content = raw.slice(openEnd, closeStart);
  const close = raw.slice(closeStart);

  // Find direct wc-* children inside content
  const children = extractOuterWcBlocks(content);

  if (children.length === 0) {
    // ── LEAF ──────────────────────────────────────────────────────────────
    // Restore any CODEBLOCK placeholders, then render markdown
    const restored = content.replace(/CODEBLOCK_(\d+)_END/g, (_, j) => codeBlocks[j]);
    const rendered = BLOCK_RE.test(restored)
      ? marked.parse(restored)
      : marked.parseInline(restored);
    return open + rendered + close;
  }

  // ── CONTAINER ─────────────────────────────────────────────────────────
  // Process each wc-* child recursively, replace with placeholders,
  // run marked.parse on surrounding non-component text, then restore.
  const childResults = [];
  // Iterate in reverse so we can safely slice by index
  let processed = content;
  const sortedChildren = [...children].sort((a, b) => b.index - a.index);
  for (const child of sortedChildren) {
    const renderedChild = processWcBlock(child.match, codeBlocks);
    const placeholder = `\x00CHILD${childResults.length}\x00`;
    childResults.unshift({ placeholder, rendered: renderedChild });
    processed = processed.slice(0, child.index) + placeholder + processed.slice(child.end);
  }

  // Restore CODEBLOCK placeholders in the surrounding text segments
  processed = processed.replace(/CODEBLOCK_(\d+)_END/g, (_, j) => codeBlocks[j]);

  // Run marked.parse on the now-placeholder-interleaved text
  let renderedContent = BLOCK_RE.test(processed)
    ? marked.parse(processed)
    : marked.parseInline(processed);

  // Restore children
  for (const { placeholder, rendered } of childResults) {
    renderedContent = renderedContent.replace(placeholder, rendered);
  }

  return open + renderedContent + close;
}

function renderMarkdown(src) {
  const codeBlocks = [];

  // 1. Extract fenced code blocks so marked never mangles their content
  let safe = src.replace(/```[\s\S]*?```/g, (m) => {
    codeBlocks.push(m);
    return `CODEBLOCK_${codeBlocks.length - 1}_END`;
  });

  // 1a. Rewrite MDX-style PascalCase tags (e.g. <Tip>, <Card>) into wc-* tags
  // before the wc-* extractor runs. Convention fallback is on by default.
  safe = rewriteMdxTags(safe);

  // 2. Extract and pre-process all top-level wc-* blocks.
  //    We do this in reverse index order so replacements don't shift positions.
  const wcBlocks = [];
  const topLevel = extractOuterWcBlocks(safe);
  const sorted = [...topLevel].sort((a, b) => b.index - a.index);
  for (const block of sorted) {
    const preProcessed = processWcBlock(block.match, codeBlocks);
    const placeholder = `WCBLOCK_${wcBlocks.length}_END`;
    wcBlocks.unshift({ placeholder, rendered: preProcessed });
    safe = safe.slice(0, block.index) + placeholder + safe.slice(block.end);
  }

  // 3. Restore plain code blocks (outside wc-*), then parse the markdown body
  safe = safe.replace(/CODEBLOCK_(\d+)_END/g, (_, i) => codeBlocks[i]);
  let html = marked.parse(safe);

  // 4. Restore pre-processed wc-* blocks.
  //    marked wraps standalone placeholders in <p>…</p>; strip that wrapper
  //    so block-level elements inside wc-* (e.g. <pre>) don't trigger the
  //    HTML5 auto-close of the surrounding <p>, which splits the DOM apart.
  for (const { placeholder, rendered } of wcBlocks) {
    html = html.replace(`<p>${placeholder}</p>\n`, rendered + '\n');
    html = html.replace(`<p>${placeholder}</p>`, rendered);
    html = html.replace(placeholder, rendered); // fallback
  }

  html = html.replace(/<wc-code-block[\s\S]*?<\/wc-code-block>|(\{\{([A-Z_][A-Z0-9_]*)\}\})/g,
    (match, varMatch, name) => varMatch ? `<wc-var name="${name}" readonly></wc-var>` : match
  );

  return html;
}


