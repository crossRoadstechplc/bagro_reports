'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { checkLogin, endSession, getUser, isManager, startSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { hashPin, validPin } from '@/lib/pin';
import { InputError, setStatus } from '@/lib/reports';
import { ROLES, type Role, type Status } from '@/lib/types';

export interface ActionState { error?: string; ok?: string }

export async function loginAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const name = String(fd.get('name') || ''), pin = String(fd.get('pin') || '');
  if (!name.trim() || !pin.trim()) return { error: 'Enter your name and PIN' };
  const user = await checkLogin(name, pin);
  if (!user) return { error: 'Wrong name or PIN' };
  await startSession(user.id);
  redirect(isManager(user) ? '/admin' : '/report');
}

export async function logoutAction() {
  await endSession();
  redirect('/login');
}

export async function reviewAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await getUser();
  if (!user) return { error: 'Please sign in again' };
  try {
    await setStatus(user, Number(fd.get('id')), String(fd.get('status')) as Status, String(fd.get('note') || ''));
  } catch (e) {
    if (e instanceof InputError) return { error: e.message };
    throw e;
  }
  revalidatePath('/admin', 'layout');
  return { ok: `Marked ${fd.get('status')}` };
}

/* ---------------- Users (Admin only) ---------------- */

async function requireAdmin() {
  const user = await getUser();
  if (!user || user.role !== 'Admin') throw new Error('Only admins can manage users');
  return user;
}

export async function createUserAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const name = String(fd.get('name') || '').trim();
  const role = String(fd.get('role')) as Role;
  const farm = String(fd.get('farm') || '');
  const pin = String(fd.get('pin') || '').trim();
  if (name.length < 2) return { error: 'Enter a name' };
  if (!ROLES.includes(role)) return { error: 'Choose a role' };
  if ((role === 'Reporter' || role === 'Supervisor') && !farm) return { error: 'Reporters and supervisors need a farm' };
  if (!validPin(pin)) return { error: 'PIN must be 4 to 8 digits' };
  const sql = db();
  const [exists] = await sql`SELECT 1 FROM users WHERE lower(name) = lower(${name})`;
  if (exists) return { error: `"${name}" already exists` };
  // Office staff always cover all farms; admins may optionally be tied to one.
  const farmId = role === 'Office' || (role === 'Admin' && !farm) ? null : farm;
  await sql`INSERT INTO users (name, role, farm_id, pin_hash) VALUES (${name}, ${role}, ${farmId}, ${hashPin(pin)})`;
  revalidatePath('/admin/users');
  return { ok: `Added ${name}` };
}

export async function updateUserAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const id = Number(fd.get('id'));
  const op = String(fd.get('op'));
  if (op === 'pin') {
    const pin = String(fd.get('pin') || '').trim();
    if (!validPin(pin)) return { error: 'PIN must be 4 to 8 digits' };
    await db()`UPDATE users SET pin_hash = ${hashPin(pin)} WHERE id = ${id}`;
    revalidatePath('/admin/users');
    return { ok: 'PIN changed' };
  }
  if (op === 'toggle') {
    if (id === admin.id) return { error: 'You cannot deactivate yourself' };
    await db()`UPDATE users SET active = NOT active WHERE id = ${id}`;
    revalidatePath('/admin/users');
    return { ok: 'Updated' };
  }
  return { error: 'Unknown action' };
}
