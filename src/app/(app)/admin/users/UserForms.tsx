'use client';

import { useActionState, useEffect, useRef } from 'react';
import { createUserAction, updateUserAction, type ActionState } from '@/app/actions';
import type { Farm } from '@/lib/types';

export function NewUserForm({ farms }: { farms: Farm[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(createUserAction, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state.ok) ref.current?.reset(); }, [state]);
  return (
    <form ref={ref} action={action} className="card">
      <h2>Add employee</h2>
      {state.error && <div className="error">{state.error}</div>}
      {state.ok && <div className="notice">{state.ok}. Give them the link, their name and PIN.</div>}
      <div className="grid4">
        <label>Name<input name="name" required /></label>
        <label>Role
          <select name="role" defaultValue="Reporter">
            <option value="Reporter">Reporter (submits reports for own farm)</option>
            <option value="Office">Office (enters and amends reports, all farms)</option>
            <option value="Supervisor">Supervisor (verifies own farm)</option>
            <option value="Admin">Admin (everything)</option>
          </select>
        </label>
        <label>Farm
          <select name="farm" defaultValue="">
            <option value="">— All farms (office / admin) —</option>
            {farms.map((f) => <option key={f.id} value={f.id}>{f.nameEn}</option>)}
          </select>
        </label>
        <label>PIN (4–8 digits)<input name="pin" inputMode="numeric" pattern="\d{4,8}" required /></label>
      </div>
      <button className="btn primary" disabled={pending}>Add employee</button>
    </form>
  );
}

export function UserRowActions({ id, active, isMe }: { id: number; active: boolean; isMe: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(updateUserAction, {});
  return (
    <form action={action} className="review-form" style={{ marginTop: 0 }}>
      <input type="hidden" name="id" value={id} />
      <input name="pin" inputMode="numeric" placeholder="New PIN" style={{ maxWidth: 110, minWidth: 0 }} />
      <button className="btn small outline" name="op" value="pin" disabled={pending}>Set PIN</button>
      {!isMe && (
        <button className={'btn small ' + (active ? 'danger' : 'outline')} name="op" value="toggle" disabled={pending}>
          {active ? 'Deactivate' : 'Activate'}
        </button>
      )}
      {state.error && <span className="diff warn">{state.error}</span>}
      {state.ok && <span className="muted">{state.ok}</span>}
    </form>
  );
}
