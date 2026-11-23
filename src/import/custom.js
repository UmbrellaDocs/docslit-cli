// Static conversion of simple pure-markup React components (export const X = (props) => <div>…</div>)
// into reusable Markdown/HTML snippets. Anything dynamic returns null.
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function componentFromEstree(init, src) {
  let params = [];
  let body;
  if (!init) return null;
  if (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression' || init.type === 'FunctionDeclaration') {
    params = init.params || [];
    body = init.body;
    if (body.type === 'BlockStatement') {
      const stmts = body.body.filter((s) => s.type !== 'EmptyStatement');
      if (stmts.length !== 1 || stmts[0].type !== 'ReturnStatement') return null;
      body = stmts[0].argument;
    }
  } else return null;
  const propNames = new Set();
  let propsId = null;
  const p0 = params[0];
  if (p0) {
    if (p0.type === 'ObjectPattern') {
      for (const pr of p0.properties) { if (pr.type !== 'Property' || pr.value.type !== 'Identifier') return null; propNames.add(pr.value.name); }
    } else if (p0.type === 'Identifier') propsId = p0.name;
    else return null;
  }
  const used = new Set();
  const expr = (e) => {
    if (e.type === 'Identifier' && propNames.has(e.name)) { used.add(e.name); return e.name === 'children' ? null : `{{${e.name}}}`; }
    if (e.type === 'MemberExpression' && propsId && e.object.type === 'Identifier' && e.object.name === propsId && !e.computed) { used.add(e.property.name); return e.property.name === 'children' ? null : `{{${e.property.name}}}`; }
    if (e.type === 'Literal' && typeof e.value === 'string') return esc(e.value);
    return null;
  };
  const jsx = (n) => {
    if (n.type === 'JSXText') return esc(n.value.replace(/\s+/g, ' '));
    if (n.type === 'JSXExpressionContainer') { if (n.expression.type === 'JSXEmptyExpression') return ''; return expr(n.expression); }
    if (n.type === 'JSXFragment') { const parts = n.children.map(jsx); return parts.some((x) => x === null) ? null : parts.join(''); }
    if (n.type !== 'JSXElement') return null;
    const name = n.openingElement.name;
    if (name.type !== 'JSXIdentifier' || !/^[a-z]/.test(name.name)) return null;
    let attrs = '';
    for (const a of n.openingElement.attributes) {
      if (a.type !== 'JSXAttribute') return null;
      const k = a.name.name === 'className' ? 'class' : a.name.name === 'htmlFor' ? 'for' : a.name.name;
      if (a.value == null) { attrs += ` ${k}`; continue; }
      if (a.value.type === 'Literal') { attrs += ` ${k}="${String(a.value.value).replace(/"/g, '&quot;')}"`; continue; }
      if (a.value.type === 'JSXExpressionContainer') {
        const e = a.value.expression;
        if (k === 'style' && e.type === 'ObjectExpression') {
          const css = e.properties.map((p) => (p.type === 'Property' && p.value.type === 'Literal' ? `${(p.key.name || p.key.value).replace(/([A-Z])/g, '-$1').toLowerCase()}: ${p.value.value}` : null));
          if (css.includes(null)) return null;
          attrs += ` style="${css.join('; ')}"`; continue;
        }
        const v = expr(e);
        if (v == null) return null;
        attrs += ` ${k}="${v}"`; continue;
      }
      return null;
    }
    const kids = n.children.map(jsx);
    if (kids.some((x) => x === null)) return null;
    const selfClosing = n.openingElement.selfClosing || (!kids.length && ['img', 'br', 'hr', 'input'].includes(name.name));
    if (selfClosing) return `<${name.name}${attrs} />`;
    return `<${name.name}${attrs}>${kids.join('')}</${name.name}>`;
  };
  const html = jsx(body);
  if (html == null || used.has('children')) return null;
  return { html, props: [...used] };
}
