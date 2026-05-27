import { describe, it, expect } from 'vitest';
import { generateApiKey, hashApiKey } from '@/lib/auth';

describe('api keys', () => {
  it('generates a prefixed key', () => {
    const k = generateApiKey();
    expect(k).toMatch(/^loop_pk_[A-Za-z0-9_-]{32,}$/);
  });
  it('hashes deterministically and differs from the raw key', () => {
    const k = generateApiKey();
    expect(hashApiKey(k)).toBe(hashApiKey(k));
    expect(hashApiKey(k)).not.toBe(k);
  });
});
