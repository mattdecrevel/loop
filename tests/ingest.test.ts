import { describe, it, expect, vi, beforeEach } from 'vitest';

// Capture inserted rows; never touch a real DB.
const inserted: Record<string, unknown>[] = [];
// Configurable result for the idempotency lookup `select(...).from(...).where(...).limit(1)`.
let selectResult: Array<{ id: string }> = [];
vi.mock('@/lib/db', () => ({
  db: {
    insert: () => ({ values: (v: Record<string, unknown>) => { inserted.push(v); return Promise.resolve(); } }),
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => selectResult,
        }),
      }),
    }),
  },
}));
// resolveDestination + transport are only reached on the non-suppressed path;
// stub them so an accidental fall-through doesn't hit the network.
const resolveDestination = vi.fn(async (..._args: unknown[]) => null);
vi.mock('@/lib/routing', () => ({ resolveDestination: (...args: unknown[]) => resolveDestination(...args) }));
const postToChannel = vi.fn(async () => ({ ok: true }));
const postToWebhook = vi.fn(async () => ({ ok: true }));
vi.mock('@/lib/slack/transport', () => ({
  postToChannel: (...args: unknown[]) => postToChannel(...(args as [])),
  postToWebhook: (...args: unknown[]) => postToWebhook(...(args as [])),
}));

import { validateIngest, ingestEvent } from '@/lib/ingest';
import type { ParsedEvent } from '@/lib/events/schemas';
import type { AuthedProject } from '@/lib/auth';

const project: AuthedProject = { id: 'p1', slug: 'demo', name: 'Demo', githubRepo: null, autofixEnabled: false };

describe('validateIngest', () => {
  it('rejects unknown type with a 400-shaped result', () => {
    const r = validateIngest({ type: 'bogus', payload: {} });
    expect(r.ok).toBe(false);
  });
  it('accepts a valid event', () => {
    const r = validateIngest({ type: 'cron', payload: { name: 'x', ok: true } });
    expect(r.ok).toBe(true);
  });
});

describe('ingestEvent digest suppression', () => {
  beforeEach(() => {
    inserted.length = 0;
    selectResult = [];
    resolveDestination.mockClear();
    postToChannel.mockClear();
    postToWebhook.mockClear();
  });

  it('suppresses digest:true + info events as status "digested" without resolving a route', async () => {
    const ev: ParsedEvent = {
      type: 'generic', category: 'ops', severity: 'info', actions: [], digest: true,
      payload: { title: 'Cache warmed', body: '' },
    };
    const result = await ingestEvent(project, ev);
    expect(result.status).toBe('digested');
    expect(resolveDestination).not.toHaveBeenCalled();
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ status: 'digested', digest: true, category: 'ops' });
  });

  it('short-circuits as "duplicate" when an existing event matches idempotencyKey, without routing or posting', async () => {
    selectResult = [{ id: 'existing-event-id' }];
    const ev: ParsedEvent = {
      type: 'cron', category: 'ops', severity: 'info', actions: [], digest: false,
      payload: { name: 'nightly', ok: true },
      idempotencyKey: 'cron-nightly-2026-05-28',
    };
    const result = await ingestEvent(project, ev);
    expect(result.status).toBe('duplicate');
    expect(resolveDestination).not.toHaveBeenCalled();
    expect(postToChannel).not.toHaveBeenCalled();
    expect(postToWebhook).not.toHaveBeenCalled();
    expect(inserted).toHaveLength(0);
  });

  it('does NOT suppress a digest event whose severity is not info', async () => {
    const ev: ParsedEvent = {
      type: 'error', category: 'errors', severity: 'error', actions: [], digest: true,
      payload: { message: 'boom' },
    };
    await ingestEvent(project, ev);
    expect(resolveDestination).toHaveBeenCalled();
  });
});
