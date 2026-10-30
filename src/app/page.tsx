import { redirect } from 'next/navigation';
import { getUser, isManager } from '@/lib/auth';

export default async function Home() {
  const user = await getUser();
  if (!user) redirect('/login');
  redirect(isManager(user) ? '/admin' : '/report');
}
