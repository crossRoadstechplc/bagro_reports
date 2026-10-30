import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { farmLabel, getFarms } from '@/lib/config';
import { EXPENSE_CATEGORIES } from '@/lib/db';
import { expenseSummary, harvestSummary, opsSummary, parsePeriod, type View } from '@/lib/summaries';
import FilterBar from '@/components/FilterBar';
import SummaryTable, { Kpis } from '@/components/SummaryTable';

const VIEWS: [View, string][] = [['ops', '🌱 Operations summary'], ['harvest', '⚖️ Coffee harvest'], ['expense', '💵 Expenses']];

export default async function Dashboard(props: PageProps<'/admin'>) {
  const user = await requireUser(['Admin', 'Supervisor']);
  const sp = await props.searchParams;
  const p = parsePeriod(user, sp);
  const showAll = sp.all === '1';
  const farms = await getFarms();
  const model = await (p.view === 'ops' ? opsSummary(p, showAll) : p.view === 'harvest' ? harvestSummary(p) : expenseSummary(p, EXPENSE_CATEGORIES));
  const empty = model.rows.length <= 1;

  // Keep the current filters when switching view / toggles.
  const qs = (extra: Record<string, string>) => {
    const q = new URLSearchParams({ farm: p.farm, mode: p.mode, ey: String(p.ey), em: String(p.em), from: p.from, to: p.to, view: p.view, ...extra });
    if (user.farmId) q.delete('farm');
    return q.toString();
  };

  return (
    <main>
      <h2>Dashboard <small>{farmLabel(farms, p.farm === 'ALL' ? null : p.farm)} · {p.label} — built live from submitted reports (rejected ones are left out)</small></h2>
      <FilterBar action="/admin" farms={farms} lockedFarm={user.farmId ? farmLabel(farms, user.farmId) : null}
        farm={p.farm} mode={p.mode} ey={p.ey} em={p.em} from={p.from} to={p.to} hidden={{ view: p.view }} />
      <div className="seg">
        {VIEWS.map(([v, label]) => <Link key={v} href={`/admin?${qs({ view: v })}`} className={p.view === v ? 'on' : ''}>{label}</Link>)}
      </div>
      <Kpis items={model.kpis} />
      {p.view === 'ops' && (
        <p className="muted">
          <Link href={`/admin?${qs({ all: showAll ? '0' : '1' })}`}>{showAll ? 'Hide empty activities' : 'Show all activities (like the Excel sheet)'}</Link>
        </p>
      )}
      {empty && !showAll ? <div className="notice">No reports for this farm and period yet.</div> : <SummaryTable model={model} />}
      <div className="row-actions">
        <a className="btn small outline" href={`/api/export?${qs(showAll ? { all: '1' } : {})}`}>⬇ Download CSV (opens in Excel)</a>
        <Link className="btn small outline" href={`/admin/review?${qs({ kind: p.view })}`}>Review these reports →</Link>
      </div>
    </main>
  );
}
