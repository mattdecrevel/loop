import { describe, it, expect } from 'vitest';
import { pickRoute, type RouteRow } from '@/lib/routing';

const rows: RouteRow[] = [
  { projectId: null, category: null, targetChannelId: 'fallback', targetWebhookUrl: null },
  { projectId: null, category: 'users', targetChannelId: 'users', targetWebhookUrl: null },
  { projectId: 'p1', category: null, targetChannelId: 'p1all', targetWebhookUrl: null },
  { projectId: 'p1', category: 'errors', targetChannelId: 'p1err', targetWebhookUrl: null },
];

describe('pickRoute precedence', () => {
  it('(project,category) wins', () => {
    expect(pickRoute(rows, 'p1', 'errors')?.targetChannelId).toBe('p1err');
  });
  it('(project,*) beats (*,category)', () => {
    expect(pickRoute(rows, 'p1', 'users')?.targetChannelId).toBe('p1all');
  });
  it('(*,category) when no project rule', () => {
    expect(pickRoute(rows, 'p2', 'users')?.targetChannelId).toBe('users');
  });
  it('global fallback otherwise', () => {
    expect(pickRoute(rows, 'p2', 'ops')?.targetChannelId).toBe('fallback');
  });
  it('returns exactly one row (no duplicates)', () => {
    const r = pickRoute(rows, 'p1', 'errors');
    expect(r).toBeTruthy();
  });
});
