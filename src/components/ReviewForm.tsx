'use client';

import { useActionState } from 'react';
import { reviewAction, type ActionState } from '@/app/actions';
import type { Role, Status } from '@/lib/types';

/**
 * Approve / Reject / Reopen buttons for one report.
 * Supervisors approve or reject their farm's waiting reports; admins can also reopen decided ones.
 */
export default function ReviewForm({ id, status, role }: { id: number; status: Status; role: Role }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(reviewAction, {});
  const waiting = status === 'Submitted' || status === 'Verified';
  const canApprove = waiting && (role === 'Admin' || role === 'Supervisor');
  const canReject = status !== 'Rejected' && (role === 'Admin' || (role === 'Supervisor' && waiting));
  const canReopen = role === 'Admin' && (status === 'Rejected' || status === 'Approved');
  if (!canApprove && !canReject && !canReopen) return null;
  return (
    <form action={action} className="review-form">
      <input type="hidden" name="id" value={id} />
      <input name="note" placeholder="Note (required to reject)" maxLength={500} />
      {canApprove && <button className="btn small primary" name="status" value="Approved" disabled={pending}>✓ Approve</button>}
      {canReject && <button className="btn small danger" name="status" value="Rejected" disabled={pending}>Reject</button>}
      {canReopen && <button className="btn small outline" name="status" value="Submitted" disabled={pending}>Reopen</button>}
      {state.error && <span className="diff warn">{state.error}</span>}
    </form>
  );
}
