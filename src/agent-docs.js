function escAttr(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function getVersionPathPrefix(version = null) {
  if (!version) return '';
  return `/${String(version).replace(/^\/+|\/+$/g, '')}`;
}

export function getLlmsTxtPath(version = null) {
  return `${getVersionPathPrefix(version)}/llms.txt`.replace(/^\/\//, '/');
}

export function getLlmsTxtUrl(config, version = null) {
  const baseUrl = (config.url || '').replace(/\/$/, '');
  const path = getLlmsTxtPath(version);
  return baseUrl ? `${baseUrl}${path}` : path;
}

export function getMarkdownPath(slug, version = null) {
  const prefix = getVersionPathPrefix(version);
  return `${prefix}/${slug}.md`.replace(/^\/\//, '/');
}

export function getMarkdownUrl(config, slug, version = null) {
  const baseUrl = (config.url || '').replace(/\/$/, '');
  const path = getMarkdownPath(slug, version);
  return baseUrl ? `${baseUrl}${path}` : path;
}

export function prependAgentDirectiveToMarkdown(markdown, directive) {
  const frontmatter = markdown.match(/^---\n[\s\S]*?\n---\n?/);
  if (frontmatter) return frontmatter[0] + directive + markdown.slice(frontmatter[0].length);
  return directive + markdown;
}

export function buildAgentDirectiveMarkdown(config, slug, version = null) {
  const llmsUrl = getLlmsTxtUrl(config, version);
  const mdUrl = getMarkdownUrl(config, slug, version);
  return `> For AI agents: the complete documentation index is at [llms.txt](${llmsUrl}). This page as Markdown: [${slug}.md](${mdUrl}).\n\n`;
}

export function buildAgentDirectiveHtml(config, version = null) {
  const llmsPath = getLlmsTxtPath(version);
  const llmsUrl = getLlmsTxtUrl(config, version);
  const href = config.url ? llmsUrl : llmsPath;
  return `<p class="agent-docs-directive" style="position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0">For AI agents: the documentation index is at <a href="${escAttr(href)}">${escAttr(llmsPath)}</a>. Request any page with <code>Accept: text/markdown</code> or append <code>.md</code> to the URL for Markdown.</p>`;
}

export function buildMarkdownPattern(config, version = null) {
  const baseUrl = (config.url || '').replace(/\/$/, '');
  const prefix = getVersionPathPrefix(version);
  const pattern = `${prefix}/{slug}.md`.replace(/^\/\//, '/');
  return baseUrl ? `${baseUrl}${pattern}` : pattern;
}
