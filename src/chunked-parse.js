// Chunked Markdown parsing for very large pages.
//
// micromark is superlinear in input size (an 800 KB changelog costs seconds per parse), so
// huge bodies are split at top-level ATX headings and parsed piecewise. Each chunk's node
// positions are shifted by the chunk's starting line so line numbers match an unchunked
// parse. A split is only made where it cannot change how the Markdown parses:
//   - the heading is at column 0, preceded by a blank line (so it cannot be a continuation
//     of an HTML block or a lazy paragraph line),
//   - it is outside fenced code and outside open HTML comments / <pre>/<script>/<style>,
//   - the document has no link reference definitions or footnote definitions (those resolve
//     across the whole document, so any such file is parsed whole).

export const CHUNK_THRESHOLD = 150 * 1024; // bodies larger than this are chunked
export const CHUNK_TARGET = 64 * 1024;     // minimum size of a chunk before the next split

const ATX_RE = /^#{1,6}(?:[ \t]|$)/;
const DEF_RE = /^ {0,3}\[[^\]\n]+\]:/m;
const FENCE_RE = /^ {0,}(`{3,}|~{3,})/;
const RAW_OPEN_RE = /<(pre|script|style|textarea)(?:[\s>]|$)/gi;
const RAW_CLOSE_RE = /<\/(pre|script|style|textarea)\s*>/gi;

/**
 * Split `src` into [{ text, lineOffset }] (lineOffset = number of lines before the chunk),
 * or null when the source is small or unsafe to split.
 */
export function splitAtHeadings(src, { threshold = CHUNK_THRESHOLD, target = CHUNK_TARGET } = {}) {
  if (!src || src.length <= threshold) return null;
  if (DEF_RE.test(src)) return null;
  const lines = src.split('\n');
  const starts = []; // line indexes where a new chunk begins
  let fence = null; // { ch, len }
  let inComment = false;
  let rawDepth = 0;
  let size = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!fence && !inComment && rawDepth === 0 && i > 0 && size >= target &&
        ATX_RE.test(line) && lines[i - 1].trim() === '') {
      starts.push(i);
      size = 0;
    }
    size += line.length + 1;
    const f = FENCE_RE.exec(line);
    if (fence) {
      if (f && f[1][0] === fence.ch && f[1].length >= fence.len &&
          line.slice(f.index + f[0].length).trim() === '') fence = null;
    } else if (f) {
      fence = { ch: f[1][0], len: f[1].length };
    } else {
      // HTML comment / raw-text element state (only tracked outside fences)
      let idx = 0;
      for (;;) {
        const o = inComment ? line.indexOf('-->', idx) : line.indexOf('<!--', idx);
        if (o < 0) break;
        inComment = !inComment;
        idx = o + (inComment ? 4 : 3);
      }
      const opens = (line.match(RAW_OPEN_RE) || []).length;
      const closes = (line.match(RAW_CLOSE_RE) || []).length;
      rawDepth = Math.max(0, rawDepth + opens - closes);
    }
  }
  if (!starts.length) return null;
  const chunks = [];
  let prev = 0;
  for (const s of [...starts, lines.length]) {
    const text = lines.slice(prev, s).join('\n') + (s < lines.length ? '\n' : '');
    chunks.push({ text, lineOffset: prev });
    prev = s;
  }
  return chunks;
}

function shiftLines(node, by) {
  const stack = [node];
  while (stack.length) {
    const n = stack.pop();
    const p = n.position;
    if (p) {
      if (p.start) p.start.line += by;
      if (p.end) p.end.line += by;
    }
    if (n.children) for (const c of n.children) stack.push(c);
  }
}

/**
 * Parse `src` with `parse` (string -> tree with a `children` array root). Large sources are
 * parsed in heading-delimited chunks whose children are concatenated under the first root.
 */
export function parseMaybeChunked(src, parse, opts) {
  const chunks = splitAtHeadings(src, opts);
  if (!chunks) return parse(src);
  let root = null;
  for (const { text, lineOffset } of chunks) {
    const tree = parse(text);
    if (lineOffset) shiftLines(tree, lineOffset);
    if (!root) root = tree;
    else root.children.push(...tree.children);
  }
  if (root.position) root.position.end = { ...root.position.end };
  return root;
}
