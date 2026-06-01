import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

// Preview/branch deploys on Vercel don't have DATABASE_URL — production owns
// the only DB. Skip cleanly there so `next build` still runs and the preview
// URL is browseable for visual review.
if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production') {
	console.log(`[migrate] skipping on VERCEL_ENV=${process.env.VERCEL_ENV}`);
	process.exit(0);
}

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) { console.error('No DATABASE_URL'); process.exit(1); }

const sql = postgres(url, { max: 1 });
await migrate(drizzle(sql), { migrationsFolder: './drizzle' });
await sql.end();
console.log('migrations applied');
