// Build-time LaTeX math: remark-math (parse) + KaTeX renderToString (render).
//
// Delimiters (default):  $$…$$ (inline or display), ```math fences, $$ blocks.
// Opt-in:                "math": { "singleDollar": true } enables $…$ inline.
// Opt-out:               "math": false
import { visit } from 'unist-util-visit';
import katex from 'katex';
import remarkMath from 'remark-math';
import fs from 'fs-extra';
import path from 'path';
import { createRequire } from 'module';

let mathConfig = { enabled: true, singleDollar: false };

/** Normalise the `math` key of docslit.json. */
export function resolveMathConfig(raw) {
  if (raw === false) return { enabled: false, singleDollar: false };
  if (raw && typeof raw === 'object') {
    return { enabled: raw.enabled !== false, singleDollar: raw.singleDollar === true };
  }
  return { enabled: true, singleDollar: false };
}

export function setMathConfig(raw) {
  mathConfig = resolveMathConfig(raw);
}

export function getMathConfig() {
  return mathConfig;
}

/** Cheap pre-check used to decide whether text may contain math. */
export function mayContainMath(text, cfg = mathConfig) {
  if (!cfg.enabled) return false;
  return cfg.singleDollar ? text.includes('$') : text.includes('$$');
}

/** [plugin, options] tuple for `unified().use(...)`; null when math is off. */
export function remarkMathPlugin(cfg = mathConfig) {
  if (!cfg.enabled) return null;
  return [remarkMath, { singleDollarTextMath: cfg.singleDollar }];
}

/**
 * A paragraph that is only `$$x$$` is display math (like Pandoc/GitHub);
 * `$$x$$` in the middle of a sentence stays inline. remark-math itself only
 * treats multi-line `$$` fences as display.
 */
export function remarkDocslitMathDisplay() {
  return (tree, file) => {
    const src = String(file.value || '');
    visit(tree, 'paragraph', (para) => {
      const kids = para.children.filter((c) => !(c.type === 'text' && !c.value.trim()));
      if (kids.length !== 1 || kids[0].type !== 'inlineMath') return;
      const node = kids[0];
      const start = node.position?.start?.offset;
      if (start == null || src.slice(start, start + 2) !== '$$') return;
      const classes = node.data?.hProperties?.className;
      if (Array.isArray(classes)) {
        node.data.hProperties.className = classes.map((c) => (c === 'math-inline' ? 'math-display' : c));
      }
    });
  };
}

function textOf(node) {
  if (node.type === 'text' || node.type === 'raw') return node.value;
  return (node.children || []).map(textOf).join('');
}

function renderKatex(tex, displayMode) {
  try {
    return katex.renderToString(tex, { displayMode, throwOnError: true, output: 'htmlAndMathml', strict: 'ignore' });
  } catch (err) {
    const msg = String(err?.message || err).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const body = tex.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<span class="katex-error" title="${msg}">${body}</span>`;
  }
}

/** Replaces `code.language-math` (inline, display, and ```math fences) with KaTeX HTML. */
export default function rehypeDocslitMath() {
  return (tree) => {
    if (!mathConfig.enabled) return;
    visit(tree, 'element', (node, index, parent) => {
      if (node.tagName !== 'code' || !parent || index == null) return;
      const classes = node.properties?.className || [];
      if (!classes.includes('language-math')) return;
      const inPre = parent.type === 'element' && parent.tagName === 'pre';
      const display = inPre || classes.includes('math-display');
      const html = renderKatex(textOf(node).replace(/\n$/, ''), display);
      node.type = 'raw';
      node.value = html;
      delete node.tagName;
      delete node.properties;
      delete node.children;
    });
    // Unwrap <pre><raw/></pre> produced above for ```math / $$ blocks.
    visit(tree, 'element', (node, index, parent) => {
      if (node.tagName !== 'pre' || !parent || index == null) return;
      if (node.children.length === 1 && node.children[0].type === 'raw' && /katex/.test(node.children[0].value)) {
        parent.children[index] = { type: 'raw', value: `<div class="docslit-math-block">${node.children[0].value}</div>` };
      }
    });
  };
}

// ── KaTeX CSS + fonts (shipped next to the site, only when a page uses math) ──

export function htmlUsesMath(html) {
  return typeof html === 'string' && html.includes('class="katex');
}

export function pagesUseMath(pagesData) {
  return Object.values(pagesData || {}).some((p) => htmlUsesMath(p?.html));
}

/**
 * Copy katex.min.css + woff2 fonts into <dir>/katex/. The CSS is rewritten to
 * reference woff2 only (all supported browsers), shrinking the footprint.
 */
export function katexDistDir() {
  return path.dirname(createRequire(import.meta.url).resolve('katex/dist/katex.min.css'));
}

export async function writeKatexAssets(dir) {
  const distDir = katexDistDir();
  const destDir = path.join(dir, 'katex');
  await fs.ensureDir(path.join(destDir, 'fonts'));
  let css = await fs.readFile(path.join(distDir, 'katex.min.css'), 'utf8');
  css = css.replace(/,url\([^)]*\.woff\) format\("woff"\)/g, '').replace(/,url\([^)]*\.ttf\) format\("truetype"\)/g, '');
  await fs.writeFile(path.join(destDir, 'katex.min.css'), css);
  const fonts = (await fs.readdir(path.join(distDir, 'fonts'))).filter((f) => f.endsWith('.woff2'));
  await Promise.all(fonts.map((f) => fs.copyFile(path.join(distDir, 'fonts', f), path.join(destDir, 'fonts', f))));
}
