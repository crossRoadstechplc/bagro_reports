import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { getFarms } from '@/lib/config';
import { linesFor, listSubmissions } from '@/lib/reports';
import { parsePeriod } from '@/lib/summaries';
import { KINDS, KIND_LABEL, STATUSES, type Kind, type Status } from '@/lib/types';
import FilterBar from '@/components/FilterBar';
import SubmissionCard from '@/components/SubmissionCard';

/** Every farm's reports, for office staff and admins to find and amend. */
export default async function AllReports(props: PageProps<'/reports'>) {
  const user = await requireUser(['Office', 'Admin']);
  const sp = await props.searchParams;
  const p = parsePeriod(user, sp);
  const kind = (KINDS.includes(sp.kind as Kind) ? sp.kind : 'ops') as Kind;
  const status = (STATUSES.includes(sp.status as Status) ? sp.status : 'All') as Status | 'All';
  const subs = await listSubmissions(user, { kind, status, farm: p.farm, from: p.from, to: p.to });
  const lines = await linesFor(subs);

  const params = { farm: p.farm, mode: p.mode, ey: String(p.ey), em: String(p.em), from: p.from, to: p.to, kind, status };
  const qs = (extra: Record<string, string>) => new URLSearchParams({ ...params, ...extra }).toString();
  const back = encodeURIComponent(`/reports?${qs({})}`);
  const statusTabs: [string, string][] = [['All', 'All'], ['Submitted', 'Waiting review'], ['Approved', 'Approved'], ['Rejected', 'Rejected']];

  return (
    <main>
      <h2>All reports <small>Reports from every farm. Reports you enter or amend are approved automatically under your name, and the previous version of an amended report is kept.</small></h2>
      <FilterBar action="/reports" farms={await getFarms()} lockedFarm={null}
        farm={p.farm} mode={p.mode} ey={p.ey} em={p.em} from={p.from} to={p.to} hidden={{ kind, status }} />
      <div className="seg">
        {KINDS.map((k) => <Link key={k} href={`/reports?${qs({ kind: k })}`} className={kind === k ? 'on' : ''}>{KIND_LABEL[k]}</Link>)}
        <Link href="/report" className="">+ Enter a new report</Link>
      </div>
      <div className="seg">
        {statusTabs.map(([s, label]) => <Link key={s} href={`/reports?${qs({ status: s })}`} className={status === s ? 'on' : ''}>{label}</Link>)}
      </div>
      {subs.length === 0 && <div className="notice">No reports in this period.</div>}
      {subs.map((s) => (
        <SubmissionCard key={s.id} s={s} lines={lines.get(s.id) ?? []}>
          <div className="row-actions">
            <Link className="btn small outline" href={`/reports/${s.id}/edit?back=${back}`}>✏️ Amend</Link>
          </div>
        </SubmissionCard>
      ))}
    </main>
  );
}
