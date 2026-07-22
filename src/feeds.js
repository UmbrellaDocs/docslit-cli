/**
 * RSS / Atom feed generation for changelog and blog posts.
 */
import path from 'path';
import fs from 'fs-extra';

export function isFeedPage(meta = {}, id = '') {
  const layout = meta.layout;
  if (layout === 'changelog' || layout === 'blog' || layout === 'post') return true;
  if (id.startsWith('changelog/') || id.startsWith('blog/')) return true;
  return false;
}

export function getPostDate(meta = {}) {
  const raw = meta.date || meta.updated || meta.published;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function collectFeedPosts(pagesData) {
  const posts = [];
  for (const [id, page] of Object.entries(pagesData)) {
    if (id.endsWith('/index') || id === 'changelog' || id === 'blog') continue;
    if (!isFeedPage(page.meta || {}, id)) continue;
    const date = getPostDate(page.meta || {});
    posts.push({
      id,
      title: page.meta?.title || id,
      description: page.meta?.description || page.meta?.desc || '',
      date,
      dateStr: date ? date.toISOString() : new Date().toISOString(),
    });
  }
  posts.sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0));
  return posts;
}

function escXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export async function writeFeeds({ config, pagesData, outDir, basePath = '' }) {
  const baseUrl = (config.url || '').replace(/\/$/, '');
  if (!baseUrl) return false;
  const posts = collectFeedPosts(pagesData);
  if (!posts.length) return false;

  const siteTitle = config.name || 'Docs';
  const prefix = basePath || '';

  const rssItems = posts.map((p) => {
    const link = `${baseUrl}${prefix}/${p.id}`;
    return `    <item>
      <title>${escXml(p.title)}</title>
      <link>${escXml(link)}</link>
      <guid>${escXml(link)}</guid>
      <pubDate>${new Date(p.dateStr).toUTCString()}</pubDate>
      <description>${escXml(p.description)}</description>
    </item>`;
  }).join('\n');

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escXml(siteTitle)}</title>
    <link>${escXml(baseUrl + prefix + '/')}</link>
    <description>${escXml(config.description || siteTitle)}</description>
${rssItems}
  </channel>
</rss>
`;

  const atomEntries = posts.map((p) => {
    const link = `${baseUrl}${prefix}/${p.id}`;
    return `  <entry>
    <title>${escXml(p.title)}</title>
    <link href="${escXml(link)}"/>
    <id>${escXml(link)}</id>
    <updated>${p.dateStr}</updated>
    <summary>${escXml(p.description)}</summary>
  </entry>`;
  }).join('\n');

  const atom = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${escXml(siteTitle)}</title>
  <link href="${escXml(baseUrl + prefix + '/')}"/>
  <id>${escXml(baseUrl + prefix + '/')}</id>
  <updated>${posts[0]?.dateStr || new Date().toISOString()}</updated>
${atomEntries}
</feed>
`;

  await fs.writeFile(path.join(outDir, 'rss.xml'), rss);
  await fs.writeFile(path.join(outDir, 'atom.xml'), atom);
  return true;
}
