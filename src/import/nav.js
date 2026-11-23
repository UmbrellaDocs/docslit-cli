// Shared navigation helpers (page lookup, sidebar item building, OpenAPI expansion).
import fs from 'fs-extra';
import path from 'path';
import { loadSpec, getEndpoints } from '../openapi.js';

export const OP_RE = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|WEBHOOK|TRACE)\s+(\S.*)$/i;

export const iconOf = (icon, iconType) => {
  if (typeof icon !== 'string' || !icon) return undefined;
  if (/^[\w-]+$/.test(icon) && (iconType === 'brands' || iconType === 'regular')) return `fa-${iconType} fa-${icon}`;
  return icon;
};

export function findPageFile(sourceDir, id, bases = ['']) {
  const clean = String(id).replace(/^\/+/, '').replace(/\.(mdx?|md)$/i, '');
  for (const b of bases) {
    for (const c of [`${clean}.mdx`, `${clean}.md`, `${clean}/index.mdx`, `${clean}/index.md`]) {
      const rel = path.posix.join(b, c);
      if (fs.pathExistsSync(path.join(sourceDir, rel))) return rel;
    }
  }
  return null;
}

// ── OpenAPI page generation ────────────────────────────────────────────────────
function deriveOperationId(method, urlPath) {
  const parts = urlPath.split('/').filter(Boolean).map((p) => (p.startsWith('{') && p.endsWith('}') ? 'By' + p[1].toUpperCase() + p.slice(2, -1) : p[0].toUpperCase() + p.slice(1)));
  return method.toLowerCase() + parts.join('');
}
const toSlug = (id) => id.replace(/([a-z])([A-Z])/g, '$1-$2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2').replace(/[^A-Za-z0-9]+/g, '-').toLowerCase().replace(/^-|-$/g, '');
const yamlStr = (s) => JSON.stringify(String(s).split(/\r?\n/)[0]);

export class OpenApiPages {
  constructor(imp) { this.imp = imp; this.specs = new Map(); this.pages = new Map(); }

  async load(specRel) {
    if (this.specs.has(specRel)) return this.specs.get(specRel);
    let entry = null;
    try {
      const abs = path.join(this.imp.sourceDir, specRel);
      const spec = await loadSpec(abs);
      entry = { spec, endpoints: getEndpoints(spec) };
    } catch (e) {
      this.imp.report('error', 'openapi-spec-invalid', `OpenAPI spec "${specRel}" could not be loaded: ${String(e.message).split('\n')[0]}`, { file: specRel, action: 'API pages were not generated.', fix: 'Fix or replace the spec file, then run `docslit openapi scaffold <spec>`.' });
    }
    this.specs.set(specRel, entry);
    return entry;
  }

  find(entry, method, urlPath) {
    const m = method.toUpperCase();
    return entry.endpoints.find((e) => e.method === m && e.path === urlPath) || entry.endpoints.find((e) => e.method === m && e.path.replace(/\{[^}]+\}/g, '{}') === urlPath.replace(/\{[^}]+\}/g, '{}'));
  }

  /** Ensure an API page exists for an endpoint; returns its slug. */
  ensurePage(ep, { slug = null, extraBody = '', title = null } = {}) {
    const opId = ep.operationId || deriveOperationId(ep.method, ep.path);
    const s = slug || `api/${toSlug(opId)}`;
    if (this.pages.has(s) && !extraBody) return s;
    const t = title || ep.summary || opId;
    const fm = ['---', `title: ${yamlStr(t)}`];
    const d = ep.description || ep.summary;
    if (d) fm.push(`description: ${yamlStr(d)}`);
    fm.push('layout: api', '---');
    const body = `${extraBody ? extraBody.trim() + '\n\n' : ''}<wc-endpoint ref="${opId}">\n\n</wc-endpoint>\n\n<wc-playground method="${ep.method}" url="${ep.path}"></wc-playground>\n`;
    this.pages.set(s, { content: `${fm.join('\n')}\n\n${body}`, title: t, method: ep.method });
    return s;
  }

  /** Replace {__op}/{__openapiAll} markers in sidebar items. */
  async expand(items, { spec: defaultSpec = null, scope = null } = {}) {
    const out = [];
    for (const it of items) {
      if (it && it.__op) {
        const entry = await this.load(it.__op.spec || defaultSpec);
        if (!entry) continue;
        const ep = this.find(entry, it.__op.method, it.__op.path);
        if (!ep) { this.imp.report('warning', 'openapi-operation-missing', `Operation ${it.__op.method} ${it.__op.path} was not found in the OpenAPI spec.`, { file: it.__op.spec, action: 'Skipped.', fix: 'Check the method/path against the spec.' }); continue; }
        const slug = this.ensurePage(ep);
        out.push({ id: slug, title: ep.summary || ep.operationId || `${ep.method} ${ep.path}`, badge: undefined });
      } else if (it && it.__openapiAll) {
        const entry = await this.load(it.__openapiAll);
        if (!entry) continue;
        const byTag = new Map();
        for (const ep of entry.endpoints) { const tg = ep.tags?.[0] || 'Endpoints'; if (!byTag.has(tg)) byTag.set(tg, []); byTag.get(tg).push(ep); }
        if (byTag.size <= 1) for (const ep of entry.endpoints) out.push({ id: this.ensurePage(ep), title: ep.summary || ep.operationId });
        else for (const [tg, eps] of byTag) out.push({ group: tg, pages: eps.map((ep) => ({ id: this.ensurePage(ep), title: ep.summary || ep.operationId })) });
      } else if (it && it.group && Array.isArray(it.pages)) {
        out.push({ ...it, pages: await this.expand(it.pages, { spec: defaultSpec }) });
      } else out.push(it);
    }
    return out;
  }
}

/** Remove empty groups; simplify page objects with no extra keys to strings. */
export function tidySidebar(items) {
  const out = [];
  for (const it of items) {
    if (typeof it === 'string') { out.push(it); continue; }
    if (it.group !== undefined) {
      const pages = tidySidebar(it.pages || []);
      if (!pages.length && !it.root && !it.autogenerate) continue;
      out.push({ ...it, pages });
    } else if (it.id) {
      const keys = Object.keys(it).filter((k) => it[k] !== undefined);
      out.push(keys.length === 1 ? it.id : Object.fromEntries(keys.map((k) => [k, it[k]])));
    } else out.push(it);
  }
  return out;
}

export function collectPageIds(items, set = new Set()) {
  for (const it of items || []) {
    if (typeof it === 'string') set.add(it);
    else if (it.id) set.add(it.id);
    else if (it.pages) collectPageIds(it.pages, set);
    if (it.root) set.add(it.root);
  }
  return set;
}
