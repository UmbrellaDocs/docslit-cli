import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { fileURLToPath } from 'url';
import { runLint, LINT_RULES } from './lint.js';

const BIN = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'docslit.js');
const dirs = [];
afterEach(async () => { while (dirs.length) await fs.remove(dirs.pop()); });

async function project(pages, config = {}) {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'docslit-lint-'));
  dirs.push(d);
  await fs.writeJson(path.join(d, 'docslit.json'), { name: 'x', sidebar: [{ group: 'G', pages: Object.keys(pages).map((p) => p.replace(/\.md$/, '')) }], ...config });
  for (const [name, content] of Object.entries(pages)) {
    const f = path.join(d, 'docs', name.endsWith('.md') ? name : `${name}.md`);
    await fs.ensureDir(path.dirname(f));
    await fs.writeFile(f, content);
  }
  return d;
}
const GOOD_DESC = 'description: A sufficiently long description of this page for search.\n';
const words = (n) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ');
const codes = (r, file) => r.issues.filter((i) => !file || i.file.endsWith(file)).map((i) => i.code);
const find = (r, code) => r.issues.find((i) => i.code === code);

describe('runLint', () => {
  it('returns the runValidation result shape and passes a clean page', async () => {
    const d = await project({ a: `---\ntitle: A\n${GOOD_DESC}---\n\n# A\n\n${words(40)}\n` });
    const r = await runLint(d);
    expect(r.ok).toBe(true);
    expect(r.issues).toEqual([]);
    expect(r.summary).toEqual({ errors: 0, warnings: 0, infos: 0, pages: 1 });
  });

  it('reports a missing directory', async () => {
    const r = await runLint(path.join(os.tmpdir(), 'docslit-nope-xyz'));
    expect(r.ok).toBe(false);
    expect(r.issues[0].code).toBe('directory-not-found');
  });

  it('flags missing and badly sized descriptions with whole-file line numbers', async () => {
    const d = await project({
      none: `---\ntitle: N\n---\n\n# N\n\n${words(40)}\n`,
      short: `---\ntitle: S\ndescription: Too short\n---\n\n# S\n\n${words(40)}\n`,
      long: `---\ntitle: L\ndescription: ${'x'.repeat(220)}\n---\n\n# L\n\n${words(40)}\n`,
    });
    const r = await runLint(d);
    expect(find({ issues: r.issues.filter((i) => i.file.endsWith('none.md')) }, 'missing-description')).toMatchObject({ level: 'warning', line: 2 });
    expect(r.issues.find((i) => i.file.endsWith('short.md') && i.code === 'description-length')).toMatchObject({ line: 3 });
    expect(r.issues.find((i) => i.file.endsWith('long.md') && i.code === 'description-length')).toBeTruthy();
    for (const i of r.issues) expect(i.fix).toBeTruthy();
  });

  it('checks the heading outline', async () => {
    const d = await project({ a: `---\ntitle: A\n${GOOD_DESC}---\n\n# Other\n\ntext\n\n## One\n\ntext\n\n#### Deep\n\ntext\n\n## One\n\ntext\n\n# Second\n\ntext ${words(30)}\n` });
    const r = await runLint(d);
    expect(find(r, 'title-h1-mismatch')).toMatchObject({ line: 6 });
    expect(find(r, 'heading-skip')).toMatchObject({ line: 14 });
    expect(find(r, 'duplicate-heading')).toMatchObject({ line: 18 });
    expect(find(r, 'multiple-h1')).toMatchObject({ line: 22 });
  });

  it('does not flag the same heading text under different parents', async () => {
    const d = await project({ a: `---\ntitle: A\n${GOOD_DESC}---\n\n# A\n\n## Create\n\n### Request\n\n${words(20)}\n\n## Delete\n\n### Request\n\n${words(20)}\n` });
    expect(codes(await runLint(d))).not.toContain('duplicate-heading');
  });

  it('flags empty sections but not a parent heading directly followed by a child', async () => {
    const d = await project({ a: `---\ntitle: A\n${GOOD_DESC}---\n\n# A\n\n## Parent\n\n### Child\n\n${words(40)}\n\n## Empty\n\n## Next\n\ntext\n\n## Last\n` });
    const r = await runLint(d);
    const empties = r.issues.filter((i) => i.code === 'empty-section').map((i) => i.line);
    expect(empties).toEqual([14, 20]);
  });

  it('ignores headings and prose problems inside code', async () => {
    const d = await project({ a: `---\ntitle: A\n${GOOD_DESC}---\n\n# A\n\n${words(40)}\n\n\`\`\`bash\n# comment TODO\n#### not a heading\n\`\`\`\n\n<wc-code-block language="md">\n# Not a heading TODO\n[click here](x)\n</wc-code-block>\n\nUse \`TODO\` and \`[here](x)\` inline.\n` });
    expect(await runLint(d)).toMatchObject({ issues: [] });
  });

  it('flags code blocks without a language (fences and wc-code-block)', async () => {
    const d = await project({ a: `---\ntitle: A\n${GOOD_DESC}---\n\n# A\n\n${words(40)}\n\n\`\`\`\nplain\n\`\`\`\n\n<wc-code-block>\nx\n</wc-code-block>\n\n~~~js\nok\n~~~\n` });
    const r = await runLint(d);
    expect(r.issues.filter((i) => i.code === 'code-no-language').map((i) => i.line)).toEqual([10, 14]);
  });

  it('flags images without alt and vague links', async () => {
    const d = await project({ a: `---\ntitle: A\n${GOOD_DESC}---\n\n# A\n\n${words(40)}\n\n![](a.png) ![ok](b.png) <img src="c.png">\n\n[click here](x) and [here](y) and [https://a.com](https://a.com) and [the guide](g) and [\`code\`](c)\n` });
    const r = await runLint(d);
    expect(r.issues.filter((i) => i.code === 'image-missing-alt').map((i) => i.line)).toEqual([10, 10]);
    expect(r.issues.filter((i) => i.code === 'link-text-vague')).toHaveLength(3);
  });

  it('flags TODO markers, raw html, long paragraphs and callout overuse', async () => {
    const callouts = Array.from({ length: 6 }, () => '<wc-callout type="info">\nNote.\n</wc-callout>\n').join('\n');
    const d = await project({ a: `---\ntitle: A\n${GOOD_DESC}---\n\n# A\n\nThis is TODO text. ${words(20)}\n\n<div>x</div>\n\n${words(160)}\n\n${callouts}` });
    const r = await runLint(d);
    expect(find(r, 'todo-marker')).toMatchObject({ line: 8 });
    expect(find(r, 'raw-html-block')).toMatchObject({ level: 'info', line: 10 });
    expect(find(r, 'long-paragraph')).toMatchObject({ line: 12 });
    expect(find(r, 'callout-overuse').level).toBe('info');
  });

  it('checks page length with configurable thresholds', async () => {
    const pages = { long: `---\ntitle: L\n${GOOD_DESC}---\n\n# L\n\n${words(3000)}\n`, short: `---\ntitle: S\n${GOOD_DESC}---\n\n# S\n\nTiny.\n` };
    const d = await project(pages);
    const r = await runLint(d);
    expect(find(r, 'page-too-long')).toMatchObject({ level: 'warning' });
    expect(find(r, 'page-too-short')).toMatchObject({ level: 'info' });
    const d2 = await project(pages, { lint: { rules: { 'page-too-long': { level: 'error', max: 5000 }, 'page-too-short': 'off' } } });
    const r2 = await runLint(d2);
    expect(codes(r2)).not.toContain('page-too-long');
    expect(codes(r2)).not.toContain('page-too-short');
    const d3 = await project(pages, { lint: { rules: { 'page-too-long': { level: 'error', max: 100 } } } });
    const r3 = await runLint(d3);
    expect(r3.ok).toBe(false);
    expect(find(r3, 'page-too-long').level).toBe('error');
  });

  it('reports invalid lint config without crashing', async () => {
    const d = await project({ a: `---\ntitle: A\n${GOOD_DESC}---\n\n# A\n\n${words(40)}\n` }, { lint: { rules: { nonsense: 'off', 'page-too-long': 'loud' } } });
    const r = await runLint(d);
    expect(r.issues.filter((i) => i.code === 'lint-config-invalid')).toHaveLength(2);
  });

  it('supports file-level and next-line disable comments', async () => {
    const d = await project({
      a: `---\ntitle: A\n---\n<!-- docslit-lint-disable missing-description, page-too-short -->\n\n# A\n\ntiny\n`,
      b: `---\ntitle: B\n${GOOD_DESC}---\n\n# B\n\n${words(40)}\n\n<!-- docslit-lint-disable-next-line code-no-language -->\n\`\`\`\nx\n\`\`\`\n\n\`\`\`\ny\n\`\`\`\n`,
    });
    const r = await runLint(d);
    expect(codes(r, 'a.md')).toEqual([]);
    expect(r.issues.filter((i) => i.file.endsWith('b.md')).map((i) => [i.code, i.line])).toEqual([['code-no-language', 15]]);
  });

  it('applies only content rules to docs/_reusables and skips redirects', async () => {
    const d = await project({
      '_reusables/snip': '## Part\n\ntext\n\n```\nx\n```\n',
      moved: '---\ntitle: Moved\nredirect: /a\n---\n',
    });
    const r = await runLint(d);
    expect(codes(r)).toEqual(['code-no-language']);
    expect(r.summary.pages).toBe(1);
  });

  it('strict mode fails on warnings only', async () => {
    const d = await project({ a: `---\ntitle: A\n---\n\n# A\n\n${words(40)}\n` });
    expect((await runLint(d)).ok).toBe(true);
    expect((await runLint(d, { strict: true })).ok).toBe(false);
  });

  it('every rule has a default level and a fix', () => {
    for (const [code, def] of Object.entries(LINT_RULES)) {
      expect(code).toMatch(/^[a-z]+(-[a-z0-9]+)*$/);
      expect(['info', 'warning', 'error']).toContain(def.level);
    }
  });

  it('CLI --format json prints only JSON', async () => {
    const d = await project({ a: `---\ntitle: A\n---\n\n# A\n\n${words(40)}\n` });
    const out = await new Promise((resolve) => execFile('node', [BIN, 'lint', d, '--format', 'json'], (err, stdout) => resolve({ code: err ? err.code : 0, stdout })));
    expect(out.code).toBe(0);
    expect(JSON.parse(out.stdout).issues[0].code).toBe('missing-description');
  });
});
