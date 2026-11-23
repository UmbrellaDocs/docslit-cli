/**
 * Reader-mode MCP definitions: connect any agent to a PUBLISHED DocsLit site
 * over HTTP (llms.txt, <slug>.md pages, search-index.json, .well-known/agent.json).
 *
 * Safety: every request is built from the base URL plus a validated relative
 * path - absolute URLs, protocol-relative URLs, backslashes and ".." are
 * rejected, redirects must stay on the same host, responses are size-capped.
 */
import { ToolError } from './server.js';
import { searchDocs } from './search.js';

const MAX_BYTES = 8 * 1024 * 1024;
const RO = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };

export function normalizeBaseUrl(input) {
  let u;
  try {
    u = new URL(String(input).trim());
  } catch {
    throw new Error(`Invalid site URL: ${input}`);
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error(`Site URL must be http(s): ${input}`);
  u.hash = '';
  u.search = '';
  if (!u.pathname.endsWith('/')) u.pathname += '/';
  return u;
}

/** Validate a user-supplied slug (page id). Returns the cleaned slug. */
export function cleanSlug(raw) {
  if (typeof raw !== 'string' || !raw.trim()) throw new ToolError('slug must be a non-empty string such as "quickstart" or "guides/setup".');
  let s = raw.trim().replace(/\\/g, '/');
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(s) || s.startsWith('//')) {
    throw new ToolError('Only page slugs relative to the connected site are accepted (not absolute URLs). Use list_pages to see slugs.');
  }
  s = s.replace(/^\/+/, '').replace(/\.md$/i, '').replace(/\/+$/, '');
  if (!s) throw new ToolError('slug must not be empty.');
  for (const seg of s.split('/')) {
    if (seg === '' || seg === '.' || seg === '..') throw new ToolError('slug must not contain empty, "." or ".." segments.');
    if (/[?#%\0]/.test(seg)) throw new ToolError('slug contains unsupported characters.');
  }
  return s;
}

function cleanVersion(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  const v = String(raw).trim().replace(/^\/+|\/+$/g, '');
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(v)) throw new ToolError(`Invalid version "${raw}".`);
  return v;
}

export function createReader(siteUrl, { fetchImpl = globalThis.fetch, ttlMs = 60_000, timeoutMs = 10_000, userAgent = 'docslit-mcp' } = {}) {
  const base = normalizeBaseUrl(siteUrl);
  const cache = new Map();

  /** Build an in-scope URL from a relative path. */
  function urlFor(rel) {
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(rel) || rel.startsWith('//') || rel.includes('\\')) throw new ToolError('Refusing to fetch outside the connected site.');
    const u = new URL(rel.replace(/^\/+/, ''), base);
    if (u.origin !== base.origin || !u.pathname.startsWith(base.pathname)) throw new ToolError('Refusing to fetch outside the connected site.');
    return u;
  }

  async function fetchRaw(u) {
    let current = u;
    for (let hop = 0; hop < 5; hop++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      let res;
      try {
        res = await fetchImpl(current, {
          signal: ctrl.signal,
          redirect: 'manual',
          headers: { 'user-agent': userAgent, accept: 'text/markdown, text/plain, application/json;q=0.9, */*;q=0.5' },
        });
      } catch (e) {
        throw new ToolError(e?.name === 'AbortError'
          ? `Timed out after ${timeoutMs / 1000}s fetching ${current.href}.`
          : `Network error fetching ${current.href}: ${e?.cause?.code || e?.message || e}`);
      } finally {
        clearTimeout(timer);
      }
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        const next = new URL(res.headers.get('location'), current);
        if (next.hostname !== base.hostname) throw new ToolError(`Refusing to follow redirect to another host (${next.hostname}).`);
        current = next;
        continue;
      }
      const len = Number(res.headers.get('content-length') || 0);
      if (len > MAX_BYTES) throw new ToolError(`Response too large (${len} bytes).`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > MAX_BYTES) throw new ToolError(`Response too large (${buf.length} bytes).`);
      return { status: res.status, text: buf.toString('utf8'), contentType: res.headers.get('content-type') || '', url: current.href };
    }
    throw new ToolError(`Too many redirects fetching ${u.href}.`);
  }

  /** GET relative path. Returns text, or null on 404/410. Cached. */
  async function getText(rel) {
    const u = urlFor(rel);
    const hit = cache.get(u.href);
    if (hit && Date.now() - hit.t < ttlMs) return hit.v;
    const r = await fetchRaw(u);
    let v;
    if (r.status === 404 || r.status === 410) v = null;
    else if (r.status >= 400) throw new ToolError(`HTTP ${r.status} fetching ${u.href}.`);
    else if (/text\/html/i.test(r.contentType) && !/\.html?$/.test(u.pathname) && /<!doctype html|<html/i.test(r.text.slice(0, 300))) {
      v = null; // SPA fallback / soft-404 serving index.html for a missing text resource
    } else v = r.text;
    cache.set(u.href, { t: Date.now(), v });
    return v;
  }

  const notDocsLit = () => new ToolError(`${base.href} does not look like a DocsLit site: neither llms.txt nor .well-known/agent.json was found. Check the URL (it should be the site root, e.g. https://docs.example.com).`);

  let siteMeta; // { agent, llms } memo (also TTL'd via getText cache)
  async function agentJson() {
    const t = await getText('.well-known/agent.json');
    if (!t) return null;
    try { return JSON.parse(t); } catch { return null; }
  }

  async function resolveVersion(versionArg) {
    const v = cleanVersion(versionArg);
    const agent = await agentJson();
    const versions = Array.isArray(agent?.versions) ? agent.versions : [];
    if (v) {
      if (versions.length && !versions.includes(v)) throw new ToolError(`Unknown version "${v}". Available: ${versions.join(', ')} (default ${agent.default_version}).`);
      return { version: v, agent };
    }
    return { version: versions.length ? agent.default_version || versions[0] : null, agent };
  }

  const vpath = (version, file) => (version ? `${version}/${file}` : file);

  /** Parse llms.txt into [{ group, title, url, slug, description }]. */
  function parseLlms(text, version) {
    const pages = [];
    let group = '';
    const basePath = base.pathname;
    for (const line of text.split('\n')) {
      const h = line.match(/^##\s+(.+?)\s*$/);
      if (h) { group = h[1]; continue; }
      const m = line.match(/^\s*[-*]\s+\[([^\]]+)\]\(([^)\s]+)\)\s*(?::\s*(.*))?$/);
      if (!m) continue;
      let pathname;
      try { pathname = new URL(m[2], base).pathname; } catch { continue; }
      let rel = pathname.startsWith(basePath) ? pathname.slice(basePath.length) : pathname.replace(/^\/+/, '');
      if (version && rel.startsWith(`${version}/`)) rel = rel.slice(version.length + 1);
      const slug = decodeURIComponent(rel).replace(/\.md$/i, '');
      if (!slug) continue;
      pages.push({ slug, title: m[1], description: m[3] || '', group, url: new URL(`${vpath(version, slug)}.md`, base).href });
    }
    return pages;
  }

  async function llmsFor(version) {
    const text = await getText(vpath(version, 'llms.txt'));
    if (text === null) {
      const agent = await agentJson();
      if (!agent) throw notDocsLit();
      throw new ToolError(`llms.txt not found for ${version ? `version ${version}` : 'this site'}.`);
    }
    return text;
  }

  async function loadPages(version) {
    return parseLlms(await llmsFor(version), version);
  }

  const versionProp = { type: 'string', description: 'Docs version (only for versioned sites; defaults to the site\'s default version). See get_docs_overview for the list.' };

  const tools = [
    {
      name: 'get_docs_overview',
      title: 'Get docs overview',
      description: `Overview of the documentation site ${base.origin}${base.pathname}: its llms.txt index (name, description, every page grouped with one-line summaries) plus available versions. Call this first to learn what the docs cover.`,
      inputSchema: { type: 'object', properties: { version: versionProp }, additionalProperties: false },
      annotations: { title: 'Get docs overview', ...RO },
      async handler({ version: vArg }) {
        const { version, agent } = await resolveVersion(vArg);
        let text;
        try {
          text = await llmsFor(version);
        } catch (e) {
          if (!agent) throw e;
          text = '(llms.txt unavailable)';
        }
        const header = agent ? `Site: ${agent.name || ''}${agent.description ? ` - ${agent.description}` : ''}\n${agent.versions ? `Versions: ${agent.versions.join(', ')} (default ${agent.default_version})\n` : ''}Source: ${base.href}\n\n` : `Source: ${base.href}\n\n`;
        return { text: header + text };
      },
    },
    {
      name: 'list_pages',
      title: 'List pages',
      description: 'List every page of the published docs: slug (pass to get_page), title, description and group.',
      inputSchema: { type: 'object', properties: { version: versionProp }, additionalProperties: false },
      annotations: { title: 'List pages', ...RO },
      async handler({ version: vArg }) {
        const { version } = await resolveVersion(vArg);
        const pages = await loadPages(version);
        return { site: base.href, version, count: pages.length, pages: pages.map(({ url, ...p }) => p) };
      },
    },
    {
      name: 'get_page',
      title: 'Get page Markdown',
      description: 'Fetch the full Markdown source of one documentation page by slug (e.g. "quickstart" or "guides/setup"). Use list_pages or search_docs to find slugs.',
      inputSchema: {
        type: 'object',
        properties: {
          slug: { type: 'string', description: 'Page slug relative to the site, without ".md". Absolute URLs are rejected.' },
          version: versionProp,
        },
        required: ['slug'],
        additionalProperties: false,
      },
      annotations: { title: 'Get page Markdown', ...RO },
      async handler({ slug: rawSlug, version: vArg }) {
        const slug = cleanSlug(rawSlug);
        const { version } = await resolveVersion(vArg);
        const text = await getText(`${vpath(version, slug)}.md`);
        if (text === null) {
          let hint = '';
          try {
            const pages = await loadPages(version);
            const hits = searchDocs(pages.map((p) => ({ id: p.slug, title: p.title, description: p.description })), slug.replace(/[-_/]+/g, ' '), { limit: 3 });
            if (hits.length) hint = ` Similar pages: ${hits.map((h) => h.id).join(', ')}.`;
          } catch { /* ignore */ }
          throw new ToolError(`Page "${slug}" not found${version ? ` in version ${version}` : ''}. Use list_pages to see valid slugs.${hint}`);
        }
        return { text };
      },
    },
    {
      name: 'search_docs',
      title: 'Search docs',
      description: 'Search the published documentation (uses the site\'s search-index.json, falling back to llms-full.txt). Returns ranked pages with a snippet; follow up with get_page for the full text.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search terms.' },
          limit: { type: 'integer', minimum: 1, maximum: 25, description: 'Maximum results (default 8).' },
          version: versionProp,
        },
        required: ['query'],
        additionalProperties: false,
      },
      annotations: { title: 'Search docs', ...RO },
      async handler({ query, limit = 8, version: vArg }) {
        const { version } = await resolveVersion(vArg);
        let docs = null;
        const idx = await getText(vpath(version, 'search-index.json'));
        if (idx) {
          try {
            const parsed = JSON.parse(idx);
            if (Array.isArray(parsed)) {
              // Merge section-level entries (id "page#anchor") into their page.
              const byId = new Map();
              for (const e of parsed) {
                const pid = String(e.id).split('#')[0];
                const cur = byId.get(pid) || { id: pid, title: e.pageTitle || e.title, description: e.desc || '', group: e.group, body: '' };
                if (!String(e.id).includes('#')) { cur.title = e.title; cur.description = e.desc || cur.description; }
                cur.body += `${String(e.id).includes('#') ? `\n## ${e.title}\n` : ''}${e.body || ''}\n`;
                byId.set(pid, cur);
              }
              docs = [...byId.values()];
            }
          } catch { /* fall through */ }
        }
        let source = 'search-index.json';
        if (!docs) {
          const full = await getText(vpath(version, 'llms-full.txt'));
          if (full === null) {
            if (!(await agentJson()) && (await getText(vpath(version, 'llms.txt'))) === null) throw notDocsLit();
            throw new ToolError('This site publishes neither search-index.json nor llms-full.txt, so it cannot be searched. Use list_pages + get_page.');
          }
          source = 'llms-full.txt';
          docs = full.split(/\n---\n# Source: /).slice(1).map((chunk) => {
            const nl = chunk.indexOf('\n');
            const id = chunk.slice(0, nl).replace(/\.md$/, '').trim();
            const body = chunk.slice(nl + 1);
            const fm = body.match(/^---\n[\s\S]*?\n---\n/);
            const title = fm?.[0].match(/^title:\s*(.+)$/m)?.[1]?.replace(/^["']|["']$/g, '') || (body.match(/^#\s+(.+)$/m)?.[1]) || id;
            return { id, title, body };
          });
        }
        const results = searchDocs(docs, query, { limit: Math.min(Number(limit) || 8, 25) });
        return { query, source, version, count: results.length, results: results.map(({ line, ...r }) => r) };
      },
    },
  ];

  return {
    base,
    tools,
    instructions: `Read-only access to the published documentation at ${base.href}. Start with get_docs_overview, use search_docs to find pages, then get_page for the full Markdown.`,
    clearCache: () => cache.clear(),
  };
}
