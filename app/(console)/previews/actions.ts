'use server';

import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { parseEvent, type EventType } from '@/lib/events/schemas';
import { ingestEvent } from '@/lib/ingest';
import type { AuthedProject } from '@/lib/auth';
import { SAMPLES } from '@/lib/render/samples';

const PREVIEW_PROJECT_SLUG = 'decrevel-dev';

export type SendPreviewResult = { ok: true; status: string } | { error: string };

/** Post a sample event through the real ingest pipeline, as the decrevel-dev project. */
export async function sendPreview(type: EventType): Promise<SendPreviewResult> {
  const sample = SAMPLES[type];
  if (sample === undefined) return { error: `No sample for type "${type}".` };

  const parsed = parseEvent(sample);
  if (!parsed.success) return { error: `Invalid sample: ${parsed.error}` };

  const [row] = await db
    .select({
      id: projects.id,
      slug: projects.slug,
      githubRepo: projects.githubRepo,
      autofixEnabled: projects.autofixEnabled,
    })
    .from(projects)
    .where(eq(projects.slug, PREVIEW_PROJECT_SLUG))
    .limit(1);

  if (!row) {
    return { error: `Project "${PREVIEW_PROJECT_SLUG}" not found. Create it on the Projects page first.` };
  }

  try {
    const result = await ingestEvent(row as AuthedProject, parsed.data);
    return { ok: true, status: result.status };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to send preview.' };
  }
}
