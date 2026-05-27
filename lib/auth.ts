import { createHash, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from './db';
import { projects } from './db/schema';

export function generateApiKey(): string {
  return `loop_pk_${randomBytes(24).toString('base64url')}`;
}

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export interface AuthedProject {
  id: string;
  slug: string;
  name: string;
  githubRepo: string | null;
  autofixEnabled: boolean;
}

/** Resolve a project from a raw `Authorization: Bearer <key>` value. */
export async function authenticateProject(authHeader: string | null): Promise<AuthedProject | null> {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const raw = authHeader.slice('Bearer '.length).trim();
  if (!raw) return null;
  const [row] = await db
    .select({ id: projects.id, slug: projects.slug, name: projects.name, githubRepo: projects.githubRepo, autofixEnabled: projects.autofixEnabled })
    .from(projects)
    .where(eq(projects.apiKeyHash, hashApiKey(raw)))
    .limit(1);
  return row ?? null;
}
