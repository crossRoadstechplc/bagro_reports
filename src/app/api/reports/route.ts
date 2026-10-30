import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { createSubmission, InputError } from '@/lib/reports';
import type { ReportPayload } from '@/lib/types';

/** Receives reports from the phone form (including ones queued while offline). */
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Please sign in' }, { status: 401 });
  let payload: ReportPayload;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
  try {
    const r = await createSubmission(user, payload);
    return NextResponse.json({ ok: true, ...r }, { status: r.duplicate ? 200 : 201 });
  } catch (e) {
    if (e instanceof InputError) return NextResponse.json({ error: e.message }, { status: 422 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
