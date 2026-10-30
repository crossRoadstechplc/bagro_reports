import { requireUser } from '@/lib/auth';
import { farmLabel, getFarms } from '@/lib/config';
import { logoutAction } from '../actions';
import NavLinks from '@/components/NavLinks';
import Brand from '@/components/Brand';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const links = [
    { href: '/report', label: '🌱 Submit report' },
    { href: '/my-reports', label: '📄 My reports' },
  ];
  if (user.role === 'Office' || user.role === 'Admin') links.push({ href: '/reports', label: '🗂 All reports' });
  if (user.role === 'Admin' || user.role === 'Supervisor') {
    links.push({ href: '/admin', label: '📊 Dashboard' }, { href: '/admin/review', label: '✅ Review' });
  }
  if (user.role === 'Admin') links.push({ href: '/admin/users', label: '👥 Users' });

  return (
    <>
      <header className="top">
        <div className="bar">
          <Brand />
          <div className="who">
            {user.name}<br />{user.role} · {farmLabel(await getFarms(), user.farmId)}
          </div>
          <form action={logoutAction}><button>Log out</button></form>
        </div>
        <NavLinks links={links} />
      </header>
      {children}
    </>
  );
}
