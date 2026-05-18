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

      if (!hasOnlyTextChildren(node.children)) {
        for (const child of node.children) {
          if (child.type === 'element' && child.tagName?.startsWith('wc-')) {
            continue;
          }
        }
        return;
      }

      const text = collectText(node.children);
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
