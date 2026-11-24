import callouts from './callouts.js';
import layout from './layout.js';
import navigation from './navigation.js';
import code from './code.js';
import media from './media.js';
import data from './data.js';
import content from './content.js';
import utility from './utility.js';
import shared from './shared.js';
import rich from './rich.js';

export function buildComponents() {
  return `import { LitElement, html, css, nothing } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';

// Link targets from attribute text (OpenAPI descriptions can be third-party): allow relative
// URLs, fragments, http(s) and mailto. Anything else (javascript:, data:, vbscript:...) is dropped.
// Browsers ignore ASCII whitespace/control chars inside a scheme, so strip them before checking.
function _safeHref(u) {
  const colon = u.indexOf(':');
  if (colon === -1) return u;
  const sep = u.search(/[\\/?#]/);
  if (sep !== -1 && sep < colon) return u;
  return /^(?:https?|mailto):/i.test(u.replace(/[\\s\\u0000-\\u001f]/g, '')) ? u : null;
}

function _inlineMd(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
    .replace(/\`([^\`]+)\`/g, '<code>$1</code>')
    .replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>')
    .replace(/(?<![\\w*])\\*([^*]+)\\*(?![\\w*])/g, '<em>$1</em>')
    .replace(/(?<![\\w])_([^_]+)_(?![\\w])/g, '<em>$1</em>')
    .replace(/\\[([^\\]]+)\\]\\(([^)]+)\\)/g, (m, label, url) => {
      const href = _safeHref(url);
      return href === null ? label : '<a href="' + href + '" target="_blank" rel="noopener">' + label + '</a>';
    });
}

${shared}

${callouts}

${layout}

${navigation}

${code}

${media}

${data}

${content}

${utility}

${rich}

console.log('✅ DocsLit: registered all built-in web components.');
`;
}
