import { describe, it, expect } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { LIT_VENDOR_FILES } from './template.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VENDOR = path.join(__dirname, 'vendor');
const hasVendor = fs.pathExistsSync(path.join(VENDOR, 'lit.js'));

// src/vendor is gitignored and produced by `npm run vendor`; skip when it has not been built.
describe.skipIf(!hasVendor)('vendored Lit bundles', () => {
  it('only lit.js contains Lit core; the other bundles import it via the bare "lit" specifier', async () => {
    const core = await fs.readFile(path.join(VENDOR, 'lit.js'), 'utf8');
    expect(core).toMatch(/litHtmlVersions/);
    for (const [key, file] of Object.entries(LIT_VENDOR_FILES)) {
      if (key === 'lit') continue;
      const src = await fs.readFile(path.join(VENDOR, file), 'utf8');
      // A second lit-html copy would register itself in window.litHtmlVersions again.
      expect(src, file).not.toMatch(/litHtmlVersions|litElementVersions|reactiveElementVersions/);
      expect(src, file).toMatch(/from\s*"lit"/);
    }
  });
});
