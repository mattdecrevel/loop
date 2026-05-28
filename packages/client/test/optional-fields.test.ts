import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Loop } from '../src/index';
import { bodyOf, installFetchMock } from './helpers';

describe('Loop extras / optional fields', () => {
  let fetchSpy: ReturnType<typeof installFetchMock>;
  let loop: Loop;

  beforeEach(() => {
    fetchSpy = installFetchMock();
    loop = new Loop({ apiKey: 'k', baseUrl: 'https://loop.example.com' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('spreads severity onto the envelope (not nested in payload)', async () => {
    await loop.signup({ email: 'a@b.com' }, { severity: 'warning' });
    const body = bodyOf(fetchSpy) as { severity: string; payload: Record<string, unknown> };
    expect(body.severity).toBe('warning');
    expect(body.payload).not.toHaveProperty('severity');
  });

  it('threads category override onto the envelope for typed helpers', async () => {
    await loop.signup({ email: 'a@b.com' }, { category: 'users' });
    const body = bodyOf(fetchSpy) as { category: string };
    expect(body.category).toBe('users');
  });

  it('threads links, footerNote, digest, idempotencyKey, actions onto the envelope', async () => {
    await loop.feedback(
      { category: 'bug', message: 'broken' },
      {
        links: [{ label: 'repro', url: 'https://x.com' }],
        footerNote: 'auto-filed',
        digest: true,
        idempotencyKey: 'idem-1',
        actions: ['issue', 'todo'],
      },
    );
    const body = bodyOf(fetchSpy) as Record<string, unknown>;
    expect(body.links).toEqual([{ label: 'repro', url: 'https://x.com' }]);
    expect(body.footerNote).toBe('auto-filed');
    expect(body.digest).toBe(true);
    expect(body.idempotencyKey).toBe('idem-1');
    expect(body.actions).toEqual(['issue', 'todo']);
    // Payload still has the feedback content untouched.
    expect(body.payload).toEqual({ category: 'bug', message: 'broken' });
  });

  it('extras cannot override the locked type field', async () => {
    // The helper signature prevents this at compile time, but the runtime
    // ordering of the spread guarantees it too. The `type: 'signup'` after
    // `...extras` wins.
    await loop.signup({ email: 'a@b.com' }, {
      // @ts-expect-error — type is locked by the helper signature
      type: 'error',
    });
    const body = bodyOf(fetchSpy) as { type: string };
    expect(body.type).toBe('signup');
  });

  it('omitting extras yields an envelope with only type + payload', async () => {
    await loop.signup({ email: 'a@b.com' });
    const body = bodyOf(fetchSpy) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(['payload', 'type']);
  });

  it('generic with extras combines explicit category + extras correctly', async () => {
    await loop.generic({ title: 't', body: 'b' }, 'ops', { severity: 'info', digest: true });
    const body = bodyOf(fetchSpy) as Record<string, unknown>;
    expect(body).toEqual({
      type: 'generic',
      category: 'ops',
      payload: { title: 't', body: 'b' },
      severity: 'info',
      digest: true,
    });
  });
});
