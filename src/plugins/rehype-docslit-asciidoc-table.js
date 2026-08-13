import { visit } from 'unist-util-visit';
import { asciidocTableToHtml } from '../asciidoc-table.js';

function collectText(children) {
  let text = '';
  for (const child of children || []) {
    if (child.type === 'text' || child.type === 'raw') text += child.value;
    else if (child.type === 'element') {
      const inner = collectText(child.children);
      if (inner == null) return null;
      text += inner;
    } else return null;
  }
  return text;
}

function attrMap(node) {
  const out = {};
  for (const [key, value] of Object.entries(node.properties || {})) {
    if (value == null || value === false) continue;
    const k = key === 'className' ? 'class' : key;
    out[k] = Array.isArray(value) ? value.join(' ') : String(value);
  }
  return out;
}

/**
 * Convert <wc-asciidoc-table> AsciiDoc source children into a rendered HTML table
 * (light DOM), so SEO / static HTML / SPA shells all see real table markup.
 */
export default function rehypeDocslitAsciidocTable() {
  return (tree) => {
    visit(tree, 'element', (node) => {
      if (node.tagName !== 'wc-asciidoc-table') return;
      if (!node.children?.length) return;

      const source = collectText(node.children);
      if (source == null || !source.trim()) return;

      // Skip if already rendered (e.g. double pass)
      if (node.children.some((c) => c.type === 'element' && (c.tagName === 'table' || c.tagName === 'div'))) {
        return;
      }

      const html = asciidocTableToHtml(source, attrMap(node));
      node.children = [{ type: 'raw', value: html }];
    });
  };
}
