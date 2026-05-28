import { describe, it, expect, vi, beforeEach } from 'vitest';

interface ReminderRow {
  id: string;
  text: string;
  channelId: string;
  messageTs: string | null;
  remindAt: Date;
  status: 'pending' | 'sent' | 'cancelled';
}

let due: ReminderRow[] = [];
const updatedIds: string[] = [];

// `select().from(reminders).where(...)` is awaited, so .where() must be thenable.
// `update().set().where(eq(reminders.id, r.id))` -> capture which ids got updated.
// We can't see the id from inside the captured where() call without a richer
// stub, so we rely on call ordering: each successful post triggers one update,
// in the same iteration order as `due`.
let updateCursor = 0;

vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          then: (resolve: (v: ReminderRow[]) => void) => resolve(due),
        }),
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => {
          if (updateCursor < due.length) updatedIds.push(due[updateCursor].id);
          updateCursor++;
          return Promise.resolve();
        },
      }),
    }),
  },
}));

const postToChannel = vi.fn(async (..._args: unknown[]) => ({ ok: true } as { ok: boolean; ts?: string; channel?: string; error?: string }));
vi.mock('@/lib/slack/transport', () => ({
  postToChannel: (...args: unknown[]) => postToChannel(...(args as [])),
}));

import { GET } from '@/app/api/cron/reminders/route';

function mkReq() {
  return new Request('http://localhost/api/cron/reminders', {
    headers: { authorization: 'Bearer test-secret' },
  });
}

beforeEach(() => {
  due = [];
  updatedIds.length = 0;
  updateCursor = 0;
  postToChannel.mockReset();
  process.env.CRON_SECRET = 'test-secret';
});

describe('GET /api/cron/reminders', () => {
  it('returns 401 without authorization', async () => {
    const res = await GET(new Request('http://localhost/api/cron/reminders'));
    expect(res.status).toBe(401);
    expect(postToChannel).not.toHaveBeenCalled();
  });

  it('returns {ok:true, due:0, sent:0} when nothing is due', async () => {
    due = [];
    const res = await GET(mkReq());
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, due: 0, sent: 0 });
    expect(postToChannel).not.toHaveBeenCalled();
  });

  it('posts each due reminder to its channel and marks it sent', async () => {
    // The query is "status=pending AND remindAt <= now()". The route trusts the
    // DB filter; we simulate that by only feeding it rows that match.
    due = [
      { id: 'r1', text: 'do the thing', channelId: 'C111', messageTs: null, remindAt: new Date(Date.now() - 60_000), status: 'pending' },
      { id: 'r2', text: 'and the other', channelId: 'C222', messageTs: '1700.1', remindAt: new Date(Date.now() - 30_000), status: 'pending' },
    ];
    postToChannel.mockResolvedValue({ ok: true });

    const res = await GET(mkReq());
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, due: 2, sent: 2 });
    expect(postToChannel).toHaveBeenCalledTimes(2);

    // Reminder 1 has no messageTs, so threadTs arg is undefined.
    const call1 = postToChannel.mock.calls[0];
    expect(call1[0]).toContain('do the thing');
    expect(call1[2]).toBe('C111');
    expect(call1[3]).toBeUndefined();

    // Reminder 2 has a messageTs → posts as a threaded reply.
    const call2 = postToChannel.mock.calls[1];
    expect(call2[2]).toBe('C222');
    expect(call2[3]).toBe('1700.1');

    // Both got status-flipped to sent.
    expect(updatedIds).toEqual(['r1', 'r2']);
  });

  it('does NOT mark a reminder sent when postToChannel fails', async () => {
    due = [{ id: 'r-fail', text: 'fail me', channelId: 'C1', messageTs: null, remindAt: new Date(Date.now() - 1000), status: 'pending' }];
    postToChannel.mockResolvedValue({ ok: false, error: 'channel_not_found' });

    const res = await GET(mkReq());
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, due: 1, sent: 0 });
    expect(updatedIds).toEqual([]); // no update issued on failure
  });
});
