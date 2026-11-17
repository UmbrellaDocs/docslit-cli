import { access, copyFile, mkdir, open, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
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

export async function writeFileIfChanged(file, data, incremental = false) {
  if (incremental) {
    try {
      const current = await readFile(file);
      if (current.equals(Buffer.isBuffer(data) ? data : Buffer.from(data))) return false;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  await writeFile(file, data);
  return true;
}

export async function copyFileIfChanged(source, dest, incremental = false) {
  if (incremental) {
    const sourceStat = await stat(source);
    let destStat;
    try {
      destStat = await stat(dest);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (destStat && sourceStat.size === destStat.size) {
      const sourceFile = await open(source, 'r');
      try {
        const destFile = await open(dest, 'r');
        try {
          const a = Buffer.allocUnsafe(64 * 1024);
          const b = Buffer.allocUnsafe(64 * 1024);
          let equal = true;
          let position = 0;
          while (position < sourceStat.size) {
            const length = Math.min(a.length, sourceStat.size - position);
            const [ra, rb] = await Promise.all([
              sourceFile.read(a, 0, length, position),
              destFile.read(b, 0, length, position),
            ]);
            if (ra.bytesRead !== length || rb.bytesRead !== length || !a.subarray(0, length).equals(b.subarray(0, length))) {
              equal = false;
              break;
            }
            position += length;
          }
          if (equal) return false;
        } finally {
          await destFile.close();
        }
      } finally {
        await sourceFile.close();
      }
    }
  }
  await copyFile(source, dest);
  return true;
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
