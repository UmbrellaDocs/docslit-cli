import { visit } from 'unist-util-visit';
import { highlight } from '../highlighter.js';

export default function rehypeDocslitCode() {
  return (tree) => {
    visit(tree, 'element', (node, index, parent) => {
      if (node.tagName !== 'pre' || !parent) return;

      const codeEl = node.children?.find(
        (c) => c.type === 'element' && c.tagName === 'code',
      );
      if (!codeEl) return;

      const text = getTextContent(codeEl);
      const className = (codeEl.properties?.className || []).find(
        (c) => typeof c === 'string' && c.startsWith('language-'),
      );
      let lang = className ? className.slice('language-'.length) : '';

      let filename = '';
      let linenumbers = false;

      const meta = codeEl.data?.meta || '';
      if (meta) {
        const fm = meta.match(/filename="([^"]+)"/);
        if (fm) filename = fm[1];
        if (/linenumbers="true"/.test(meta)) linenumbers = true;
      }

      const hasVars = /\{\{[A-Z_][A-Z0-9_]*\}\}/.test(text);
      const effectiveLang =
        (lang === 'markdown' || lang === 'md' || !lang) && /<wc-/.test(text)
          ? 'mdx'
          : lang;
      const highlighted = !hasVars ? highlight(text, effectiveLang) : null;

      const escaped = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      const attrs = [];
      if (lang) attrs.push(`language="${lang}"`);
      if (filename) attrs.push(`filename="${filename}"`);
      if (linenumbers) attrs.push('linenumbers="true"');
      if (highlighted) attrs.push('highlighted');

      const attrStr = attrs.length ? ' ' + attrs.join(' ') : '';
      const content = highlighted || escaped;

      parent.children[index] = {
        type: 'raw',
        value: `<wc-code-block${attrStr}>${content}</wc-code-block>`,
      };
    });
  };
}

function getTextContent(node) {
  if (node.type === 'text') return node.value;
  if (node.children) return node.children.map(getTextContent).join('');
  return '';
}
