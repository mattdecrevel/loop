import { describe, it, expect, vi, beforeEach } from 'vitest';

let pending: Record<string, unknown>[] = [];
let projectsByQuery: Record<string, unknown>[] = [];
const updates: Array<{ ids: string[] | null }> = [];

// `select().from(events).where(...)` and `select().from(projects).where(...).limit(1)`.
// We use a simple from-name dispatch by stamping a marker on the table object.
vi.mock('@/lib/db/schema', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/lib/db/schema');
  return actual;
});

vi.mock('@/lib/db', () => {
  return {
    db: {
      select: () => ({
        from: (_t: unknown) => {
          // events.where: returns thenable resolving to `pending`.
          // projects.where: chain .limit() returning projectsByQuery.
          const chain = {
            where: (_w: unknown) => {
              return {
                then: (resolve: (v: unknown) => void) => resolve(pending),
                limit: async (_n: number) => projectsByQuery,
              };
            },
          };
          return chain;
        },
      }),
      update: (_t: unknown) => ({
        set: (_v: unknown) => ({
          where: (_w: unknown) => {
            updates.push({ ids: null });
            return Promise.resolve();
          },
        }),
      }),
    },
  };
});

const resolveDestination = vi.fn();
vi.mock('@/lib/routing', () => ({ resolveDestination: (...args: unknown[]) => resolveDestination(...args) }));

const postToChannel = vi.fn(async (..._args: unknown[]) => ({ ok: true, ts: '1.2', channel: 'C1' }));
const postToWebhook = vi.fn(async (..._args: unknown[]) => ({ ok: true }));
vi.mock('@/lib/slack/transport', () => ({
  postToChannel: (...args: unknown[]) => postToChannel(...(args as [])),
  postToWebhook: (...args: unknown[]) => postToWebhook(...(args as [])),
}));

import { GET } from '@/app/api/cron/digest/route';

function mkReq() {
  return new Request('http://localhost/api/cron/digest', { headers: { authorization: 'Bearer test-secret' } });
}

beforeEach(() => {
  pending = [];
  projectsByQuery = [];
  updates.length = 0;
  resolveDestination.mockReset();
  postToChannel.mockClear();
  postToWebhook.mockClear();
  process.env.CRON_SECRET = 'test-secret';
});

describe('GET /api/cron/digest', () => {
  it('returns 401 when authorization is missing', async () => {
    const res = await GET(new Request('http://localhost/api/cron/digest'));
    expect(res.status).toBe(401);
  });

  it('returns {ok:true, groups:0, posted:0} when nothing is pending', async () => {
    pending = [];
    const res = await GET(mkReq());
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, groups: 0, posted: 0 });
    expect(postToChannel).not.toHaveBeenCalled();
  });

  it('groups multi-category pending events and posts one message per group', async () => {
    // 3 events for p1 → 2 distinct categories. Expect 2 groups, 2 posts.
    pending = [
      { id: 'e1', projectId: 'p1', type: 'generic', category: 'ops', severity: 'info', payload: { title: 'cache warmed' }, status: 'digested', digestPostedAt: null, createdAt: new Date() },
      { id: 'e2', projectId: 'p1', type: 'generic', category: 'ops', severity: 'info', payload: { title: 'queue drained' }, status: 'digested', digestPostedAt: null, createdAt: new Date() },
      { id: 'e3', projectId: 'p1', type: 'signup', category: 'users', severity: 'info', payload: { email: 'a@b.com' }, status: 'digested', digestPostedAt: null, createdAt: new Date() },
    ];
    projectsByQuery = [{ id: 'p1', name: 'Demo', slug: 'demo' }];
    resolveDestination.mockResolvedValue({ kind: 'channel', slackChannelId: 'C-DIGEST' });

    const res = await GET(mkReq());
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.groups).toBe(2);
    expect(body.posted).toBe(2);
    expect(postToChannel).toHaveBeenCalledTimes(2);

    // Both posts should target the resolved channel id.
    for (const call of postToChannel.mock.calls) {
      expect(call[2]).toBe('C-DIGEST');
    }
  });
});
