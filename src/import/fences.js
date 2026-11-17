// Code-fence conversion (Mintlify / Fern meta -> DocsLit meta). See parity/code-mapping.md.
// Most fences are already understood by src/code-meta.js and are returned unchanged.

const OPEN_RE = /^(\s*)(`{3,}|~{3,})[ \t]*([^\s{]*)(.*)$/;
const WORD_RE = /[ \t]*(?:\/\/|#|\/\*|<!--|--)[ \t]*\[!code word:[^\]]*\][ \t]*(?:\*\/|-->)?/g;

export function convertFence(text, { vendor, report = () => {}, count = () => {} } = {}) {
  const lines = text.split('\n');
  const m = OPEN_RE.exec(lines[0]);
  if (!m) return text;
  const indent = m[1];
  const fence = m[2];
  let lang = m[3];
  let meta = m[4].trim();

  if (lang === 'nocopy') { lang = 'text'; meta = ['nocopy', meta].filter(Boolean).join(' '); }

  if (/\btheme=\{null\}/.test(meta)) meta = meta.replace(/\s*\btheme=\{null\}/g, '');
  if (/(^|\s)twoslash(\s|$)/.test(meta)) {
    meta = meta.replace(/(^|\s)twoslash(?=\s|$)/g, '').trim();
    report('info', 'code-twoslash-dropped', 'Twoslash type hovers are not supported; the block renders as plain highlighted code.', {
      action: 'Dropped the `twoslash` flag.', fix: 'None needed (hover annotations are lost).' });
  }

  if (vendor === 'fern' && !/^(mermaid|math)$/i.test(lang)) {
    const off = /\bshowLineNumbers=\{false\}|\bshowLineNumbers="false"/.test(meta);
    if (off) meta = meta.replace(/\s*\bshowLineNumbers=(\{false\}|"false")/g, '');
    else {
      meta = meta.replace(/\bshowLineNumbers(?:=\{true\}|="true")?/g, 'lines');
      if (!/(^|\s)lines(\s|$|=)/.test(meta)) meta = (meta + ' lines').trim();
    }
    count('code block (Fern default line numbers)', 'lines');
  }

  let wordHits = 0;
  const body = lines.slice(1).map((l) => {
    if (!l.includes('[!code word:')) return l;
    wordHits++;
    return l.replace(WORD_RE, '');
  });
  if (wordHits) report('info', 'code-word-highlight-dropped', '`[!code word:…]` highlights are not supported.', {
    action: `Removed ${wordHits} marker comment(s) so they do not show in the code.`, fix: 'None needed.' });

  const open = `${indent}${fence}${lang}${meta ? ' ' + meta.replace(/\s+/g, ' ').trim() : ''}`;
  return [open, ...body].join('\n');
}
