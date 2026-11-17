/**
 * Opt-in incremental build cache (node_modules/.cache/docslit/build/).
 */
import crypto from 'crypto';
import path from 'path';
import fs from 'node:fs/promises';
import { pathExists, ensureDir, readJson } from './fs-helpers.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG_VERSION = JSON.parse(readFileSync(path.join(__dirname, '../package.json'), 'utf8')).version;

function cacheRoot() {
  return path.join(process.cwd(), 'node_modules', '.cache', 'docslit', 'build');
}

function hashKey(...parts) {
  return crypto.createHash('sha256').update(parts.join('\0')).digest('hex');
}

export function contentHash(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

export function assetCacheKey(code, loader, esbuildVersion) {
  return hashKey('minify-v1', loader, esbuildVersion, code);
}

async function readTextCache(kind, key) {
  const file = path.join(cacheRoot(), kind, `${key}.json`);
  let raw;
  try {
    raw = await fs.readFile(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  try {
    const data = JSON.parse(raw);
    if (data && typeof data.code === 'string' && data.hash === contentHash(data.code)) return data.code;
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
  }
  console.warn(`  Warning: invalid ${kind === 'assets' ? 'minified asset' : 'rendered page'} cache ${file}; regenerating`);
  return null;
}

async function writeTextCache(kind, key, code) {
  const dir = path.join(cacheRoot(), kind);
  const file = path.join(dir, `${key}.json`);
  const tmp = `${file}.${crypto.randomUUID()}.tmp`;
  await ensureDir(dir);
  try {
    await fs.writeFile(tmp, JSON.stringify({ code, hash: contentHash(code) }));
    await fs.rename(tmp, file);
  } finally {
    await fs.rm(tmp, { force: true });
  }
}

export const readAssetCache = key => readTextCache('assets', key);
export const writeAssetCache = (key, code) => writeTextCache('assets', key, code);
export const readRenderedPageCache = key => readTextCache('html', key);
export const writeRenderedPageCache = (key, html) => writeTextCache('html', key, html);

export function getPkgVersion() {
  return PKG_VERSION;
}

export async function getOgImageCachePath(key) {
  return path.join(cacheRoot(), 'og', `${key}.png`);
}

export function ogImageCacheKey({ title, siteName, colors }) {
  return hashKey(title || '', siteName || '', JSON.stringify(colors || {}), PKG_VERSION);
}

export async function readOgImageCache(key) {
  const p = await getOgImageCachePath(key);
  if (await pathExists(p)) return fs.readFile(p);
  return null;
}

export async function writeOgImageCache(key, png) {
  const p = await getOgImageCachePath(key);
  await ensureDir(path.dirname(p));
  await fs.writeFile(p, png);
}

export function pageCacheKey({ raw, docsRoot, pagePath, globalAttributes, versionSlug, parserFingerprint = '', pkgVersion = PKG_VERSION }) {
  return hashKey(raw, docsRoot || '', pagePath || '', JSON.stringify(globalAttributes || {}), versionSlug || '', parserFingerprint, pkgVersion);
}

export async function readPageCache(key) {
  const p = path.join(cacheRoot(), 'pages', `${key}.json`);
  if (await pathExists(p)) {
    try {
      return await readJson(p);
    } catch { /* corrupt */ }
  }
  return null;
}

export async function writePageCache(key, data) {
  const p = path.join(cacheRoot(), 'pages', `${key}.json`);
  await ensureDir(path.dirname(p));
  await fs.writeFile(p, JSON.stringify(data) + '\n');
}

export async function readBuildManifest() {
  const p = path.join(cacheRoot(), 'build-manifest.json');
  if (await pathExists(p)) {
    try {
      return await readJson(p);
    } catch { /* corrupt */ }
  }
  return {};
}

export async function writeBuildManifest(manifest) {
  const p = path.join(cacheRoot(), 'build-manifest.json');
  await ensureDir(path.dirname(p));
  await fs.writeFile(p, JSON.stringify(manifest, null, 2) + '\n');
}
