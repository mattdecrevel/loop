import { isNull, or, eq } from 'drizzle-orm';
import { db } from './db';
import { channels, routes } from './db/schema';
import type { Category } from './events/schemas';

export interface RouteRow {
  projectId: string | null;
  category: Category | null;
  targetChannelId: string | null;   // channels.id (UUID) or sentinel in tests
  targetWebhookUrl: string | null;
}

/** Pure precedence resolver. Most-specific match wins; returns exactly one or null. */
export function pickRoute(rows: RouteRow[], projectId: string, category: Category): RouteRow | null {
  const score = (r: RouteRow): number => {
    if (r.projectId === projectId && r.category === category) return 4;
    if (r.projectId === projectId && r.category === null) return 3;
    if (r.projectId === null && r.category === category) return 2;
    if (r.projectId === null && r.category === null) return 1;
    return 0; // non-matching (e.g. other project) — excluded
  };
  let best: RouteRow | null = null;
  let bestScore = 0;
  for (const r of rows) {
    const s = score(r);
    if (s > bestScore) { best = r; bestScore = s; }
  }
  return best;
}

export type Destination = { kind: 'channel'; slackChannelId: string } | { kind: 'webhook'; url: string };

/** Resolve the single destination for (project, category) from the DB. */
export async function resolveDestination(projectId: string, category: Category): Promise<Destination | null> {
  // Candidate rows: this project's rules + global rules.
  const rows = await db
    .select()
    .from(routes)
    .where(or(eq(routes.projectId, projectId), isNull(routes.projectId)));
  const picked = pickRoute(rows as unknown as RouteRow[], projectId, category);
  if (!picked) return null;
  if (picked.targetWebhookUrl) return { kind: 'webhook', url: picked.targetWebhookUrl };
  if (picked.targetChannelId) {
    const [ch] = await db.select({ sid: channels.slackChannelId }).from(channels).where(eq(channels.id, picked.targetChannelId)).limit(1);
    if (ch) return { kind: 'channel', slackChannelId: ch.sid };
  }
  return null;
}
