'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function NavLinks({ links }: { links: { href: string; label: string }[] }) {
  const path = usePathname();
  // The longest matching link is the active one (so /admin/review doesn't also light up /admin).
  const active = links.filter((l) => path === l.href || path.startsWith(l.href + '/'))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <nav className="tabs">
      <div className="inner">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className={l.href === active ? 'on' : ''}>{l.label}</Link>
        ))}
      </div>
    </nav>
  );
}
