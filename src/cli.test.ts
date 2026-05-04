import { describe, it, expect } from 'vitest';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import { parseDoc } from './markdown.js';
import { getAllPageIds } from './config.js';
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
    'wc-columns', 'wc-frame', 'wc-panel', 'wc-expandable', 'wc-accordion', 'wc-aside',
    // Navigation
    'wc-steps', 'wc-step', 'wc-tabs', 'wc-tab', 'wc-view', 'wc-view-panel',
    // Code
    'wc-code-block', 'wc-code-group', 'wc-code-tab',
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
