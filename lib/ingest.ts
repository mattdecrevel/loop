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
  const rendered = renderEvent(ev, {
    siteLabel: project.name, projectSlug: project.slug, time: new Date(),
    githubRepo: project.githubRepo, autofixEnabled: project.autofixEnabled,
  });

  // Digest: the rolling-summary cron isn't built yet (Phase 3). Suppressing
  // `digest: true` events here would silently drop them (nothing would ever
  // post the summary), so until that cron lands we DO NOT suppress — digest
  // events post normally and carry the `digest` flag on their row so a future
  // aggregation cron can backfill them.

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
