import { describe, it, expect } from 'vitest';
import { validateIngest } from '@/lib/ingest';

/**
 * Covers the full type matrix accepted by validateIngest. For each event type
 * we send a representative valid payload and assert (a) ok=true and (b) the
 * category falls back from TYPE_DEFAULT_CATEGORY unless overridden.
 */
describe('validateIngest — every event type round-trips', () => {
  it('accepts error', () => {
    const r = validateIngest({ type: 'error', payload: { message: 'boom', route: '/x', source: 'sentry' } });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.event.category).toBe('errors');
  });
  it('accepts signup', () => {
    const r = validateIngest({ type: 'signup', payload: { email: 'a@b.com' } });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.event.category).toBe('users');
  });
  it('accepts subscription', () => {
    const r = validateIngest({ type: 'subscription', payload: { email: 'a@b.com', kind: 'new', amount: 49, interval: 'month' } });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.event.category).toBe('revenue');
  });
  it('accepts feedback', () => {
    const r = validateIngest({ type: 'feedback', payload: { category: 'bug', message: 'broken' } });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.event.category).toBe('feedback');
  });
  it('accepts cron', () => {
    const r = validateIngest({ type: 'cron', payload: { name: 'nightly', ok: true, summary: 'done' } });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.event.category).toBe('ops');
  });
  it('accepts infra', () => {
    const r = validateIngest({ type: 'infra', payload: { host: 'web-1', message: 'high cpu' } });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.event.category).toBe('ops');
  });
  it('accepts booking', () => {
    const r = validateIngest({ type: 'booking', payload: { name: 'Ada', email: 'a@b.com', start: 'May 30' } });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.event.category).toBe('bookings');
  });
  it('accepts contact', () => {
    const r = validateIngest({ type: 'contact', payload: { name: 'Ada', email: 'a@b.com', message: 'hi' } });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.event.category).toBe('bookings');
  });
  it('accepts seo_report', () => {
    const r = validateIngest({ type: 'seo_report', payload: { siteLabel: 'x.dev', clicks: 12, impressions: 100 } });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.event.category).toBe('seo');
  });
  it('accepts generic when explicit category is provided', () => {
    const r = validateIngest({ type: 'generic', category: 'ops', payload: { title: 'Deploy', body: 'shipped' } });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.event.category).toBe('ops');
  });
  it('accepts raw when explicit category is provided', () => {
    const r = validateIngest({ type: 'raw', category: 'ops', payload: { text: 'hello' } });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.event.category).toBe('ops');
  });
});

describe('validateIngest — rejection paths', () => {
  it('rejects an unknown event type', () => {
    const r = validateIngest({ type: 'bogus', payload: {} });
    expect(r.ok).toBe(false);
  });
  it('rejects a signup without the required email field', () => {
    const r = validateIngest({ type: 'signup', payload: { name: 'No Email' } });
    expect(r.ok).toBe(false);
  });
  it('rejects an error without the required message field', () => {
    const r = validateIngest({ type: 'error', payload: { route: '/x' } });
    expect(r.ok).toBe(false);
  });
  it('rejects feedback with an unknown sub-category', () => {
    const r = validateIngest({ type: 'feedback', payload: { category: 'rant', message: 'x' } });
    expect(r.ok).toBe(false);
  });
  it('rejects subscription with an unknown kind', () => {
    const r = validateIngest({ type: 'subscription', payload: { email: 'a@b.com', kind: 'wat' } });
    expect(r.ok).toBe(false);
  });
  it('rejects generic when no category is provided (no default)', () => {
    const r = validateIngest({ type: 'generic', payload: { title: 'x', body: 'y' } });
    expect(r.ok).toBe(false);
  });
  it('rejects raw when no category is provided (no default)', () => {
    const r = validateIngest({ type: 'raw', payload: { text: 'x' } });
    expect(r.ok).toBe(false);
  });
});

describe('validateIngest — category override', () => {
  it('honours an explicit category override over the type default', () => {
    const r = validateIngest({ type: 'signup', category: 'ops', payload: { email: 'a@b.com' } });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.event.category).toBe('ops');
  });
});
