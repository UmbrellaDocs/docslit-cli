import { visit } from 'unist-util-visit';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeRaw from 'rehype-raw';
import rehypeStringify from 'rehype-stringify';

const CODE_TAGS = new Set([
  'wc-code-block',
  'wc-code-group',
  'wc-code-tab',
  'wc-asciidoc-table',
]);

const MD_SYNTAX_RE = /\*\*|__|\*[^*]|_[^_]|\[.*?\]\(|^#{1,6}\s|^[-*+]\s|^>\s|^```|^\|/m;

let miniProcessor;

function getMiniProcessor() {
  if (!miniProcessor) {
    miniProcessor = unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkRehype, { allowDangerousHtml: true })
      .use(rehypeRaw)
      .use(rehypeStringify);
  }
  return miniProcessor;
}

function collectText(children) {
  let text = '';
  for (const child of children) {
    if (child.type === 'text') text += child.value;
    else if (child.type === 'raw') text += child.value;
    else return null;
  }
  return text;
}

/** Rebuild markdown source when parse5 promoted `` `<wc-*>` `` into element nodes. */
function hasMeaningfulAttrs(properties = {}) {
  return Object.keys(properties).some((key) => {
    const val = properties[key];
    if (val === undefined || val === false || val === null) return false;
    if (key === 'className') return Array.isArray(val) ? val.length > 0 : !!val;
    return true;
  });
}

function reconstructProseSource(children) {
  let text = '';
  for (const child of children) {
    if (child.type === 'text' || child.type === 'raw') {
      text += child.value;
      continue;
    }
    if (child.type === 'element' && child.tagName?.startsWith('wc-')) {
      // Real nested components (attrs and/or element children) must stay in the tree.
      // Only bare `<wc-foo>` promotions from inline code should be flattened to prose.
      if (hasMeaningfulAttrs(child.properties)) return null;
      if (child.children?.some((c) => c.type === 'element')) return null;

      const inner = child.children?.length ? reconstructProseSource(child.children) : '';
      if (inner === null) return null;
      // Emit real HTML so rehypeRaw keeps a <code> node; entities display as <wc-*>.
      text += `<code>&lt;${child.tagName}&gt;</code>`;
      if (inner) text += inner;
      continue;
    }
    return null;
  }
  return text;
}

function hasOnlyTextChildren(children) {
  return children.every((c) => c.type === 'text' || c.type === 'raw');
}

function selfCloseIfEmpty(node) {
  if (
    node.type === 'element' &&
    node.tagName?.startsWith('wc-') &&
    node.children?.length === 0
  ) {
    return;
  }
}

export default function rehypeDocslitWcContent() {
  return (tree) => {
    visit(tree, 'element', (node) => {
      if (!node.tagName?.startsWith('wc-')) return;
      if (CODE_TAGS.has(node.tagName)) return;
      if (!node.children || node.children.length === 0) return;

      selfCloseIfEmpty(node);

      let text = null;
      if (hasOnlyTextChildren(node.children)) {
        text = collectText(node.children);
      } else {
        // Defense: accidental <wc-*> nodes from inline code inside HTML blocks
        text = reconstructProseSource(node.children);
      }
      if (text === null) return;
      if (!MD_SYNTAX_RE.test(text)) return;

      const proc = getMiniProcessor();
      const result = proc.processSync(text);
      const html = String(result);

      const trimmed = html.replace(/^\s*<p>/, '').replace(/<\/p>\s*$/, '');

      node.children = [{ type: 'raw', value: trimmed }];
    });
  };
}
