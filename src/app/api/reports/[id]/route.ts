import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { InputError, updateSubmission } from '@/lib/reports';
import type { ReportPayload } from '@/lib/types';

/** Amends an existing report (Office and Admin). */
export async function PUT(req: Request, ctx: RouteContext<'/api/reports/[id]'>) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Please sign in' }, { status: 401 });
  const id = Number((await ctx.params).id);
  let payload: ReportPayload;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
  try {
    await updateSubmission(user, id, payload);
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    if (e instanceof InputError) return NextResponse.json({ error: e.message }, { status: 422 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
