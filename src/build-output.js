import fs from 'node:fs/promises';
import path from 'node:path';
import { contentHash, readOutputManifest, writeOutputManifest } from './build-cache.js';

export function createOutputTracker(outDir) {
  const root = path.resolve(outDir);
  const files = new Set();
  const protectedFiles = new Set();
  const protectedDirs = new Set();
  function relative(file) {
    const rel = path.relative(root, path.resolve(file));
    if (!rel || path.isAbsolute(rel) || rel === '..' || rel.startsWith(`..${path.sep}`)) {
      throw new Error(`Generated output is outside the build directory: ${file}`);
    }
    return rel;
  }
  return {
    add(file) {
      files.add(relative(file));
    },
    protect(file) { protectedFiles.add(relative(file)); },
    protectDirectory(dir) { protectedDirs.add(relative(dir)); },
    async finish(incremental) {
      const previous = incremental ? await readOutputManifest(root) : null;
      const realRoot = await fs.realpath(root);
      if (previous) {
        for (const [rel, hash] of Object.entries(previous)) {
          if (files.has(rel) || protectedFiles.has(rel) || [...protectedDirs].some(dir => rel.startsWith(dir + path.sep))
            || typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash)) continue;
          const file = path.resolve(root, rel);
          const resolvedRel = path.relative(root, file);
          if (!resolvedRel || path.isAbsolute(rel) || resolvedRel !== rel || resolvedRel === '..' || resolvedRel.startsWith(`..${path.sep}`)) continue;
          try {
            const info = await fs.lstat(file);
            if (!info.isFile()) continue;
            const realParent = await fs.realpath(path.dirname(file));
            if (realParent !== realRoot && !realParent.startsWith(realRoot + path.sep)) continue;
            if (contentHash(await fs.readFile(file)) === hash) {
              await fs.unlink(file);
            } else {
              console.warn(`  Warning: preserving modified generated file ${file}`);
            }
          } catch (error) {
            if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error;
          }
        }
      }
      const current = {};
      await Promise.all([...files].map(async rel => {
        const file = path.join(root, rel);
        try {
          const info = await fs.lstat(file);
          if (!info.isFile()) return;
          const realParent = await fs.realpath(path.dirname(file));
          if (realParent !== realRoot && !realParent.startsWith(realRoot + path.sep)) return;
          current[rel] = contentHash(await fs.readFile(file));
        } catch (error) {
          if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error;
        }
      }));
      await writeOutputManifest(root, current);
    },
  };
}
