import { describe, it, expect } from 'vitest';
import { resolveAuth, normalizeApiUrl, DEFAULT_API_URL } from './cloud-auth.js';

describe('resolveAuth', () => {
  it('prefers DOCSLIT_TOKEN over the stored config', () => {
    const a = resolveAuth({ env: { DOCSLIT_TOKEN: ' env-tok ' }, stored: { token: 'file-tok', apiUrl: 'https://x.dev/api' } });
    expect(a).toEqual({ token: 'env-tok', apiUrl: 'https://x.dev/api', source: 'env' });
  });
  it('uses DOCSLIT_API_URL when set', () => {
    expect(resolveAuth({ env: { DOCSLIT_TOKEN: 't', DOCSLIT_API_URL: 'https://y.dev/api' }, stored: null }).apiUrl).toBe('https://y.dev/api');
  });
  it('falls back to the stored token and default api url', () => {
    expect(resolveAuth({ env: {}, stored: { token: 'file-tok', tokenId: 'id1' } })).toEqual({ token: 'file-tok', apiUrl: DEFAULT_API_URL, source: 'config', tokenId: 'id1' });
  });
  it('returns null when there is nothing', () => {
    expect(resolveAuth({ env: {}, stored: null })).toBeNull();
    expect(resolveAuth({ env: { DOCSLIT_TOKEN: '  ' }, stored: {} })).toBeNull();
  });
});

describe('normalizeApiUrl', () => {
  it('accepts https and strips trailing slashes', () => {
    expect(normalizeApiUrl('https://docslit.com/api/')).toBe('https://docslit.com/api');
  });
  it('allows http only for localhost', () => {
    expect(normalizeApiUrl('http://localhost:8787/api')).toBe('http://localhost:8787/api');
    expect(() => normalizeApiUrl('http://evil.example/api')).toThrow(/https/);
  });
  it('rejects garbage and other schemes', () => {
    expect(() => normalizeApiUrl('nope')).toThrow();
    expect(() => normalizeApiUrl('ftp://x.dev')).toThrow();
  });
});
