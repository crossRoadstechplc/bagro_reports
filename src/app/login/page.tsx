import { redirect } from 'next/navigation';
import { getUser } from '@/lib/auth';
import LoginForm from './LoginForm';
import Brand from '@/components/Brand';

export default async function LoginPage() {
  if (await getUser()) redirect('/');
  return (
    <>
      <header className="top">
        <div className="bar"><Brand /></div>
      </header>
      <main>
        <LoginForm />
      </main>
    </>
  );
}
