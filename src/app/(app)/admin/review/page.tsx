import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { farmLabel, getFarms } from '@/lib/config';
import { linesFor, listSubmissions } from '@/lib/reports';
import { parsePeriod } from '@/lib/summaries';
import { KINDS, KIND_LABEL, STATUSES, type Kind, type Status } from '@/lib/types';
import FilterBar from '@/components/FilterBar';
import ReviewForm from '@/components/ReviewForm';
import SubmissionCard from '@/components/SubmissionCard';

export default async function ReviewPage(props: PageProps<'/admin/review'>) {
  const user = await requireUser(['Admin', 'Supervisor']);
  const sp = await props.searchParams;
  const p = parsePeriod(user, sp);
  const kind = (KINDS.includes(sp.kind as Kind) ? sp.kind : 'ops') as Kind;
  const status = (sp.status === 'All' || STATUSES.includes(sp.status as Status) ? sp.status : 'Submitted') as Status | 'All';
  const farms = await getFarms();
  const subs = await listSubmissions(user, { kind, status, farm: p.farm, from: p.from, to: p.to });
  const lines = await linesFor(subs);

  const qs = (extra: Record<string, string>) => {
    const q = new URLSearchParams({ farm: p.farm, mode: p.mode, ey: String(p.ey), em: String(p.em), from: p.from, to: p.to, kind, status, ...extra });
    if (user.farmId) q.delete('farm');
    return q.toString();
  };
  const statusTabs: [string, string][] = [['Submitted', 'Waiting'], ['Verified', 'Verified'], ['Approved', 'Approved'], ['Rejected', 'Rejected'], ['All', 'All']];

  return (
    <main>
      <h2>Review &amp; approve <small>
        {user.role === 'Supervisor' ? 'Verify or reject reports from your farm. Admins give final approval.' : 'Supervisors verify, admins approve. Rejected reports are left out of the dashboard.'}
      </small></h2>
      <FilterBar action="/admin/review" farms={farms} lockedFarm={user.farmId ? farmLabel(farms, user.farmId) : null}
        farm={p.farm} mode={p.mode} ey={p.ey} em={p.em} from={p.from} to={p.to} hidden={{ kind, status }} />
      <div className="seg">
        {KINDS.map((k) => <Link key={k} href={`/admin/review?${qs({ kind: k })}`} className={kind === k ? 'on' : ''}>{KIND_LABEL[k]}</Link>)}
      </div>
      <div className="seg">
        {statusTabs.map(([s, label]) => <Link key={s} href={`/admin/review?${qs({ status: s })}`} className={status === s ? 'on' : ''}>{label}</Link>)}
      </div>
      {subs.length === 0 && <div className="notice">No {status === 'All' ? '' : status.toLowerCase() + ' '}reports in this period.</div>}
      {subs.map((s) => (
        <SubmissionCard key={s.id} s={s} lines={lines.get(s.id) ?? []}>
          <ReviewForm id={s.id} status={s.status} role={user.role} />
        </SubmissionCard>
      ))}
    </main>
  );
}
