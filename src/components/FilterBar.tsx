'use client';

import Form from 'next/form';
import { ETH_MONTHS_AM, ETH_MONTHS_EN } from '@/lib/ethiopian';
import type { Farm } from '@/lib/types';

interface Props {
  action: string;
  farms: Farm[];
  lockedFarm: string | null; // supervisors only see their farm
  farm: string; mode: 'eth' | 'range'; ey: number; em: number; from: string; to: string;
  hidden?: Record<string, string>;
}

/** Farm + period picker. Re-loads the page as soon as something changes. */
export default function FilterBar(p: Props) {
  return (
    <Form action={p.action} className="card" onChange={(e) => e.currentTarget.requestSubmit()}>
      {Object.entries(p.hidden ?? {}).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <div className="grid4">
        <label>Farm / እርሻ
          {p.lockedFarm
            ? <input value={p.lockedFarm} disabled />
            : <select name="farm" defaultValue={p.farm}>
                <option value="ALL">All farms (consolidated)</option>
                {p.farms.map((f) => <option key={f.id} value={f.id}>{f.nameEn} / {f.nameAm}</option>)}
              </select>}
        </label>
        <label>Period
          <select name="mode" defaultValue={p.mode}>
            <option value="eth">Ethiopian month</option>
            <option value="range">Custom dates</option>
          </select>
        </label>
        {p.mode === 'eth' ? (
          <>
            <label>Month / ወር
              <select name="em" defaultValue={p.em}>
                {ETH_MONTHS_EN.map((m, i) => <option key={m} value={i + 1}>{m} / {ETH_MONTHS_AM[i]}</option>)}
              </select>
            </label>
            <label>Year (E.C.) / ዓ.ም<input name="ey" type="number" defaultValue={p.ey} min={2000} max={2100} /></label>
          </>
        ) : (
          <>
            <label>From<input name="from" type="date" defaultValue={p.from} /></label>
            <label>To<input name="to" type="date" defaultValue={p.to} /></label>
          </>
        )}
      </div>
      <div className="muted">{p.from} → {p.to}</div>
    </Form>
  );
}
