import { NextResponse } from 'next/server';
import { desc, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { projects, channels, routes, events, todos, reminders } from '@/lib/db/schema';

export const runtime = 'nodejs';

/** Fail-closed bearer auth. Returns false when LOOP_READ_KEY is unset or the header mismatches. */
function authorized(req: Request): boolean {
  const key = process.env.LOOP_READ_KEY;
  if (!key) return false;
  return req.headers.get('authorization') === `Bearer ${key}`;
}

async function count(table: typeof projects | typeof channels | typeof routes | typeof events): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(table);
  return row?.n ?? 0;
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const [
    projectCount,
    channelCount,
    routeCount,
    eventCount,
    openTodos,
    pendingReminders,
    recentEvents,
  ] = await Promise.all([
    count(projects),
    count(channels),
    count(routes),
    count(events),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(todos)
      .where(eq(todos.status, 'open'))
      .then((r) => r[0]?.n ?? 0),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(reminders)
      .where(eq(reminders.status, 'pending'))
      .then((r) => r[0]?.n ?? 0),
    db
      .select({
        type: events.type,
        category: events.category,
        severity: events.severity,
        status: events.status,
        projectSlug: projects.slug,
        createdAt: events.createdAt,
      })
      .from(events)
      .leftJoin(projects, eq(events.projectId, projects.id))
      .orderBy(desc(events.createdAt))
      .limit(20),
  ]);

  return NextResponse.json({
    counts: {
      projects: projectCount,
      channels: channelCount,
      routes: routeCount,
      events: eventCount,
      openTodos,
      pendingReminders,
    },
    recentEvents,
  });
}
