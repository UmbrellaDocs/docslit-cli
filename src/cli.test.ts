import { describe, it, expect } from 'vitest';
import { spawn } from 'child_process';
import path from 'path';

describe('DocsLit CLI', () => {
  it('should display help text when run with --help', async () => {
    return new Promise((resolve, reject) => {
      const proc = spawn('node', [path.join(__dirname, '../bin/docslit.js'), '--help']);

      let output = '';
      proc.stdout?.on('data', (data) => {
        output += data.toString();
      });

      proc.stderr?.on('data', (data) => {
        output += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0 || code === null) {
          expect(output).toBeTruthy();
          resolve(undefined);
        } else {
          reject(new Error(`CLI exited with code ${code}`));
        }
      });

      setTimeout(() => {
        proc.kill();
        reject(new Error('CLI help timeout'));
      }, 5000);
    });
  });

  it('should handle version flag', async () => {
    return new Promise((resolve, reject) => {
      const proc = spawn('node', [path.join(__dirname, '../bin/docslit.js'), '--version']);

      let output = '';
      proc.stdout?.on('data', (data) => {
        output += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0 || code === null) {
          resolve(undefined);
        } else {
          reject(new Error(`CLI exited with code ${code}`));
        }
      });

      setTimeout(() => {
        proc.kill();
        reject(new Error('CLI version timeout'));
      }, 5000);
    });
  });
});
