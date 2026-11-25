import { describe, it, expect } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { getComponentManifest, getComponent, listComponentTags } from './component-manifest.js';
import { runValidation } from './validate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COMPONENTS_DIR = path.join(__dirname, 'components');

// Compile-time tags handled by the preprocessor rather than a custom element.
const COMPILE_TIME_TAGS = ['wc-include', 'wc-if'];

function readComponentSources() {
  return fs.readdirSync(COMPONENTS_DIR)
    .filter((f) => f.endsWith('.js') && f !== 'index.js')
    .map((f) => ({ file: f, src: fs.readFileSync(path.join(COMPONENTS_DIR, f), 'utf8') }));
}

function definedTags() {
  const tags = new Set();
  for (const { src } of readComponentSources()) {
    for (const m of src.matchAll(/customElements\.define\(\s*['"](wc-[a-z0-9-]+)['"]/g)) tags.add(m[1]);
  }
  return tags;
}

/** Public (non-state, non-underscore) attribute names from `static properties={...}` per class. */
function litAttributesByTag() {
  const out = new Map();
  for (const { src } of readComponentSources()) {
    for (const def of src.matchAll(/customElements\.define\(\s*['"](wc-[a-z0-9-]+)['"]\s*,\s*(?:_lazy\(\s*)?([A-Za-z0-9_]+)\s*\)?\s*\)/g)) {
      const [, tag, cls] = def;
      const classStart = src.indexOf(`class ${cls} `);
      if (classStart === -1) continue;
      const propsStart = src.indexOf('static properties=', classStart);
      const nextClass = src.indexOf('\nclass ', classStart + 1);
      if (propsStart === -1 || (nextClass !== -1 && propsStart > nextClass)) { out.set(tag, []); continue; }
      const open = src.indexOf('{', propsStart);
      let depth = 0; let end = open;
      for (let i = open; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
      }
      const body = src.slice(open + 1, end);
      const names = [];
      let i = 0;
      while (i < body.length) {
        const km = /^\s*,?\s*(?:'([^']+)'|"([^"]+)"|([A-Za-z_$][\w$]*))\s*:\s*/.exec(body.slice(i));
        if (!km) break;
        const key = km[1] || km[2] || km[3];
        i += km[0].length;
        let value = '';
        if (body[i] === '{') {
          let d = 0; let j = i;
          for (; j < body.length; j++) {
            if (body[j] === '{') d++;
            else if (body[j] === '}') { d--; if (d === 0) { j++; break; } }
          }
          value = body.slice(i, j); i = j;
        }
        if (key.startsWith('_') || /state\s*:\s*true/.test(value)) continue;
        const attrMatch = /attribute\s*:\s*'([^']+)'/.exec(value);
        names.push(attrMatch ? attrMatch[1] : key.toLowerCase());
      }
      out.set(tag, names);
    }
  }
  return out;
}

describe('component manifest', () => {
  const manifest = getComponentManifest();
  const tags = listComponentTags();

  it('covers every custom element defined in src/components', () => {
    const missing = [...definedTags()].filter((t) => !tags.includes(t));
    expect(missing).toEqual([]);
  });

  it('includes compile-time tags and has no stale entries', () => {
    const known = new Set([...definedTags(), ...COMPILE_TIME_TAGS]);
    for (const t of COMPILE_TIME_TAGS) expect(tags).toContain(t);
    expect(tags.filter((t) => !known.has(t))).toEqual([]);
  });

  it('has unique tags', () => {
    expect(new Set(tags).size).toBe(tags.length);
  });

  it('gives every entry a category, description, content, attributes and example', () => {
    for (const c of manifest) {
      expect(c.tag, c.tag).toMatch(/^wc-[a-z0-9-]+$/);
      expect(c.category, c.tag).toBeTruthy();
      expect(c.description.length, c.tag).toBeGreaterThan(10);
      expect(c.content, c.tag).toBeTruthy();
      expect(Array.isArray(c.attributes), c.tag).toBe(true);
      expect(c.example.trim().length, c.tag).toBeGreaterThan(0);
      for (const a of c.attributes) {
        expect(a.name, c.tag).toBeTruthy();
        expect(a.type, `${c.tag}.${a.name}`).toBeTruthy();
        expect(a.description, `${c.tag}.${a.name}`).toBeTruthy();
      }
    }
  });

  it('only references known tags in examples, parents and children', () => {
    const known = new Set(tags);
    for (const c of manifest) {
      const used = [...c.example.matchAll(/<(wc-[a-z0-9-]+)/g)].map((m) => m[1]);
      expect(used.length, `${c.tag} example uses its own tag`).toBeGreaterThan(0);
      for (const u of used) expect(known.has(u), `${c.tag} example uses unknown ${u}`).toBe(true);
      for (const r of [...(c.parents || []), ...(c.children || [])]) {
        expect(known.has(r), `${c.tag} references unknown ${r}`).toBe(true);
      }
    }
  });

  it('lists every public Lit property of each component as an attribute', () => {
    const lit = litAttributesByTag();
    const problems = [];
    for (const c of manifest) {
      const declared = lit.get(c.tag);
      if (!declared) continue;
      const attrNames = new Set(c.attributes.map((a) => a.name));
      for (const name of declared) {
        if (!attrNames.has(name)) problems.push(`${c.tag} is missing attribute "${name}"`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('documents every attribute a component reads via getAttribute/hasAttribute', () => {
    // Lit `static properties` only covers reactive properties. Attributes read
    // imperatively (e.g. `sync` on wc-tabs / wc-code-group, `cols` on wc-grid) are
    // invisible to that scan, so also scan the literal names passed to
    // getAttribute()/hasAttribute() in component source. Child reads (wc-tabs
    // reading each wc-tab's `label`) count as long as SOME manifest entry
    // documents the name; `this.getAttribute(..)` reads must be documented on the
    // component's own entry.
    const GLOBAL = new Set(['id', 'class', 'style', 'slot']);
    const documented = new Set(manifest.flatMap((c) => c.attributes.map((a) => a.name)));
    const problems = [];
    for (const { file, src } of readComponentSources()) {
      for (const m of src.matchAll(/(?:\b(this)|[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\.(?:get|has)Attribute\(\s*['"]([^'"]+)['"]/g)) {
        const name = m[2];
        if (GLOBAL.has(name)) continue;
        if (!documented.has(name)) problems.push(`${file}: reads attribute "${name}" but no manifest entry documents it`);
        if (m[1]) {
          // Find the enclosing custom element class and make sure it lists the attribute.
          const before = src.slice(0, m.index);
          const cls = [...before.matchAll(/\nclass\s+([A-Za-z0-9_]+)\s+extends/g)].pop()?.[1];
          const tag = cls && [...src.matchAll(new RegExp(`customElements\\.define\\(\\s*['"](wc-[a-z0-9-]+)['"]\\s*,\\s*(?:_lazy\\(\\s*)?${cls}\\s*\\)?\\s*\\)`, 'g'))][0]?.[1];
          const entry = tag && manifest.find((c) => c.tag === tag);
          if (entry && !entry.attributes.some((a) => a.name === name)) problems.push(`${file}: ${tag} reads this.getAttribute("${name}") but does not document it`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('getComponent resolves tags with or without the wc- prefix', () => {
    expect(getComponent('wc-callout').tag).toBe('wc-callout');
    expect(getComponent('callout').tag).toBe('wc-callout');
    expect(getComponent('nope')).toBeNull();
  });

  it('every example validates without errors or unknown components', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'docslit-manifest-'));
    try {
      await fs.ensureDir(path.join(dir, 'docs', '_reusables'));
      await fs.writeFile(path.join(dir, 'docs', '_reusables', 'snippet.md'), 'Reusable text.\n');
      const slugs = [];
      for (const c of manifest) {
        const slug = c.tag.replace(/^wc-/, '');
        slugs.push(slug);
        await fs.writeFile(path.join(dir, 'docs', `${slug}.md`),
          `---\ntitle: ${c.tag}\n---\n\n# ${c.tag}\n\n${c.example}\n`);
      }
      await fs.writeJson(path.join(dir, 'docslit.json'), { name: 't', sidebar: [{ group: 'All', pages: slugs }] });
      const result = await runValidation(dir);
      const bad = result.issues.filter((i) => i.level === 'error' || i.code === 'unknown-component');
      expect(bad).toEqual([]);
    } finally {
      await fs.remove(dir);
    }
  });
});
