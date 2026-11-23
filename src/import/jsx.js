// Small helpers for reading JSX attribute values and ESTree literals out of an
// MDX AST (remark-mdx). Everything here is pure.

/** Marker objects for values that cannot be reduced to plain JS data. */
export const isJsx = (v) => v && typeof v === 'object' && '__jsx' in v;
export const isExpr = (v) => v && typeof v === 'object' && '__expr' in v;

/** Evaluate a literal-ish ESTree expression. JSX and anything dynamic become marker objects. */
export function evalEstree(n, src) {
  if (!n) return { __expr: '' };
  const raw = () => src.slice(n.start, n.end);
  switch (n.type) {
    case 'Literal': return n.value === null ? null : n.value;
    case 'TemplateLiteral':
      if (n.expressions.length === 0) return n.quasis.map((q) => q.value.cooked ?? q.value.raw).join('');
      return { __expr: raw() };
    case 'ArrayExpression': return n.elements.map((e) => (e ? evalEstree(e, src) : null));
    case 'ObjectExpression': {
      const o = {};
      for (const p of n.properties) {
        if (p.type !== 'Property') return { __expr: raw() };
        const k = p.key.type === 'Identifier' ? p.key.name : p.key.value;
        o[k] = evalEstree(p.value, src);
      }
      return o;
    }
    case 'UnaryExpression': {
      const v = evalEstree(n.argument, src);
      if (n.operator === '-' && typeof v === 'number') return -v;
      if (n.operator === '!' && typeof v === 'boolean') return !v;
      return { __expr: raw() };
    }
    case 'Identifier':
      if (n.name === 'undefined') return undefined;
      return { __expr: n.name };
    case 'JSXElement':
    case 'JSXFragment': return { __jsx: raw() };
    case 'ParenthesizedExpression': return evalEstree(n.expression, src);
    default: return { __expr: raw() };
  }
}

/** Props of an mdxJsx element as a plain object: strings, booleans, numbers, arrays, objects, markers. */
export function readProps(node, src) {
  const props = {};
  const order = [];
  const spreads = [];
  for (const a of node.attributes || []) {
    if (a.type === 'mdxJsxExpressionAttribute') { spreads.push(a.value); continue; }
    let v;
    if (a.value == null) v = true;
    else if (typeof a.value === 'string') v = a.value;
    else {
      const est = a.value.data?.estree;
      const expr = est?.body?.[0]?.expression;
      v = expr ? evalEstree(expr, src) : { __expr: a.value.value };
    }
    props[a.name] = v;
    order.push(a.name);
  }
  Object.defineProperty(props, '__order', { value: order, enumerable: false });
  Object.defineProperty(props, '__spreads', { value: spreads, enumerable: false });
  return props;
}

/** Scalar -> string used in an HTML attribute; arrays -> comma list. Returns undefined for "omit". */
export function attrString(v) {
  if (v === undefined || v === null || v === false) return undefined;
  if (v === true) return true;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') return v.replace(/\s*\n\s*/g, ' ').trim();
  if (Array.isArray(v)) {
    const parts = v.map((x) => (typeof x === 'string' || typeof x === 'number' ? String(x) : null));
    if (parts.some((x) => x === null)) return undefined;
    return parts.join(', ');
  }
  return undefined;
}

const escAttr = (s) => String(s);

/** Render ordered attributes object to ` a="b" c` (leading space when non-empty). */
export function renderAttrs(attrs) {
  let out = '';
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (v === true) { out += ` ${k}`; continue; }
    let s = escAttr(String(v).replace(/\r?\n/g, ' '));
    // &amp; double-escaping guard: keep already-escaped entities readable
    if (s.includes('"') && !s.includes("'")) out += ` ${k}='${s}'`;
    else out += ` ${k}="${s.replace(/"/g, '&quot;')}"`;
  }
  return out;
}

/** camelCase -> kebab-case */
export const kebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

/** React style object -> CSS string */
export function styleToCss(obj) {
  return Object.entries(obj).map(([k, v]) => {
    if (typeof v === 'number' && !/^(opacity|zIndex|flex|fontWeight|lineHeight)$/.test(k)) v = `${v}px`;
    const prop = k.startsWith('--') ? k : kebab(k).replace(/^(webkit|moz|ms)-/, '-$1-');
    return `${prop}: ${v}`;
  }).join('; ');
}

const SVG_ATTRS = /\b(stroke-?width|stroke-?linecap|stroke-?linejoin|fill-?rule|clip-?rule|stroke-?miterlimit|stroke-?dasharray|stroke-?dashoffset|stroke-?opacity|fill-?opacity|clip-?path|xlink:?href|font-?size|text-?anchor)\b/;

/** Convert a JSX `<svg …/>` source string to an HTML string, or null when it contains dynamic bits. */
export function jsxSvgToHtml(raw) {
  let s = raw.trim();
  if (!/^<svg[\s>]/.test(s)) return null;
  s = s.replace(/\bclassName=/g, 'class=').replace(/\bhtmlFor=/g, 'for=');
  s = s.replace(/\b([a-z]+[A-Z][A-Za-z]*)=/g, (m, name) => (SVG_ATTRS.test(kebab(name)) ? `${kebab(name)}=` : m));
  // numeric / literal expression values: attr={2} -> attr="2"
  s = s.replace(/=\{\s*(-?[\d.]+|"[^"]*"|'[^']*')\s*\}/g, (m, v) => `="${v.replace(/^["']|["']$/g, '')}"`);
  if (/\{|\}/.test(s)) return null;
  return s.replace(/\s*\n\s*/g, ' ');
}

/** Plain-text of mdast children (used for button/link labels). */
export function mdastText(node) {
  if (!node) return '';
  if (typeof node.value === 'string' && node.type !== 'mdxjsEsm') return node.value;
  return (node.children || []).map(mdastText).join('');
}
