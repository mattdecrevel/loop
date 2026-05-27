import { describe, it, expect, beforeAll } from 'vitest';
import { signSession, verifySession } from '@/lib/session';

beforeAll(() => { process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret'; });

describe('session', () => {
  it('round-trips a valid signed token', () => {
    const tok = signSession(Date.now() + 60_000);
    expect(verifySession(tok)).toBe(true);
  });
  it('rejects a tampered token', () => {
    const tok = signSession(Date.now() + 60_000);
    expect(verifySession(tok.slice(0, -2) + 'xx')).toBe(false);
  });
  it('rejects an expired token', () => {
    const tok = signSession(Date.now() - 1000);
    expect(verifySession(tok)).toBe(false);
  });
});
