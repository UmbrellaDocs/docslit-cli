import { describe, it, expect } from 'vitest';
import { buildComponents } from './index.js';

// _inlineMd lives inside the generated components bundle (a string), so pull the
// helper source out of the build output and evaluate it on its own.
function loadInlineMd() {
  const src = buildComponents();
  const start = src.indexOf('function _safeHref(');
  const end = src.indexOf('\n}\n', src.indexOf('function _inlineMd(')) + 2;
  expect(start).toBeGreaterThan(-1);
  return new Function(`${src.slice(start, end)}\nreturn _inlineMd;`)();
}

const md = loadInlineMd();

describe('_inlineMd', () => {
  it('renders safe links', () => {
    expect(md('see [docs](https://example.com/a?b=1#c)')).toBe(
      'see <a href="https://example.com/a?b=1#c" target="_blank" rel="noopener">docs</a>',
    );
    expect(md('[rel](../guide/intro)')).toContain('href="../guide/intro"');
    expect(md('[frag](#auth)')).toContain('href="#auth"');
    expect(md('[mail](mailto:a@b.c)')).toContain('href="mailto:a@b.c"');
    expect(md('[q](/search?q=a:b)')).toContain('href="/search?q=a:b"');
  });

  it('drops dangerous link schemes and keeps the label as text', () => {
    for (const url of [
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      'java\tscript:alert(1)',
      ' javascript:alert(1)',
      'data:text/html,<b>x</b>',
      'vbscript:msgbox',
    ]) {
      const out = md(`[click](${url})`);
      expect(out, url).not.toContain('<a');
      expect(out, url).toContain('click');
    }
  });

  it('cannot break out of the href attribute', () => {
    const out = md('[x](https://a" onmouseover="alert(1))');
    expect(out).not.toContain('" onmouseover');
    expect(out).toContain('&quot;');
  });

  it('escapes HTML and quotes in plain text', () => {
    expect(md(`<img src=x onerror="y"> it's`)).toBe('&lt;img src=x onerror=&quot;y&quot;&gt; it&#39;s');
  });

  it('keeps inline formatting', () => {
    expect(md('`code` **bold** *em*')).toBe('<code>code</code> <strong>bold</strong> <em>em</em>');
  });
});
