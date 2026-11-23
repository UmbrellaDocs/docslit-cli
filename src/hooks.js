/**
 * Optional ESM hooks from docslit.config.js (or .mjs).
 */
import path from 'path';
import { pathExists } from './fs-helpers.js';
import { pathToFileURL } from 'url';

export async function loadHooks(cwd) {
  for (const name of ['docslit.config.js', 'docslit.config.mjs']) {
    const file = path.join(cwd, name);
    if (!(await pathExists(file))) continue;
    const mod = await import(pathToFileURL(file).href);
    return {
      transformPage: typeof mod.transformPage === 'function' ? mod.transformPage : (mod.default?.transformPage),
      onBuildEnd: typeof mod.onBuildEnd === 'function' ? mod.onBuildEnd : (mod.default?.onBuildEnd),
      file,
    };
  }
  return { transformPage: null, onBuildEnd: null, file: null };
}
