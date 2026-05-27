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
  githubRepo: string | null,
  autofixEnabled: boolean,
): Promise<void> {
  await db.update(projects).set({ githubRepo, autofixEnabled }).where(eq(projects.id, id));
  revalidatePath('/projects');
}
