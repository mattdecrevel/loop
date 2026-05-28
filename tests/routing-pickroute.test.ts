import { describe, it, expect } from 'vitest';
import { pickRoute, type RouteRow } from '@/lib/routing';

/**
 * Augments tests/routing.test.ts with edge cases the existing fixture doesn't
 * exercise: webhook URL targets, unknown category fall-through, and the
 * "more specific match wins" guarantee against shuffled input order.
 */
describe('pickRoute — webhook targets', () => {
  const rows: RouteRow[] = [
    { projectId: null, category: null, targetChannelId: null, targetWebhookUrl: 'https://hooks.slack.com/global' },
    { projectId: 'p1', category: 'errors', targetChannelId: null, targetWebhookUrl: 'https://hooks.slack.com/p1err' },
    { projectId: 'p1', category: 'users', targetChannelId: 'ch1', targetWebhookUrl: null },
  ];

  it('returns a webhook URL on the most-specific match', () => {
    const picked = pickRoute(rows, 'p1', 'errors');
    expect(picked?.targetWebhookUrl).toBe('https://hooks.slack.com/p1err');
    expect(picked?.targetChannelId).toBeNull();
  });

  it('returns a channel target for a different category on the same project', () => {
    const picked = pickRoute(rows, 'p1', 'users');
    expect(picked?.targetChannelId).toBe('ch1');
    expect(picked?.targetWebhookUrl).toBeNull();
  });

  it('falls through to the global webhook for an unrouted category', () => {
    const picked = pickRoute(rows, 'p1', 'feedback');
    expect(picked?.targetWebhookUrl).toBe('https://hooks.slack.com/global');
  });
});

describe('pickRoute — order independence', () => {
  it('still picks the most-specific match when rows are reversed', () => {
    const rows: RouteRow[] = [
      { projectId: null, category: null, targetChannelId: 'fallback', targetWebhookUrl: null },
      { projectId: 'p1', category: 'errors', targetChannelId: 'p1err', targetWebhookUrl: null },
    ];
    expect(pickRoute(rows, 'p1', 'errors')?.targetChannelId).toBe('p1err');
    expect(pickRoute([...rows].reverse(), 'p1', 'errors')?.targetChannelId).toBe('p1err');
  });

  it('returns null when no rule matches (e.g. only other-project rules present)', () => {
    const rows: RouteRow[] = [
      { projectId: 'other', category: 'errors', targetChannelId: 'x', targetWebhookUrl: null },
    ];
    expect(pickRoute(rows, 'p1', 'errors')).toBeNull();
  });
});
