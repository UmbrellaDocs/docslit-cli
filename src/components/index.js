import callouts from './callouts.js';
import layout from './layout.js';
import navigation from './navigation.js';
import code from './code.js';
import media from './media.js';
import data from './data.js';
import content from './content.js';
import utility from './utility.js';

export function buildComponents() {
  return `import { LitElement, html, css, nothing } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';

function _inlineMd(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\`([^\`]+)\`/g, '<code>$1</code>')
    .replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>')
    .replace(/(?<![\\w*])\\*([^*]+)\\*(?![\\w*])/g, '<em>$1</em>')
    .replace(/(?<![\\w])_([^_]+)_(?![\\w])/g, '<em>$1</em>')
    .replace(/\\[([^\\]]+)\\]\\(([^)]+)\\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
}

${callouts}

${layout}

${navigation}

${code}

${media}

${data}

${content}

${utility}

console.log('✅ DocsLit: registered all built-in web components.');
`;
}
