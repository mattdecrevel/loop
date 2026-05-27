'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { routes } from '@/lib/db/schema';
import { CATEGORIES, type Category } from '@/lib/events/schemas';

export type CreateRouteResult = { ok: true } | { error: string };

function asCategory(value: string | null): Category | null {
  if (!value) return null;
  return (CATEGORIES as readonly string[]).includes(value) ? (value as Category) : null;
}

export async function createRoute(formData: FormData): Promise<CreateRouteResult> {
  const projectIdRaw = String(formData.get('projectId') ?? '').trim();
  const categoryRaw = String(formData.get('category') ?? '').trim();
  const targetKind = String(formData.get('targetKind') ?? '').trim(); // 'channel' | 'webhook'
  const targetChannelIdRaw = String(formData.get('targetChannelId') ?? '').trim();
  const targetWebhookUrlRaw = String(formData.get('targetWebhookUrl') ?? '').trim();

  // Sentinel "__all__" means NULL (global / all categories).
  const projectId = projectIdRaw && projectIdRaw !== '__all__' ? projectIdRaw : null;
  const category = categoryRaw && categoryRaw !== '__all__' ? asCategory(categoryRaw) : null;

  let targetChannelId: string | null = null;
  let targetWebhookUrl: string | null = null;

  if (targetKind === 'channel') {
    if (!targetChannelIdRaw) return { error: 'Select a channel for this route.' };
    targetChannelId = targetChannelIdRaw;
  } else if (targetKind === 'webhook') {
    if (!targetWebhookUrlRaw) return { error: 'Enter a webhook URL for this route.' };
    try {
      // eslint-disable-next-line no-new
      new URL(targetWebhookUrlRaw);
    } catch {
      return { error: 'Webhook URL is not a valid URL.' };
    }
    targetWebhookUrl = targetWebhookUrlRaw;
  } else {
    return { error: 'Choose a target: a channel or a webhook.' };
  }

  // Exactly one target must be set.
  if (Boolean(targetChannelId) === Boolean(targetWebhookUrl)) {
    return { error: 'Exactly one of channel or webhook must be set.' };
  }

  await db.insert(routes).values({ projectId, category, targetChannelId, targetWebhookUrl });
  revalidatePath('/routes');
  return { ok: true };
}

export async function deleteRoute(id: string): Promise<void> {
  await db.delete(routes).where(eq(routes.id, id));
  revalidatePath('/routes');
}
