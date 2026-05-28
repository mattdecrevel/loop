'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { todos } from '@/lib/db/schema';

export async function markTodoDone(id: string): Promise<void> {
  await db
    .update(todos)
    .set({ status: 'done', completedAt: new Date() })
    .where(eq(todos.id, id));
  revalidatePath('/todos');
}

export async function reopenTodo(id: string): Promise<void> {
  await db
    .update(todos)
    .set({ status: 'open', completedAt: null })
    .where(eq(todos.id, id));
  revalidatePath('/todos');
}
