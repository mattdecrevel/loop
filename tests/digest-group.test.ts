import { describe, it, expect } from 'vitest';
import { groupPendingForDigest, digestLineFor, type DigestEventRow } from '@/lib/digest/group';

function row(partial: Partial<DigestEventRow>): DigestEventRow {
  return {
    id: 'e-' + Math.random().toString(36).slice(2),
    projectId: 'p1',
    type: 'generic',
    category: 'ops',
    severity: 'info',
    payload: {},
    status: 'digested',
    slackTs: null,
    slackChannelId: null,
    githubIssueNumber: null,
    githubIssueUrl: null,
    resolvedAt: null,
    idempotencyKey: null,
    digest: true,
    digestPostedAt: null,
    createdAt: new Date(),
    ...partial,
  } as DigestEventRow;
}

describe('groupPendingForDigest', () => {
  it('returns [] for an empty pending list', () => {
    expect(groupPendingForDigest([])).toEqual([]);
  });

  it('produces one group per (projectId, category) bucket', () => {
    const rows = [
      row({ projectId: 'p1', category: 'ops' }),
      row({ projectId: 'p1', category: 'ops' }),
      row({ projectId: 'p1', category: 'users' }),
      row({ projectId: 'p2', category: 'ops' }),
    ];
    const groups = groupPendingForDigest(rows);
    expect(groups).toHaveLength(3);
    const ops = groups.find((g) => g.projectId === 'p1' && g.category === 'ops');
    expect(ops?.rows).toHaveLength(2);
  });

  it('treats null projectId as its own bucket keyed as "global"', () => {
    const rows = [
      row({ projectId: null, category: 'ops' }),
      row({ projectId: 'p1', category: 'ops' }),
    ];
    const groups = groupPendingForDigest(rows);
    expect(groups).toHaveLength(2);
    expect(groups.some((g) => g.projectId === null)).toBe(true);
  });
});

describe('digestLineFor', () => {
  it('prefers payload.title when present', () => {
    expect(digestLineFor(row({ payload: { title: 'Deploy', body: 'shipped' } }))).toBe('• Deploy');
  });
  it('falls back to payload.message', () => {
    expect(digestLineFor(row({ payload: { message: 'thing happened' } }))).toBe('• thing happened');
  });
  it('falls back to payload.name', () => {
    expect(digestLineFor(row({ payload: { name: 'nightly' } }))).toBe('• nightly');
  });
  it('falls back to payload.email', () => {
    expect(digestLineFor(row({ payload: { email: 'a@b.com' } }))).toBe('• a@b.com');
  });
  it('falls back to ev.type when nothing useful is present', () => {
    expect(digestLineFor(row({ type: 'generic', payload: {} }))).toBe('• generic');
  });
});
