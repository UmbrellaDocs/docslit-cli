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

${callouts}

${layout}

${navigation}

${code}

${media}

${data}

${content}

${utility}

console.log('✅ DocsLit: 44 built-in web components registered');
`;
}
