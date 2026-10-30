import 'server-only';
import { ADDIS, db, EXPENSE_CATEGORIES, type Tx } from './db';
import { todayAddis } from './ethiopian';
import {
  KINDS, STATUSES,
  type ExpenseLineIn, type HarvestLineIn, type Kind, type NumIn, type OpsLineIn, type ReportPayload, type SessionUser, type Status,
} from './types';

/** A problem with what the user entered. The message is safe to show them. */
export class InputError extends Error {}

function num(v: NumIn, label: string): number | null {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new InputError(`${label}: "${v}" is not a number`);
  if (n < 0) throw new InputError(`${label}: negative numbers are not allowed`);
  return n;
}
const text = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);

const canAmend = (u: SessionUser) => u.role === 'Admin' || u.role === 'Office';

/* ------------------------------------------------------------------ */
/* Validation shared by new reports and amendments                     */
/* ------------------------------------------------------------------ */

async function checkHeader(user: SessionUser, p: ReportPayload) {
  if (!p || !KINDS.includes(p.kind)) throw new InputError('Unknown report type');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date || '') || p.date < '2015-01-01') throw new InputError('Invalid date');
  if (p.date > todayAddis()) throw new InputError('Report date cannot be in the future');
  if (typeof p.farm !== 'string') throw new InputError('Unknown farm');
  const [farm] = await db()`SELECT 1 FROM farms WHERE id = ${p.farm}`;
  if (!farm) throw new InputError('Unknown farm');
  if (user.farmId && p.farm !== user.farmId) throw new InputError(`You can only report for your own farm (${user.farmId})`);
  if (!Array.isArray(p.lines)) throw new InputError('No lines');
}

/** Validates the lines and returns a function that inserts them for a submission id. */
async function buildLines(p: ReportPayload): Promise<(tx: Tx, subId: number) => Promise<unknown>> {
  const sql = db();
  const blocks = new Set((await sql<{ name: string }[]>`SELECT name FROM blocks WHERE farm_id = ${p.farm}`).map((b) => b.name));
  const checkBlock = (b: string, n: number) => {
    if (!blocks.has(b)) throw new InputError(`Line ${n}: choose a block of this farm`);
    return b;
  };

  if (p.kind === 'ops') {
    const acts = new Map((await sql<{ code: string; name_en: string; name_am: string; unit: string }[]>`SELECT code, name_en, name_am, unit FROM activities`)
      .map((a) => [a.code, a]));
    const rows = (p.lines as OpsLineIn[]).map((l, i) => {
      const n = i + 1, a = acts.get(l?.activityCode);
      if (!a) throw new InputError(`Line ${n}: choose an activity`);
      const r = {
        block: checkBlock(l.block, n), activity_code: a.code, activity_name: `${a.name_am} / ${a.name_en}`, unit: a.unit,
        norm: num(l.norm, `Line ${n} norm`), plan: num(l.plan, `Line ${n} plan`),
        actual: num(l.actual, `Line ${n} done`), labor: num(l.labor, `Line ${n} labor`), birr: num(l.birr, `Line ${n} payment`),
      };
      if (r.actual === null && r.labor === null && r.birr === null) throw new InputError(`Line ${n}: enter done, labor or payment`);
      return r;
    });
    if (!rows.length) throw new InputError('Nothing to save - fill at least one line');
    return (tx, id) => tx`INSERT INTO ops_lines ${tx(rows.map((r) => ({ submission_id: id, ...r })))}`;
  }

  if (p.kind === 'harvest') {
    const rows = (p.lines as HarvestLineIn[])
      .map((l, i) => ({ n: i + 1, block: l?.block, picked_kg: num(l?.picked, `Line ${i + 1} picked`), delivered_kg: num(l?.delivered, `Line ${i + 1} delivered`), deduction_birr: num(l?.deduction, `Line ${i + 1} collected`) }))
      .filter((r) => r.picked_kg !== null || r.delivered_kg !== null)
      .map(({ n, ...r }) => ({ ...r, block: checkBlock(r.block, n) }));
    if (rows.length && !text(p.weighers, 1000)) throw new InputError('Write who weighed the coffee');
    if (!rows.length) throw new InputError('Nothing to save - fill at least one line');
    return (tx, id) => tx`INSERT INTO harvest_lines ${tx(rows.map((r) => ({ submission_id: id, ...r })))}`;
  }

  const rows = (p.lines as ExpenseLineIn[]).map((l, i) => {
    const n = i + 1;
    if (!EXPENSE_CATEGORIES.includes(l?.category)) throw new InputError(`Line ${n}: choose an expense type`);
    const amount = num(l.amount, `Line ${n} amount`);
    if (amount === null) throw new InputError(`Line ${n}: enter the amount`);
    return { category: l.category, description: text(l.description, 500), amount_birr: amount };
  });
  if (!rows.length) throw new InputError('Nothing to save - fill at least one line');
  return (tx, id) => tx`INSERT INTO expense_lines ${tx(rows.map((r) => ({ submission_id: id, ...r })))}`;
}

const LINE_TABLE: Record<Kind, string> = { ops: 'ops_lines', harvest: 'harvest_lines', expense: 'expense_lines' };

/* ------------------------------------------------------------------ */
/* Saving a new report                                                 */
/* ------------------------------------------------------------------ */

export async function createSubmission(user: SessionUser, p: ReportPayload): Promise<{ id: number; duplicate: boolean }> {
  const sql = db();
  if (!p || typeof p.clientId !== 'string' || !p.clientId || p.clientId.length > 64) throw new InputError('Missing report id');
  await checkHeader(user, p);

  // The phone may send the same report twice (weak signal). Save it once.
  const findExisting = async () => (await sql<{ id: number }[]>`SELECT id FROM submissions WHERE client_id = ${p.clientId}`)[0];
  const existing = await findExisting();
  if (existing) return { id: existing.id, duplicate: true };

  const insertLines = await buildLines(p);
  try {
    const id = await sql.begin(async (tx) => {
      const [s] = await tx<{ id: number }[]>`
        INSERT INTO submissions (client_id, kind, report_date, farm_id, user_id, remarks, weighers)
        VALUES (${p.clientId}, ${p.kind}, ${p.date}, ${p.farm}, ${user.id}, ${text(p.remarks, 2000)}, ${text(p.weighers, 1000)})
        RETURNING id`;
      await insertLines(tx, s.id);
      return s.id;
    });
    return { id, duplicate: false };
  } catch (e) {
    // Two copies of the same report arrived at the same moment: the other one won.
    if ((e as { code?: string }).code === '23505') {
      const again = await findExisting();
      if (again) return { id: again.id, duplicate: true };
    }
    throw e;
  }
}

/* ------------------------------------------------------------------ */
/* Amending a report (Office and Admin, any farm)                      */
/* ------------------------------------------------------------------ */

type EditReport = ReportPayload & { id: number; status: Status; reporter: string };

/** Loads a report in the same shape the form sends, so it can be opened in the form for amending. */
export async function getSubmissionForEdit(user: SessionUser, id: number): Promise<EditReport | null> {
  if (!canAmend(user) || !Number.isInteger(id)) return null;
  const sql = db();
  const [s] = await sql<{ id: number; kind: Kind; date: string; farm: string; remarks: string; weighers: string; status: Status; reporter: string }[]>`
    SELECT s.id, s.kind, s.report_date::text date, s.farm_id farm, s.remarks, s.weighers, s.status, u.name reporter
    FROM submissions s JOIN users u ON u.id = s.user_id WHERE s.id = ${id}`;
  if (!s) return null;
  const str = (v: number | null) => (v === null || v === undefined ? '' : String(v));
  let lines: ReportPayload['lines'];
  if (s.kind === 'ops') {
    lines = (await sql`SELECT * FROM ops_lines WHERE submission_id = ${id} ORDER BY id`)
      .map((l) => ({ block: l.block, activityCode: l.activity_code, actual: str(l.actual), labor: str(l.labor), birr: str(l.birr), norm: str(l.norm), plan: str(l.plan) }));
  } else if (s.kind === 'harvest') {
    lines = (await sql`SELECT * FROM harvest_lines WHERE submission_id = ${id} ORDER BY id`)
      .map((l) => ({ block: l.block, picked: str(l.picked_kg), delivered: str(l.delivered_kg), deduction: str(l.deduction_birr) }));
  } else {
    lines = (await sql`SELECT * FROM expense_lines WHERE submission_id = ${id} ORDER BY id`)
      .map((l) => ({ category: l.category, description: l.description, amount: str(l.amount_birr) }));
  }
  return { id: s.id, clientId: '', kind: s.kind, date: s.date, farm: s.farm, remarks: s.remarks, weighers: s.weighers, lines, status: s.status, reporter: s.reporter };
}

/**
 * Replaces a report's date, farm, remarks and lines. The old version is kept in submission_edits,
 * and the report goes back to "Submitted" so it is reviewed again.
 */
export async function updateSubmission(user: SessionUser, id: number, p: ReportPayload) {
  if (!canAmend(user)) throw new InputError('Only office staff and admins can amend reports');
  if (!Number.isInteger(id)) throw new InputError('Report not found');
  const sql = db();
  const [before] = await sql`SELECT * FROM submissions WHERE id = ${id}`;
  if (!before) throw new InputError('Report not found');
  if (p?.kind !== before.kind) throw new InputError('The report type cannot be changed');
  await checkHeader(user, p);
  const insertLines = await buildLines(p);
  const table = LINE_TABLE[before.kind as Kind];

  await sql.begin(async (tx) => {
    const oldLines = await tx`SELECT * FROM ${tx(table)} WHERE submission_id = ${id} ORDER BY id`;
    await tx`INSERT INTO submission_edits (submission_id, edited_by, before_json)
             VALUES (${id}, ${user.id}, ${tx.json(JSON.parse(JSON.stringify({ submission: before, lines: [...oldLines] })))})`;
    await tx`DELETE FROM ${tx(table)} WHERE submission_id = ${id}`;
    await insertLines(tx, id);
    await tx`
      UPDATE submissions SET report_date = ${p.date}, farm_id = ${p.farm}, remarks = ${text(p.remarks, 2000)}, weighers = ${text(p.weighers, 1000)},
        status = 'Submitted', reviewed_by = NULL, reviewed_at = NULL, review_note = '',
        amended_by = ${user.id}, amended_at = now()
      WHERE id = ${id}`;
  });
}

/* ------------------------------------------------------------------ */
/* Listing reports                                                     */
/* ------------------------------------------------------------------ */

export interface SubmissionRow {
  id: number; kind: Kind; reportDate: string; farmId: string; farmName: string; reporter: string; userId: number;
  status: Status; reviewer: string | null; reviewedAt: string | null; reviewNote: string; remarks: string; weighers: string;
  createdAt: string; lineCount: number; totalA: number | null; totalB: number | null;
  amendedBy: string | null; amendedAt: string | null; editCount: number;
}

export interface ListFilter { kind?: Kind; farm?: string; from?: string; to?: string; status?: Status | 'All'; mine?: boolean; limit?: number }

const ts = (col: string) => `to_char(${col} AT TIME ZONE '${ADDIS}', 'YYYY-MM-DD HH24:MI')`;

export async function listSubmissions(user: SessionUser, f: ListFilter): Promise<SubmissionRow[]> {
  const sql = db();
  const farm = user.farmId ?? (f.farm && f.farm !== 'ALL' ? f.farm : null);
  const conds = [
    user.role === 'Reporter' || f.mine ? sql`s.user_id = ${user.id}` : null,
    farm ? sql`s.farm_id = ${farm}` : null,
    f.kind ? sql`s.kind = ${f.kind}` : null,
    f.from ? sql`s.report_date >= ${f.from}` : null,
    f.to ? sql`s.report_date <= ${f.to}` : null,
    f.status && f.status !== 'All' ? sql`s.status = ${f.status}` : null,
  ].filter((c) => c !== null);
  const where = conds.reduce((acc, c) => sql`${acc} AND ${c}`, sql`TRUE`);

  const rows = await sql<SubmissionRow[]>`
    SELECT s.id, s.kind, s.report_date::text "reportDate", s.farm_id "farmId", f.name_en "farmName", u.name reporter, s.user_id "userId",
      s.status, r.name reviewer, ${sql.unsafe(ts('s.reviewed_at'))} "reviewedAt", s.review_note "reviewNote", s.remarks, s.weighers,
      ${sql.unsafe(ts('s.created_at'))} "createdAt",
      a.name "amendedBy", ${sql.unsafe(ts('s.amended_at'))} "amendedAt",
      (SELECT COUNT(*)::int FROM submission_edits WHERE submission_id = s.id) "editCount",
      CASE s.kind WHEN 'ops' THEN (SELECT COUNT(*)::int FROM ops_lines WHERE submission_id = s.id)
                  WHEN 'harvest' THEN (SELECT COUNT(*)::int FROM harvest_lines WHERE submission_id = s.id)
                  ELSE (SELECT COUNT(*)::int FROM expense_lines WHERE submission_id = s.id) END "lineCount",
      CASE s.kind WHEN 'ops' THEN (SELECT SUM(labor) FROM ops_lines WHERE submission_id = s.id)
                  WHEN 'harvest' THEN (SELECT SUM(picked_kg) FROM harvest_lines WHERE submission_id = s.id)
                  ELSE (SELECT SUM(amount_birr) FROM expense_lines WHERE submission_id = s.id) END "totalA",
      CASE s.kind WHEN 'ops' THEN (SELECT SUM(birr) FROM ops_lines WHERE submission_id = s.id)
                  WHEN 'harvest' THEN (SELECT SUM(delivered_kg) FROM harvest_lines WHERE submission_id = s.id)
                  ELSE NULL END "totalB"
    FROM submissions s
    JOIN farms f ON f.id = s.farm_id
    JOIN users u ON u.id = s.user_id
    LEFT JOIN users r ON r.id = s.reviewed_by
    LEFT JOIN users a ON a.id = s.amended_by
    WHERE ${where}
    ORDER BY s.report_date DESC, s.id DESC
    LIMIT ${f.limit ?? 300}`;
  return [...rows];
}

export type LineRow = Record<string, string | number | null>;

/** Detail lines for many submissions at once, grouped by submission id. */
export async function linesFor(subs: SubmissionRow[]): Promise<Map<number, LineRow[]>> {
  const sql = db();
  const out = new Map<number, LineRow[]>();
  const ids = (k: Kind) => subs.filter((s) => s.kind === k).map((s) => s.id);
  const queries: Record<Kind, (ids: number[]) => Promise<LineRow[]>> = {
    ops: (ids) => sql<LineRow[]>`SELECT submission_id sid, block "Block", activity_name "Activity", unit "Unit", actual "Done", labor "Labor", birr "Birr", plan "Plan"
      FROM ops_lines WHERE submission_id IN ${sql(ids)} ORDER BY id`,
    harvest: (ids) => sql<LineRow[]>`SELECT submission_id sid, block "Block", picked_kg "Picked kg", delivered_kg "At drying site kg",
      ROUND((picked_kg - delivered_kg)::numeric, 2)::float8 "Difference kg", deduction_birr "Collected Birr"
      FROM harvest_lines WHERE submission_id IN ${sql(ids)} ORDER BY id`,
    expense: (ids) => sql<LineRow[]>`SELECT submission_id sid, category "Type", description "Description", amount_birr "Birr"
      FROM expense_lines WHERE submission_id IN ${sql(ids)} ORDER BY id`,
  };
  const results = await Promise.all(KINDS.map((k) => (ids(k).length ? queries[k](ids(k)) : Promise.resolve([] as LineRow[]))));
  for (const rows of results) {
    for (const r of rows) {
      const { sid, ...rest } = r;
      const key = sid as number;
      if (!out.has(key)) out.set(key, []);
      out.get(key)!.push(rest);
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Review: Supervisor verifies/rejects own farm, Admin can do anything */
/* ------------------------------------------------------------------ */

export async function setStatus(user: SessionUser, id: number, status: Status, note: string) {
  if (!STATUSES.includes(status)) throw new InputError('Unknown status');
  if (user.role !== 'Admin' && user.role !== 'Supervisor') throw new InputError('Not allowed');
  if (!Number.isInteger(id)) throw new InputError('Report not found');
  const sql = db();
  const [sub] = await sql<{ farm_id: string; status: Status }[]>`SELECT farm_id, status FROM submissions WHERE id = ${id}`;
  if (!sub) throw new InputError('Report not found');
  if (user.role === 'Supervisor') {
    if (sub.farm_id !== user.farmId) throw new InputError('This report is not from your farm');
    if (status === 'Approved') throw new InputError('Only admins can approve');
    if (sub.status === 'Approved') throw new InputError('Already approved - ask an admin to change it');
  }
  if (status === 'Rejected' && !note.trim()) throw new InputError('Write the reason for rejecting');
  await sql`UPDATE submissions SET status = ${status}, reviewed_by = ${user.id}, reviewed_at = now(), review_note = ${note.trim().slice(0, 500)} WHERE id = ${id}`;
}
