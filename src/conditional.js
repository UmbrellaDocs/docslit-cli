/**
 * Build-time conditional content: `<wc-if ...>...</wc-if>`.
 *
 * Evaluated while the page is preprocessed (before Markdown), so excluded content never reaches
 * the HTML, the search index or the generated `.md` / llms output.
 *
 *   version="1.0,2.0"        DOCSLIT_VERSION (the versioned build being rendered) is one of these
 *   locale="fr"              page lives under docs.<locale>/ (or DOCSLIT_LOCALE equals it; the default locale is "en")
 *   attr="PLAN" equals="pro" an `attributes` variable (docslit.json or page frontmatter); `attr` alone = set and not
 *                            "", "false" or "0"; also `not-equals`
 *   not                      invert the version / locale / attr condition
 *   for="humans|agents"      audience: "humans" content is dropped from the agent Markdown (.md, llms),
 *                            "agents" content appears ONLY in the agent Markdown
 *
 * All given conditions must hold (AND). Content inside fenced code / inline code is never touched.
 */

const OPEN_RE = /<wc-if\b([^>]*)>/gi;
const CLOSE_RE = /<\/wc-if\s*>/gi;
const KNOWN = new Set(['version', 'locale', 'attr', 'equals', 'not-equals', 'not', 'for']);

function parseAttrs(text = '') {
  const out = {};
  const re = /([:@\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g;
  let m;
  while ((m = re.exec(text))) out[m[1].toLowerCase()] = m[2] ?? m[3] ?? '';
  return out;
}

const mask = (s) => s
  .replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1[ \t]*$/gm, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/<wc-code-block[\s\S]*?<\/wc-code-block>/g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/`[^`\n]+`/g, (m) => ' '.repeat(m.length));

const list = (v) => String(v || '').split(',').map((s) => s.trim()).filter(Boolean);

export function localeOf(pagePath, attrs = {}) {
  const m = pagePath && /[\\/]docs\.([A-Za-z]{2,3}(?:-[A-Za-z0-9]+)?)[\\/]/.exec(String(pagePath));
  if (m) return m[1];
  return attrs.DOCSLIT_LOCALE || attrs.DOCSLIT_DEFAULT_LOCALE || 'en';
}

/** Does this `<wc-if>` (parsed attrs) pass for the build context? mode: 'html' | 'agent'. */
export function conditionHolds(a, ctx, mode = 'html') {
  const aud = (a.for || '').toLowerCase();
  if (aud === 'agents' && mode !== 'agent') return false;
  if (aud === 'humans' && mode === 'agent') return false;
  let ok = true;
  if (a.version !== undefined) ok = ok && list(a.version).includes(String(ctx.version ?? 'unversioned'));
  if (a.locale !== undefined) ok = ok && list(a.locale).includes(String(ctx.locale ?? 'en'));
  if (a.attr !== undefined) {
    const v = ctx.attributes?.[a.attr];
    if (a.equals !== undefined) ok = ok && list(a.equals).includes(String(v));
    else if (a['not-equals'] !== undefined) ok = ok && !list(a['not-equals']).includes(String(v));
    else ok = ok && v !== undefined && !['', 'false', '0'].includes(String(v).toLowerCase());
  }
  const hasCond = a.version !== undefined || a.locale !== undefined || a.attr !== undefined;
  if (a.not !== undefined && hasCond) ok = !ok;
  return ok;
}

/**
 * @returns {{ content: string, warnings: {message:string,line:number|null}[] }}
 */
export function evaluateConditionals(content, ctx = {}, mode = 'html') {
  const src = String(content);
  if (!/<wc-if\b/i.test(src)) return { content: src, warnings: [] };
  const masked = mask(src);
  const events = [];
  for (const m of masked.matchAll(OPEN_RE)) events.push({ type: 'open', index: m.index, end: m.index + m[0].length, attrs: src.slice(m.index + 6, m.index + m[0].length - 1) });
  for (const m of masked.matchAll(CLOSE_RE)) events.push({ type: 'close', index: m.index, end: m.index + m[0].length });
  events.sort((x, y) => x.index - y.index);

  const warnings = [];
  const lineOf = (i) => src.slice(0, i).split('\n').length;
  const ops = []; // { start, end, replacement } for outermost decisions only
  const stack = [];
  for (const ev of events) {
    if (ev.type === 'open') {
      const a = parseAttrs(ev.attrs.replace(/\/\s*$/, ''));
      for (const k of Object.keys(a)) if (!KNOWN.has(k)) warnings.push({ line: lineOf(ev.index), message: `wc-if: unsupported condition "${k}" (supported: ${[...KNOWN].join(', ')})` });
      stack.push({ ev, a, drop: false });
      continue;
    }
    const open = stack.pop();
    if (!open) { warnings.push({ line: lineOf(ev.index), message: 'wc-if: stray </wc-if>' }); continue; }
    const keep = conditionHolds(open.a, ctx, mode);
    // An outer drop already removes everything inside, so only record ops when no enclosing wc-if exists
    // or the enclosing one is kept (decisions are applied innermost-first by position below).
    ops.push({ start: open.ev.index, end: ev.end, innerStart: open.ev.end, innerEnd: ev.index, keep, depth: stack.length });
  }
  for (const o of stack) warnings.push({ line: lineOf(o.ev.index), message: 'wc-if is not closed' });

  // Apply: walk ops in source order, skipping ops nested inside a dropped range, unwrapping kept ones.
  ops.sort((x, y) => x.start - y.start || y.end - x.end);
  let out = '';
  let pos = 0;
  const emit = (from, to, list) => {
    let p = from;
    for (const o of list) {
      if (o.start < p || o.end > to) continue;
      out += src.slice(p, o.start);
      if (o.keep) {
        const nested = list.filter((n) => n !== o && n.start >= o.innerStart && n.end <= o.innerEnd);
        const save = out; out = '';
        emit(o.innerStart, o.innerEnd, nested);
        out = save + out.replace(/^\n+/, '\n').replace(/\n+$/, '\n');
      } else {
        out += '\n';
      }
      p = o.end;
    }
    out += src.slice(p, to);
  };
  emit(0, src.length, ops);
  return { content: out, warnings };
}
