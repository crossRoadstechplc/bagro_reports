import { ethLabel } from '@/lib/ethiopian';
import type { LineRow, SubmissionRow } from '@/lib/reports';
import { KIND_LABEL } from '@/lib/types';

const fmt0 = (n: number | null) => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });

function summary(s: SubmissionRow) {
  if (s.kind === 'ops') return `${s.lineCount} activities · ${fmt0(s.totalA)} man-days · ${fmt0(s.totalB)} Birr`;
  if (s.kind === 'harvest') return `${fmt0(s.totalA)} kg picked · ${fmt0(s.totalB)} kg at drying site`;
  return `${s.lineCount} item(s) · ${fmt0(s.totalA)} Birr`;
}

export default function SubmissionCard({ s, lines, children }: { s: SubmissionRow; lines: LineRow[]; children?: React.ReactNode }) {
  const cols = lines[0] ? Object.keys(lines[0]) : [];
  const auto = s.status === 'Approved' && s.reviewNote.startsWith('Auto-approved');
  return (
    <div className="sub-card">
      <div className="meta">
        <span>
          <b>{KIND_LABEL[s.kind]}</b> · {ethLabel(s.reportDate)} <span className="muted">({s.reportDate})</span> · {s.farmName} · entered by <b>{s.reporter}</b>
        </span>
        <span className={`status st-${s.status}`}>{s.status}</span>
      </div>
      <div className="muted">
        {summary(s)}
        {s.reviewer && !auto && <> · {s.status.toLowerCase()} by {s.reviewer}</>}
      </div>
      {auto && <div className="muted">✓ Approved automatically ({s.reviewNote.replace('Auto-approved: ', '')}) - {s.reviewer}, {s.reviewedAt}</div>}
      {s.amendedBy && (
        <div className="muted">✏️ Amended by {s.amendedBy} on {s.amendedAt}{s.editCount > 1 ? ` (${s.editCount} times)` : ''}</div>
      )}
      {s.reviewNote && !auto && <div className={s.status === 'Rejected' ? 'diff warn' : 'muted'}>Note: {s.reviewNote}</div>}
      <details>
        <summary>Show details · report #{s.id}</summary>
        <div className="tablewrap">
          <table className="grid">
            <thead><tr>{cols.map((c) => <th key={c}>{c}</th>)}</tr></thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i}>
                  {cols.map((c) => (typeof l[c] === 'number'
                    ? <td key={c} className="n">{fmt0(l[c] as number)}</td>
                    : <td key={c}>{l[c] ?? ''}</td>))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {s.remarks && <p className="muted">Remarks: {s.remarks}</p>}
        {s.weighers && <p className="muted pre-line">Weighed by:{'\n'}{s.weighers}</p>}
        <p className="muted">Sent {s.createdAt} (Addis time)</p>
      </details>
      {children}
    </div>
  );
}
