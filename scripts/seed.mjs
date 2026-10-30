// Loads farms, blocks, activities and the starter user accounts from src/lib/seed-data.json.
// Safe to run again: existing rows are left as they are (office edits and changed PINs are kept).
// Usage: npm run db:seed
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';

const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) {
  console.error('Set DIRECT_URL (or DATABASE_URL) in .env first.');
  process.exit(1);
}
const seed = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', 'src', 'lib', 'seed-data.json'), 'utf8'));
const sql = postgres(url, { ssl: 'require', max: 1, prepare: false });

// Same format as src/lib/pin.ts: "salt:hash" with scrypt.
function hashPin(pin) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${crypto.scryptSync(pin, salt, 32).toString('hex')}`;
}

try {
  const counts = await sql.begin(async (tx) => {
    const farms = seed.Farms.map((f, i) => ({ id: f.FarmID, name_en: f.Name_EN, name_am: f.Name_AM, annual_plan_kg: f.AnnualHarvestPlanKg || 0, sort: i }));
    const f = await tx`INSERT INTO farms ${tx(farms)} ON CONFLICT (id) DO NOTHING`;

    const blocks = seed.Blocks.map((b, i) => ({ farm_id: b.FarmID, name: b.Block, area_ha: b.AreaHa ?? null, sort: i }));
    const b = await tx`INSERT INTO blocks ${tx(blocks)} ON CONFLICT (farm_id, name) DO NOTHING`;

    const acts = seed.Activities.map((a, i) => ({
      code: a.Code, category_en: a.Category_EN, category_am: a.Category_AM, name_en: a.Name_EN, name_am: a.Name_AM, unit: a.Unit, sort: i,
    }));
    const a = await tx`INSERT INTO activities ${tx(acts)} ON CONFLICT (code) DO NOTHING`;

    const users = seed.Users.map((u) => ({
      name: u.Name, role: u.Role, farm_id: u.FarmID === 'ALL' ? null : u.FarmID, pin_hash: hashPin(u.PIN),
    }));
    const u = await tx`INSERT INTO users ${tx(users)} ON CONFLICT ((lower(name))) DO NOTHING`;
    return { farms: f.count, blocks: b.count, activities: a.count, users: u.count };
  });
  console.log('added:', counts);
  const users = await sql`SELECT name, role, coalesce(farm_id, 'ALL') farm FROM users ORDER BY id`;
  console.log(`users in database (${users.length}):`);
  for (const u of users) console.log(`  ${u.name.padEnd(20)} ${u.role.padEnd(11)} ${u.farm}`);
} catch (e) {
  console.error('Seeding failed:', e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
