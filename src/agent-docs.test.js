import { describe, it, expect } from 'vitest';
import {
  buildAgentDirectiveHtml,
  buildAgentDirectiveMarkdown,
  buildMarkdownPattern,
  getLlmsTxtUrl,
  getMarkdownUrl,
  prependAgentDirectiveToMarkdown,
} from './agent-docs.js';

const config = {
  name: 'Test Docs',
  url: 'https://docs.example.com',
};

describe('agent-docs helpers', () => {
  it('builds version-aware llms and markdown URLs', () => {
    expect(getLlmsTxtUrl(config)).toBe('https://docs.example.com/llms.txt');
    expect(getLlmsTxtUrl(config, '0.1')).toBe('https://docs.example.com/0.1/llms.txt');
    expect(getMarkdownUrl(config, 'getting-started/intro', '0.1'))
      .toBe('https://docs.example.com/0.1/getting-started/intro.md');
    expect(buildMarkdownPattern(config, '0.1'))
      .toBe('https://docs.example.com/0.1/{slug}.md');
  });

  it('prepends markdown directive after frontmatter', () => {
    const raw = '---\ntitle: Intro\n---\n\n# Intro\n';
    const out = prependAgentDirectiveToMarkdown(raw, buildAgentDirectiveMarkdown(config, 'intro', '0.1'));
    expect(out.startsWith('---\ntitle: Intro\n---\n')).toBe(true);
    expect(out).toContain('> For AI agents:');
    expect(out).toContain('[llms.txt](https://docs.example.com/0.1/llms.txt)');
    expect(out).toContain('# Intro');
  });

  it('builds visually hidden HTML directive with llms.txt link', () => {
    const html = buildAgentDirectiveHtml(config, '0.1');
    expect(html).toContain('agent-docs-directive');
    expect(html).toContain('href="https://docs.example.com/0.1/llms.txt"');
    expect(html).toContain('clip:rect(0,0,0,0)');
  });
});
