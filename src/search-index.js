/**
 * Search index helpers: strip markup, section chunks from HTML headings.
 */

const BODY_CAP = 500;

export function stripForSearch(text) {
  if (!text) return '';
  let s = String(text);
  s = s.replace(/```[\s\S]*?```/g, ' ');
  s = s.replace(/`[^`]+`/g, ' ');
  s = s.replace(/<[^>]+>/g, ' ');
  s = s.replace(/!\[[^\]]*\]\([^)]+\)/g, ' ');
  s = s.replace(/\[[^\]]*\]\([^)]+\)/g, '$1');
  s = s.replace(/[#>*_\-]+/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  if (s.length > BODY_CAP) s = s.slice(0, BODY_CAP);
  return s;
}

export function slugifyHeading(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'section';
}

/**
 * Split HTML into heading-anchored chunks for section search.
 * Returns array of { anchor, title, body }.
 */
export function extractHeadingChunks(html) {
  if (!html) return [];
  const chunks = [];
  const re = /<h([2-4])([^>]*)>([\s\S]*?)<\/h\1>/gi;
  const matches = [...String(html).matchAll(re)];
  if (!matches.length) {
    const body = stripForSearch(html);
    if (body) chunks.push({ anchor: '', title: '', body });
    return chunks;
  }

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const attrs = m[2] || '';
    const inner = m[3].replace(/<[^>]+>/g, '').trim();
    const idMatch = attrs.match(/\bid=["']([^"']+)["']/i);
    const anchor = idMatch ? idMatch[1] : slugifyHeading(inner);
    const start = m.index + m[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : html.length;
    const sectionHtml = html.slice(start, end);
    chunks.push({
      anchor,
      title: inner,
      body: stripForSearch(sectionHtml),
    });
  }
  return chunks;
}

export function buildSearchEntries({ id, title, group, desc, html, markdown }) {
  const pageTitle = title || id;
  const chunks = extractHeadingChunks(html || '');
  const entries = [];

  // Page-level entry (no full body — keep payload small)
  entries.push({
    id,
    title: pageTitle,
    pageTitle,
    section: '',
    group: group || 'Pages',
    desc: desc || '',
    body: stripForSearch(markdown || desc || ''),
  });

  for (const chunk of chunks) {
    if (!chunk.anchor) continue;
    entries.push({
      id: `${id}#${chunk.anchor}`,
      title: chunk.title,
      pageTitle,
      section: chunk.title,
      group: group || 'Pages',
      desc: `${pageTitle} → ${chunk.title}`,
      body: chunk.body,
    });
  }
  return entries;
}
