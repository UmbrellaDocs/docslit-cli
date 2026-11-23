/**
 * Worker-thread pool for parallel OG image rendering (Resvg is CPU-bound).
 */
import { Worker } from 'worker_threads';
import os from 'os';

const workerUrl = new URL('./workers/og-image-worker.js', import.meta.url);

let pool = null;

class OgImagePool {
  constructor(size) {
    this.size = size;
    this.workers = [];
    this.idle = [];
    this.queue = [];
  }

  _addWorker() {
    const worker = new Worker(workerUrl, { type: 'module' });
    worker.on('message', (msg) => this._onMessage(worker, msg));
    worker.on('error', (err) => this._onError(worker, err));
    worker.on('exit', (code) => {
      if (this.workers.includes(worker)) this._onError(worker, new Error(`OG image worker exited unexpectedly (${code})`));
    });
    this.workers.push(worker);
    this.idle.push(worker);
  }

  render(svg) {
    return new Promise((resolve, reject) => {
      this.queue.push({ svg, resolve, reject });
      this._dispatch();
    });
  }

  _dispatch() {
    while (this.queue.length > this.idle.length && this.workers.length < this.size) {
      this._addWorker();
    }
    while (this.queue.length && this.idle.length) {
      const worker = this.idle.pop();
      const task = this.queue.shift();
      worker._currentTask = task;
      worker.postMessage({ svg: task.svg });
    }
  }

  _onMessage(worker, msg) {
    const task = worker._currentTask;
    worker._currentTask = null;
    this.idle.push(worker);
    if (msg.error) task.reject(new Error(msg.error));
    else task.resolve(Buffer.from(msg.png));
    this._dispatch();
  }

  _onError(worker, err) {
    const task = worker._currentTask;
    this.workers = this.workers.filter(w => w !== worker);
    this.idle = this.idle.filter(w => w !== worker);
    if (task) {
      worker._currentTask = null;
      task.reject(err);
    }
    this._dispatch();
  }

  async shutdown() {
    const workers = this.workers;
    this.workers = [];
    this.idle = [];
    this.queue = [];
    await Promise.all(workers.map((w) => w.terminate()));
  }
}

function getPool() {
  if (!pool) {
    const size = Math.max(1, Math.min(os.cpus().length, 8));
    pool = new OgImagePool(size);
  }
  return pool;
}

export async function renderSvgToPng(svg) {
  return getPool().render(svg);
}

export async function shutdownOgImagePool() {
  if (pool) {
    await pool.shutdown();
    pool = null;
  }
}
