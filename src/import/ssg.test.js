import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { commonRoot, convertSsgSyntax, detectSsg, localeKeys, objectAfter } from './ssg.js';
import { runImport } from '../import.js';

const dirs = [];
function tree(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'docslit-ssg-'));
  dirs.push(dir);
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text);
  }
  return dir;
}
afterEach(() => { while (dirs.length) fs.rmSync(dirs.pop(), { recursive: true, force: true }); });

describe('container directives', () => {
  it('converts Docusaurus, Starlight and VitePress forms', () => {
    const out = convertSsgSyntax([
      ':::tip[Pro tip]', 'A', ':::',
      ':::note Heads up', 'B', ':::',
      '::: warning', 'C', ':::',
      ':::caution', 'D', ':::',
      '::: details Show', 'E', ':::',
    ].join('\n'));
    expect(out).toContain('<wc-callout type="tip" title="Pro tip">');
    expect(out).toContain('<wc-callout type="note" title="Heads up">');
    expect(out).toContain('<wc-callout type="warning">');
    expect(out.match(/<wc-callout type="warning">/g)).toHaveLength(2);
    expect(out).toContain('<wc-accordion title="Show">');
    expect(out.match(/<\/wc-callout>/g)).toHaveLength(4);
    expect(out).not.toMatch(/^:::/m);
  });

  it('nests, and leaves ::: inside code fences alone', () => {
    const out = convertSsgSyntax(['::::note', ':::tip', 'x', ':::', '::::', '```md', ':::note', '```'].join('\n'));
    expect(out.match(/<\/wc-callout>/g)).toHaveLength(2);
    expect(out).toContain('```md\n:::note\n```');
  });

  it('turns a VitePress code-group into wc-code-group with fence titles', () => {
    const out = convertSsgSyntax(['::: code-group', '```sh [npm]', 'npm i', '```', '```sh [pnpm]', 'pnpm add', '```', ':::'].join('\n'), { format: 'vitepress' });
    expect(out).toContain('<wc-code-group>');
    expect(out).toContain('```sh title="npm"');
    expect(out).toContain('```sh title="pnpm"');
    expect(out).toContain('</wc-code-group>');
  });

  it('closes containers left open and reports it', () => {
    const issues = [];
    const out = convertSsgSyntax(':::note\nx', { report: (...a) => issues.push(a) });
    expect(out.trim().endsWith('</wc-callout>')).toBe(true);
    expect(issues[0][1]).toBe('container-unclosed');
  });
});

describe('VitePress Markdown', () => {
  it('removes Vue-only blocks and attributes, escapes braces outside code', () => {
    const out = convertSsgSyntax([
      '<script setup>', "import X from './X.vue'", '</script>',
      '[[toc]]',
      'Count is {{ count }} and `{{ code }}` stays.',
      '<Demo :items="list" @click="go" v-if="ok" title="t" />',
      'Line<br>break',
      '<style scoped>', '.a { color: red }', '</style>',
    ].join('\n'), { format: 'vitepress' });
    expect(out).not.toContain('<script');
    expect(out).not.toContain('<style');
    expect(out).not.toContain('[[toc]]');
    expect(out).toContain('Count is \\{\\{ count \\}\\} and `{{ code }}` stays.');
    expect(out).toContain('<Demo title="t" />');
    expect(out).toContain('<br />');
  });

  it('leaves braces alone for other formats', () => {
    expect(convertSsgSyntax('a {b}', { format: 'docusaurus' })).toBe('a {b}');
  });
});

describe('config reading', () => {
  it('reads a balanced object literal after a key', () => {
    expect(objectAfter('x = { docs: { path: "../docs", a: { b: 1 } }, blog: false }', 'docs')).toBe('{ path: "../docs", a: { b: 1 } }');
    expect(objectAfter('blog: false', 'blog')).toBe(false);
  });

  it('lists locale keys except root', () => {
    expect(localeKeys(`locales: { root: { label: 'English' }, de: { label: 'Deutsch' }, 'zh-cn': { label: '中文' } }`)).toEqual(['de', 'zh-cn']);
  });

  it('finds the deepest common folder', () => {
    expect(commonRoot(['/a/b/docs', '/a/b/website/blog'])).toBe('/a/b');
  });
});

describe('detection', () => {
  it('Docusaurus in website/ with docs outside it', async () => {
    const dir = tree({
      'website/docusaurus.config.js': `module.exports = { presets: [['classic', { docs: { path: '../docs' }, blog: { postsPerPage: 5 } }]] };`,
      'docs/intro.md': '# Intro',
      'website/blog/2024-01-31-hello.md': '# Hello',
      'website/versioned_docs/version-1/intro.md': '# Old',
    });
    const s = await detectSsg(dir);
    expect(s.format).toBe('docusaurus');
    expect(s.contentDirs.map((d) => path.relative(dir, d.dir))).toEqual(['docs', path.join('website', 'blog')]);
    expect(s.skipped).toContain(path.join('website', 'versioned_docs'));
  });

  it('VitePress srcDir and Starlight content folder with locales', async () => {
    const vp = tree({ '.vitepress/config.ts': `export default { srcDir: 'src' }`, 'src/index.md': '# Home' });
    expect((await detectSsg(vp)).contentDirs[0].dir).toBe(path.join(vp, 'src'));
    const sl = tree({
      'astro.config.mjs': `import starlight from '@astrojs/starlight'; export default { integrations: [starlight({ locales: { root: { label: 'English' }, fr: { label: 'Français' } } })] };`,
      'src/content/docs/index.md': '# Home',
      'src/content/docs/fr/index.md': '# Accueil',
    });
    const s = await detectSsg(sl);
    expect(s.format).toBe('starlight');
    expect(s.contentDirs[0].exclude).toEqual(['fr']);
  });
});

describe('import', () => {
  it('imports a Docusaurus site end to end', async () => {
    const dir = tree({
      'website/docusaurus.config.js': `module.exports = { presets: [['classic', { docs: { path: '../docs' } }]] };`,
      'docs/intro.md': "---\ntitle: Intro\n---\nimport Tabs from '@theme/Tabs';\nimport TabItem from '@theme/TabItem';\n\n:::tip[Try it]\nRead [the post](/blog/2024/01/31/hello).\n:::\n\n<Tabs>\n<TabItem value=\"npm\" label=\"npm\">\n\nnpm i\n\n</TabItem>\n</Tabs>\n",
      'docs/_partial.md': 'Shared text',
      'website/blog/2024-01-31-hello.md': '---\ntitle: Hello\n---\nPost.\n',
      'website/versioned_docs/version-1/intro.md': '# Old',
    });
    const out = path.join(dir, 'out');
    const res = await runImport({ sourceDir: path.join(dir, 'website'), outDir: out, validateOutput: false, fetchText: null });
    const intro = fs.readFileSync(path.join(out, 'docs/intro.md'), 'utf8');
    expect(res.source.format).toBe('docusaurus');
    expect(fs.existsSync(path.join(out, 'docs/blog/2024-01-31-hello.md'))).toBe(true);
    expect(fs.existsSync(path.join(out, 'docs/version-1'))).toBe(false);
    expect(fs.existsSync(path.join(out, 'docs/_partial.md'))).toBe(false);
    expect(intro).toContain('<wc-callout type="tip" title="Try it">');
    expect(intro).toContain('<wc-tab label="npm">');
    expect(intro).toContain('(/blog/2024-01-31-hello)');
    expect(intro).not.toContain('@theme/Tabs');
  });
});
