import 'server-only';
import { db } from './db';
import { getActivities, getBlocks, getFarms } from './config';
import { ETH_MONTHS_EN, ethLabel, ethMonthRange, isoToEth, todayAddis } from './ethiopian';
import type { SessionUser, TableModel, TableRow } from './types';

export type View = 'ops' | 'harvest' | 'expense';

export interface Period { farm: string; mode: 'eth' | 'range'; ey: number; em: number; from: string; to: string; label: string; view: View }

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || '';
const isIso = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Reads the dashboard filters from the URL. Defaults to the current Ethiopian month. */
export function parsePeriod(user: SessionUser, sp: SP): Period {
  const today = todayAddis(), now = isoToEth(today);
  const view = (['ops', 'harvest', 'expense'].includes(one(sp.view)) ? one(sp.view) : 'ops') as View;
  const farm = user.farmId ?? (one(sp.farm) || 'ALL');
  const mode = one(sp.mode) === 'range' ? 'range' : 'eth';
  const ey = Number(one(sp.ey)) || now.y;
  const em = Math.min(13, Math.max(1, Number(one(sp.em)) || now.m));
  if (mode === 'eth') {
    const r = ethMonthRange(ey, em);
    return { farm, mode, ey, em, from: r.from, to: r.to, label: `${ETH_MONTHS_EN[em - 1]} ${ey}`, view };
  }
  const from = isIso(one(sp.from)) ? one(sp.from) : today;
  const to = isIso(one(sp.to)) ? one(sp.to) : today;
  return { farm, mode, ey, em, from, to, label: `${from} to ${to}`, view };
}

const n0 = (v: number | null | undefined) => v ?? 0;
const fmt0 = (n: number) => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
/** Rows of one report type in the period, excluding rejected reports, optionally for one farm. */
const scope = (p: Period, kind: string) => {
  const sql = db();
  return sql`s.kind = ${kind} AND s.status <> 'Rejected' AND s.report_date BETWEEN ${p.from} AND ${p.to}
    ${p.farm === 'ALL' ? sql`` : sql`AND s.farm_id = ${p.farm}`}`;
};
/** Column key: farms when looking at all farms, otherwise blocks. */
const groupKey = (p: Period) => (p.farm === 'ALL' ? db()`s.farm_id` : db()`l.block`);

async function columns(p: Period, extraKeys: string[]) {
  const byFarm = p.farm === 'ALL';
  const groups = byFarm
    ? (await getFarms()).map((f) => ({ key: f.id, label: f.nameEn }))
    : (await getBlocks(p.farm)).map((b) => ({ key: b.name, label: b.name + (b.areaHa ? ` (${b.areaHa} ha)` : '') }));
  for (const k of extraKeys) if (k && !groups.some((g) => g.key === k)) groups.push({ key: k, label: k });
  return { byFarm, groups };
}

/* ------------------------------------------------------------------ */
/* Operations: same layout as the Chetu monthly summary sheet          */
/* ------------------------------------------------------------------ */
export async function opsSummary(p: Period, showAll = false): Promise<TableModel> {
  const sql = db();
  const [data, [stats], acts] = await Promise.all([
    sql<{ code: string; name: string; unit: string; k: string; a: number | null; lab: number | null; b: number | null }[]>`
      SELECT l.activity_code code, MAX(l.activity_name) name, MAX(l.unit) unit, ${groupKey(p)} k,
        SUM(l.actual) a, SUM(l.labor) lab, SUM(l.birr) b
      FROM ops_lines l JOIN submissions s ON s.id = l.submission_id
      WHERE ${scope(p, 'ops')}
      GROUP BY 1, 4`,
    sql<{ subs: number; days: number; pending: number }[]>`
      SELECT COUNT(*)::int subs, COUNT(DISTINCT report_date)::int days, COUNT(*) FILTER (WHERE status = 'Submitted')::int pending
      FROM submissions s WHERE ${scope(p, 'ops')}`,
    getActivities(true),
  ]);

  const { groups } = await columns(p, uniq(data.map((r) => r.k)));
  const agg = new Map<string, Map<string, { a: number; l: number; b: number }>>();
  for (const r of data) {
    if (!agg.has(r.code)) agg.set(r.code, new Map());
    agg.get(r.code)!.set(r.k, { a: n0(r.a), l: n0(r.lab), b: n0(r.b) });
  }

  // Categories in catalogue order; reports for removed activities go under "Other".
  const cats = uniq(acts.map((a) => a.categoryEn)).map((c) => {
    const list = acts.filter((a) => a.categoryEn === c);
    return { name: c, label: `${c} / ${list[0].categoryAm}`, acts: list.map((a) => ({ code: a.code, name: `${a.nameEn} / ${a.nameAm}`, unit: a.unit })) };
  });
  const known = new Set(acts.map((a) => a.code));
  const orphans = data.filter((r) => !known.has(r.code));
  if (orphans.length) {
    cats.push({ name: 'Other', label: 'Other (removed activities)', acts: uniq(orphans.map((r) => r.code)).map((code) => {
      const r = orphans.find((x) => x.code === code)!;
      return { code, name: r.name, unit: r.unit };
    }) });
  }

  const rows: TableRow[] = [];
  const grand = groups.map(() => ({ l: 0, b: 0 }));
  let gl = 0, gb = 0;
  for (const cat of cats) {
    const sub = groups.map(() => ({ l: 0, b: 0 }));
    let sl = 0, sb = 0;
    const body: TableRow[] = [];
    for (const a of cat.acts) {
      const cells = agg.get(a.code);
      if (!cells && !showAll) continue;
      let ta = 0, tl = 0, tb = 0;
      const vals: number[] = [];
      groups.forEach((g, i) => {
        const c = cells?.get(g.key) ?? { a: 0, l: 0, b: 0 };
        vals.push(c.a, c.l, c.b);
        ta += c.a; tl += c.l; tb += c.b;
        sub[i].l += c.l; sub[i].b += c.b;
      });
      sl += tl; sb += tb;
      body.push({ c: [cat.name, a.name, a.unit, ...vals, ta, tl, tb] });
    }
    if (!body.length) continue;
    rows.push({ cls: 'cat', c: [cat.label] }, ...body,
      { cls: 'sub', c: [cat.name, 'Sub total / ንዑስ ድምር', '', ...sub.flatMap((s) => ['', s.l, s.b]), '', sl, sb] });
    sub.forEach((s, i) => { grand[i].l += s.l; grand[i].b += s.b; });
    gl += sl; gb += sb;
  }
  rows.push({ cls: 'total', c: ['', 'TOTAL / ጠቅላላ ድምር', '', ...grand.flatMap((s) => ['', s.l, s.b]), '', gl, gb] });

  return {
    title: 'Operations',
    head: [
      [{ t: 'Activity / ተግባር', rs: 2 }, { t: 'Unit', rs: 2 }, ...groups.map((g) => ({ t: g.label, cs: 3 })), { t: 'Total', cs: 3 }],
      [...groups.flatMap(() => ['Done', 'Labor', 'Birr']), 'Done', 'Labor', 'Birr'],
    ],
    flat: ['Category', 'Activity', 'Unit', ...groups.flatMap((g) => [`${g.label} Done`, `${g.label} Labor`, `${g.label} Birr`]), 'Total Done', 'Total Labor', 'Total Birr'],
    rows, skipFirst: true,
    kpis: [
      ['Labor (man-days)', fmt0(gl)],
      ['Payment (Birr)', fmt0(gb)],
      ['Reports', `${stats.subs} on ${stats.days} day(s)`],
      ['Waiting review', String(stats.pending ?? 0)],
    ],
  };
}

/* ------------------------------------------------------------------ */
/* Coffee harvest: kg per day per block with running total             */
/* ------------------------------------------------------------------ */
export async function harvestSummary(p: Period): Promise<TableModel> {
  const sql = db();
  const [data, farms] = await Promise.all([
    sql<{ d: string; k: string; kg: number; picked: number | null; delivered: number | null; ded: number | null }[]>`
      SELECT s.report_date::text d, ${groupKey(p)} k,
        SUM(COALESCE(l.delivered_kg, l.picked_kg)) kg, SUM(l.picked_kg) picked, SUM(l.delivered_kg) delivered, SUM(l.deduction_birr) ded
      FROM harvest_lines l JOIN submissions s ON s.id = l.submission_id
      WHERE ${scope(p, 'harvest')}
      GROUP BY 1, 2 ORDER BY 1`,
    getFarms(),
  ]);

  const { groups } = await columns(p, uniq(data.map((r) => r.k)));
  const dates = uniq(data.map((r) => r.d));
  const colTot = groups.map(() => 0);
  let cum = 0;
  const rows: TableRow[] = dates.map((dt) => {
    const vals = groups.map((g, i) => {
      const v = n0(data.find((r) => r.d === dt && r.k === g.key)?.kg);
      colTot[i] += v;
      return v;
    });
    const day = vals.reduce((a, b) => a + b, 0);
    cum += day;
    return { c: [dt, ethLabel(dt), ...vals, day, cum] };
  });
  rows.push({ cls: 'total', c: ['TOTAL', '', ...colTot, cum, cum] });

  const picked = data.reduce((s, r) => s + n0(r.picked), 0);
  const delivered = data.reduce((s, r) => s + n0(r.delivered), 0);
  const ded = data.reduce((s, r) => s + n0(r.ded), 0);
  const plan = p.farm === 'ALL' ? farms.reduce((s, f) => s + f.annualPlanKg, 0) : farms.find((f) => f.id === p.farm)?.annualPlanKg ?? 0;
  const kpis: [string, string][] = [
    ['Picked (kg)', fmt0(picked)],
    ['At drying site (kg)', fmt0(delivered)],
    ['Difference (kg)', fmt0(picked - delivered) + (picked ? ` (${fmt0(((picked - delivered) / picked) * 100)}%)` : '')],
    ['Collected from workers (Birr)', fmt0(ded)],
  ];
  if (plan) kpis.push(['Of annual plan', `${fmt0((cum / plan) * 100)}% of ${fmt0(plan)} kg`]);
  return {
    title: 'Harvest',
    head: [['Date', 'Ethiopian date', ...groups.map((g) => g.label), 'Day total', 'Cumulative']],
    flat: ['Date', 'Ethiopian date', ...groups.map((g) => `${g.label} (kg)`), 'Day total (kg)', 'Cumulative (kg)'],
    rows, kpis,
  };
}

/* ------------------------------------------------------------------ */
/* Expenses by type                                                    */
/* ------------------------------------------------------------------ */
export async function expenseSummary(p: Period, categories: string[]): Promise<TableModel> {
  const sql = db(), byFarm = p.farm === 'ALL';
  const data = await sql<{ c: string; f: string; amt: number }[]>`
    SELECT l.category c, s.farm_id f, SUM(l.amount_birr) amt
    FROM expense_lines l JOIN submissions s ON s.id = l.submission_id
    WHERE ${scope(p, 'expense')}
    GROUP BY 1, 2`;
  const groups = byFarm ? (await getFarms()).map((f) => ({ key: f.id, label: f.nameEn })) : [{ key: p.farm, label: 'Amount (Birr)' }];
  const colTot = groups.map(() => 0);
  const rows: TableRow[] = [];
  for (const c of uniq([...categories, ...data.map((r) => r.c)])) {
    const vals = groups.map((g, i) => {
      const v = data.filter((r) => r.c === c && r.f === g.key).reduce((s, r) => s + r.amt, 0);
      colTot[i] += v;
      return v;
    });
    const t = vals.reduce((a, b) => a + b, 0);
    if (t) rows.push({ c: [c, ...vals, ...(byFarm ? [t] : [])] });
  }
  const total = colTot.reduce((a, b) => a + b, 0);
  rows.push({ cls: 'total', c: ['TOTAL', ...colTot, ...(byFarm ? [total] : [])] });
  const head = ['Expense type', ...groups.map((g) => g.label), ...(byFarm ? ['Total'] : [])];
  return { title: 'Expenses', head: [head], flat: head, rows, kpis: [['Total expenses (Birr)', fmt0(total)]] };
}

export function toCsv(m: TableModel) {
  const all = [m.flat, ...m.rows.map((r) => r.c)];
  return '﻿' + all.map((r) => r.map((v) => {
    const s = String(v ?? '');
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\r\n');
}

function uniq<T>(a: T[]) { return [...new Set(a)]; }
