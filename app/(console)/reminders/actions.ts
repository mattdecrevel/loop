'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { reminders } from '@/lib/db/schema';

export async function cancelReminder(id: string): Promise<void> {
  await db.update(reminders).set({ status: 'cancelled' }).where(eq(reminders.id, id));
  revalidatePath('/reminders');
}
