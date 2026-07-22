/**
 * git lastmod helpers for sitemap.
 */
import fs from 'fs-extra';
import path from 'path';
import git from 'isomorphic-git';

export async function getFileLastmod(cwd, filePath) {
  try {
    const commits = await git.log({
      fs,
      dir: cwd,
      filepath: filePath,
      depth: 1,
    });
    if (commits[0]?.commit?.author?.timestamp) {
      const d = new Date(commits[0].commit.author.timestamp * 1000);
      return d.toISOString().split('T')[0];
    }
  } catch { /* not in git or no history */ }

  try {
    const abs = path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath);
    const st = await fs.stat(abs);
    return st.mtime.toISOString().split('T')[0];
  } catch {
    return new Date().toISOString().split('T')[0];
  }
}

export async function getPageLastmods(cwd, pagesData) {
  const map = {};
  await Promise.all(Object.entries(pagesData).map(async ([id, page]) => {
    const rel = page.sourcePath
      ? (path.isAbsolute(page.sourcePath) ? path.relative(cwd, page.sourcePath) : page.sourcePath)
      : path.join('docs', `${id}.md`);
    map[id] = await getFileLastmod(cwd, rel);
  }));
  return map;
}
