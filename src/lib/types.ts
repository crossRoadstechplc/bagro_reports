// Types shared by the server and the browser.

// Reporter: own farm, submit only. Office: all farms, submit + amend. Supervisor: review own farm. Admin: everything.
export type Role = 'Reporter' | 'Office' | 'Supervisor' | 'Admin';
export const ROLES: Role[] = ['Reporter', 'Office', 'Supervisor', 'Admin'];
export type Kind = 'ops' | 'harvest' | 'expense';
export type Status = 'Submitted' | 'Verified' | 'Approved' | 'Rejected';

export const KINDS: Kind[] = ['ops', 'harvest', 'expense'];
export const STATUSES: Status[] = ['Submitted', 'Verified', 'Approved', 'Rejected'];
export const KIND_LABEL: Record<Kind, string> = { ops: 'Daily work', harvest: 'Coffee weighing', expense: 'Expenses' };

export interface SessionUser {
  id: number;
  name: string;
  role: Role;
  farmId: string | null; // null = all farms
}

export interface Farm { id: string; nameEn: string; nameAm: string; annualPlanKg: number }
export interface Block { farmId: string; name: string; areaHa: number | null }
export interface Activity { code: string; categoryEn: string; categoryAm: string; nameEn: string; nameAm: string; unit: string }

export interface AppConfig {
  farms: Farm[];
  blocks: Block[];
  activities: Activity[];
  expenseCategories: string[];
}

/* What the report forms send to POST /api/reports. Numbers arrive as strings from inputs. */
export type NumIn = string | number | null | undefined;
export interface OpsLineIn { block: string; activityCode: string; actual?: NumIn; labor?: NumIn; birr?: NumIn; norm?: NumIn; plan?: NumIn }
export interface HarvestLineIn { block: string; picked?: NumIn; delivered?: NumIn; deduction?: NumIn }
export interface ExpenseLineIn { category: string; description?: string; amount?: NumIn }

export interface ReportPayload {
  clientId: string;
  kind: Kind;
  date: string;
  farm: string;
  remarks?: string;
  weighers?: string;
  lines: (OpsLineIn | HarvestLineIn | ExpenseLineIn)[];
}

/* Summary tables: rendered as HTML and exported as CSV from the same model. */
export type Cell = string | number;
export interface HeadCell { t: string; cs?: number; rs?: number }
export interface TableRow { cls?: 'cat' | 'sub' | 'total'; c: Cell[] }
export interface TableModel {
  title: string;
  head: (HeadCell | string)[][];
  flat: string[];
  rows: TableRow[];
  skipFirst?: boolean; // first column is only for CSV (category)
  kpis: [string, string][];
}
