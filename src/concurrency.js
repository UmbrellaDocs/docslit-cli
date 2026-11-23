/**
 * Bounded-concurrency map: like Promise.all(items.map(fn)) but at most `limit`
 * calls are in flight. Results keep the input order.
 *
 * Page parsing is CPU-bound on one thread, so starting every page at once gains
 * no speed and keeps every page's intermediate trees alive together: a 765-page
 * site with large changelogs ran out of memory that way.
 */
export const DEFAULT_LIMIT = 6;

export async function mapLimit(items, limit, fn) {
  const list = Array.from(items);
  const out = new Array(list.length);
  let next = 0;
  const n = Math.max(1, Math.min(limit || DEFAULT_LIMIT, list.length));
  const worker = async () => {
    while (next < list.length) {
      const i = next++;
      out[i] = await fn(list[i], i);
    }
  };
  await Promise.all(Array.from({ length: n }, worker));
  return out;
}
