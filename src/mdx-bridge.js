// MDX → DocsLit bridge.
//
// Shared by:
//   • src/markdown.js — runs at parse time so users can write Mintlify-style
//     PascalCase tags directly in their .md files (drop-in MDX support).
//   • src/import.js   — runs once on import; reuses the same map and parser.
//
// Two layers of conversion:
//   Layer 1 — explicit COMPONENT_MAP entries (e.g. <Tip> → <wc-callout type="tip">).
//   Layer 2 — convention fallback: any unmapped PascalCase tag becomes
//             <wc-pascal-case>. Disable via { conventionFallback: false }.

// ─── Font Awesome → built-in Lucide icon name mapping ────────────────────────
// Icons not in this map are kept as-is and fetched from FA CDN at runtime.
export const FA_TO_LUCIDE = {
  'check': 'check', 'check-circle': 'check', 'circle-check': 'check',
  'times': 'x', 'xmark': 'x', 'circle-xmark': 'x', 'times-circle': 'x',
  'exclamation-triangle': 'warning', 'triangle-exclamation': 'warning',
  'info-circle': 'info', 'circle-info': 'info',
  'exclamation-circle': 'error', 'circle-exclamation': 'error',
  'arrow-right': 'arrow-right', 'arrow-left': 'arrow-left',
  'arrow-up': 'arrow-up', 'arrow-down': 'arrow-down',
  'chevron-right': 'chevron-right', 'angle-right': 'chevron-right',
  'chevron-down': 'chevron-down', 'angle-down': 'chevron-down',
  'external-link': 'external-link', 'external-link-alt': 'external-link',
  'up-right-from-square': 'external-link', 'arrow-up-right-from-square': 'external-link',
  'link': 'link', 'chain': 'link',
  'copy': 'copy', 'clone': 'copy',
  'download': 'download', 'cloud-download': 'download', 'cloud-arrow-down': 'download',
  'code': 'code',
  'terminal': 'terminal',
  'file': 'file', 'file-alt': 'file', 'file-lines': 'file',
  'folder': 'folder', 'folder-open': 'folder',
  'search': 'search', 'magnifying-glass': 'search',
  'star': 'star',
  'bolt': 'zap', 'lightning': 'zap', 'zap': 'zap',
  'book': 'book', 'book-open': 'book',
  'cog': 'settings', 'gear': 'settings', 'sliders': 'settings',
  'sliders-h': 'settings', 'wrench': 'settings',
  'user': 'user', 'user-circle': 'user', 'circle-user': 'user',
  'home': 'home', 'house': 'home',
  'th-large': 'grid', 'grid': 'grid', 'table-cells-large': 'grid',
  'list': 'list', 'list-ul': 'list', 'bars': 'list',
  'eye': 'eye',
  'lock': 'lock',
  'box': 'package', 'cube': 'package', 'cubes': 'package',
  'globe': 'globe', 'earth-americas': 'globe', 'earth': 'globe',
  'microchip': 'cpu', 'chip': 'cpu',
  'rocket': 'zap', 'paper-plane': 'zap',
  'shield': 'lock', 'shield-alt': 'lock', 'shield-halved': 'lock',
  'plug': 'zap', 'power-off': 'zap',
  'envelope': 'file', 'mail': 'file',
};

// ─── Mintlify / common-MDX → DocsLit component map ───────────────────────────
// tag:         output wc-* tag (null = special handling)
// fixedAttrs:  attrs always written on the output tag
// passAttrs:   prop names to pass through from source
// attrRename:  { srcProp: destProp }
// unwrap:      drop the wrapper tag, keep its children verbatim
// flatten:     drop the tag, keep inner text content
// remove:      drop tag + all children
export const COMPONENT_MAP = {
  // ── Callouts ────────────────────────────────────────────────────────────────
  Note:    { tag: 'wc-callout', fixedAttrs: { type: 'info',    title: 'Note'    } },
  Info:    { tag: 'wc-callout', fixedAttrs: { type: 'info',    title: 'Info'    } },
  Warning: { tag: 'wc-callout', fixedAttrs: { type: 'warning', title: 'Warning' } },
  Danger:  { tag: 'wc-callout', fixedAttrs: { type: 'danger',  title: 'Danger'  } },
  Caution: { tag: 'wc-callout', fixedAttrs: { type: 'warning', title: 'Caution' } },
  Tip:     { tag: 'wc-callout', fixedAttrs: { type: 'tip',     title: 'Tip'     } },
  Check:   { tag: 'wc-callout', fixedAttrs: { type: 'success', title: 'Check'   } },
  Success: { tag: 'wc-callout', fixedAttrs: { type: 'success', title: 'Success' } },
  // ── Cards ────────────────────────────────────────────────────────────────────
  Card:      { tag: 'wc-card',  passAttrs: ['title', 'href', 'color'], attrRename: { icon: 'icon-name' } },
  CardGroup: { tag: 'wc-tiles', passAttrs: ['cols'] },
  // ── Tabs ─────────────────────────────────────────────────────────────────────
  Tabs: { tag: 'wc-tabs' },
  Tab:  { tag: 'wc-tab', attrRename: { title: 'label' }, passAttrs: ['label'] },
  // ── Accordion ────────────────────────────────────────────────────────────────
  Accordion:      { tag: 'wc-accordion', passAttrs: ['title'] },
  AccordionGroup: { tag: 'wc-accordion-group' },
  // ── Steps ────────────────────────────────────────────────────────────────────
  Steps: { tag: 'wc-steps' },
  Step:  { tag: 'wc-step', passAttrs: ['title'], autoNumber: true },
  // ── Code ─────────────────────────────────────────────────────────────────────
  CodeGroup: { tag: 'wc-code-group' },
  // ── Layout / media ───────────────────────────────────────────────────────────
  Frame:   { tag: 'wc-frame',   passAttrs: ['caption', 'type'] },
  Columns: { tag: 'wc-columns' },
  Column:  { tag: null, unwrap: true },
  Panel:   { tag: 'wc-panel',   passAttrs: ['title'] },
  // ── UI elements ──────────────────────────────────────────────────────────────
  Badge:      { tag: 'wc-badge',      passAttrs: ['variant', 'color'] },
  Expandable: { tag: 'wc-expandable', passAttrs: ['title', 'defaultOpen'] },
  Update:     { tag: 'wc-update',     passAttrs: ['label', 'date'] },
  // ── API reference ────────────────────────────────────────────────────────────
  // Mintlify ParamField/ResponseField → docslit wc-field. Users wrap groups in
  // <wc-fields> or <wc-response-fields> themselves (Mintlify has no analogue).
  ParamField:    { tag: 'wc-field',
                   passAttrs: ['name', 'type', 'required', 'optional', 'default'],
                   attrRename: { path: 'name', query: 'name', body: 'name', header: 'name' } },
  ResponseField: { tag: 'wc-field', passAttrs: ['name', 'type', 'required'] },
  // ── Tables ───────────────────────────────────────────────────────────────────
  AsciidocTable: {
    tag: 'wc-asciidoc-table',
    passAttrs: ['cols', 'options', 'format', 'separator', 'frame', 'grid', 'stripes', 'width', 'caption'],
  },
  // ── Unsupported (graceful degradation) ───────────────────────────────────────
  Tooltip: { tag: null, flatten: true },
  Icon:    { tag: null, remove: true },
  Snippet: { tag: null, flatten: true },
};

// ─── JSX prop parser ──────────────────────────────────────────────────────────
// Converts the raw attribute string from a JSX tag into structured { name, value } pairs.
// Handles: name="v", name='v', name={2}, name={true/false}, name={"str"}, bare `name`.
export function parseJSXProps(raw) {
  if (!raw || !raw.trim()) return [];
  const props = [];
  let i = 0;
  while (i < raw.length) {
    while (i < raw.length && /\s/.test(raw[i])) i++;
    if (i >= raw.length) break;
    const nameStart = i;
    while (i < raw.length && /[\w-]/.test(raw[i])) i++;
    const name = raw.slice(nameStart, i);
    if (!name) { i++; continue; }
    while (i < raw.length && raw[i] === ' ') i++;
    if (i >= raw.length || raw[i] !== '=') {
      props.push({ name, value: true, type: 'bool' });
      continue;
    }
    i++; // skip '='
    while (i < raw.length && raw[i] === ' ') i++;
    if (raw[i] === '"') {
      i++;
      const s = i;
      while (i < raw.length && raw[i] !== '"') i++;
      props.push({ name, value: raw.slice(s, i), type: 'string' });
      i++;
    } else if (raw[i] === "'") {
      i++;
      const s = i;
      while (i < raw.length && raw[i] !== "'") i++;
      props.push({ name, value: raw.slice(s, i), type: 'string' });
      i++;
    } else if (raw[i] === '{') {
      i++;
      const s = i;
      let depth = 1;
      while (i < raw.length && depth > 0) {
        if (raw[i] === '{') depth++;
        else if (raw[i] === '}') depth--;
        i++;
      }
      const expr = raw.slice(s, i - 1).trim();
      if (expr === 'true')          props.push({ name, value: true,  type: 'bool' });
      else if (expr === 'false')    props.push({ name, value: false, type: 'bool' });
      else if (/^\d+$/.test(expr)) props.push({ name, value: expr,  type: 'number' });
      else if (/^"([^"]*)"$/.test(expr)) props.push({ name, value: expr.slice(1,-1), type: 'string' });
      else if (/^'([^']*)'$/.test(expr)) props.push({ name, value: expr.slice(1,-1), type: 'string' });
      else props.push({ name, value: null, type: 'complex', raw: expr });
    } else {
      // Unknown value form — skip
      while (i < raw.length && !/\s/.test(raw[i])) i++;
    }
  }
  return props;
}

// Build an HTML attribute string from parsed props + component config.
export function buildAttrs(rawAttrStr, config) {
  const { fixedAttrs = {}, passAttrs = [], attrRename = {} } = config;
  const parts = [];

  // Fixed attrs always go first
  for (const [k, v] of Object.entries(fixedAttrs)) {
    parts.push(`${k}="${v}"`);
  }

  const allSourceNames = [...passAttrs, ...Object.keys(attrRename)];
  const parsed = parseJSXProps(rawAttrStr);

  for (const prop of parsed) {
    if (!allSourceNames.includes(prop.name)) continue;
    const dest = attrRename[prop.name] ?? prop.name;
    if (fixedAttrs[dest] !== undefined) continue; // already added as fixed

    if (prop.type === 'bool' && prop.value === false) continue;
    if (prop.type === 'bool' && prop.value === true)  { parts.push(dest); continue; }
    if (prop.type === 'complex' || prop.value === null) continue; // can't convert
    let val = prop.value;
    if (prop.name === 'icon' && typeof val === 'string') val = FA_TO_LUCIDE[val] || val;
    parts.push(`${dest}="${val}"`);
  }

  return parts.join(' ');
}

// PascalCase → wc-kebab-case.
//   CardGroup    → wc-card-group
//   MyAPIBlock   → wc-my-api-block
//   APIDocsCard  → wc-api-docs-card
export function pascalToWcKebab(name) {
  const kebab = name
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')   // ABCDef → ABC-Def
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')       // aB → a-B
    .toLowerCase();
  return `wc-${kebab}`;
}

// ─── Inline-code shielding ────────────────────────────────────────────────────
// Hide single-line backtick spans so we don't rewrite tags inside them.
// (Fenced ``` blocks are already extracted upstream in markdown.js.)
function shieldInlineCode(src) {
  const stash = [];
  const out = src.replace(/`[^`\n]+`/g, (m) => {
    stash.push(m);
    return `\x00MDXIC${stash.length - 1}\x00`;
  });
  return { out, stash };
}

function unshieldInlineCode(src, stash) {
  return src.replace(/\x00MDXIC(\d+)\x00/g, (_, i) => stash[Number(i)]);
}

// ─── Public: parse-time MDX rewrite ───────────────────────────────────────────
// Converts MDX-style PascalCase tags to the docslit wc-* equivalents in place.
//
// Options:
//   conventionFallback (default true)
//     true  — unmapped PascalCase tags are renamed via pascalToWcKebab.
//     false — unmapped PascalCase tags are left as-is (callers can warn on them).
export function rewriteMdxTags(src, { conventionFallback = true } = {}) {
  if (!src) return src;

  const { out: shielded, stash } = shieldInlineCode(src);
  let out = shielded;

  // ── Layer 1: explicit map components ──────────────────────────────────────
  for (const [name, cfg] of Object.entries(COMPONENT_MAP)) {
    const selfRe = new RegExp(`<${name}(\\s[^>]*?)?\\s*\\/\\s*>`, 'g');
    const pairRe = new RegExp(`<${name}(\\s[^>]*?)?>([\\s\\S]*?)<\\/${name}>`, 'gs');

    if (cfg.remove) {
      out = out.replace(selfRe, '');
      out = out.replace(pairRe, '');
      continue;
    }

    if (cfg.flatten || cfg.unwrap) {
      out = out.replace(selfRe, '');
      out = out.replace(pairRe, (_, _attrs, inner) => inner.trim());
      continue;
    }

    const { tag } = cfg;
    out = out.replace(selfRe, (_, rawAttrs) => {
      const attrs = buildAttrs(rawAttrs || '', cfg);
      return attrs ? `<${tag} ${attrs}></${tag}>` : `<${tag}></${tag}>`;
    });
    out = out.replace(pairRe, (_, rawAttrs, inner) => {
      const attrs = buildAttrs(rawAttrs || '', cfg);
      const trimmed = inner.trim();
      return attrs
        ? `<${tag} ${attrs}>\n${trimmed}\n</${tag}>`
        : `<${tag}>\n${trimmed}\n</${tag}>`;
    });
  }

  // Auto-number <wc-step> within each <wc-steps> block (Mintlify Step parity)
  out = out.replace(/<wc-steps>([\s\S]*?)<\/wc-steps>/g, (_, inner) => {
    let n = 0;
    const numbered = inner.replace(/<wc-step\b/g, () => `<wc-step n="${++n}"`);
    return `<wc-steps>${numbered}</wc-steps>`;
  });

  // ── Layer 2: convention fallback for unmapped PascalCase tags ─────────────
  if (conventionFallback) {
    const OPEN_RE  = /<([A-Z][A-Za-z0-9]*)(\s[^>]*?)?(\/?)>/g;
    const CLOSE_RE = /<\/([A-Z][A-Za-z0-9]*)\s*>/g;

    out = out.replace(OPEN_RE, (full, name, rawAttrs, selfClose) => {
      // Drop tags from special configs (remove/flatten/unwrap) that survived
      // because they were unpaired or otherwise unmatched.
      if (name in COMPONENT_MAP && !COMPONENT_MAP[name].tag) return '';
      const wcName = COMPONENT_MAP[name]?.tag || pascalToWcKebab(name);
      const attrStr = rawAttrs || '';
      return selfClose === '/'
        ? `<${wcName}${attrStr}></${wcName}>`
        : `<${wcName}${attrStr}>`;
    });

    out = out.replace(CLOSE_RE, (full, name) => {
      if (name in COMPONENT_MAP && !COMPONENT_MAP[name].tag) return '';
      const wcName = COMPONENT_MAP[name]?.tag || pascalToWcKebab(name);
      return `</${wcName}>`;
    });
  }

  return unshieldInlineCode(out, stash);
}

// ─── Public: detect PascalCase tags (for validate.js) ─────────────────────────
// Returns the unique set of PascalCase tag names found in src, ignoring fenced
// blocks and inline code spans.
export function findPascalTags(src) {
  if (!src) return new Set();
  const noFences = src.replace(/```[\s\S]*?```/g, '');
  const { out } = shieldInlineCode(noFences);
  const found = new Set();
  for (const m of out.matchAll(/<([A-Z][A-Za-z0-9]*)[\s/>]/g)) found.add(m[1]);
  return found;
}
