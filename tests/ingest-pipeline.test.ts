import { describe, it, expect, vi, beforeEach } from 'vitest';

// State captured by mocks.
const inserted: Record<string, unknown>[] = [];
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

const resolveDestination = vi.fn();
vi.mock('@/lib/routing', () => ({ resolveDestination: (...args: unknown[]) => resolveDestination(...args) }));

const postToChannel = vi.fn(async () => ({ ok: true, ts: '1700000000.000100', channel: 'C123' }));
const postToWebhook = vi.fn(async () => ({ ok: true }));
vi.mock('@/lib/slack/transport', () => ({
  postToChannel: (...args: unknown[]) => postToChannel(...(args as [])),
  postToWebhook: (...args: unknown[]) => postToWebhook(...(args as [])),
}));

import { ingestEvent } from '@/lib/ingest';
import type { ParsedEvent } from '@/lib/events/schemas';
import type { AuthedProject } from '@/lib/auth';

const project: AuthedProject = { id: 'p1', slug: 'demo', name: 'Demo', githubRepo: null, autofixEnabled: false };

beforeEach(() => {
  inserted.length = 0;
  selectResult = [];
  resolveDestination.mockReset();
  postToChannel.mockClear();
  postToWebhook.mockClear();
});

describe('ingestEvent — routed posting', () => {
  it('posts to a channel destination and records the event as "posted" with slack ts', async () => {
    resolveDestination.mockResolvedValueOnce({ kind: 'channel', slackChannelId: 'C123' });
    const ev: ParsedEvent = {
      type: 'signup', category: 'users', severity: 'info', actions: [], digest: false,
      payload: { email: 'a@b.com' },
    };
    const result = await ingestEvent(project, ev);
    expect(result.status).toBe('posted');
    expect(postToChannel).toHaveBeenCalledOnce();
    expect(postToWebhook).not.toHaveBeenCalled();
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ status: 'posted', slackChannelId: 'C123' });
  });

  it('posts to a webhook destination and records as "posted"', async () => {
    resolveDestination.mockResolvedValueOnce({ kind: 'webhook', url: 'https://hooks.slack.com/x' });
    const ev: ParsedEvent = {
      type: 'signup', category: 'users', severity: 'info', actions: [], digest: false,
      payload: { email: 'a@b.com' },
    };
    const result = await ingestEvent(project, ev);
    expect(result.status).toBe('posted');
    expect(postToWebhook).toHaveBeenCalledOnce();
    expect(postToChannel).not.toHaveBeenCalled();
    expect(inserted[0]).toMatchObject({ status: 'posted' });
  });

  it('records as "skipped" when no route resolves', async () => {
    resolveDestination.mockResolvedValueOnce(null);
    const ev: ParsedEvent = {
      type: 'signup', category: 'users', severity: 'info', actions: [], digest: false,
      payload: { email: 'a@b.com' },
    };
    const result = await ingestEvent(project, ev);
    expect(result.status).toBe('skipped_no_route');
    expect(postToChannel).not.toHaveBeenCalled();
    expect(postToWebhook).not.toHaveBeenCalled();
    expect(inserted[0]).toMatchObject({ status: 'skipped' });
  });

  it('records "failed" when the transport returns ok:false', async () => {
    resolveDestination.mockResolvedValueOnce({ kind: 'channel', slackChannelId: 'C123' });
    postToChannel.mockResolvedValueOnce({ ok: false, error: 'channel_not_found' } as never);
    const ev: ParsedEvent = {
      type: 'signup', category: 'users', severity: 'info', actions: [], digest: false,
      payload: { email: 'a@b.com' },
    };
    const result = await ingestEvent(project, ev);
    expect(result.status).toBe('failed');
    expect(inserted[0]).toMatchObject({ status: 'failed' });
  });

  it('digest:true info events do NOT invoke any transport', async () => {
    const ev: ParsedEvent = {
      type: 'generic', category: 'ops', severity: 'info', actions: [], digest: true,
      payload: { title: 'cache warmed', body: '' },
    };
    await ingestEvent(project, ev);
    expect(postToChannel).not.toHaveBeenCalled();
    expect(postToWebhook).not.toHaveBeenCalled();
    expect(resolveDestination).not.toHaveBeenCalled();
    expect(inserted[0]).toMatchObject({ status: 'digested' });
  });
});
