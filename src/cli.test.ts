import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import git from 'isomorphic-git';
import * as nodeFs from 'node:fs';
import { parseDoc } from './markdown.js';
import { rewriteMdxTags, pascalToWcKebab, COMPONENT_MAP } from './mdx-bridge.js';
import { getAllPageIds, getVersionConfig, gitReadFile, getVersionSidebar, getChangedDocs } from './config.js';
import { renderShell, renderPage, buildStylesFile, buildAppFile, buildComponentsFile } from './template.js';
import { buildComponents } from './components/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BIN = path.join(__dirname, '../bin/docslit.js');
const pkg = JSON.parse(readFileSync(path.join(__dirname, '../package.json'), 'utf8'));

/** Run the CLI with the given args and return { code, stdout, stderr }. */
function run(args: string[], timeoutMs = 5000): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', [BIN, ...args]);
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
  it('parses frontmatter into meta', () => {
    const raw = `---\ntitle: Hello World\ndraft: true\n---\n# Hello\n`;
    const { meta, html } = parseDoc(raw);
    expect(meta.title).toBe('Hello World');
    expect(meta.draft).toBe(true);
  });

  it('converts markdown headings to HTML', () => {
    const { html } = parseDoc('# Heading One\n\n## Heading Two\n');
    expect(html).toContain('<h1');
    expect(html).toContain('<h2');
  });

  it('converts markdown paragraphs to HTML', () => {
    const { html } = parseDoc('Some **bold** text and _italic_ text.\n');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>italic</em>');
  });

  it('preserves wc-* web component tags unchanged', () => {
    const raw = '<wc-callout type="warning">Watch out</wc-callout>\n';
    const { html } = parseDoc(raw);
    expect(html).toContain('<wc-callout type="warning">');
    expect(html).toContain('Watch out');
  });

  it('preserves self-closing wc-* tags', () => {
    const raw = '<wc-badge label="v1.0" />\n';
    const { html } = parseDoc(raw);
    expect(html).toContain('<wc-badge');
    expect(html).toContain('label="v1.0"');
  });

  it('does not mangle code inside fenced blocks', () => {
    const raw = '```js\nconst x = <wc-button />\n```\n';
    const { html } = parseDoc(raw);
    expect(html).toContain('const x =');
  });

  it('returns empty meta when no frontmatter present', () => {
    const { meta } = parseDoc('Just some text.\n');
    expect(meta).toEqual({});
  });

  it('converts self-closing wc-* tags to open+close pairs for HTML compatibility', () => {
    const raw = '<wc-var name="X" default="hello" />\n';
    const { html } = parseDoc(raw);
    expect(html).toContain('<wc-var name="X" default="hello"></wc-var>');
    expect(html).not.toContain('/>');
  });

  it('preserves content after self-closing wc-* tags', () => {
    const raw = '<wc-var name="X" default="val" />\n\n<wc-callout>After var</wc-callout>\n';
    const { html } = parseDoc(raw);
    expect(html).toContain('<wc-var');
    expect(html).toContain('<wc-callout>');
    expect(html).toContain('After var');
  });

  it('preserves special characters like && inside wc-code-block', () => {
    const raw = '<wc-code-block>mkdir foo && cd foo</wc-code-block>\n';
    const { html } = parseDoc(raw);
    expect(html).toContain('mkdir foo && cd foo');
    expect(html).not.toContain('&amp;');
  });

  it('preserves {{VAR}} placeholders inside wc-code-block', () => {
    const raw = '<wc-code-block>curl {{API_URL}}/status</wc-code-block>\n';
    const { html } = parseDoc(raw);
    expect(html).toContain('{{API_URL}}');
  });

  it('rewrites Mintlify-style <Tip> as <wc-callout type="tip">', () => {
    const { html } = parseDoc('<Tip>Use cache</Tip>\n');
    expect(html).toContain('<wc-callout');
    expect(html).toContain('type="tip"');
    expect(html).toContain('title="Tip"');
    expect(html).toContain('Use cache');
  });

  it('rewrites <Card icon="rocket"> with attribute renaming', () => {
    const raw = '<Card title="Quickstart" icon="rocket" href="/start">Get going.</Card>\n';
    const { html } = parseDoc(raw);
    expect(html).toContain('<wc-card');
    expect(html).toContain('title="Quickstart"');
    expect(html).toContain('icon-name="zap"'); // rocket → zap via FA_TO_LUCIDE
    expect(html).toContain('href="/start"');
  });

  it('rewrites self-closing <Card /> to a paired wc-card', () => {
    const { html } = parseDoc('<Card title="Solo" />\n');
    expect(html).toContain('<wc-card');
    expect(html).toContain('title="Solo"');
    expect(html).toContain('</wc-card>');
    expect(html).not.toContain('/>');
  });

  it('applies convention fallback for unmapped PascalCase tags', () => {
    const { html } = parseDoc('<CustomThing prop="x">Body</CustomThing>\n');
    expect(html).toContain('<wc-custom-thing');
    expect(html).toContain('prop="x"');
    expect(html).toContain('</wc-custom-thing>');
  });

  it('does not rewrite PascalCase tags inside fenced code blocks', () => {
    const raw = '```jsx\n<Callout>literal source</Callout>\n```\n';
    const { html } = parseDoc(raw);
    expect(html).toContain('&lt;Callout&gt;');
    expect(html).not.toContain('<wc-callout');
  });

  it('does not rewrite PascalCase tags inside inline backticks', () => {
    const { html } = parseDoc('Use `<Callout>` for warnings.\n');
    expect(html).toContain('<code>&lt;Callout&gt;</code>');
    expect(html).not.toContain('<wc-callout');
  });

  it('auto-numbers <Step> inside <Steps>', () => {
    const raw = '<Steps>\n<Step title="A">First</Step>\n<Step title="B">Second</Step>\n</Steps>\n';
    const { html } = parseDoc(raw);
    expect(html).toContain('n="1"');
    expect(html).toContain('n="2"');
  });

  it('drops <Tooltip> wrapper but keeps inner content (flatten)', () => {
    const { html } = parseDoc('Hover <Tooltip tip="hi">here</Tooltip> for info.\n');
    expect(html).not.toContain('Tooltip');
    expect(html).not.toContain('wc-tooltip');
    expect(html).toContain('Hover');
    expect(html).toContain('here');
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

  it('inlines search index when offline with searchIndex', () => {
    const html = renderShell({ config, mode: 'static', offline: true, pagesData, searchIndex });
    expect(html).toContain('window.__DOCSLIT_SEARCH_INDEX__');
    expect(html).toContain('"id":"intro"');
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
