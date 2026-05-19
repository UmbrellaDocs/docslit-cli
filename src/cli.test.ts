import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import git from 'isomorphic-git';
import * as nodeFs from 'node:fs';
import { parseDoc } from './markdown.js';
import { rewriteMdxTags, pascalToWcKebab, COMPONENT_MAP } from './mdx-bridge.js';
import { getAllPageIds, getVersionConfig, getOpenAPIConfig, gitReadFile, getVersionSidebar, getChangedDocs } from './config.js';
import { renderShell, renderPage, buildStylesFile, buildAppFile, buildComponentsFile } from './template.js';
import { loadSpec, getEndpoints, getOperation, getWebhooks, getSecuritySchemes, getUndocumentedOps, resolveSpecRefs, schemaToFields, endpointToMarkdown, buildApiPageMarkdown } from './openapi.js';
import { buildComponents } from './components/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BIN = path.join(__dirname, '../bin/docslit.js');
const pkg = JSON.parse(readFileSync(path.join(__dirname, '../package.json'), 'utf8'));

/** Run the CLI with the given args and return { code, stdout, stderr }. */
function run(args: string[], timeoutMs = 5000, cwd?: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', [BIN, ...args], { cwd });
    let stdout = '';
    let stderr = '';
    proc.stdout?.on('data', (d) => (stdout += d.toString()));
    proc.stderr?.on('data', (d) => (stderr += d.toString()));
    const timer = setTimeout(() => { proc.kill(); reject(new Error(`CLI timeout for: ${args.join(' ')}`)); }, timeoutMs);
    proc.on('close', (code) => { clearTimeout(timer); resolve({ code: code ?? 0, stdout, stderr }); });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI binary
// ─────────────────────────────────────────────────────────────────────────────
describe('CLI — help & version', () => {
  it('exits 0 and prints usage with --help', async () => {
    const { code, stdout } = await run(['--help']);
    expect(code).toBe(0);
    expect(stdout).toContain('docslit');
    expect(stdout).toContain('init');
    expect(stdout).toContain('dev');
    expect(stdout).toContain('build');
    expect(stdout).toContain('validate');
  });

  it('exits 0 and prints usage with -h', async () => {
    const { code, stdout } = await run(['-h']);
    expect(code).toBe(0);
    expect(stdout).toContain('docslit');
  });

  it('exits 0 and prints usage when no command given', async () => {
    const { code, stdout } = await run([]);
    expect(code).toBe(0);
    expect(stdout).toContain('Usage');
  });

  it('prints the package.json version with --version', async () => {
    const { code, stdout } = await run(['--version']);
    expect(code).toBe(0);
    expect(stdout.trim()).toBe(pkg.version);
  });

  it('prints the package.json version with -v', async () => {
    const { code, stdout } = await run(['-v']);
    expect(code).toBe(0);
    expect(stdout.trim()).toBe(pkg.version);
  });

  it('exits 1 and prints error for unknown command', async () => {
    const { code, stderr } = await run(['foobar-unknown']);
    expect(code).toBe(1);
    expect(stderr).toContain('Unknown command');
  });
});

describe('CLI — import requires a source directory', () => {
  it('exits 1 when no source dir is given to import', async () => {
    const { code, stderr } = await run(['import']);
    expect(code).toBe(1);
    expect(stderr).toContain('source directory');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// markdown.js — parseDoc
// ─────────────────────────────────────────────────────────────────────────────
describe('parseDoc', () => {
  it('parses frontmatter into meta', async () => {
    const raw = `---\ntitle: Hello World\ndraft: true\n---\n# Hello\n`;
    const { meta, html } = await parseDoc(raw);
    expect(meta.title).toBe('Hello World');
    expect(meta.draft).toBe(true);
  });

  it('converts markdown headings to HTML', async () => {
    const { html } = await parseDoc('# Heading One\n\n## Heading Two\n');
    expect(html).toContain('<h1');
    expect(html).toContain('<h2');
  });

  it('converts markdown paragraphs to HTML', async () => {
    const { html } = await parseDoc('Some **bold** text and _italic_ text.\n');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>italic</em>');
  });

  it('preserves wc-* web component tags unchanged', async () => {
    const raw = '<wc-callout type="warning">Watch out</wc-callout>\n';
    const { html } = await parseDoc(raw);
    expect(html).toContain('<wc-callout type="warning">');
    expect(html).toContain('Watch out');
  });

  it('preserves self-closing wc-* tags', async () => {
    const raw = '<wc-badge label="v1.0" />\n';
    const { html } = await parseDoc(raw);
    expect(html).toContain('<wc-badge');
    expect(html).toContain('label="v1.0"');
  });

  it('does not mangle code inside fenced blocks', async () => {
    const raw = '```js\nconst x = <wc-button />\n```\n';
    const { html } = await parseDoc(raw);
    expect(html).toContain('const x =');
  });

  it('returns empty meta when no frontmatter present', async () => {
    const { meta } = await parseDoc('Just some text.\n');
    expect(meta).toEqual({});
  });

  it('converts self-closing wc-* tags to open+close pairs for HTML compatibility', async () => {
    const raw = '<wc-var name="X" default="hello" />\n';
    const { html } = await parseDoc(raw);
    expect(html).toContain('<wc-var name="X" default="hello"></wc-var>');
    expect(html).not.toContain('/>');
  });

  it('preserves content after self-closing wc-* tags', async () => {
    const raw = '<wc-var name="X" default="val" />\n\n<wc-callout>After var</wc-callout>\n';
    const { html } = await parseDoc(raw);
    expect(html).toContain('<wc-var');
    expect(html).toContain('<wc-callout>');
    expect(html).toContain('After var');
  });

  it('preserves special characters like && inside wc-code-block', async () => {
    const raw = '<wc-code-block>mkdir foo && cd foo</wc-code-block>\n';
    const { html } = await parseDoc(raw);
    expect(html).toContain('mkdir foo && cd foo');
    expect(html).not.toContain('&amp;');
  });

  it('preserves {{VAR}} placeholders inside wc-code-block', async () => {
    const raw = '<wc-code-block>curl {{API_URL}}/status</wc-code-block>\n';
    const { html } = await parseDoc(raw);
    expect(html).toContain('{{API_URL}}');
  });

  it('rewrites Mintlify-style <Tip> as <wc-callout type="tip">', async () => {
    const { html } = await parseDoc('<Tip>Use cache</Tip>\n');
    expect(html).toContain('<wc-callout');
    expect(html).toContain('type="tip"');
    expect(html).toContain('title="Tip"');
    expect(html).toContain('Use cache');
  });

  it('rewrites <Card icon="rocket"> with attribute renaming', async () => {
    const raw = '<Card title="Quickstart" icon="rocket" href="/start">Get going.</Card>\n';
    const { html } = await parseDoc(raw);
    expect(html).toContain('<wc-card');
    expect(html).toContain('title="Quickstart"');
    expect(html).toContain('icon-name="zap"'); // rocket → zap via FA_TO_LUCIDE
    expect(html).toContain('href="/start"');
  });

  it('rewrites self-closing <Card /> to a paired wc-card', async () => {
    const { html } = await parseDoc('<Card title="Solo" />\n');
    expect(html).toContain('<wc-card');
    expect(html).toContain('title="Solo"');
    expect(html).toContain('</wc-card>');
    expect(html).not.toContain('/>');
  });

  it('applies convention fallback for unmapped PascalCase tags', async () => {
    const { html } = await parseDoc('<CustomThing prop="x">Body</CustomThing>\n');
    expect(html).toContain('<wc-custom-thing');
    expect(html).toContain('prop="x"');
    expect(html).toContain('</wc-custom-thing>');
  });

  it('does not rewrite PascalCase tags inside fenced code blocks', async () => {
    const raw = '```jsx\n<Callout>literal source</Callout>\n```\n';
    const { html } = await parseDoc(raw);
    expect(html).toContain('&lt;Callout&gt;');
    expect(html).not.toContain('<wc-callout');
  });

  it('does not rewrite PascalCase tags inside inline backticks', async () => {
    const { html } = await parseDoc('Use `<Callout>` for warnings.\n');
    expect(html).toContain('<code>');
    expect(html).toMatch(/Callout/);
    expect(html).not.toContain('<wc-callout');
  });

  it('auto-numbers <Step> inside <Steps>', async () => {
    const raw = '<Steps>\n<Step title="A">First</Step>\n<Step title="B">Second</Step>\n</Steps>\n';
    const { html } = await parseDoc(raw);
    expect(html).toContain('n="1"');
    expect(html).toContain('n="2"');
  });

  it('drops <Tooltip> wrapper but keeps inner content (flatten)', async () => {
    const { html } = await parseDoc('Hover <Tooltip tip="hi">here</Tooltip> for info.\n');
    expect(html).not.toContain('Tooltip');
    expect(html).not.toContain('wc-tooltip');
    expect(html).toContain('Hover');
    expect(html).toContain('here');
  });

  it('processes markdown inside wc-* elements (single-line, no blank lines)', async () => {
    const { html } = await parseDoc('<wc-callout>**bold** and [link](http://x.com)</wc-callout>\n');
    expect(html).toContain('<wc-callout');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<a href="http://x.com">link</a>');
    expect(html).toContain('</wc-callout>');
  });

  it('renders GFM tables correctly', async () => {
    const { html } = await parseDoc('| Name | Value |\n|------|-------|\n| foo  | bar   |\n');
    expect(html).toContain('<table>');
    expect(html).toContain('<th>Name</th>');
    expect(html).toContain('<td>foo</td>');
    expect(html).toContain('<td>bar</td>');
  });

  it('handles recursive same-tag nesting (wc-dir inside wc-dir)', async () => {
    const raw = '<wc-dir name="src">\n\n<wc-dir name="lib">\n\ninner\n\n</wc-dir>\n\n</wc-dir>\n';
    const { html } = await parseDoc(raw);
    expect(html).toContain('<wc-dir name="src">');
    expect(html).toContain('<wc-dir name="lib">');
    expect(html).toContain('inner');
    expect(html).toContain('</wc-dir>');
    const outerIdx = html.indexOf('<wc-dir name="src">');
    const innerIdx = html.indexOf('<wc-dir name="lib">');
    expect(innerIdx).toBeGreaterThan(outerIdx);
  });

  it('preserves wc-code-group / wc-code-tab structure with fenced code inside', async () => {
    const raw = '<wc-code-group>\n<wc-code-tab label="JS">\n\n```js\nconsole.log(1)\n```\n\n</wc-code-tab>\n</wc-code-group>\n';
    const { html } = await parseDoc(raw);
    expect(html).toContain('<wc-code-group>');
    expect(html).toContain('<wc-code-tab label="JS">');
    expect(html).toContain('<wc-code-block');
    expect(html).toContain('language="js"');
    expect(html).toContain('console.log(1)');
    expect(html).toContain('</wc-code-group>');
  });
});

describe('parseDoc preprocess MVP', () => {
  const tmpDocs = path.join(__dirname, '../.test-preprocess-docs');

  beforeAll(() => {
    if (existsSync(tmpDocs)) rmSync(tmpDocs, { recursive: true });
    mkdirSync(path.join(tmpDocs, '_reusables', 'shared'), { recursive: true });
    writeFileSync(path.join(tmpDocs, '_reusables', 'shared', 'intro.md'), 'Reusable line with {{PRODUCT}}.\n');
    writeFileSync(path.join(tmpDocs, '_reusables', 'has-include.md'), '<wc-include src="shared/intro.md" />\n');
    writeFileSync(
      path.join(tmpDocs, '_reusables', 'include-example-only.md'),
      '```markdown\n<wc-include src="shared/intro.md" />\n```\n'
    );
  });

  afterAll(() => {
    if (existsSync(tmpDocs)) rmSync(tmpDocs, { recursive: true });
  });

  it('resolves wc-include from docs/_reusables and substitutes variables', async () => {
    const raw = `---
title: Test
attributes:
  PRODUCT: PageProduct
---
<wc-include src="shared/intro.md" />
`;
    const { html, preprocessedMarkdown } = await parseDoc(raw, {
      docsRoot: tmpDocs,
      pagePath: path.join(tmpDocs, 'page.md'),
      globalAttributes: { PRODUCT: 'GlobalProduct' },
    });
    expect(html).toContain('Reusable line with PageProduct.');
    expect(preprocessedMarkdown).toContain('<!-- BEGIN: Content from file docs/_reusables/shared/intro.md -->');
    expect(preprocessedMarkdown).toContain('<!-- END: Content from file docs/_reusables/shared/intro.md -->');
  });

  it('allows page-local wc-var declarations to override page and global attributes', async () => {
    const raw = `---
title: Vars
attributes:
  PRODUCT: PageProduct
---
<wc-var name="PRODUCT" value="LocalProduct" />
Value: {{PRODUCT}}
`;
    const { html } = await parseDoc(raw, {
      docsRoot: tmpDocs,
      pagePath: path.join(tmpDocs, 'vars.md'),
      globalAttributes: { PRODUCT: 'GlobalProduct' },
    });
    expect(html).toContain('Value: LocalProduct');
  });

  it('does not replace placeholders inside fenced code blocks', async () => {
    const raw = `---
title: Code
---
\`\`\`bash
echo {{PRODUCT}}
\`\`\`
`;
    const { html } = await parseDoc(raw, {
      docsRoot: tmpDocs,
      pagePath: path.join(tmpDocs, 'code.md'),
      globalAttributes: { PRODUCT: 'GlobalProduct' },
    });
    expect(html).toContain('echo {{PRODUCT}}');
  });

  it('throws for include paths outside docs/_reusables', async () => {
    const raw = '<wc-include src="../outside.md" />\n';
    await expect(parseDoc(raw, {
      docsRoot: tmpDocs,
      pagePath: path.join(tmpDocs, 'bad.md'),
      globalAttributes: {},
    })).rejects.toThrow('outside docs/_reusables');
  });

  it('throws when reusable files contain nested includes', async () => {
    const raw = '<wc-include src="has-include.md" />\n';
    await expect(parseDoc(raw, {
      docsRoot: tmpDocs,
      pagePath: path.join(tmpDocs, 'nested.md'),
      globalAttributes: {},
    })).rejects.toThrow('Nested include is not allowed');
  });

  it('allows reusable files that only mention wc-include inside fenced code', async () => {
    const raw = '<wc-include src="include-example-only.md" />\n';
    const { html } = await parseDoc(raw, {
      docsRoot: tmpDocs,
      pagePath: path.join(tmpDocs, 'code-only.md'),
      globalAttributes: {},
    });
    expect(html).toContain('<wc-code-block language="markdown">');
    expect(html).toContain('src="shared/intro.md"');
  });

  it('throws for invalid wc-var declaration names', async () => {
    const raw = '<wc-var name="bad-name" value="x" />\n';
    await expect(parseDoc(raw, {
      docsRoot: tmpDocs,
      pagePath: path.join(tmpDocs, 'bad-var.md'),
      globalAttributes: {},
    })).rejects.toThrow('Invalid variable name');
  });

  it('ignores wc-include text inside inline code', async () => {
    const raw = 'Use `<wc-include />` as an example in docs.\n';
    const { html } = await parseDoc(raw, {
      docsRoot: tmpDocs,
      pagePath: path.join(tmpDocs, 'inline-example.md'),
      globalAttributes: {},
    });
    expect(html).toContain('<code>');
    expect(html).toMatch(/wc-include/);
    expect(html).not.toContain('<wc-include></wc-include>');
  });

  it('does not process includes inside fenced code blocks', async () => {
    const raw = '```markdown\n<wc-include src="shared/intro.md" />\n```\n';
    const { html } = await parseDoc(raw, {
      docsRoot: tmpDocs,
      pagePath: path.join(tmpDocs, 'fence-example.md'),
      globalAttributes: {},
    });
    expect(html).toContain('<wc-code-block language="markdown">');
    expect(html).toContain('src="shared/intro.md"');
    expect(html).not.toContain('Reusable line with');
  });

  it('supports pass:[...] to render literal variable placeholders', async () => {
    const { html } = await parseDoc('Literal pass:[{{TOKEN}}] in prose.\n', {
      docsRoot: tmpDocs,
      pagePath: path.join(tmpDocs, 'pass-var.md'),
      globalAttributes: { TOKEN: 'secret' },
    });
    expect(html).toContain('Literal {{TOKEN}} in prose.');
    expect(html).not.toContain('<wc-var name="TOKEN" readonly>');
  });

  it('supports pass:[...] to render literal wc tags', async () => {
    const { html } = await parseDoc('Literal pass:[<wc-include src="shared/intro.md" />] example.\n', {
      docsRoot: tmpDocs,
      pagePath: path.join(tmpDocs, 'pass-include.md'),
      globalAttributes: {},
    });
    expect(html).toContain('&lt;wc-include src="shared/intro.md" /&gt;');
    expect(html).not.toContain('Reusable line with');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// mdx-bridge — pascalToWcKebab + rewriteMdxTags
// ─────────────────────────────────────────────────────────────────────────────
describe('pascalToWcKebab', () => {
  it('handles simple PascalCase', () => {
    expect(pascalToWcKebab('CardGroup')).toBe('wc-card-group');
  });

  it('handles consecutive uppercase letters (acronyms)', () => {
    expect(pascalToWcKebab('APIDocsCard')).toBe('wc-api-docs-card');
    expect(pascalToWcKebab('MyAPIBlock')).toBe('wc-my-api-block');
  });

  it('handles single-word names', () => {
    expect(pascalToWcKebab('Tip')).toBe('wc-tip');
  });
});

describe('rewriteMdxTags', () => {
  it('returns input untouched when there are no PascalCase tags', () => {
    expect(rewriteMdxTags('plain text and <wc-card></wc-card>')).toBe('plain text and <wc-card></wc-card>');
  });

  it('leaves unmapped PascalCase alone when conventionFallback is false', () => {
    const out = rewriteMdxTags('<CustomThing>x</CustomThing>', { conventionFallback: false });
    expect(out).toContain('<CustomThing>');
    expect(out).not.toContain('wc-custom-thing');
  });

  it('still rewrites mapped components when conventionFallback is false', () => {
    const out = rewriteMdxTags('<Tip>hi</Tip>', { conventionFallback: false });
    expect(out).toContain('<wc-callout');
    expect(out).toContain('type="tip"');
  });

  it('exports the COMPONENT_MAP with expected aliases', () => {
    expect(COMPONENT_MAP.Tip.tag).toBe('wc-callout');
    expect(COMPONENT_MAP.CardGroup.tag).toBe('wc-tiles');
    expect(COMPONENT_MAP.Tooltip.flatten).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// config.js — getAllPageIds
// ─────────────────────────────────────────────────────────────────────────────
describe('getAllPageIds', () => {
  it('returns all page slugs from sidebar groups', () => {
    const config = {
      name: 'Test',
      sidebar: [
        { group: 'Getting Started', pages: ['introduction', 'quickstart'] },
        { group: 'Reference', pages: ['api-reference'] },
      ],
    };
    expect(getAllPageIds(config)).toEqual(['introduction', 'quickstart', 'api-reference']);
  });

  it('returns an empty array when sidebar is empty', () => {
    expect(getAllPageIds({ sidebar: [] })).toEqual([]);
  });

  it('returns an empty array when config has no sidebar key', () => {
    expect(getAllPageIds({})).toEqual([]);
  });

  it('handles groups with empty page arrays', () => {
    const config = { sidebar: [{ group: 'Empty', pages: [] }] };
    expect(getAllPageIds(config)).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// components/index.js — buildComponents
// ─────────────────────────────────────────────────────────────────────────────
describe('buildComponents', () => {
  const output = buildComponents();

  it('returns a non-empty string', () => {
    expect(typeof output).toBe('string');
    expect(output.length).toBeGreaterThan(100);
  });

  it('includes the Lit import', () => {
    expect(output).toContain("from 'lit'");
  });

  it('wc-code-block captures innerHTML on connectedCallback so child tags render as source text', () => {
    // The component must capture innerHTML before shadow DOM renders, not use a slot.
    expect(output).toContain('connectedCallback');
    expect(output).toContain('this.innerHTML');
    // Lit text bindings use textContent, so raw < > display correctly — no manual escaping needed.
    expect(output).not.toContain("_escape(this._code)");
  });

  const expectedComponents = [
    // Text & Callouts
    'wc-callout', 'wc-alert', 'wc-banner', 'wc-badge', 'wc-tooltip', 'wc-update',
    // Layout
    'wc-columns', 'wc-frame', 'wc-panel', 'wc-expandable', 'wc-accordion', 'wc-accordion-group', 'wc-aside',
    // Navigation
    'wc-steps', 'wc-step', 'wc-tabs', 'wc-tab', 'wc-view', 'wc-view-panel',
    // Code
    'wc-var', 'wc-code-block', 'wc-code-group', 'wc-code-tab',
    // Media & Files
    'wc-icon', 'wc-file', 'wc-dir', 'wc-files', 'wc-tree', 'wc-tree-item', 'wc-download', 'wc-copy',
    // Data & API
    'wc-field', 'wc-fields', 'wc-response-fields', 'wc-color', 'wc-table',
    'wc-schema', 'wc-mermaid', 'wc-endpoint', 'wc-runnable-endpoint',
    // Content
    'wc-card', 'wc-tile', 'wc-tiles', 'wc-button', 'wc-prompt',
    // Utility
    'wc-anchor', 'wc-indent', 'wc-visibility', 'wc-version', 'wc-versions', 'wc-page-meta',
  ];

  for (const tag of expectedComponents) {
    it(`registers ${tag}`, () => {
      expect(output).toContain(`customElements.define('${tag}'`);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// config.js — getVersionConfig
// ─────────────────────────────────────────────────────────────────────────────
describe('getVersionConfig', () => {
  it('returns null when no versions field', () => {
    expect(getVersionConfig({ name: 'Test', sidebar: [] })).toBeNull();
  });

  it('returns null when versions.list is empty', () => {
    expect(getVersionConfig({ versions: { default: 'v1', list: [] } })).toBeNull();
  });

  it('returns null when versions field exists but has no list', () => {
    expect(getVersionConfig({ versions: { default: 'v1' } })).toBeNull();
  });

  it('returns the versions object when properly configured', () => {
    const config = {
      versions: {
        default: 'v2',
        list: [
          { version: 'v1', branch: 'docs-v1' },
          { version: 'v2', branch: 'main', tag: 'Latest' },
        ],
      },
    };
    const result = getVersionConfig(config);
    expect(result).not.toBeNull();
    expect(result!.default).toBe('v2');
    expect(result!.list).toHaveLength(2);
    expect(result!.list[1].tag).toBe('Latest');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// config.js — git helpers (isomorphic-git)
// ─────────────────────────────────────────────────────────────────────────────
describe('git helpers (isomorphic-git)', () => {
  const tmpDir = path.join(__dirname, '../.test-git-repo');
  const author = { name: 'Test', email: 'test@test.com' };

  beforeAll(async () => {
    // Create a temporary git repo with two branches
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true });
    mkdirSync(tmpDir, { recursive: true });

    await git.init({ fs: nodeFs, dir: tmpDir, defaultBranch: 'main' });

    // Create docs directory and files on main
    mkdirSync(path.join(tmpDir, 'docs'), { recursive: true });
    writeFileSync(path.join(tmpDir, 'docs', 'intro.md'), '---\ntitle: Intro\n---\n# Intro\n');
    writeFileSync(path.join(tmpDir, 'docs', 'setup.md'), '---\ntitle: Setup v2\n---\n# Setup v2\n');
    writeFileSync(path.join(tmpDir, 'docslit.json'), JSON.stringify({
      name: 'Test Docs',
      sidebar: [{ group: 'Guide', pages: ['intro', 'setup'] }],
    }));

    await git.add({ fs: nodeFs, dir: tmpDir, filepath: 'docs/intro.md' });
    await git.add({ fs: nodeFs, dir: tmpDir, filepath: 'docs/setup.md' });
    await git.add({ fs: nodeFs, dir: tmpDir, filepath: 'docslit.json' });
    await git.commit({ fs: nodeFs, dir: tmpDir, author, message: 'initial' });

    // Create docs-v1 branch with a different setup.md
    await git.branch({ fs: nodeFs, dir: tmpDir, ref: 'docs-v1' });
    await git.checkout({ fs: nodeFs, dir: tmpDir, ref: 'docs-v1' });

    writeFileSync(path.join(tmpDir, 'docs', 'setup.md'), '---\ntitle: Setup v1\n---\n# Setup v1\n');
    writeFileSync(path.join(tmpDir, 'docslit.json'), JSON.stringify({
      name: 'Test Docs v1',
      sidebar: [{ group: 'Guide', pages: ['intro', 'setup'] }],
    }));

    await git.add({ fs: nodeFs, dir: tmpDir, filepath: 'docs/setup.md' });
    await git.add({ fs: nodeFs, dir: tmpDir, filepath: 'docslit.json' });
    await git.commit({ fs: nodeFs, dir: tmpDir, author, message: 'v1 changes' });

    // Go back to main
    await git.checkout({ fs: nodeFs, dir: tmpDir, ref: 'main' });
  });

  afterAll(() => {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true });
  });

  it('gitReadFile reads a file from the current branch', async () => {
    const content = await gitReadFile('main', 'docs/intro.md', tmpDir);
    expect(content).toContain('# Intro');
  });

  it('gitReadFile reads a file from another branch', async () => {
    const content = await gitReadFile('docs-v1', 'docs/setup.md', tmpDir);
    expect(content).toContain('Setup v1');
  });

  it('gitReadFile returns null for non-existent file', async () => {
    const content = await gitReadFile('main', 'docs/nonexistent.md', tmpDir);
    expect(content).toBeNull();
  });

  it('gitReadFile returns null for non-existent branch', async () => {
    const content = await gitReadFile('no-such-branch', 'docs/intro.md', tmpDir);
    expect(content).toBeNull();
  });

  it('getVersionSidebar reads sidebar from another branch', async () => {
    const sidebar = await getVersionSidebar('docs-v1', tmpDir);
    expect(sidebar).toHaveLength(1);
    expect(sidebar[0].group).toBe('Guide');
    expect(sidebar[0].pages).toEqual(['intro', 'setup']);
  });

  it('getVersionSidebar returns empty array for non-existent branch', async () => {
    const sidebar = await getVersionSidebar('no-such-branch', tmpDir);
    expect(sidebar).toEqual([]);
  });

  it('getChangedDocs finds only files that differ between branches', async () => {
    const changed = await getChangedDocs('main', 'docs-v1', tmpDir);
    expect(changed).toContain('setup');
    expect(changed).not.toContain('intro');
  });

  it('getChangedDocs returns empty array for identical branches', async () => {
    const changed = await getChangedDocs('main', 'main', tmpDir);
    expect(changed).toEqual([]);
  });

  it('getChangedDocs returns empty array for non-existent branch', async () => {
    const changed = await getChangedDocs('main', 'no-such-branch', tmpDir);
    expect(changed).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// template.js — version selector rendering
// ─────────────────────────────────────────────────────────────────────────────
describe('renderShell — versioning', () => {
  const baseConfig = { name: 'Test', sidebar: [{ group: 'G', pages: ['intro'] }] };
  const versionConfig = {
    default: 'v2',
    list: [
      { version: 'v1', branch: 'docs-v1', tag: 'Legacy' },
      { version: 'v2', branch: 'main', tag: 'Latest' },
    ],
  };

  it('does not inject version selector when versionConfig is null', () => {
    const html = renderShell({ config: baseConfig, mode: 'dev', port: 3000 });
    expect(html).not.toContain('<select class="version-select"');
    expect(html).not.toContain('window.__DOCSLIT_VERSIONS__ =');
  });

  it('injects version selector when versionConfig is provided', () => {
    const html = renderShell({ config: baseConfig, mode: 'dev', port: 3000, versionConfig, currentVersion: 'v2' });
    expect(html).toContain('<select class="version-select"');
    expect(html).toContain('v1 (Legacy)');
    expect(html).toContain('v2 (Latest)');
  });

  it('marks the current version as selected', () => {
    const html = renderShell({ config: baseConfig, mode: 'dev', port: 3000, versionConfig, currentVersion: 'v1' });
    expect(html).toContain('value="v1" selected');
    expect(html).not.toContain('value="v2" selected');
  });

  it('injects __DOCSLIT_VERSIONS__ script with correct data', () => {
    const html = renderShell({ config: baseConfig, mode: 'dev', port: 3000, versionConfig, currentVersion: 'v2' });
    expect(html).toContain('window.__DOCSLIT_VERSIONS__');
    expect(html).toContain('"current":"v2"');
    expect(html).toContain('"default":"v2"');
  });

  it('includes switchVersion function in output', () => {
    const html = renderShell({ config: baseConfig, mode: 'dev', port: 3000, versionConfig, currentVersion: 'v2' });
    expect(html).toContain('function switchVersion');
  });

  it('includes version-select CSS styles', () => {
    const html = renderShell({ config: baseConfig, mode: 'dev', port: 3000 });
    expect(html).toContain('.version-select');
  });
});

describe('renderShell — versioned loaders', () => {
  const baseConfig = { name: 'Test', sidebar: [{ group: 'G', pages: ['intro'] }] };
  const versionConfig = {
    default: 'v2',
    list: [
      { version: 'v1', branch: 'docs-v1' },
      { version: 'v2', branch: 'main' },
    ],
  };

  it('dev loader uses versioned API path when __DOCSLIT_VERSIONS__ is set', () => {
    const html = renderShell({ config: baseConfig, mode: 'dev', port: 3000, versionConfig, currentVersion: 'v2' });
    expect(html).toContain("'/api/page/' + vc.current + '/' + id");
  });

  it('static loader includes fallback fetch to default version', () => {
    const html = renderShell({ config: baseConfig, mode: 'static', versionConfig, currentVersion: 'v1' });
    expect(html).toContain("vc.default + '/'");
  });

  it('all three loaders reference __DOCSLIT_VERSIONS__ for versioned routing', () => {
    for (const mode of ['dev', 'static'] as const) {
      const html = renderShell({ config: baseConfig, mode, port: 3000, versionConfig, currentVersion: 'v2' });
      expect(html).toContain('__DOCSLIT_VERSIONS__');
    }
    const offlineHtml = renderShell({
      config: baseConfig, mode: 'static', versionConfig, currentVersion: 'v2',
      pagesData: { intro: { meta: {}, html: '<p>hi</p>' } }, offline: true,
    });
    expect(offlineHtml).toContain('__DOCSLIT_VERSIONS__');
  });
});

// ── Search ───────────────────────────────────────────────────────────────────

describe('renderShell — search UI', () => {
  const config = { name: 'Test', sidebar: [{ group: 'Guide', pages: ['intro', 'setup'] }] };

  it('includes search trigger button in nav', () => {
    const html = renderShell({ config, mode: 'static' });
    expect(html).toContain('search-trigger');
    expect(html).toContain('Search…');
    expect(html).toContain('⌘K');
  });

  it('includes search overlay modal markup', () => {
    const html = renderShell({ config, mode: 'static' });
    expect(html).toContain('search-overlay');
    expect(html).toContain('search-modal');
    expect(html).toContain('search-input');
    expect(html).toContain('Search docs…');
  });

  it('includes search JS functions', () => {
    const html = renderShell({ config, mode: 'static' });
    expect(html).toContain('function openSearch');
    expect(html).toContain('function closeSearch');
    expect(html).toContain('function handleSearchInput');
    expect(html).toContain('function handleSearchKey');
    expect(html).toContain('function selectSearchItem');
  });

  it('includes Cmd+K keyboard shortcut handler', () => {
    const html = renderShell({ config, mode: 'static' });
    expect(html).toContain("e.key === 'k'");
    expect(html).toContain('e.metaKey');
    expect(html).toContain('e.ctrlKey');
  });

  it('includes FlexSearch CDN import', () => {
    const html = renderShell({ config, mode: 'static' });
    expect(html).toContain('flexsearch');
  });

  it('fetches search-index.json in static mode', () => {
    const html = renderShell({ config, mode: 'static' });
    expect(html).toContain('search-index.json');
  });

  it('fetches /api/search-index in dev mode', () => {
    const html = renderShell({ config, mode: 'dev' });
    expect(html).toContain('/api/search-index');
  });

  it('includes search CSS styles', () => {
    const html = renderShell({ config, mode: 'static' });
    expect(html).toContain('.search-trigger');
    expect(html).toContain('.search-overlay');
    expect(html).toContain('.search-modal');
    expect(html).toContain('.search-item');
    expect(html).toContain('mark.hl');
  });
});

describe('renderShell — search offline mode', () => {
  const config = { name: 'Test', sidebar: [{ group: 'Guide', pages: ['intro'] }] };
  const pagesData = { intro: { meta: { title: 'Intro' }, html: '<h1>Intro</h1>' } };
  const searchIndex = [{ id: 'intro', title: 'Intro', group: 'Guide', desc: '', body: 'content' }];

  it('loads search index via script tag in offline mode', () => {
    const html = renderShell({ config, mode: 'static', offline: true, pagesData, searchIndex });
    expect(html).toContain('search-index.js');
    expect(html).not.toContain('"id":"intro"');
  });

  it('does not inline search index when not offline', () => {
    const html = renderShell({ config, mode: 'static', searchIndex });
    expect(html).not.toContain('window.__DOCSLIT_SEARCH_INDEX__ =');
  });

  it('does not inline search index when no searchIndex provided', () => {
    const html = renderShell({ config, mode: 'static', offline: true, pagesData });
    expect(html).not.toContain('window.__DOCSLIT_SEARCH_INDEX__ =');
  });
});

// ── Sidebar filter ───────────────────────────────────────────────────────

describe('renderShell — sidebar filter', () => {
  const config = { name: 'Test', sidebar: [{ group: 'Guide', pages: ['intro', 'setup'] }] };

  it('includes filter input in sidebar', () => {
    const html = renderShell({ config, mode: 'static' });
    expect(html).toContain('sidebar-filter');
    expect(html).toContain('Filter pages…');
  });

  it('includes clear button', () => {
    const html = renderShell({ config, mode: 'static' });
    expect(html).toContain('sidebar-filter-clear');
    expect(html).toContain('_clearSidebarFilter()');
  });

  it('includes filter JS function', () => {
    const html = renderShell({ config, mode: 'static' });
    expect(html).toContain('function _filterSidebar');
    expect(html).toContain('function _clearSidebarFilter');
  });

  it('includes filter highlight CSS', () => {
    const html = renderShell({ config, mode: 'static' });
    expect(html).toContain('.sidebar-filter-wrap');
    expect(html).toContain('mark.filter-hl');
    expect(html).toContain('.sidebar-no-results');
  });

  it('wraps sidebar items in a scrollable container', () => {
    const html = renderShell({ config, mode: 'static' });
    expect(html).toContain('sidebar-scroll');
    expect(html).toContain('id="sidebar-scroll"');
  });

  it('sidebar items have oninput wired to _filterSidebar', () => {
    const html = renderShell({ config, mode: 'static' });
    expect(html).toContain('oninput="_filterSidebar(this.value)"');
  });
});

// ── Accessibility ────────────────────────────────────────────────────────

describe('renderShell — accessibility', () => {
  const config = { name: 'Test', sidebar: [{ group: 'Guide', pages: ['intro'] }] };

  it('includes skip-to-content link', () => {
    const html = renderShell({ config, mode: 'static' });
    expect(html).toContain('skip-link');
    expect(html).toContain('href="#docs-content"');
    expect(html).toContain('Skip to content');
  });

  it('uses <main> element for content area', () => {
    const html = renderShell({ config, mode: 'static' });
    expect(html).toContain('<main class="docs-content"');
    expect(html).toContain('role="main"');
    expect(html).toContain('</main>');
  });

  it('sidebar scroll has nav landmark with aria-label', () => {
    const html = renderShell({ config, mode: 'static' });
    expect(html).toContain('<nav class="sidebar-scroll"');
    expect(html).toContain('aria-label="Documentation pages"');
  });

  it('search input has combobox role and aria attributes', () => {
    const html = renderShell({ config, mode: 'static' });
    expect(html).toContain('role="combobox"');
    expect(html).toContain('aria-controls="search-results"');
    expect(html).toContain('aria-activedescendant');
  });

  it('search results container has listbox role', () => {
    const html = renderShell({ config, mode: 'static' });
    expect(html).toContain('role="listbox"');
    expect(html).toContain('aria-label="Search results"');
  });

  it('search result items have role="option" in render functions', () => {
    const html = renderShell({ config, mode: 'static' });
    expect(html).toContain("role=\"option\"");
  });

  it('includes focus trap function for search modal', () => {
    const html = renderShell({ config, mode: 'static' });
    expect(html).toContain('function _trapFocus');
    expect(html).toContain('addEventListener(\'keydown\', _trapFocus)');
  });

  it('returns focus to trigger on search close', () => {
    const html = renderShell({ config, mode: 'static' });
    expect(html).toContain('search-trigger');
    expect(html).toContain('trigger.focus()');
  });

  it('includes prefers-reduced-motion styles', () => {
    const html = renderShell({ config, mode: 'static' });
    expect(html).toContain('prefers-reduced-motion: reduce');
    expect(html).toContain('animation-duration: 0.01ms');
    expect(html).toContain('transition-duration: 0.01ms');
  });

  it('includes prefers-contrast styles', () => {
    const html = renderShell({ config, mode: 'static' });
    expect(html).toContain('prefers-contrast: more');
  });

  it('includes focus-visible indicators', () => {
    const html = renderShell({ config, mode: 'static' });
    expect(html).toContain('*:focus-visible');
    expect(html).toContain('outline: 2px solid var(--accent)');
  });

  it('content links have underline for distinguishability', () => {
    const html = renderShell({ config, mode: 'static' });
    expect(html).toContain('.docs-content a { text-decoration: underline');
  });
});

describe('components — accessibility', () => {
  const components = buildComponents();

  it('tabs have ARIA tablist/tab/tabpanel roles', () => {
    expect(components).toContain('role="tablist"');
    expect(components).toContain('role="tab"');
    expect(components).toContain('role="tabpanel"');
    expect(components).toContain('aria-selected');
  });

  it('tabs support arrow key navigation', () => {
    expect(components).toContain('ArrowRight');
    expect(components).toContain('ArrowLeft');
  });

  it('expandable has keyboard support and ARIA', () => {
    expect(components).toContain('aria-expanded');
    expect(components).toContain('tabindex="0"');
  });

  it('copy button is keyboard accessible', () => {
    expect(components).toContain("role=\"button\"");
    expect(components).toContain('tabindex="0"');
  });

  it('callout has appropriate role', () => {
    expect(components).toContain("role=");
  });

  it('components include focus-visible styles', () => {
    expect(components).toContain('focus-visible');
  });

  it('components include prefers-reduced-motion', () => {
    expect(components).toContain('prefers-reduced-motion');
  });
});

// ── renderPage — per-route HTML ──────────────────────────────────────────

describe('renderPage — per-route HTML', () => {
  const config = { name: 'TestSite', sidebar: [{ group: 'Guide', pages: ['intro', 'setup'] }] };
  const meta = { title: 'Introduction', description: 'Getting started guide' };
  const pageHtml = '<h1>Introduction</h1><p>Welcome to the docs.</p>';

  it('includes pre-rendered content', () => {
    const html = renderPage({ config, id: 'intro', meta, html: pageHtml, draftPageIds: [] });
    expect(html).toContain('<h1>Introduction</h1>');
    expect(html).toContain('<p>Welcome to the docs.</p>');
    expect(html).not.toContain('Loading…');
  });

  it('sets page-specific title', () => {
    const html = renderPage({ config, id: 'intro', meta, html: pageHtml, draftPageIds: [] });
    expect(html).toContain('<title>Introduction — TestSite</title>');
  });

  it('includes SEO meta tags', () => {
    const html = renderPage({ config, id: 'intro', meta, html: pageHtml, draftPageIds: [] });
    expect(html).toContain('og:title');
    expect(html).toContain('og:type');
    expect(html).toContain('twitter:card');
    expect(html).toContain('application/ld+json');
  });

  it('includes description meta when provided', () => {
    const html = renderPage({ config, id: 'intro', meta, html: pageHtml, draftPageIds: [] });
    expect(html).toContain('name="description"');
    expect(html).toContain('Getting started guide');
  });

  it('references external CSS instead of inline styles', () => {
    const html = renderPage({ config, id: 'intro', meta, html: pageHtml, draftPageIds: [] });
    expect(html).toContain('href="docslit.css"');
    expect(html).not.toMatch(/<style>[^<]{1000,}<\/style>/);
  });

  it('references external JS files', () => {
    const html = renderPage({ config, id: 'intro', meta, html: pageHtml, draftPageIds: [] });
    expect(html).toContain('src="docslit.js"');
    expect(html).toContain('src="docslit-app.js"');
  });

  it('sets __DOCSLIT_PAGE_ID__', () => {
    const html = renderPage({ config, id: 'intro', meta, html: pageHtml, draftPageIds: [] });
    expect(html).toContain('window.__DOCSLIT_PAGE_ID__ = "intro"');
  });

  it('marks active sidebar item', () => {
    const html = renderPage({ config, id: 'intro', meta, html: pageHtml, draftPageIds: [] });
    expect(html).toContain('sidebar-item active');
    expect(html).toMatch(/data-page="intro"[^>]*>.*?Intro/);
  });

  it('includes version selector when versionConfig provided', () => {
    const vc = { default: 'v1', list: [{ version: 'v1', branch: 'main', tag: 'Latest' }] };
    const html = renderPage({ config, id: 'intro', meta, html: pageHtml, draftPageIds: [], versionConfig: vc, currentVersion: 'v1' });
    expect(html).toContain('version-select');
    expect(html).toContain('__DOCSLIT_VERSIONS__');
  });

  it('includes theme init script in head', () => {
    const html = renderPage({ config, id: 'intro', meta, html: pageHtml, draftPageIds: [] });
    expect(html).toContain('docslit-theme');
    expect(html).toContain('__themeMode');
  });

  it('includes import map', () => {
    const html = renderPage({ config, id: 'intro', meta, html: pageHtml, draftPageIds: [] });
    expect(html).toContain('importmap');
    expect(html).toContain('esm.sh/lit@3');
  });

  it('computes asset prefix for nested page IDs', () => {
    const html = renderPage({ config, id: 'commands/check', meta, html: pageHtml, draftPageIds: [] });
    expect(html).toContain('href="../docslit.css"');
    expect(html).toContain('src="../docslit.js"');
    expect(html).toContain('src="../docslit-app.js"');
  });

  it('includes canonical URL when config.url is set', () => {
    const cfgWithUrl = { ...config, url: 'https://docs.example.com' };
    const html = renderPage({ config: cfgWithUrl, id: 'intro', meta, html: pageHtml, draftPageIds: [], versionConfig: { default: 'v1', list: [] }, currentVersion: 'v1' });
    expect(html).toContain('rel="canonical"');
    expect(html).toContain('https://docs.example.com/v1/intro');
  });

  it('includes breadcrumb with page title', () => {
    const html = renderPage({ config, id: 'intro', meta, html: pageHtml, draftPageIds: [] });
    expect(html).toContain('docs-breadcrumb-current');
    expect(html).toContain('>Introduction<');
  });

  it('includes skip link for accessibility', () => {
    const html = renderPage({ config, id: 'intro', meta, html: pageHtml, draftPageIds: [] });
    expect(html).toContain('skip-link');
    expect(html).toContain('Skip to content');
  });

  it('hides draft pages from sidebar', () => {
    const html = renderPage({ config, id: 'intro', meta, html: pageHtml, draftPageIds: ['setup'] });
    expect(html).not.toContain('data-page="setup"');
    expect(html).toContain('data-page="intro"');
  });
});

// ── buildStylesFile ─────────────────────────────────────────────────────

describe('buildStylesFile', () => {
  it('returns CSS without style tags', () => {
    const css = buildStylesFile();
    expect(css).not.toContain('<style>');
    expect(css).not.toContain('</style>');
    expect(css).toContain(':root');
  });

  it('contains theme variables', () => {
    const css = buildStylesFile();
    expect(css).toContain('--bg:');
    expect(css).toContain('--accent:');
    expect(css).toContain('html.light');
  });
});

// ── buildAppFile ────────────────────────────────────────────────────────

describe('buildAppFile', () => {
  it('contains all required functions for static mode', () => {
    const js = buildAppFile('static');
    expect(js).toContain('function loadPage');
    expect(js).toContain('function toggleTheme');
    expect(js).toContain('function openSearch');
    expect(js).toContain('function activateSidebar');
    expect(js).toContain('function buildToc');
    expect(js).toContain('function _buildPrevNext');
    expect(js).toContain('function _filterSidebar');
  });

  it('contains pre-render check for __DOCSLIT_PAGE_ID__', () => {
    const js = buildAppFile('static');
    expect(js).toContain('__DOCSLIT_PAGE_ID__');
  });

  it('exports functions to window', () => {
    const js = buildAppFile('static');
    expect(js).toContain('window.loadPage');
    expect(js).toContain('window.openSidebar');
    expect(js).toContain('window.switchVersion');
  });

  it('strips .html from pathname in _pageFromUrl', () => {
    const js = buildAppFile('static');
    expect(js).toContain(".replace(/\\.html$/, '')");
  });
});

// ── buildComponentsFile ─────────────────────────────────────────────────

describe('buildComponentsFile', () => {
  it('returns ES module with Lit import', () => {
    const js = buildComponentsFile('static');
    expect(js).toContain("import { LitElement");
    expect(js).toContain('customElements.define');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// openapi.js — spec loading and data extraction
// ─────────────────────────────────────────────────────────────────────────────
const FIXTURE_SPEC = path.join(__dirname, 'test-fixtures/petstore.yaml');
const FIXTURE_OVERLAY = path.join(__dirname, 'test-fixtures/petstore-overlay.yaml');

describe('loadSpec', () => {
  it('parses a YAML spec and returns a resolved object', async () => {
    const spec = await loadSpec(FIXTURE_SPEC);
    expect(spec.openapi).toBe('3.1.0');
    expect(spec.info.title).toBe('Petstore API');
    expect(spec.paths['/pets']).toBeDefined();
  });

  it('throws for a non-existent spec file', async () => {
    await expect(loadSpec('/tmp/no-such-file.yaml')).rejects.toThrow('not found');
  });

  it('applies an overlay when provided', async () => {
    const spec = await loadSpec(FIXTURE_SPEC, FIXTURE_OVERLAY);
    const createPet = spec.paths['/pets'].post;
    expect(createPet.description).toContain('Creates a new pet');
    expect(createPet['x-docslit-examples']).toHaveLength(1);
    expect(createPet['x-docslit-examples'][0].label).toBe('cURL');
  });

  it('throws for a non-existent overlay file', async () => {
    await expect(loadSpec(FIXTURE_SPEC, '/tmp/no-overlay.yaml')).rejects.toThrow('overlay not found');
  });
});

describe('getEndpoints', () => {
  let spec: any;
  let endpoints: any[];

  beforeAll(async () => {
    spec = await loadSpec(FIXTURE_SPEC);
    endpoints = getEndpoints(spec);
  });

  it('extracts all endpoints from spec', () => {
    expect(endpoints).toHaveLength(3);
  });

  it('extracts method and path correctly', () => {
    const listPets = endpoints.find((e: any) => e.operationId === 'listPets');
    expect(listPets.method).toBe('GET');
    expect(listPets.path).toBe('/pets');
  });

  it('extracts parameters with constraints', () => {
    const listPets = endpoints.find((e: any) => e.operationId === 'listPets');
    expect(listPets.parameters).toHaveLength(2);
    const limit = listPets.parameters.find((p: any) => p.name === 'limit');
    expect(limit.in).toBe('query');
    expect(limit.required).toBe(false);
    expect(limit.type).toBe('integer');
    expect(limit.minimum).toBe(1);
    expect(limit.maximum).toBe(100);
  });

  it('merges path-level parameters into operations', () => {
    const listPets = endpoints.find((e: any) => e.operationId === 'listPets');
    const header = listPets.parameters.find((p: any) => p.name === 'X-Request-ID');
    expect(header).toBeDefined();
    expect(header.in).toBe('header');
    expect(header.format).toBe('uuid');
  });

  it('extracts maxLength from body fields', () => {
    const createPet = endpoints.find((e: any) => e.operationId === 'createPet');
    const nameField = createPet.bodyFields.find((f: any) => f.name === 'name');
    expect(nameField.maxLength).toBe(100);
  });

  it('extracts request body fields', () => {
    const createPet = endpoints.find((e: any) => e.operationId === 'createPet');
    expect(createPet.bodyFields).toHaveLength(2);
    const nameField = createPet.bodyFields.find((f: any) => f.name === 'name');
    expect(nameField.in).toBe('body');
    expect(nameField.required).toBe(true);
    expect(nameField.type).toBe('string');
  });

  it('extracts tags', () => {
    const getPet = endpoints.find((e: any) => e.operationId === 'getPet');
    expect(getPet.tags).toEqual(['Pets']);
  });

  it('extracts summary', () => {
    const getPet = endpoints.find((e: any) => e.operationId === 'getPet');
    expect(getPet.summary).toBe('Get a pet by ID');
  });
});

describe('getEndpoints — with overlay', () => {
  it('includes x-docslit-examples from overlay', async () => {
    const spec = await loadSpec(FIXTURE_SPEC, FIXTURE_OVERLAY);
    const endpoints = getEndpoints(spec);
    const createPet = endpoints.find((e: any) => e.operationId === 'createPet');
    expect(createPet.description).toContain('Creates a new pet');
    expect(createPet.examples).toHaveLength(1);
    expect(createPet.examples[0].label).toBe('cURL');
  });
});

describe('getOperation', () => {
  it('returns the matching operation by operationId', async () => {
    const spec = await loadSpec(FIXTURE_SPEC);
    const op = getOperation(spec, 'getPet');
    expect(op).not.toBeNull();
    expect(op!.method).toBe('GET');
    expect(op!.path).toBe('/pets/{petId}');
  });

  it('returns null for unknown operationId', async () => {
    const spec = await loadSpec(FIXTURE_SPEC);
    expect(getOperation(spec, 'nonExistent')).toBeNull();
  });
});

describe('getWebhooks', () => {
  it('extracts webhooks from spec', async () => {
    const spec = await loadSpec(FIXTURE_SPEC);
    const webhooks = getWebhooks(spec);
    expect(webhooks).toHaveLength(1);
    expect(webhooks[0].name).toBe('petAdopted');
    expect(webhooks[0].method).toBe('POST');
    expect(webhooks[0].summary).toBe('Pet was adopted');
    expect(webhooks[0].payloadFields).toHaveLength(2);
  });

  it('returns empty array when no webhooks defined', async () => {
    const webhooks = getWebhooks({ openapi: '3.1.0', paths: {} });
    expect(webhooks).toEqual([]);
  });
});

describe('getSecuritySchemes', () => {
  it('extracts security schemes from spec', async () => {
    const spec = await loadSpec(FIXTURE_SPEC);
    const schemes = getSecuritySchemes(spec);
    expect(schemes.apiKey).toBeDefined();
    expect(schemes.apiKey.type).toBe('apiKey');
    expect(schemes.apiKey.name).toBe('X-API-Key');
  });

  it('returns empty object when no schemes defined', () => {
    expect(getSecuritySchemes({ openapi: '3.1.0', paths: {} })).toEqual({});
  });
});

describe('getUndocumentedOps', () => {
  it('returns operationIds not in the provided refs', async () => {
    const spec = await loadSpec(FIXTURE_SPEC);
    const undoc = getUndocumentedOps(spec, ['listPets']);
    expect(undoc).toContain('createPet');
    expect(undoc).toContain('getPet');
    expect(undoc).not.toContain('listPets');
  });

  it('returns empty array when all ops are documented', async () => {
    const spec = await loadSpec(FIXTURE_SPEC);
    const undoc = getUndocumentedOps(spec, ['listPets', 'createPet', 'getPet']);
    expect(undoc).toEqual([]);
  });
});

describe('resolveSpecRefs', () => {
  let specData: any[];

  beforeAll(async () => {
    const spec = await loadSpec(FIXTURE_SPEC, FIXTURE_OVERLAY);
    specData = getEndpoints(spec);
  });

  it('injects method and url into wc-endpoint with ref', () => {
    const html = '<wc-endpoint ref="listPets">User prose</wc-endpoint>';
    const resolved = resolveSpecRefs(html, specData);
    expect(resolved).toContain('method="GET"');
    expect(resolved).toContain('url="/pets"');
    expect(resolved).toContain('User prose');
  });

  it('generates wc-fields with wc-field children from spec params', () => {
    const html = '<wc-endpoint ref="listPets"></wc-endpoint>';
    const resolved = resolveSpecRefs(html, specData);
    expect(resolved).toContain('<wc-fields title="Query Parameters">');
    expect(resolved).toContain('name="limit"');
    expect(resolved).toContain('type="integer"');
    expect(resolved).toContain('in="query"');
  });

  it('groups fields by type with separate wc-fields blocks', () => {
    const html = '<wc-endpoint ref="listPets"></wc-endpoint>';
    const resolved = resolveSpecRefs(html, specData);
    expect(resolved).toContain('<wc-fields title="Headers">');
    expect(resolved).toContain('<wc-fields title="Query Parameters">');
  });

  it('passes description attribute to wc-endpoint', () => {
    const html = '<wc-endpoint ref="createPet"></wc-endpoint>';
    const resolved = resolveSpecRefs(html, specData);
    expect(resolved).toContain('description="');
  });

  it('adds maxlength attr to wc-field', () => {
    const html = '<wc-endpoint ref="createPet"></wc-endpoint>';
    const resolved = resolveSpecRefs(html, specData);
    expect(resolved).toMatch(/wc-field[^>]*name="name"[^>]*maxlength="100"/);
  });

  it('generates body fields from request body', () => {
    const html = '<wc-endpoint ref="createPet"></wc-endpoint>';
    const resolved = resolveSpecRefs(html, specData);
    expect(resolved).toContain('name="name"');
    expect(resolved).toContain('in="body"');
    expect(resolved).toContain('required');
  });

  it('preserves existing children', () => {
    const html = '<wc-endpoint ref="listPets"><p>Custom content</p></wc-endpoint>';
    const resolved = resolveSpecRefs(html, specData);
    expect(resolved).toContain('<p>Custom content</p>');
    expect(resolved).toContain('method="GET"');
  });

  it('injects examples from overlay', () => {
    const html = '<wc-endpoint ref="createPet"></wc-endpoint>';
    const resolved = resolveSpecRefs(html, specData);
    expect(resolved).toContain('<wc-code-tab');
    expect(resolved).toContain('label="cURL"');
    expect(resolved).toContain('language="bash"');
  });

  it('leaves unmatched refs unchanged', () => {
    const html = '<wc-endpoint ref="nonExistent">Content</wc-endpoint>';
    const resolved = resolveSpecRefs(html, specData);
    expect(resolved).toBe(html);
  });

  it('handles multiple refs in one document', () => {
    const html = '<wc-endpoint ref="listPets"></wc-endpoint>\n<wc-endpoint ref="getPet"></wc-endpoint>';
    const resolved = resolveSpecRefs(html, specData);
    expect(resolved).toContain('method="GET" url="/pets"');
    expect(resolved).toContain('method="GET" url="/pets/{petId}"');
  });

  it('adds example and default attrs to wc-field', () => {
    const html = '<wc-endpoint ref="listPets"></wc-endpoint>';
    const resolved = resolveSpecRefs(html, specData);
    expect(resolved).toContain('example="10"');
    expect(resolved).toContain('default="20"');
  });

  it('adds deprecated attr to wc-field', () => {
    const html = '<wc-endpoint ref="createPet"></wc-endpoint>';
    const resolved = resolveSpecRefs(html, specData);
    expect(resolved).toMatch(/wc-field[^>]*name="tag"[^>]*deprecated/);
  });

  it('generates wc-responses with status codes', () => {
    const html = '<wc-endpoint ref="listPets"></wc-endpoint>';
    const resolved = resolveSpecRefs(html, specData);
    expect(resolved).toContain('<wc-responses>');
    expect(resolved).toContain('code="200"');
    expect(resolved).toContain('code="400"');
    expect(resolved).toContain('description="A list of pets"');
  });

  it('generates wc-api-examples with response data', () => {
    const html = '<wc-endpoint ref="listPets"></wc-endpoint>';
    const resolved = resolveSpecRefs(html, specData);
    expect(resolved).toContain('<wc-api-examples');
    expect(resolved).toContain('method="GET"');
    expect(resolved).toContain('data="');
  });

  it('adds security attr to wc-endpoint', () => {
    const html = '<wc-endpoint ref="createPet"></wc-endpoint>';
    const resolved = resolveSpecRefs(html, specData);
    expect(resolved).toContain('security="');
    expect(resolved).toContain('apiKey');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1.5 — getEndpoints enriched data extraction
// ─────────────────────────────────────────────────────────────────────────────
describe('getEndpoints — enriched data', () => {
  let specData: any[];

  beforeAll(async () => {
    const spec = await loadSpec(FIXTURE_SPEC);
    specData = getEndpoints(spec);
  });

  it('extracts example and default from parameters', () => {
    const ep = specData.find((e: any) => e.operationId === 'listPets');
    const limit = ep.parameters.find((p: any) => p.name === 'limit');
    expect(limit.example).toBe(10);
    expect(limit.default).toBe(20);
  });

  it('extracts deprecated flag from body fields', () => {
    const ep = specData.find((e: any) => e.operationId === 'createPet');
    const tag = ep.bodyFields.find((f: any) => f.name === 'tag');
    expect(tag.deprecated).toBe(true);
  });

  it('extracts structured responses with status codes', () => {
    const ep = specData.find((e: any) => e.operationId === 'listPets');
    expect(ep.responses).toBeInstanceOf(Array);
    expect(ep.responses.length).toBe(2);
    expect(ep.responses[0].code).toBe('200');
    expect(ep.responses[0].description).toBe('A list of pets');
    expect(ep.responses[1].code).toBe('400');
  });

  it('extracts response examples', () => {
    const ep = specData.find((e: any) => e.operationId === 'listPets');
    const r200 = ep.responses.find((r: any) => r.code === '200');
    expect(r200.content.length).toBe(1);
    expect(r200.content[0].mediaType).toBe('application/json');
    expect(r200.content[0].examples.length).toBe(1);
    expect(r200.content[0].examples[0].summary).toBe('Two pets');
    expect(r200.content[0].examples[0].value).toBeInstanceOf(Array);
  });

  it('extracts operation-level security', () => {
    const ep = specData.find((e: any) => e.operationId === 'createPet');
    expect(ep.security).toEqual([{ apiKey: [] }]);
  });

  it('returns null security when not set at operation level', () => {
    const ep = specData.find((e: any) => e.operationId === 'listPets');
    expect(ep.security).toBeNull();
  });

  it('extracts request body examples', () => {
    const ep = specData.find((e: any) => e.operationId === 'createPet');
    expect(ep.requestBodyExamples.length).toBe(1);
    expect(ep.requestBodyExamples[0].mediaType).toBe('application/json');
    expect(ep.requestBodyExamples[0].examples.length).toBe(1);
    expect(ep.requestBodyExamples[0].examples[0].summary).toBe('Create a dog');
  });

  it('extracts example from body fields', () => {
    const ep = specData.find((e: any) => e.operationId === 'createPet');
    const name = ep.bodyFields.find((f: any) => f.name === 'name');
    expect(name.example).toBe('Buddy');
  });

  it('extracts inline response example via media.example', () => {
    const ep = specData.find((e: any) => e.operationId === 'getPet');
    const r200 = ep.responses.find((r: any) => r.code === '200');
    expect(r200.content[0].examples.length).toBe(1);
    expect(r200.content[0].examples[0].value).toEqual({ id: 'abc123', name: 'Fido' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// schemaToFields — recursive schema walker
// ─────────────────────────────────────────────────────────────────────────────
describe('schemaToFields', () => {
  it('extracts flat properties with types and constraints', () => {
    const schema = {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string', format: 'uuid', description: 'Unique ID' },
        name: { type: 'string', maxLength: 100 },
      },
    };
    const fields = schemaToFields(schema);
    expect(fields).toHaveLength(2);
    expect(fields[0].name).toBe('id');
    expect(fields[0].required).toBe(true);
    expect(fields[0].format).toBe('uuid');
    expect(fields[1].maxLength).toBe(100);
  });

  it('handles nested objects with children', () => {
    const schema = {
      type: 'object',
      properties: {
        meta: {
          type: 'object',
          required: ['offset'],
          properties: {
            offset: { type: 'integer', description: 'Pagination offset' },
            limit: { type: 'integer' },
          },
        },
      },
    };
    const fields = schemaToFields(schema);
    expect(fields).toHaveLength(1);
    expect(fields[0].name).toBe('meta');
    expect(fields[0].type).toBe('object');
    expect(fields[0].children).toHaveLength(2);
    expect(fields[0].children[0].name).toBe('offset');
    expect(fields[0].children[0].required).toBe(true);
  });

  it('handles array of objects', () => {
    const schema = {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
            },
          },
        },
      },
    };
    const fields = schemaToFields(schema);
    expect(fields[0].type).toBe('array[object]');
    expect(fields[0].children).toHaveLength(1);
    expect(fields[0].children[0].name).toBe('id');
  });

  it('resolves allOf composition', () => {
    const schema = {
      allOf: [
        { type: 'object', properties: { a: { type: 'string' } }, required: ['a'] },
        { properties: { b: { type: 'integer' } } },
      ],
    };
    const fields = schemaToFields(schema);
    expect(fields).toHaveLength(2);
    expect(fields[0].name).toBe('a');
    expect(fields[0].required).toBe(true);
    expect(fields[1].name).toBe('b');
  });
});

describe('response fields in getEndpoints', () => {
  it('extracts response schema fields for 200 response', async () => {
    const spec = await loadSpec(FIXTURE_SPEC);
    const endpoints = getEndpoints(spec);
    const createPet = endpoints.find((e: any) => e.operationId === 'createPet');
    const r201 = createPet.responses.find((r: any) => r.code === '201');
    expect(r201.fields).toHaveLength(2);
    expect(r201.fields[0].name).toBe('id');
    expect(r201.fields[1].name).toBe('name');
  });

  it('renders wc-response-fields in resolveSpecRefs', async () => {
    const spec = await loadSpec(FIXTURE_SPEC, FIXTURE_OVERLAY);
    const specData = getEndpoints(spec);
    const html = '<wc-endpoint ref="createPet"></wc-endpoint>';
    const resolved = resolveSpecRefs(html, specData);
    expect(resolved).toContain('<wc-response-fields');
    expect(resolved).toContain('title="Response body application/json"');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// config.js — getOpenAPIConfig
// ─────────────────────────────────────────────────────────────────────────────
describe('getOpenAPIConfig', () => {
  it('returns null when no openapi field', () => {
    expect(getOpenAPIConfig({ name: 'Test', sidebar: [] })).toBeNull();
  });

  it('parses string shorthand', () => {
    const result = getOpenAPIConfig({ openapi: 'spec.yaml' });
    expect(result).toEqual({ spec: 'spec.yaml', overlay: null });
  });

  it('parses object form with spec and overlay', () => {
    const result = getOpenAPIConfig({ openapi: { spec: 'api.yaml', overlay: 'overlay.yaml' } });
    expect(result).toEqual({ spec: 'api.yaml', overlay: 'overlay.yaml' });
  });

  it('parses object form without overlay', () => {
    const result = getOpenAPIConfig({ openapi: { spec: 'api.yaml' } });
    expect(result).toEqual({ spec: 'api.yaml', overlay: null });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1 — CLI openapi scaffold
// ─────────────────────────────────────────────────────────────────────────────
describe('CLI — openapi command', () => {
  it('exits 1 when no subcommand given', async () => {
    const { code, stderr } = await run(['openapi']);
    expect(code).toBe(1);
    expect(stderr).toContain('Unknown openapi subcommand');
  });

  it('exits 1 when scaffold has no spec path', async () => {
    const { code, stderr } = await run(['openapi', 'scaffold']);
    expect(code).toBe(1);
    expect(stderr).toContain('spec file path');
  });

  it('shows openapi scaffold in --help output', async () => {
    const { code, stdout } = await run(['--help']);
    expect(code).toBe(0);
    expect(stdout).toContain('openapi scaffold');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1 — openapi scaffold integration (file creation)
// ─────────────────────────────────────────────────────────────────────────────
describe('openapi scaffold — file generation', () => {
  const tmpDir = path.join(__dirname, '../.test-scaffold');

  beforeAll(() => {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true });
    mkdirSync(tmpDir, { recursive: true });
    mkdirSync(path.join(tmpDir, 'docs'), { recursive: true });
    writeFileSync(path.join(tmpDir, 'docslit.json'), JSON.stringify({
      name: 'Test',
      sidebar: [{ group: 'Guide', pages: ['intro'] }],
    }));
    writeFileSync(path.join(tmpDir, 'docs', 'intro.md'), '---\ntitle: Intro\n---\n# Intro\n');
  });

  afterAll(() => {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true });
  });

  it('generates stub markdown files from spec', async () => {
    const { code, stderr } = await run(['openapi', 'scaffold', FIXTURE_SPEC], 15000, tmpDir);
    expect(code).toBe(0);
    expect(stderr).toBe('');

    // Check files were created
    expect(existsSync(path.join(tmpDir, 'docs', 'api', 'list-pets.md'))).toBe(true);
    expect(existsSync(path.join(tmpDir, 'docs', 'api', 'create-pet.md'))).toBe(true);
    expect(existsSync(path.join(tmpDir, 'docs', 'api', 'get-pet.md'))).toBe(true);

    // Check content
    const content = readFileSync(path.join(tmpDir, 'docs', 'api', 'list-pets.md'), 'utf8');
    expect(content).toContain('ref="listPets"');
    expect(content).toContain('title: List all pets');
    expect(content).toContain('# List all pets');
    expect(content).toContain('layout: api');
  });

  it('updates docslit.json with API Reference group', () => {
    const config = JSON.parse(readFileSync(path.join(tmpDir, 'docslit.json'), 'utf8'));
    expect(config.openapi).toBeDefined();
    const apiGroup = config.sidebar.find((g: any) => g.group === 'API Reference');
    expect(apiGroup).toBeDefined();
    const pageIds = apiGroup.pages.map((p: any) => typeof p === 'string' ? p : p.id);
    expect(pageIds).toContain('api/list-pets');
    expect(pageIds).toContain('api/create-pet');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1 — renderPage with API layout
// ─────────────────────────────────────────────────────────────────────────────
describe('renderPage — API layout', () => {
  const config = { name: 'TestAPI', sidebar: [{ group: 'API Reference', pages: ['api/list-pets'] }] };
  const meta = { title: 'List Pets', layout: 'api' as const };
  const pageHtml = '<h1>List Pets</h1><wc-endpoint method="GET" url="/pets" ref="listPets"></wc-endpoint>';

  it('adds api-layout class for pages with layout: api', () => {
    const html = renderPage({ config, id: 'api/list-pets', meta, html: pageHtml, draftPageIds: [] });
    expect(html).toContain('api-layout');
  });

  it('includes docs-examples panel for API pages', () => {
    const html = renderPage({ config, id: 'api/list-pets', meta, html: pageHtml, draftPageIds: [] });
    expect(html).toContain('docs-examples');
  });

  it('does not add api-layout for non-API pages', () => {
    const normalMeta = { title: 'Intro' };
    const html = renderPage({ config, id: 'intro', meta: normalMeta, html: '<h1>Intro</h1>', draftPageIds: [] });
    expect(html).not.toContain('api-layout');
  });

  it('generates API sidebar with method badges when specData provided', async () => {
    const spec = await loadSpec(FIXTURE_SPEC);
    const specData = getEndpoints(spec);
    const html = renderPage({ config, id: 'api/list-pets', meta, html: pageHtml, draftPageIds: [], specData });
    expect(html).toContain('method-badge');
    expect(html).toContain('api-nav-item');
    expect(html).toContain('/pets');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1 — API layout CSS
// ─────────────────────────────────────────────────────────────────────────────
describe('buildStylesFile — API layout', () => {
  it('includes API layout styles', () => {
    const css = buildStylesFile();
    expect(css).toContain('.api-layout');
    expect(css).toContain('.docs-examples');
    expect(css).toContain('.method-badge');
    expect(css).toContain('.api-nav-item');
  });

  it('includes responsive rules for API layout', () => {
    const css = buildStylesFile();
    expect(css).toContain('.api-layout .docs-examples');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1 — wc-field upgrades
// ─────────────────────────────────────────────────────────────────────────────
describe('components — wc-field upgrades', () => {
  const components = buildComponents();

  it('wc-field has in property', () => {
    expect(components).toContain("in:{type:String}");
  });

  it('wc-field has enum property', () => {
    expect(components).toContain("enum:{type:String}");
  });

  it('wc-field has format property', () => {
    expect(components).toContain("format:{type:String}");
  });

  it('wc-field has pattern property', () => {
    expect(components).toContain("pattern:{type:String}");
  });

  it('wc-field has minimum/maximum properties', () => {
    expect(components).toContain("minimum:{type:String}");
    expect(components).toContain("maximum:{type:String}");
  });

  it('wc-field has collapsible property', () => {
    expect(components).toContain("collapsible:{type:Boolean}");
  });

  it('wc-field renders in-badge for location', () => {
    expect(components).toContain('in-badge');
  });

  it('wc-field renders constraint info', () => {
    expect(components).toContain('constraint');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1 — wc-endpoint upgrades
// ─────────────────────────────────────────────────────────────────────────────
describe('components — wc-endpoint upgrades', () => {
  const components = buildComponents();

  it('wc-endpoint has ref property', () => {
    expect(components).toContain("ref:{type:String}");
  });

  it('wc-endpoint has summary property', () => {
    expect(components).toContain("summary:{type:String}");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// endpointToMarkdown + buildApiPageMarkdown
// ─────────────────────────────────────────────────────────────────────────────
describe('endpointToMarkdown', () => {
  let spec: any;
  let endpoints: any[];

  beforeAll(async () => {
    spec = await loadSpec(path.join(__dirname, 'test-fixtures/petstore.yaml'));
    endpoints = getEndpoints(spec);
  });

  it('generates heading with method and path', () => {
    const op = endpoints.find((e: any) => e.operationId === 'listPets');
    const md = endpointToMarkdown(op);
    expect(md).toContain('## GET /pets');
  });

  it('includes summary and description', () => {
    const op = endpoints.find((e: any) => e.operationId === 'listPets');
    const md = endpointToMarkdown(op);
    expect(md).toContain('List all pets');
  });

  it('renders query parameters table', () => {
    const op = endpoints.find((e: any) => e.operationId === 'listPets');
    const md = endpointToMarkdown(op);
    expect(md).toContain('### Query Parameters');
    expect(md).toContain('`limit`');
  });

  it('renders request body fields', () => {
    const op = endpoints.find((e: any) => e.operationId === 'createPet');
    const md = endpointToMarkdown(op);
    expect(md).toContain('### Request Body');
    expect(md).toContain('`name`');
    expect(md).toContain('**required**');
  });

  it('renders response sections', () => {
    const op = endpoints.find((e: any) => e.operationId === 'createPet');
    const md = endpointToMarkdown(op);
    expect(md).toContain('### Responses');
    expect(md).toContain('#### 201 Pet created');
  });

  it('renders response examples', () => {
    const op = endpoints.find((e: any) => e.operationId === 'listPets');
    const md = endpointToMarkdown(op);
    expect(md).toContain('```json');
    expect(md).toContain('Fido');
  });

  it('returns empty string for null input', () => {
    expect(endpointToMarkdown(null)).toBe('');
  });
});

describe('buildApiPageMarkdown', () => {
  let spec: any;
  let endpoints: any[];

  beforeAll(async () => {
    spec = await loadSpec(path.join(__dirname, 'test-fixtures/petstore.yaml'));
    endpoints = getEndpoints(spec);
  });

  it('replaces wc-endpoint refs with enriched markdown', () => {
    const raw = `---
title: Pets API
layout: api
---

# Pets API

<wc-endpoint ref="listPets"></wc-endpoint>`;

    const md = buildApiPageMarkdown(raw, endpoints);
    expect(md).toContain('# Pets API');
    expect(md).toContain('## GET /pets');
    expect(md).toContain('`limit`');
    expect(md).not.toContain('wc-endpoint');
  });

  it('preserves frontmatter', () => {
    const raw = `---
title: Test
layout: api
---

<wc-endpoint ref="createPet"></wc-endpoint>`;

    const md = buildApiPageMarkdown(raw, endpoints);
    expect(md).toContain('---\ntitle: Test\nlayout: api\n---');
  });

  it('handles multiple refs', () => {
    const raw = `---
title: All
---

# All Endpoints

<wc-endpoint ref="listPets"></wc-endpoint>
<wc-endpoint ref="createPet"></wc-endpoint>`;

    const md = buildApiPageMarkdown(raw, endpoints);
    expect(md).toContain('## GET /pets');
    expect(md).toContain('## POST /pets');
  });

  it('passes through content with no refs unchanged', () => {
    const raw = `# Just a page\n\nNo API refs here.`;
    const md = buildApiPageMarkdown(raw, endpoints);
    expect(md).toBe(raw);
  });

  it('skips unknown refs gracefully', () => {
    const raw = `---
title: Missing
---

# Missing

<wc-endpoint ref="nonExistentOp"></wc-endpoint>`;

    const md = buildApiPageMarkdown(raw, endpoints);
    expect(md).not.toContain('##');
  });
});

describe('CLI — validate link resolution and reusables', () => {
  const tmpDir = path.join(__dirname, '../.test-validate-links');

  beforeAll(() => {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true });
    mkdirSync(path.join(tmpDir, 'docs', 'getting-started'), { recursive: true });
    mkdirSync(path.join(tmpDir, 'docs', 'cli-reference'), { recursive: true });
    mkdirSync(path.join(tmpDir, 'docs', 'components'), { recursive: true });
    mkdirSync(path.join(tmpDir, 'docs', 'deployment'), { recursive: true });
    mkdirSync(path.join(tmpDir, 'docs', 'integrations'), { recursive: true });
    mkdirSync(path.join(tmpDir, 'docs', 'writing-content'), { recursive: true });
    mkdirSync(path.join(tmpDir, 'docs', '_reusables', 'page'), { recursive: true });

    writeFileSync(path.join(tmpDir, 'docslit.json'), JSON.stringify({
      name: 'Validate Fixtures',
      sidebar: [
        { group: 'Getting Started', pages: ['getting-started/introduction', 'getting-started/installation'] },
        { group: 'CLI', pages: ['cli-reference/commands', 'cli-reference/validation'] },
        { group: 'Components', pages: ['components/callouts-and-alerts'] },
        { group: 'Deployment', pages: ['deployment/docslit-cloud'] },
        { group: 'Integrations', pages: ['integrations/openapi'] },
        { group: 'Writing', pages: ['writing-content/reusable-content', 'writing-content/variables-and-precedence'] },
      ],
    }, null, 2));

    writeFileSync(path.join(tmpDir, 'docs', 'getting-started', 'introduction.md'), `---
title: Intro
---

[Install](installation)
[Quick ref](../cli-reference/commands)
[Callouts](../components/callouts-and-alerts)
`);
    writeFileSync(path.join(tmpDir, 'docs', 'getting-started', 'installation.md'), `---
title: Install
---
`);
    writeFileSync(path.join(tmpDir, 'docs', 'cli-reference', 'commands.md'), `---
title: Commands
---

[Validation](validation)
[OpenAPI](../integrations/openapi)
[Cloud](../deployment/docslit-cloud)
<a href="../integrations/openapi">Inline link</a>
`);
    writeFileSync(path.join(tmpDir, 'docs', 'cli-reference', 'validation.md'), `---
title: Validation
---
`);
    writeFileSync(path.join(tmpDir, 'docs', 'components', 'callouts-and-alerts.md'), `---
title: Callouts
---
`);
    writeFileSync(path.join(tmpDir, 'docs', 'deployment', 'docslit-cloud.md'), `---
title: Cloud
---
`);
    writeFileSync(path.join(tmpDir, 'docs', 'integrations', 'openapi.md'), `---
title: OpenAPI
---
`);
    writeFileSync(path.join(tmpDir, 'docs', 'writing-content', 'variables-and-precedence.md'), `---
title: Vars
---
`);
    writeFileSync(path.join(tmpDir, 'docs', 'writing-content', 'reusable-content.md'), `---
title: Reusable Content
---

<wc-include src="page/reusable-content.md" />
`);
    writeFileSync(path.join(tmpDir, 'docs', '_reusables', 'page', 'reusable-content.md'), `
This reusable snippet links to [vars](variables-and-precedence).
`);
  });

  afterAll(() => {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true });
  });

  it('resolves same-folder and ../ relative links based on current page', async () => {
    const { code, stdout, stderr } = await run(['validate', tmpDir], 15000);
    expect(stderr).toBe('');
    expect(code).toBe(0);
    expect(stdout).not.toContain('Broken internal link');
    expect(stdout).not.toContain('Possible broken href');
    expect(stdout).not.toContain('validation" (no page with slug "validation"');
    expect(stdout).not.toContain('../integrations/openapi');
  });

  it('does not treat wc-include and reusable snippets as normal pages', async () => {
    const { stdout } = await run(['validate', tmpDir], 15000);
    expect(stdout).not.toContain('Unknown component <wc-include>');
    expect(stdout).not.toContain('docs/_reusables/page/reusable-content.md] Missing frontmatter field');
    expect(stdout).not.toContain('docs/_reusables/page/reusable-content.md] Orphaned page');
    expect(stdout).not.toContain('docs/_reusables/page/reusable-content.md');
  });
});
