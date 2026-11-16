import { describe, it, expect } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import vm from 'vm';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VENDOR = path.join(__dirname, 'vendor');
const hasVendor = fs.pathExistsSync(path.join(VENDOR, 'flexsearch.js'));
const hasIife = fs.pathExistsSync(path.join(VENDOR, 'flexsearch.iife.js'));

const DOC = { document: { id: 'id', index: ['title', 'body'], store: ['id', 'title'] }, tokenize: 'forward' };

// The search runtime in template.js does `mod.default || mod` then
// `new FlexSearch.Document(...)`. These guard the shape of the bundles produced
// by `npm run vendor` (src/vendor is gitignored, so skip when it has not been built).
describe('vendored FlexSearch bundles', () => {
  it('download-vendor re-exports the default export (export * drops it)', async () => {
    const src = await fs.readFile(path.join(__dirname, '..', 'scripts', 'download-vendor.js'), 'utf8');
    expect(src).toMatch(/export \{ default \} from 'flexsearch'/);
  });

  it.skipIf(!hasVendor)('flexsearch.js (ESM) has default.Document usable for search', async () => {
    const mod = await import(pathToFileURL(path.join(VENDOR, 'flexsearch.js')).href);
    expect(typeof mod.default?.Document).toBe('function');
    expect(typeof mod.Document).toBe('function');
    const idx = new mod.default.Document(DOC);
    idx.add({ id: 'a', title: 'Callouts', body: 'tips and warnings' });
    const res = idx.search('callout', { enrich: true });
    expect(res.length).toBeGreaterThan(0);
  });

  it.skipIf(!hasIife)('flexsearch.iife.js (offline classic script) sets window.FlexSearch', async () => {
    const code = await fs.readFile(path.join(VENDOR, 'flexsearch.iife.js'), 'utf8');
    const ctx = vm.createContext({});
    ctx.globalThis = ctx;
    vm.runInContext(code, ctx);
    expect(typeof ctx.FlexSearch?.Document).toBe('function');
  });
});
