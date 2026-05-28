import { NextResponse } from 'next/server';
import { and, eq, gte, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { events, projects } from '@/lib/db/schema';
import { richMessage } from '@/lib/render/blocks';
import { resolveDestination } from '@/lib/routing';
import { postToChannel, postToWebhook } from '@/lib/slack/transport';
import { groupPendingForDigest, digestLineFor } from '@/lib/digest/group';

export const runtime = 'nodejs';

const WINDOW_MS = 6 * 60 * 60 * 1000; // rolling 6h window

/** Fail-closed bearer auth. Returns false when CRON_SECRET is unset or the header mismatches. */
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

const CATEGORY_EMOJI: Record<string, string> = {
  users: '👤', revenue: '💳', feedback: '💬', errors: '🚨', seo: '🔎', ops: '⚙️', bookings: '📅',
};

export async function GET(req: Request) {
  if (!authorized(req)) return new NextResponse('unauthorized', { status: 401 });

  const since = new Date(Date.now() - WINDOW_MS);
  const pending = await db.select().from(events).where(
    and(
      eq(events.status, 'digested'),
      isNull(events.digestPostedAt),
      gte(events.createdAt, since),
    ),
  );

  if (pending.length === 0) return NextResponse.json({ ok: true, groups: 0, posted: 0, events: 0 });

  // Group by (projectId, category) — pure helper for testability.
  const groupList = groupPendingForDigest(pending);

  let posted = 0;
  const stampedIds: string[] = [];

  for (const g of groupList) {
    if (!g.projectId) continue; // can't resolve a route without a project; skip (leave unstamped to retry)
    const [proj] = await db.select().from(projects).where(eq(projects.id, g.projectId)).limit(1);
    const dest = await resolveDestination(g.projectId, g.category);
    if (!dest) {
      // No route — stamp anyway so we don't re-process forever.
      stampedIds.push(...g.rows.map((r) => r.id));
      continue;
    }

    const emoji = CATEGORY_EMOJI[g.category] ?? 'ℹ️';
    const lines = g.rows.slice(0, 20).map(digestLineFor);
    const more = g.rows.length > 20 ? `…and ${g.rows.length - 20} more` : null;
    const blocks = richMessage({
      emoji,
      title: `${g.category} digest`,
      subject: `${g.rows.length} update${g.rows.length === 1 ? '' : 's'}`,
      body: lines.join('\n'),
      meta: [more],
      siteLabel: proj?.name,
    });
    const text = `${g.category} digest — ${g.rows.length} update${g.rows.length === 1 ? '' : 's'}`;

    const result = dest.kind === 'channel'
      ? await postToChannel(text, blocks, dest.slackChannelId)
      : await postToWebhook(text, blocks, dest.url);

    if (result.ok) {
      posted++;
      stampedIds.push(...g.rows.map((r) => r.id));
    }
  }

  if (stampedIds.length) {
    await db.update(events).set({ digestPostedAt: sql`now()` }).where(inArray(events.id, stampedIds));
  }

  return NextResponse.json({ ok: true, groups: groupList.length, posted, events: stampedIds.length });
}
