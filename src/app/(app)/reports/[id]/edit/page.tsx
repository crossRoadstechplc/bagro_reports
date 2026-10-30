import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { getConfig } from '@/lib/config';
import { getSubmissionForEdit } from '@/lib/reports';
import ReportForms from '@/components/ReportForms';

export default async function AmendReport(props: PageProps<'/reports/[id]/edit'>) {
  const user = await requireUser(['Office', 'Admin']);
  const { id } = await props.params;
  const sp = await props.searchParams;
  const report = await getSubmissionForEdit(user, Number(id));
  if (!report) notFound();
  const back = typeof sp.back === 'string' && sp.back.startsWith('/') ? sp.back : '/reports';
  return <ReportForms config={await getConfig()} user={user} edit={{ report, backHref: back }} />;
}
