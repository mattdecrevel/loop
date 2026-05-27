'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyCredentials } from '@/lib/console-auth';
import { signSession, SESSION_COOKIE } from '@/lib/session';

const TTL_MS = 1000 * 60 * 60 * 12; // 12h

export async function login(formData: FormData) {
  const user = String(formData.get('user') ?? '');
  const password = String(formData.get('password') ?? '');
  if (!verifyCredentials(user, password)) redirect('/login?error=1');
  const jar = await cookies();
  jar.set(SESSION_COOKIE, signSession(Date.now() + TTL_MS), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: TTL_MS / 1000,
  });
  redirect('/');
}

export async function logout() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  redirect('/login');
}
