import { NextResponse } from 'next/server';
import { and, eq, lte, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { reminders } from '@/lib/db/schema';
import { section } from '@/lib/render/blocks';
import { postToChannel } from '@/lib/slack/transport';

export const runtime = 'nodejs';

/** Fail-closed bearer auth. Returns false when CRON_SECRET is unset or the header mismatches. */
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!authorized(req)) return new NextResponse('unauthorized', { status: 401 });

  // Due, still-pending reminders.
  const due = await db.select().from(reminders)
    .where(and(eq(reminders.status, 'pending'), lte(reminders.remindAt, sql`now()`)));

  let sent = 0;
  for (const r of due) {
    const text = `⏰ Reminder: ${r.text}`;
    const result = await postToChannel(text, [section(text)], r.channelId, r.messageTs ?? undefined);
    if (result.ok) {
      await db.update(reminders)
        .set({ status: 'sent', sentAt: new Date() })
        .where(eq(reminders.id, r.id));
      sent++;
    }
  }

  return NextResponse.json({ ok: true, due: due.length, sent });
}
