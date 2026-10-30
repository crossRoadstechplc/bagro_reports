import 'server-only';
import postgres from 'postgres';
import seed from './seed-data.json';

// Tables are created by `npm run db:migrate` (db/migrations/*.sql) and filled by `npm run db:seed`.

declare global {
  // One connection pool per server process (survives hot reloads in development).
  var __bagroSql: postgres.Sql | undefined;
}

export type Sql = postgres.Sql;
export type Tx = postgres.TransactionSql;

export function db(): Sql {
  if (!globalThis.__bagroSql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
    globalThis.__bagroSql = postgres(url, {
      prepare: false,          // required by Supabase's transaction pooler (port 6543)
      ssl: 'require',
      max: process.env.NODE_ENV === 'production' ? 5 : 3,
      // One query at a time per connection. Supabase's transaction pooler can stall when several
      // queries are pipelined on one connection (seen as a page hanging on its first load).
      max_pipeline: 1,
      queue_timeout: 10,       // seconds; fail with an error rather than wait forever for a connection
      idle_timeout: 20,
      connect_timeout: 15,
      debug: process.env.DEBUG_SQL ? (conn, query) => console.log(`[sql conn ${conn}]`, query.replace(/\s+/g, ' ').slice(0, 90)) : undefined,
    });
  }
  return globalThis.__bagroSql;
}

export const EXPENSE_CATEGORIES: string[] = seed.ExpenseCategories;

/** Timestamps are shown in Addis Ababa time. */
export const ADDIS = 'Africa/Addis_Ababa';
