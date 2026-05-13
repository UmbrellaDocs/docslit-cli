import { createHighlighter } from 'shiki';

let highlighter = null;

const COMMON_LANGS = [
  'javascript', 'typescript', 'jsx', 'tsx',
  'html', 'css', 'scss', 'json', 'jsonc',
  'bash', 'shell', 'sh', 'zsh', 'powershell',
  'python', 'ruby', 'go', 'rust', 'java', 'c', 'cpp', 'csharp',
  'php', 'swift', 'kotlin', 'scala',
  'sql', 'graphql',
  'yaml', 'toml', 'xml', 'markdown', 'mdx',
  'docker', 'diff', 'ini',
  'http',
];

export async function initHighlighter() {
  highlighter = await createHighlighter({
    themes: ['github-dark', 'github-light'],
    langs: COMMON_LANGS,
  });
}

export function highlight(code, lang) {
  if (!highlighter || !lang) return null;
  try {
    const html = highlighter.codeToHtml(code, {
      lang,
      themes: { dark: 'github-dark', light: 'github-light' },
      defaultColor: 'dark',
    });
    const match = html.match(/<code>([\s\S]*)<\/code>/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}
