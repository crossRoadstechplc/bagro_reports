import { requireUser } from '@/lib/auth';
import { getConfig } from '@/lib/config';
import ReportForms from '@/components/ReportForms';

export default async function ReportPage() {
  const user = await requireUser();
  return <ReportForms config={await getConfig()} user={user} />;
}
