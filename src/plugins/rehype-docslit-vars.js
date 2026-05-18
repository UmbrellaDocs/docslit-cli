import { visit, SKIP } from 'unist-util-visit';

const VAR_RE = /\{\{([A-Z_][A-Z0-9_]*)\}\}/g;

const SKIP_TAGS = new Set([
  'wc-code-block',
  'wc-code-group',
  'wc-code-tab',
  'code',
  'pre',
]);

export default function rehypeDocslitVars() {
  return (tree) => {
    visit(tree, (node, index, parent) => {
      if (node.type === 'element' && SKIP_TAGS.has(node.tagName)) {
        return SKIP;
      }

      if (node.type !== 'text' || !parent) return;
      if (!VAR_RE.test(node.value)) return;

      const parts = [];
      let last = 0;
      const text = node.value;
      VAR_RE.lastIndex = 0;
      let m;
      while ((m = VAR_RE.exec(text)) !== null) {
        if (m.index > last) {
          parts.push({ type: 'text', value: text.slice(last, m.index) });
        }
        parts.push({
          type: 'raw',
          value: `<wc-var name="${m[1]}" readonly></wc-var>`,
        });
        last = m.index + m[0].length;
      }
      if (last < text.length) {
        parts.push({ type: 'text', value: text.slice(last) });
      }

      if (parts.length > 1 || (parts.length === 1 && parts[0].type !== 'text')) {
        parent.children.splice(index, 1, ...parts);
        return index + parts.length;
      }
    });
  };
}
