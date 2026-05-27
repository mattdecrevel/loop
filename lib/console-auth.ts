import { timingSafeEqual } from 'node:crypto';

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function verifyCredentials(user: string, password: string): boolean {
  const u = process.env.LOOP_ADMIN_USER;
  const p = process.env.LOOP_ADMIN_PASSWORD;
  if (!u || !p) return false;
  return safeEqual(user, u) && safeEqual(password, p);
}
