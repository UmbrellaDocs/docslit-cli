/**
 * rehype plugin: lazy images, dark variants, CLS dimensions, wrap for lightbox.
 */
import { visit } from 'unist-util-visit';
import path from 'path';
import fs from 'fs-extra';
import sizeOf from 'image-size';

function parseHash(url) {
  const hashIdx = url.indexOf('#');
  if (hashIdx < 0) return { src: url, dark: null };
  const src = url.slice(0, hashIdx);
  const hash = url.slice(hashIdx + 1);
  const darkMatch = hash.match(/(?:^|&)dark=([^&]+)/);
  return { src, dark: darkMatch ? decodeURIComponent(darkMatch[1]) : null };
}

export default function rehypeDocslitImages(opts = {}) {
  const docsDir = opts.docsDir || null;
  const cwd = opts.cwd || process.cwd();

  return async function transformer(tree) {
    const imgs = [];
    visit(tree, 'element', (node) => {
      if (node.tagName === 'img' && node.properties?.src) imgs.push(node);
    });

    for (const node of imgs) {
      const rawSrc = String(node.properties.src);
      const { src, dark } = parseHash(rawSrc);
      node.properties.src = src;
      node.properties.loading = node.properties.loading || 'lazy';
      node.properties.decoding = node.properties.decoding || 'async';

      if (dark) {
        node.properties['data-dark-src'] = dark;
        // Promote to wc-image when dark variant present
        node.tagName = 'wc-image';
        node.properties.darkSrc = dark;
      }

      // Try to inject width/height for local images
      if (docsDir && !/^https?:\/\//i.test(src) && !src.startsWith('data:')) {
        const local = path.resolve(docsDir, src.replace(/^\//, ''));
        const alt = path.resolve(cwd, src.replace(/^\//, ''));
        for (const candidate of [local, alt]) {
          try {
            if (await fs.pathExists(candidate)) {
              const buf = await fs.readFile(candidate);
              const dim = sizeOf(buf);
              if (dim.width && !node.properties.width) node.properties.width = dim.width;
              if (dim.height && !node.properties.height) node.properties.height = dim.height;
              break;
            }
          } catch { /* ignore */ }
        }
      }

      // Wrap plain img in wc-image for lightbox unless already custom element
      if (node.tagName === 'img' && opts.lightbox !== false) {
        node.tagName = 'wc-image';
      }
    }
  };
}
