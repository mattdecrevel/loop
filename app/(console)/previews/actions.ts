'use server';

import { asc, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { parseEvent, type EventType } from '@/lib/events/schemas';
import { ingestEvent } from '@/lib/ingest';
import type { AuthedProject } from '@/lib/auth';
import { SAMPLE_TYPES, SAMPLES } from '@/lib/render/samples';

export type SendPreviewResult = { ok: true; status: string } | { error: string };

const PROJECT_COLUMNS = {
	id: projects.id,
	slug: projects.slug,
	name: projects.name,
	githubRepo: projects.githubRepo,
	autofixEnabled: projects.autofixEnabled,
};

/**
 * Resolve a target project for sending preview events. Accepts an optional
 * slug; falls back to the oldest project (preserves the historical behavior
 * when no slug is selected).
 */
async function resolveProject(slug?: string): Promise<AuthedProject | { error: string }> {
	if (slug) {
		const [row] = await db.select(PROJECT_COLUMNS).from(projects).where(eq(projects.slug, slug)).limit(1);
		if (!row) return { error: `Project "${slug}" not found.` };
		return row as AuthedProject;
	}
	const [row] = await db.select(PROJECT_COLUMNS).from(projects).orderBy(asc(projects.createdAt)).limit(1);
	if (!row) return { error: 'No project found. Create one on the Projects page first.' };
	return row as AuthedProject;
}

/** Post a single sample event through the real ingest pipeline. */
export async function sendPreview(type: EventType, projectSlug?: string): Promise<SendPreviewResult> {
	const sample = SAMPLES[type];
	if (sample === undefined) return { error: `No sample for type "${type}".` };

	const parsed = parseEvent(sample);
	if (!parsed.success) return { error: `Invalid sample: ${parsed.error}` };

	const project = await resolveProject(projectSlug);
	if ('error' in project) return project;

	try {
		const result = await ingestEvent(project, parsed.data);
		return { ok: true, status: result.status };
	} catch (err) {
		return { error: err instanceof Error ? err.message : 'Failed to send preview.' };
	}
}

export type FireAllResult = {
	project: string;
	results: { type: EventType; status: string; error?: string }[];
};

/**
 * Fire one of every event type sequentially. Sequential (not parallel) so the
 * order in Slack is deterministic and we stay well under any rate limits.
 * Returns a per-type result list for the UI to display.
 */
export async function fireAllPreviews(projectSlug?: string): Promise<FireAllResult | { error: string }> {
	const project = await resolveProject(projectSlug);
	if ('error' in project) return project;

	const results: FireAllResult['results'] = [];
	for (const type of SAMPLE_TYPES) {
		const sample = SAMPLES[type];
		if (sample === undefined) {
			results.push({ type, status: 'skipped', error: 'no sample defined' });
			continue;
		}
		const parsed = parseEvent(sample);
		if (!parsed.success) {
			results.push({ type, status: 'failed', error: parsed.error });
			continue;
		}
		try {
			const r = await ingestEvent(project, parsed.data);
			results.push({ type, status: r.status });
		} catch (err) {
			results.push({ type, status: 'failed', error: err instanceof Error ? err.message : String(err) });
		}
	}
	return { project: project.slug, results };
}
