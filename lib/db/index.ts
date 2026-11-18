import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

type Db = PostgresJsDatabase<typeof schema>;

let instance: Db | undefined;

/**
 * Connects on first use, not at import. `next build` imports every route
 * module while collecting page data, and preview deploys have no
 * DATABASE_URL by design (production owns the only database; see
 * scripts/migrate.ts). Throwing at import failed every preview build;
 * throwing on first query keeps the error for code that actually needs
 * the database at runtime.
 */
function getDb(): Db {
  if (!instance) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL is not set');
    instance = drizzle(postgres(connectionString, { prepare: false }), { schema });
  }
  return instance;
}

export const db = new Proxy({} as Db, {
  get(_target, prop) {
    const real = getDb();
    const value = Reflect.get(real, prop, real);
    return typeof value === 'function' ? value.bind(real) : value;
  },
});
