/** Shared sidebar traversal helpers (used by template and PDF export). */

export function containsPage(pages, id) {
  for (const item of pages) {
    if (typeof item === 'string' && item === id) return true;
    if (typeof item === 'object' && item.id && item.id === id) return true;
    if (typeof item === 'object' && item.pages && containsPage(item.pages, id)) return true;
  }
  return false;
}

export function findGroupForPage(sidebar, id) {
  for (const g of sidebar) {
    if (containsPage(g.pages || [], id)) return g.group || '';
  }
  return '';
}

/** Collect page IDs from a pages array in sidebar order (recursive subgroups). */
export function collectPageIds(pages) {
  const ids = [];
  for (const item of pages || []) {
    if (typeof item === 'string') ids.push(item);
    else if (item.id) ids.push(item.id);
    else if (item.pages) ids.push(...collectPageIds(item.pages));
  }
  return ids;
}

export function toLabel(id) {
  const name = id.includes('/') ? id.split('/').pop() : id;
  return name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
