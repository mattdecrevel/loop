'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { channels } from '@/lib/db/schema';

export type CreateChannelResult = { ok: true; warning?: string } | { error: string };

const SLACK_ID = /^C[A-Z0-9]+$/i;

export async function createChannel(formData: FormData): Promise<CreateChannelResult> {
  const name = String(formData.get('name') ?? '').trim();
  const slackChannelId = String(formData.get('slackChannelId') ?? '').trim();
  if (!name || !slackChannelId) return { error: 'name and Slack channel ID required' };
  if (/\s/.test(name)) return { error: 'name must be a single word (no spaces)' };

  const warning = SLACK_ID.test(slackChannelId)
    ? undefined
    : 'Slack channel IDs usually look like "C0123ABCD". Double-check this value.';

  try {
    await db.insert(channels).values({ name, slackChannelId });
  } catch {
    return { error: `A channel named "${name}" already exists.` };
  }
  revalidatePath('/channels');
  revalidatePath('/routes');
  return { ok: true, warning };
}

export async function deleteChannel(id: string): Promise<void> {
  await db.delete(channels).where(eq(channels.id, id));
  revalidatePath('/channels');
  revalidatePath('/routes');
}
