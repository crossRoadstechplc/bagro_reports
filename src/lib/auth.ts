import 'server-only';
import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { db } from './db';
import { verifyPin } from './pin';
import type { Role, SessionUser } from './types';

const COOKIE = 'bagro_session';
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days - field phones stay signed in

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s && process.env.NODE_ENV === 'production') {
    throw new Error('Set SESSION_SECRET in the environment before running in production.');
  }
  return s || 'dev-only-secret-do-not-use-in-production';
}

function sign(data: string) {
  return crypto.createHmac('sha256', secret()).update(data).digest('base64url');
}

function encode(uid: number) {
  const body = Buffer.from(JSON.stringify({ uid, exp: Date.now() + MAX_AGE * 1000 })).toString('base64url');
  return `${body}.${sign(body)}`;
}

function decode(token: string | undefined): number | null {
  if (!token) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = sign(body);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const { uid, exp } = JSON.parse(Buffer.from(body, 'base64url').toString());
    return typeof uid === 'number' && exp > Date.now() ? uid : null;
  } catch {
    return null;
  }
}

interface UserRow { id: number; name: string; role: Role; farm_id: string | null; pin_hash: string }

// Office staff always work across all farms.
const toSession = (u: UserRow): SessionUser => ({ id: u.id, name: u.name, role: u.role, farmId: u.role === 'Office' ? null : u.farm_id });

/** Checks name + PIN. Returns the user or null. */
export async function checkLogin(name: string, pin: string): Promise<SessionUser | null> {
  const [u] = await db()<UserRow[]>`SELECT id, name, role, farm_id, pin_hash FROM users WHERE lower(name) = lower(${name.trim()}) AND active`;
  if (!u || !verifyPin(pin.trim(), u.pin_hash)) return null;
  return toSession(u);
}

export async function startSession(userId: number) {
  (await cookies()).set(COOKIE, encode(userId), {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: MAX_AGE,
  });
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}

/** The signed-in user, or null. Deactivated users are signed out automatically. */
// cache(): the layout and the page share one lookup per request.
export const getUser = cache(async (): Promise<SessionUser | null> => {
  const uid = decode((await cookies()).get(COOKIE)?.value);
  if (!uid) return null;
  const [u] = await db()<UserRow[]>`SELECT id, name, role, farm_id, pin_hash FROM users WHERE id = ${uid} AND active`;
  return u ? toSession(u) : null;
});

/** Use in pages: sends to /login if signed out, or home if the role is not allowed. */
export async function requireUser(roles?: Role[]): Promise<SessionUser> {
  const u = await getUser();
  if (!u) redirect('/login');
  if (roles && !roles.includes(u.role)) redirect('/');
  return u;
}

/** Can open the dashboard and review reports. */
export const isManager = (u: SessionUser) => u.role === 'Admin' || u.role === 'Supervisor';
/** Can amend any farm's reports (and enter reports for any farm). */
export const canAmend = (u: SessionUser) => u.role === 'Admin' || u.role === 'Office';
