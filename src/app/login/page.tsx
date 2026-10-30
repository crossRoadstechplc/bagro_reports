import { redirect } from 'next/navigation';
import { getUser } from '@/lib/auth';
import LoginForm from './LoginForm';

export default async function LoginPage() {
  if (await getUser()) redirect('/');
  return (
    <>
      <header className="top">
        <div className="bar"><h1>B Agro <small>· Field Reports / የመስክ ሪፖርት</small></h1></div>
      </header>
      <main>
        <LoginForm showDemo={process.env.NODE_ENV !== 'production'} />
      </main>
    </>
  );
}
