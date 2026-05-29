import { describe, it, expect } from 'vitest';
import { projects, channels, routes, events } from '@/lib/db/schema';
describe('schema', () => {
  it('exports all tables', () => {
    expect(projects).toBeDefined();
    expect(channels).toBeDefined();
    expect(routes).toBeDefined();
    expect(events).toBeDefined();
  });
});

import { parseEvent } from '@/lib/events/schemas';

describe('event envelope', () => {
  it('accepts a valid signup event and defaults category from type', () => {
    const r = parseEvent({ type: 'signup', payload: { email: 'a@b.com' } });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.category).toBe('users');
  });
  it('rejects an unknown type', () => {
    const r = parseEvent({ type: 'nope', payload: {} });
    expect(r.success).toBe(false);
  });
  it('requires category for generic', () => {
    const r = parseEvent({ type: 'generic', payload: { title: 'x', body: 'y' } });
    expect(r.success).toBe(false); // category required when type=generic
  });
  it('surfaces base-level links and footerNote on the parsed event', () => {
    const r = parseEvent({
      type: 'signup',
      links: [{ label: 'View in Sentry', url: 'https://sentry.io/x' }],
      footerNote: 'MRR: $4,210',
      payload: { email: 'a@b.com' },
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.links).toEqual([{ label: 'View in Sentry', url: 'https://sentry.io/x' }]);
      expect(r.data.footerNote).toBe('MRR: $4,210');
    }
  });
  it('parses a downgrade subscription with endsAt', () => {
    const r = parseEvent({
      type: 'subscription',
      payload: { email: 'a@b.com', kind: 'downgrade', endsAt: 'Jun 30, 2026' },
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.category).toBe('revenue');
  });
  it('parses an expired subscription', () => {
    const r = parseEvent({ type: 'subscription', payload: { email: 'a@b.com', kind: 'expired' } });
    expect(r.success).toBe(true);
  });
  it('parses a waitlist signup and still routes to users', () => {
    const r = parseEvent({ type: 'signup', payload: { email: 'a@b.com', kind: 'waitlist' } });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.category).toBe('users');
  });
  it('rejects an unknown signup kind', () => {
    const r = parseEvent({ type: 'signup', payload: { email: 'a@b.com', kind: 'bogus' } });
    expect(r.success).toBe(false);
  });
  it('parses the addon_cancel subscription kind (routes to revenue)', () => {
    const r = parseEvent({ type: 'subscription', payload: { email: 'a@b.com', kind: 'addon_cancel' } });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.category).toBe('revenue');
  });
  it('routes a signup to revenue when the caller overrides the category', () => {
    // A "free signup" is just a signup posted to the revenue channel — a routing
    // override, not a dedicated type/kind.
    const r = parseEvent({ type: 'signup', category: 'revenue', payload: { email: 'a@b.com' } });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.category).toBe('revenue');
  });
  it('parses feedback with captured consoleErrors', () => {
    const r = parseEvent({
      type: 'feedback',
      payload: { category: 'bug', message: 'broke', consoleErrors: ['TypeError: x', 'Warning: y'] },
    });
    expect(r.success).toBe(true);
    if (r.success) expect((r.data.payload as { consoleErrors: string[] }).consoleErrors).toHaveLength(2);
  });
});
