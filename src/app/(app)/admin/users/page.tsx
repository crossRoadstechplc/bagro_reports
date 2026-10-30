import { requireUser } from '@/lib/auth';
import { farmLabel, getFarms } from '@/lib/config';
import { db } from '@/lib/db';
import { NewUserForm, UserRowActions } from './UserForms';

interface Row { id: number; name: string; role: string; farm_id: string | null; active: boolean; reports: number; last: string | null }

export default async function UsersPage() {
  const me = await requireUser(['Admin']);
  const farms = await getFarms();
  const users = await db()<Row[]>`
    SELECT u.id, u.name, u.role, u.farm_id, u.active,
      (SELECT COUNT(*)::int FROM submissions WHERE user_id = u.id) reports,
      (SELECT MAX(report_date)::text FROM submissions WHERE user_id = u.id) last
    FROM users u ORDER BY u.active DESC, u.role, u.name`;

  return (
    <main>
      <h2>Users <small>Each employee signs in with their name and PIN. Reporters and supervisors only see their own farm. Office staff enter and amend reports for all farms.</small></h2>
      <NewUserForm farms={farms} />
      <section className="card">
        <table className="plain">
          <thead><tr><th>Name</th><th>Role</th><th>Farm</th><th>Reports</th><th>Last report</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} style={u.active ? undefined : { opacity: 0.55 }}>
                <td><b>{u.name}</b>{u.id === me.id && <span className="muted"> (you)</span>}</td>
                <td>{u.role}</td>
                <td>{farmLabel(farms, u.farm_id)}</td>
                <td>{u.reports}</td>
                <td>{u.last ?? '—'}</td>
                <td>{u.active ? 'Active' : 'Inactive'}</td>
                <td><UserRowActions id={u.id} active={!!u.active} isMe={u.id === me.id} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
