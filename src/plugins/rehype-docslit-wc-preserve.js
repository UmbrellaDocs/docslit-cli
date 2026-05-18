import { visit } from 'unist-util-visit';
import { toHtml } from 'hast-util-to-html';

const CODE_TAGS = new Set(['wc-code-block', 'wc-code-group', 'wc-code-tab']);

export default function rehypeDocslitWcPreserve() {
  return (tree) => {
    visit(tree, 'element', (node) => {
      if (!CODE_TAGS.has(node.tagName)) return;
      if (!node.children || node.children.length === 0) return;

      node.children = node.children.map((child) => {
        if (child.type === 'text') {
          return { type: 'raw', value: child.value };
        }
        return child;
      });
    });
  };
}
