'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { generateApiKey, hashApiKey } from '@/lib/auth';

export type CreateProjectResult = { apiKey: string } | { error: string };

export async function createProject(formData: FormData): Promise<CreateProjectResult> {
	const slug = String(formData.get('slug') ?? '').trim();
	const name = String(formData.get('name') ?? '').trim();
	const githubRepo = String(formData.get('githubRepo') ?? '').trim() || null;
	if (!slug || !name) return { error: 'slug and name required' };
	const key = generateApiKey();
	try {
		await db.insert(projects).values({ slug, name, apiKeyHash: hashApiKey(key), githubRepo });
	} catch {
		return { error: `A project with slug "${slug}" already exists.` };
	}
	revalidatePath('/projects');
	return { apiKey: key };
}

export async function updateProject(
	id: string,
	patch: { name?: string; githubRepo?: string | null; autofixEnabled?: boolean },
): Promise<{ ok: true } | { error: string }> {
	const fields: { name?: string; githubRepo?: string | null; autofixEnabled?: boolean } = {};
	if (typeof patch.name === 'string') {
		const trimmed = patch.name.trim();
		if (!trimmed) return { error: 'name cannot be empty' };
		fields.name = trimmed;
	}
	if ('githubRepo' in patch) {
		const trimmed = (patch.githubRepo ?? '').trim();
		fields.githubRepo = trimmed === '' ? null : trimmed;
	}
	if (typeof patch.autofixEnabled === 'boolean') {
		fields.autofixEnabled = patch.autofixEnabled;
	}
	if (Object.keys(fields).length === 0) return { ok: true };
	await db.update(projects).set(fields).where(eq(projects.id, id));
	revalidatePath('/projects');
	return { ok: true };
}

export type RotateApiKeyResult = { apiKey: string } | { error: string };

/**
 * Mint a fresh API key for a project, hash + store it, and return the
 * plaintext once. The old key is invalidated as soon as the row is
 * updated. The caller MUST display the returned key immediately — it
 * cannot be retrieved again (hashed at rest).
 */
export async function rotateApiKey(id: string): Promise<RotateApiKeyResult> {
	if (!id) return { error: 'project id required' };
	const key = generateApiKey();
	const updated = await db
		.update(projects)
		.set({ apiKeyHash: hashApiKey(key) })
		.where(eq(projects.id, id))
		.returning({ id: projects.id });
	if (updated.length === 0) return { error: 'project not found' };
	revalidatePath('/projects');
	return { apiKey: key };
}
