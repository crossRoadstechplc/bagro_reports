// Applies db/migrations/*.sql that haven't run yet, in name order, each in its own transaction.
// Usage: npm run db:migrate   (uses DIRECT_URL, falls back to DATABASE_URL)
import fs from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';

const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) {
  console.error('Set DIRECT_URL (or DATABASE_URL) in .env first.');
  process.exit(1);
}
const sql = postgres(url, { ssl: 'require', max: 1, prepare: false, onnotice: () => {} });
const dir = path.join(import.meta.dirname, '..', 'db', 'migrations');

try {
  await sql`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`;
  await sql`ALTER TABLE schema_migrations ENABLE ROW LEVEL SECURITY`;
  const done = new Set((await sql`SELECT name FROM schema_migrations`).map((r) => r.name));
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  let applied = 0;
  for (const file of files) {
    if (done.has(file)) continue;
    const body = fs.readFileSync(path.join(dir, file), 'utf8');
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`INSERT INTO schema_migrations (name) VALUES (${file})`;
    });
    console.log('applied', file);
    applied++;
  }
  console.log(applied ? `${applied} migration(s) applied.` : 'Database is up to date.');
} catch (e) {
  console.error('Migration failed:', e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
