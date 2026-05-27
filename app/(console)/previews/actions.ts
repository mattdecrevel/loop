'use server';

import { asc } from 'drizzle-orm';

import { db } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { parseEvent, type EventType } from '@/lib/events/schemas';
import { ingestEvent } from '@/lib/ingest';
import type { AuthedProject } from '@/lib/auth';
import { SAMPLES } from '@/lib/render/samples';

export type SendPreviewResult = { ok: true; status: string } | { error: string };

/** Post a sample event through the real ingest pipeline, as the first project. */
export async function sendPreview(type: EventType): Promise<SendPreviewResult> {
  const sample = SAMPLES[type];
  if (sample === undefined) return { error: `No sample for type "${type}".` };

  const parsed = parseEvent(sample);
  if (!parsed.success) return { error: `Invalid sample: ${parsed.error}` };

  const [row] = await db
    .select({
      id: projects.id,
      slug: projects.slug,
      name: projects.name,
      githubRepo: projects.githubRepo,
      autofixEnabled: projects.autofixEnabled,
    })
    .from(projects)
    .orderBy(asc(projects.createdAt))
    .limit(1);

  if (!row) {
    return { error: 'No project found. Create one on the Projects page first.' };
  }

  try {
    const result = await ingestEvent(row as AuthedProject, parsed.data);
    return { ok: true, status: result.status };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to send preview.' };
  }
}
