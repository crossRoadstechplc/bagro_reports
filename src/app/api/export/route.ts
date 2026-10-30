import { NextResponse, type NextRequest } from 'next/server';
import { getUser, isManager } from '@/lib/auth';
import { EXPENSE_CATEGORIES } from '@/lib/db';
import { expenseSummary, harvestSummary, opsSummary, parsePeriod, toCsv } from '@/lib/summaries';

/** CSV of the dashboard table, with the same filters as the page. */
export async function GET(req: NextRequest) {
  const user = await getUser();
  if (!user || !isManager(user)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  const sp = Object.fromEntries(req.nextUrl.searchParams);
  const p = parsePeriod(user, sp);
  const model = await (p.view === 'ops' ? opsSummary(p, sp.all === '1') : p.view === 'harvest' ? harvestSummary(p) : expenseSummary(p, EXPENSE_CATEGORIES));
  const name = `${model.title} - ${p.farm === 'ALL' ? 'All farms' : p.farm} - ${p.label}`.replace(/[^\w\- ]+/g, '');
  return new NextResponse(toCsv(model), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${name}.csv"`,
    },
  });
}
