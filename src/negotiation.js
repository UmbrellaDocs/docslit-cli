/**
 * Accept-header negotiation shared by the generated host middleware
 * (Cloudflare/Netlify `_middleware.js` and Vercel `middleware.js`).
 */

/**
 * True when the client ranks text/markdown at least as high as text/html.
 * `text/markdown`, `text/markdown, text/html;q=0.9` and `text/markdown;q=1, text/*;q=0.5`
 * get Markdown; browsers (which never list text/markdown) and `text/html, text/markdown;q=0.5` get HTML.
 */
export function prefersMarkdown(accept) {
  let md = -1; let html = -1;
  for (const part of String(accept || '').toLowerCase().split(',')) {
    const [type, ...params] = part.trim().split(';').map((s) => s.trim());
    const qp = params.find((p) => p.startsWith('q='));
    const q = qp ? Number(qp.slice(2)) : 1;
    if (Number.isNaN(q)) continue;
    if (type === 'text/markdown') md = Math.max(md, q);
    else if (type === 'text/html') html = Math.max(html, q);
  }
  return md > 0 && md >= html;
}

/** Source of `prefersMarkdown` for inlining into generated middleware. */
export const PREFERS_MARKDOWN_SRC = prefersMarkdown.toString();
