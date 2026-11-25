/**
 * rehype plugin: wrap Markdown/HTML tables in `<div class="table-wrap">` at build time.
 *
 * The client used to add this wrapper after load (`_wrapTables` in the app
 * runtime, which stays as a fallback for other content). Until then a bare table
 * keeps its `min-width: 480px`, which widens the page on phones, and wrapping it
 * later changes its border and margin: both show up as layout shifts.
 * Same rules as the runtime: skip tables already wrapped and AsciiDoc tables.
 */
import { visit, SKIP } from 'unist-util-visit';

function hasClass(node, name) {
  return [].concat(node?.properties?.className || []).map(String).includes(name);
}

export default function rehypeDocslitTableWrap() {
  return function transformer(tree) {
    visit(tree, 'element', (node, index, parent) => {
      // AsciiDoc tables manage their own wrapper: leave the whole subtree alone.
      if (node.tagName === 'wc-asciidoc-table') return SKIP;
      if (node.tagName !== 'table' || !parent || index == null) return;
      if (parent.type === 'element' && (hasClass(parent, 'table-wrap') || hasClass(parent, 'adoc-table-wrap'))) return;
      parent.children[index] = {
        type: 'element',
        tagName: 'div',
        properties: { className: ['table-wrap'] },
        children: [node],
      };
    });
  };
}
