/**
 * Worker thread: SVG string → PNG bytes via @resvg/resvg-js.
 */
import { parentPort } from 'worker_threads';
import { encodePng } from '../png-encode.js';

const { Resvg } = await import('@resvg/resvg-js');

parentPort.on('message', ({ svg }) => {
  try {
    const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } });
    const rendered = resvg.render();
    const png = encodePng({ width: rendered.width, height: rendered.height, rgba: rendered.pixels });
    parentPort.postMessage({ png });
  } catch (e) {
    parentPort.postMessage({ error: e.message || String(e) });
  }
});
