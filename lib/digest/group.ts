import type { events } from '@/lib/db/schema';
import type { Category } from '@/lib/events/schemas';

export type DigestEventRow = typeof events.$inferSelect;

export interface DigestGroup {
  projectId: string | null;
  category: Category;
  rows: DigestEventRow[];
}

/**
 * Pure grouping helper: bucket pending digested events by (projectId, category).
 * Returns groups in insertion order. Kept side-effect-free so the digest cron's
 * fan-out logic can be exercised in unit tests without a DB.
 */
export function groupPendingForDigest(pending: DigestEventRow[]): DigestGroup[] {
  const groups = new Map<string, DigestGroup>();
  for (const ev of pending) {
    const key = `${ev.projectId ?? 'global'}::${ev.category}`;
    const g = groups.get(key) ?? { projectId: ev.projectId, category: ev.category as Category, rows: [] };
    g.rows.push(ev);
    groups.set(key, g);
  }
  return Array.from(groups.values());
}

/** Compact one-line label for a digested event from its payload. */
export function digestLineFor(ev: DigestEventRow): string {
  const p = (ev.payload ?? {}) as Record<string, unknown>;
  const candidate = p.title ?? p.message ?? p.name ?? p.summary ?? p.email ?? ev.type;
  return `• ${String(candidate)}`;
}
