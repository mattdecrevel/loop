import { and, eq } from 'drizzle-orm';
import { db } from './db';
import { events } from './db/schema';
import { parseEvent, type ParsedEvent } from './events/schemas';
import { renderEvent } from './render';
import { resolveDestination } from './routing';
import { postToChannel, postToWebhook } from './slack/transport';
import type { AuthedProject } from './auth';

export function validateIngest(input: unknown): { ok: true; event: ParsedEvent } | { ok: false; error: string } {
  const r = parseEvent(input);
  return r.success ? { ok: true, event: r.data } : { ok: false, error: r.error };
}

/** Full pipeline: render -> resolve route -> post -> record. Returns event id. */
export async function ingestEvent(project: AuthedProject, ev: ParsedEvent): Promise<{ status: string }> {
  // Idempotency: if the caller supplied an idempotencyKey and we've already
  // recorded an event for (project, key), short-circuit before any work. The
  // unique partial index on (project_id, idempotency_key) is the belt; this
  // explicit lookup is the suspenders + gives us a clean 'duplicate' return.
  if (ev.idempotencyKey) {
    const existing = await db
      .select({ id: events.id })
      .from(events)
      .where(and(eq(events.projectId, project.id), eq(events.idempotencyKey, ev.idempotencyKey)))
      .limit(1);
    if (existing.length > 0) {
      return { status: 'duplicate' };
    }
  }

  const rendered = renderEvent(ev, {
    siteLabel: project.name, projectSlug: project.slug, time: new Date(),
    githubRepo: project.githubRepo, autofixEnabled: project.autofixEnabled,
  });

  // Digest suppression: low-signal `digest: true` info events are not posted
  // immediately. They are recorded as `digested` and the rolling-summary cron
  // (/api/cron/digest) batches them into a periodic summary per category.
  if (ev.digest && ev.severity === 'info') {
    await db.insert(events).values({
      projectId: project.id, type: ev.type, category: ev.category, severity: ev.severity,
      payload: ev.payload as object, status: 'digested', idempotencyKey: ev.idempotencyKey, digest: ev.digest,
    });
    return { status: 'digested' };
  }

  const dest = await resolveDestination(project.id, ev.category);
  if (!dest) {
    await db.insert(events).values({
      projectId: project.id, type: ev.type, category: ev.category, severity: ev.severity,
      payload: ev.payload as object, status: 'skipped', idempotencyKey: ev.idempotencyKey, digest: ev.digest,
    });
    return { status: 'skipped_no_route' };
  }

  const result = dest.kind === 'channel'
    ? await postToChannel(rendered.text, rendered.blocks, dest.slackChannelId)
    : await postToWebhook(rendered.text, rendered.blocks, dest.url);

  await db.insert(events).values({
    projectId: project.id, type: ev.type, category: ev.category, severity: ev.severity,
    payload: ev.payload as object, status: result.ok ? 'posted' : 'failed',
    slackTs: result.ts ?? null, slackChannelId: result.channel ?? (dest.kind === 'channel' ? dest.slackChannelId : null),
    idempotencyKey: ev.idempotencyKey, digest: ev.digest,
  });

  return { status: result.ok ? 'posted' : 'failed' };
}
