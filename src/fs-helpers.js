import { access, mkdir, readdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';

export async function pathExists(file) {
  try {
    await access(file);
    return true;
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'ENOTDIR') return false;
    throw err;
  }
}

export function ensureDir(dir) {
  return mkdir(dir, { recursive: true });
}

export async function emptyDir(dir) {
  await ensureDir(dir);
  const entries = await readdir(dir);
  await Promise.all(entries.map(entry => rm(path.join(dir, entry), { recursive: true, force: true })));
}

export async function readJson(file) {
  const contents = await readFile(file, 'utf8');
  try {
    return JSON.parse(contents.replace(/^\uFEFF/, ''));
  } catch (err) {
    err.message = `${file}: ${err.message}`;
    throw err;
  }
}
