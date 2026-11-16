/**
 * Dependency-free ranked search over { id, title, description, group, body } docs.
 * Used by authoring mode (source pages) and reader mode (search-index.json / llms-full.txt).
 */

export function tokenize(q) {
  return String(q || '').toLowerCase().split(/[^\p{L}\p{N}_]+/u).filter((t) => t.length > 0);
}

function countOccurrences(hay, needle) {
  if (!needle) return 0;
  let n = 0;
  let i = hay.indexOf(needle);
  while (i !== -1 && n < 50) { n++; i = hay.indexOf(needle, i + needle.length); }
  return n;
}

function snippetAround(text, terms, width = 90) {
  const lower = text.toLowerCase();
  let at = -1;
  for (const t of terms) {
    const i = lower.indexOf(t);
    if (i !== -1 && (at === -1 || i < at)) at = i;
  }
  if (at === -1) return text.slice(0, width * 2).replace(/\s+/g, ' ').trim();
  const start = Math.max(0, at - width);
  const end = Math.min(text.length, at + width);
  return `${start > 0 ? '...' : ''}${text.slice(start, end).replace(/\s+/g, ' ').trim()}${end < text.length ? '...' : ''}`;
}

/** Strip frontmatter from a raw page. */
export function stripFrontmatterText(src) {
  const m = String(src).match(/^﻿?---\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n?([\s\S]*)$/);
  return m ? m[1] : String(src);
}

/**
 * @returns {Array<{id,title,group,description,score,section,line,snippet}>} best first
 */
export function searchDocs(docs, query, { limit = 8 } = {}) {
  const terms = [...new Set(tokenize(query))];
  if (!terms.length) return [];
  const phrase = String(query).trim().toLowerCase();
  const results = [];
  for (const d of docs) {
    const title = String(d.title || d.id || '');
    const titleL = title.toLowerCase();
    const descL = String(d.description || d.desc || '').toLowerCase();
    const idL = String(d.id || '').toLowerCase();
    const body = stripFrontmatterText(d.body || '');
    const lines = body.split('\n');
    let score = 0;
    let matchedTerms = 0;
    let bestSection = null;
    let bestSectionScore = 0;
    let section = '';
    let sectionLine = 0;
    let inFence = false;
    const sections = [{ heading: '', line: 1, text: [] }];
    lines.forEach((ln, i) => {
      if (/^\s*(```|~~~)/.test(ln)) inFence = !inFence;
      const h = !inFence && ln.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
      if (h) sections.push({ heading: h[2], line: i + 1, text: [] });
      else sections[sections.length - 1].text.push(ln);
    });
    for (const s of sections) {
      const headL = s.heading.toLowerCase();
      const textL = s.text.join('\n').toLowerCase();
      let sc = 0;
      for (const t of terms) {
        if (headL.includes(t)) sc += 6;
        sc += Math.min(countOccurrences(textL, t), 5);
      }
      if (sc > bestSectionScore) { bestSectionScore = sc; bestSection = s; }
      section = s.heading; sectionLine = s.line;
    }
    for (const t of terms) {
      let hit = false;
      if (titleL.includes(t)) { score += 10; hit = true; }
      if (idL.includes(t)) { score += 4; hit = true; }
      if (descL.includes(t)) { score += 4; hit = true; }
      const c = countOccurrences(body.toLowerCase(), t);
      if (c) { score += Math.min(c, 5); hit = true; }
      if (bestSection && bestSection.heading.toLowerCase().includes(t)) { score += 4; hit = true; }
      if (hit) matchedTerms++;
    }
    if (!matchedTerms) continue;
    if (matchedTerms === terms.length) score += 8;
    if (terms.length > 1 && (titleL.includes(phrase) || body.toLowerCase().includes(phrase))) score += 6;
    const snipSource = bestSection && bestSectionScore > 0 ? bestSection.text.join('\n') : (d.description || body);
    results.push({
      id: d.id,
      title,
      group: d.group || null,
      description: d.description || d.desc || '',
      score,
      section: bestSection?.heading || '',
      line: bestSection ? bestSection.line : undefined,
      snippet: snippetAround(snipSource || body, terms),
    });
  }
  results.sort((a, b) => b.score - a.score || String(a.id).localeCompare(String(b.id)));
  return results.slice(0, Math.max(1, limit));
}
