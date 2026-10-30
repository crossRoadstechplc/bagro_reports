// Makes the blocks table match the "Blocks" list in src/lib/seed-data.json:
//   - adds missing blocks and updates their order (and area, if one is given in the list)
//   - removes blocks that are no longer listed, but NEVER one that already has reports
// Usage: npm run db:sync-blocks            (shows what it will do, then does it)
//        npm run db:sync-blocks -- --dry   (only shows what it would do)
import fs from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';

const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) {
  console.error('Set DIRECT_URL (or DATABASE_URL) in .env first.');
  process.exit(1);
}
const dry = process.argv.includes('--dry');
const seed = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', 'src', 'lib', 'seed-data.json'), 'utf8'));
const sql = postgres(url, { ssl: 'require', max: 1, prepare: false });

try {
  const wanted = seed.Blocks.map((b, i) => ({ farm_id: b.FarmID, name: b.Block, area_ha: b.AreaHa ?? null, sort: i }));
  const key = (b) => `${b.farm_id}|${b.name}`;
  const wantedKeys = new Set(wanted.map(key));
  const current = await sql`SELECT id, farm_id, name FROM blocks`;
  const currentKeys = new Set(current.map(key));

  // Blocks that reports point at (reports store the block name with the report's farm).
  const used = new Set((await sql`
    SELECT DISTINCT s.farm_id, l.block AS name FROM ops_lines l JOIN submissions s ON s.id = l.submission_id
    UNION SELECT DISTINCT s.farm_id, l.block FROM harvest_lines l JOIN submissions s ON s.id = l.submission_id`).map(key));

  const toAdd = wanted.filter((b) => !currentKeys.has(key(b)));
  const stale = current.filter((b) => !wantedKeys.has(key(b)));
  const toRemove = stale.filter((b) => !used.has(key(b)));
  const kept = stale.filter((b) => used.has(key(b)));

  console.log(`add ${toAdd.length}: ${toAdd.map((b) => `${b.farm_id}/${b.name}`).join(', ') || '-'}`);
  console.log(`remove ${toRemove.length}: ${toRemove.map((b) => `${b.farm_id}/${b.name}`).join(', ') || '-'}`);
  if (kept.length) console.log(`KEPT (they have reports - rename or merge by hand): ${kept.map((b) => `${b.farm_id}/${b.name}`).join(', ')}`);

  if (dry) {
    console.log('Dry run - nothing changed.');
  } else {
    await sql.begin(async (tx) => {
      if (toRemove.length) await tx`DELETE FROM blocks WHERE id IN ${tx(toRemove.map((b) => b.id))}`;
      for (const b of wanted) {
        await tx`
          INSERT INTO blocks (farm_id, name, area_ha, sort) VALUES (${b.farm_id}, ${b.name}, ${b.area_ha}, ${b.sort})
          ON CONFLICT (farm_id, name) DO UPDATE SET sort = EXCLUDED.sort,
            area_ha = COALESCE(EXCLUDED.area_ha, blocks.area_ha)`;
      }
    });
    console.log('Blocks updated.');
  }
  const now = await sql`SELECT farm_id, COUNT(*)::int n, string_agg(name, ', ' ORDER BY sort) list FROM blocks GROUP BY farm_id ORDER BY MIN(sort)`;
  for (const r of now) console.log(`  ${r.farm_id.padEnd(8)} ${String(r.n).padStart(2)}  ${r.list}`);
} catch (e) {
  console.error('Failed:', e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
