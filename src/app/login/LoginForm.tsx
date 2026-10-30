'use client';

import { useActionState } from 'react';
import { loginAction, type ActionState } from '../actions';

export default function LoginForm({ showDemo }: { showDemo: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(loginAction, {});
  return (
    <form action={action} className="card login">
      <h2>Sign in <small>ይግቡ</small></h2>
      {state.error && <div className="error">{state.error}</div>}
      <label>Your name / ስም<input name="name" autoComplete="username" required /></label>
      <label>PIN / ሚስጥር ቁጥር<input name="pin" type="password" inputMode="numeric" autoComplete="current-password" required /></label>
      <button className="btn primary wide" disabled={pending}>{pending ? 'Signing in…' : 'Sign in'}</button>
      <p className="muted">Ask the office for your name and PIN.</p>
      {showDemo && (
        <div className="notice">
          <b>Starter accounts</b> (change PINs in Users):<br />
          <b>Admin</b> / 1234 · <b>Office Clerk</b> / 3333<br />
          <b>&lt;Farm&gt; Supervisor</b> and <b>&lt;Farm&gt; Reporter</b> / 1111 for Gawi, Telli, Ephrata, Kamisse, Shakis<br />
          <b>Chetu Supervisor</b> / 2222 · <b>Chetu Reporter</b> / 1111
        </div>
      )}
    </form>
  );
}
