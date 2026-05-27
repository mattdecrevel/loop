import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Dummy connection string so module-load guards in lib/db pass without a live
    // DB. postgres-js is lazy and does not connect until a query is issued, so the
    // pure-logic unit tests never touch the network.
    env: { DATABASE_URL: 'postgres://u:p@localhost:5432/db' },
  },
  resolve: { alias: { '@': resolve(__dirname, '.') } },
});
