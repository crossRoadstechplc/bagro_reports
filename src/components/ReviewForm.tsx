'use client';

import { useActionState } from 'react';
import { reviewAction, type ActionState } from '@/app/actions';
import type { Role, Status } from '@/lib/types';

/** Verify / Approve / Reject buttons for one report. Which buttons show depends on role and status. */
export default function ReviewForm({ id, status, role }: { id: number; status: Status; role: Role }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(reviewAction, {});
  const canVerify = status === 'Submitted';
  const canApprove = role === 'Admin' && (status === 'Submitted' || status === 'Verified');
  const canReject = status !== 'Rejected' && (role === 'Admin' || status !== 'Approved');
  const canReopen = role === 'Admin' && (status === 'Rejected' || status === 'Approved');
  if (!canVerify && !canApprove && !canReject && !canReopen) return null;
  return (
    <form action={action} className="review-form">
      <input type="hidden" name="id" value={id} />
      <input name="note" placeholder="Note (required to reject)" maxLength={500} />
      {canVerify && <button className="btn small outline" name="status" value="Verified" disabled={pending}>✓ Verify</button>}
      {canApprove && <button className="btn small primary" name="status" value="Approved" disabled={pending}>✓ Approve</button>}
      {canReject && <button className="btn small danger" name="status" value="Rejected" disabled={pending}>Reject</button>}
      {canReopen && <button className="btn small outline" name="status" value="Submitted" disabled={pending}>Reopen</button>}
      {state.error && <span className="diff warn">{state.error}</span>}
    </form>
  );
}
