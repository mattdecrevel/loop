import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Loop } from '../src/index';
import { bodyOf, headerOf, installFetchMock, urlOf } from './helpers';

const API_KEY = 'test-key-abc';

describe('Loop typed helpers', () => {
  let fetchSpy: ReturnType<typeof installFetchMock>;
  let loop: Loop;

  beforeEach(() => {
    fetchSpy = installFetchMock();
    loop = new Loop({ apiKey: API_KEY, baseUrl: 'https://loop.example.com' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('posts to /api/events with bearer auth and JSON content type', async () => {
    await loop.signup({ email: 'a@b.com' });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(urlOf(fetchSpy)).toBe('https://loop.example.com/api/events');
    expect(headerOf(fetchSpy, 'Authorization')).toBe(`Bearer ${API_KEY}`);
    expect(headerOf(fetchSpy, 'Content-Type')).toBe('application/json');
  });

  it('strips trailing slash from baseUrl', async () => {
    const l = new Loop({ apiKey: API_KEY, baseUrl: 'https://loop.example.com/' });
    await l.signup({ email: 'a@b.com' });
    expect(urlOf(fetchSpy)).toBe('https://loop.example.com/api/events');
  });

  it('no-ops when apiKey is empty (does not call fetch)', async () => {
    const l = new Loop({ apiKey: '', baseUrl: 'https://loop.example.com' });
    await l.signup({ email: 'a@b.com' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  describe('signup', () => {
    it('sends { type: "signup", payload: { email, name } }', async () => {
      await loop.signup({ email: 'a@b.com', name: 'Ada' });
      expect(bodyOf(fetchSpy)).toEqual({ type: 'signup', payload: { email: 'a@b.com', name: 'Ada' } });
    });
  });

  describe('signup', () => {
    it('threads a waitlist kind through into the payload', async () => {
      await loop.signup({ email: 'a@b.com', kind: 'waitlist' });
      expect(bodyOf(fetchSpy)).toEqual({ type: 'signup', payload: { email: 'a@b.com', kind: 'waitlist' } });
    });
  });

  describe('subscription', () => {
    for (const kind of ['new', 'cancel', 'payment_failed', 'addon', 'addon_cancel'] as const) {
      it(`sends type:"subscription" for kind="${kind}"`, async () => {
        await loop.subscription({ email: 'a@b.com', kind, plan: 'pro' });
        expect(bodyOf(fetchSpy)).toEqual({
          type: 'subscription',
          payload: { email: 'a@b.com', kind, plan: 'pro' },
        });
      });
    }
  });

  describe('feedback', () => {
    for (const category of ['bug', 'question', 'feature', 'general'] as const) {
      it(`sends type:"feedback" for category="${category}"`, async () => {
        await loop.feedback({ category, message: 'hello' });
        expect(bodyOf(fetchSpy)).toEqual({
          type: 'feedback',
          payload: { category, message: 'hello' },
        });
      });
    }
    it('threads captured consoleErrors through into the payload', async () => {
      await loop.feedback({ category: 'bug', message: 'broke', consoleErrors: ['TypeError: x'] });
      expect(bodyOf(fetchSpy)).toEqual({
        type: 'feedback',
        payload: { category: 'bug', message: 'broke', consoleErrors: ['TypeError: x'] },
      });
    });
  });

  describe('cron', () => {
    it('sends ok:true', async () => {
      await loop.cron({ name: 'nightly', ok: true, summary: 'done' });
      expect(bodyOf(fetchSpy)).toEqual({
        type: 'cron',
        payload: { name: 'nightly', ok: true, summary: 'done' },
      });
    });
    it('sends ok:false', async () => {
      await loop.cron({ name: 'nightly', ok: false, summary: 'failed' });
      expect(bodyOf(fetchSpy)).toEqual({
        type: 'cron',
        payload: { name: 'nightly', ok: false, summary: 'failed' },
      });
    });
  });

  describe('booking', () => {
    it('sends type:"booking"', async () => {
      await loop.booking({ name: 'Ada', email: 'a@b.com', start: '2025-01-01T10:00Z' });
      expect(bodyOf(fetchSpy)).toMatchObject({
        type: 'booking',
        payload: { name: 'Ada', email: 'a@b.com', start: '2025-01-01T10:00Z' },
      });
    });
  });

  describe('contact', () => {
    it('sends type:"contact"', async () => {
      await loop.contact({ name: 'Ada', email: 'a@b.com', message: 'hi' });
      expect(bodyOf(fetchSpy)).toEqual({
        type: 'contact',
        payload: { name: 'Ada', email: 'a@b.com', message: 'hi' },
      });
    });
  });

  describe('infra', () => {
    it('sends type:"infra"', async () => {
      await loop.infra({ host: 'web-1', message: 'cpu high', metric: '95%' });
      expect(bodyOf(fetchSpy)).toEqual({
        type: 'infra',
        payload: { host: 'web-1', message: 'cpu high', metric: '95%' },
      });
    });
  });

  describe('error', () => {
    it('extracts message and stack from an Error', async () => {
      const e = new Error('boom');
      await loop.error(e);
      const body = bodyOf(fetchSpy) as { type: string; severity: string; payload: { message: string; stack?: string } };
      expect(body.type).toBe('error');
      expect(body.severity).toBe('error');
      expect(body.payload.message).toBe('boom');
      expect(typeof body.payload.stack).toBe('string');
      expect(body.payload.stack).toContain('boom');
    });

    it('coerces a non-Error into an Error and still extracts message', async () => {
      await loop.error('something went wrong');
      const body = bodyOf(fetchSpy) as { payload: { message: string } };
      expect(body.payload.message).toBe('something went wrong');
    });

    it('threads route + source through into payload', async () => {
      await loop.error(new Error('x'), { route: '/api/foo', source: 'web' });
      const body = bodyOf(fetchSpy) as { payload: { route?: string; source?: string } };
      expect(body.payload.route).toBe('/api/foo');
      expect(body.payload.source).toBe('web');
    });

    it('allows callers to override severity via extras', async () => {
      await loop.error(new Error('x'), { severity: 'warning' });
      const body = bodyOf(fetchSpy) as { severity: string };
      expect(body.severity).toBe('warning');
    });
  });

  describe('generic', () => {
    it('requires explicit category and includes it on the envelope', async () => {
      await loop.generic({ title: 't', body: 'b' }, 'ops');
      expect(bodyOf(fetchSpy)).toEqual({
        type: 'generic',
        category: 'ops',
        payload: { title: 't', body: 'b' },
      });
    });
  });

  describe('raw', () => {
    it('requires explicit category and passes blocks through', async () => {
      await loop.raw({ text: 'fallback', blocks: [{ type: 'section' }] }, 'errors');
      expect(bodyOf(fetchSpy)).toEqual({
        type: 'raw',
        category: 'errors',
        payload: { text: 'fallback', blocks: [{ type: 'section' }] },
      });
    });
  });

  describe('notify (direct path)', () => {
    it('passes through the envelope unchanged', async () => {
      await loop.notify({
        type: 'signup',
        payload: { email: 'a@b.com' },
        severity: 'info',
        links: [{ label: 'profile', url: 'https://x.com' }],
      });
      expect(bodyOf(fetchSpy)).toEqual({
        type: 'signup',
        payload: { email: 'a@b.com' },
        severity: 'info',
        links: [{ label: 'profile', url: 'https://x.com' }],
      });
    });
  });
});
