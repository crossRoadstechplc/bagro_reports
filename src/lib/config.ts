import 'server-only';
import { db, EXPENSE_CATEGORIES } from './db';
import type { Activity, AppConfig, Block, Farm } from './types';

export async function getFarms(): Promise<Farm[]> {
  return db()<Farm[]>`SELECT id, name_en "nameEn", name_am "nameAm", annual_plan_kg "annualPlanKg" FROM farms ORDER BY sort, id`;
}

export async function getBlocks(farmId?: string): Promise<Block[]> {
  const sql = db();
  return sql<Block[]>`
    SELECT farm_id "farmId", name, area_ha "areaHa" FROM blocks
    ${farmId ? sql`WHERE farm_id = ${farmId}` : sql``}
    ORDER BY sort, id`;
}

export async function getActivities(includeInactive = false): Promise<Activity[]> {
  const sql = db();
  return sql<Activity[]>`
    SELECT code, category_en "categoryEn", category_am "categoryAm", name_en "nameEn", name_am "nameAm", unit
    FROM activities ${includeInactive ? sql`` : sql`WHERE active`}
    ORDER BY sort, code`;
}

export async function getConfig(): Promise<AppConfig> {
  const [farms, blocks, activities] = await Promise.all([getFarms(), getBlocks(), getActivities()]);
  return { farms: [...farms], blocks: [...blocks], activities: [...activities], expenseCategories: EXPENSE_CATEGORIES };
}

export function farmLabel(farms: Farm[], id: string | null) {
  if (!id) return 'All farms';
  const f = farms.find((x) => x.id === id);
  return f ? `${f.nameEn} / ${f.nameAm}` : id;
}
