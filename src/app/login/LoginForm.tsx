'use client';

import { useActionState } from 'react';
import { loginAction, type ActionState } from '../actions';

export default function LoginForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(loginAction, {});
  return (
    <form action={action} className="card login">
      <h2>Sign in <small>ይግቡ</small></h2>
      {state.error && <div className="error">{state.error}</div>}
      <label>Your name / ስም<input name="name" autoComplete="username" required /></label>
      <label>PIN / ሚስጥር ቁጥር<input name="pin" type="password" inputMode="numeric" autoComplete="current-password" required /></label>
      <button className="btn primary wide" disabled={pending}>{pending ? 'Signing in…' : 'Sign in'}</button>
      <p className="muted">Ask IT Team for login</p>
    </form>
  );
}
