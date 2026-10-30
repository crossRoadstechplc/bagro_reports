'use client';

import { useActionState, useRef } from 'react';
import { loginAction, type ActionState } from '../actions';

// Shown on the sign-in page; tapping it fills the form. Remove or change it before real use.
const DEMO = { name: 'Office Clerk', pin: '3333' };

export default function LoginForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(loginAction, {});
  const nameRef = useRef<HTMLInputElement>(null);
  const pinRef = useRef<HTMLInputElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);

  const fillDemo = () => {
    if (nameRef.current) nameRef.current.value = DEMO.name;
    if (pinRef.current) pinRef.current.value = DEMO.pin;
    submitRef.current?.focus();
  };

  return (
    <form action={action} className="card login">
      <h2>Sign in <small>ይግቡ</small></h2>
      {state.error && <div className="error">{state.error}</div>}
      <label>Your name / ስም<input ref={nameRef} name="name" autoComplete="username" required /></label>
      <label>PIN / ሚስጥር ቁጥር<input ref={pinRef} name="pin" type="password" inputMode="numeric" autoComplete="current-password" required /></label>
      <button ref={submitRef} className="btn primary wide" disabled={pending}>{pending ? 'Signing in…' : 'Sign in'}</button>
      <p className="muted">Ask the office for your name and PIN.</p>
      <button type="button" className="demo-login" onClick={fillDemo}>
        <span>Try it: <b>{DEMO.name}</b> · PIN <b>{DEMO.pin}</b></span>
        <small>Tap to fill in</small>
      </button>
    </form>
  );
}
