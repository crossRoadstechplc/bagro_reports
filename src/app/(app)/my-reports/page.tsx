import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { linesFor, listSubmissions } from '@/lib/reports';
import { STATUSES, type Status } from '@/lib/types';
import SubmissionCard from '@/components/SubmissionCard';

export default async function MyReports(props: PageProps<'/my-reports'>) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const status = (STATUSES.includes(sp.status as Status) ? sp.status : 'All') as Status | 'All';
  const subs = await listSubmissions(user, { mine: true, status, limit: 100 });
  const lines = await linesFor(subs);
  const filters: [string, string][] = [['All', 'All'], ['Submitted', 'Waiting review'], ['Verified', 'Verified'], ['Approved', 'Approved'], ['Rejected', 'Rejected']];

  return (
    <main className="narrow">
      <h2>My reports <small>የላኳቸው ሪፖርቶች — the last 100 you sent, newest first</small></h2>
      <div className="seg">
        {filters.map(([v, label]) => (
          <Link key={v} href={v === 'All' ? '/my-reports' : `/my-reports?status=${v}`} className={status === v ? 'on' : ''}>{label}</Link>
        ))}
      </div>
      {subs.length === 0 && (
        <div className="notice">No reports here yet. <Link href="/report">Submit a report</Link>.</div>
      )}
      {subs.map((s) => <SubmissionCard key={s.id} s={s} lines={lines.get(s.id) ?? []} />)}
    </main>
  );
}
