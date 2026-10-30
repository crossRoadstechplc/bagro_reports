'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ethLabel, ethLabelAm, todayLocal } from '@/lib/ethiopian';
import { KIND_LABEL, type AppConfig, type Kind, type ReportPayload, type SessionUser } from '@/lib/types';

/* ---------------- Draft shapes (what the forms hold while typing) ---------------- */
interface OpsLine { id: string; block: string; category: string; activityCode: string; actual: string; labor: string; birr: string; norm: string; plan: string }
interface HarvestRow { picked?: string; delivered?: string; deduction?: string }
interface ExpLine { id: string; category: string; description: string; amount: string }
interface Drafts {
  ops: { date: string; farm: string; remarks: string; lines: OpsLine[] };
  harvest: { date: string; farm: string; remarks: string; weighers: string; rows: Record<string, HarvestRow> };
  expense: { date: string; farm: string; remarks: string; lines: ExpLine[] };
}
interface OutboxItem { payload: ReportPayload; status: 'pending' | 'failed'; error?: string; createdAt: string }

const uid = () => 'c-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
const has = (v: string | undefined) => v !== undefined && v !== '';
const toNum = (v: string | undefined) => { const n = parseFloat(v ?? ''); return Number.isFinite(n) ? n : 0; };
const fmt0 = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });
const newOpsLine = (prev?: OpsLine): OpsLine => ({ id: uid(), block: prev?.block ?? '', category: prev?.category ?? '', activityCode: '', actual: '', labor: '', birr: '', norm: '', plan: '' });
const newExpLine = (): ExpLine => ({ id: uid(), category: '', description: '', amount: '' });

function freshDrafts(farm: string, keep?: Partial<Drafts>): Drafts {
  const date = todayLocal();
  return {
    ops: { date: keep?.ops?.date ?? date, farm: keep?.ops?.farm ?? farm, remarks: '', lines: [newOpsLine()] },
    harvest: { date: keep?.harvest?.date ?? date, farm: keep?.harvest?.farm ?? farm, remarks: '', weighers: keep?.harvest?.weighers ?? '', rows: {} },
    expense: { date: keep?.expense?.date ?? date, farm: keep?.expense?.farm ?? farm, remarks: '', lines: [newExpLine()] },
  };
}

/** Turns a saved report back into a form draft (used for amending and for "Fix in form"). */
function draftsFromPayload(p: ReportPayload, all: Drafts, categoryOf: (code: string) => string): Drafts {
  const base = { date: p.date, farm: p.farm, remarks: p.remarks ?? '' };
  if (p.kind === 'ops') {
    return { ...all, ops: { ...base, lines: (p.lines as OpsLine[]).map((l) => ({ ...newOpsLine(), ...l, id: uid(), category: categoryOf(l.activityCode) })) } };
  }
  if (p.kind === 'harvest') {
    const rows: Record<string, HarvestRow> = {};
    (p.lines as (HarvestRow & { block: string })[]).forEach((l) => { rows[l.block] = { picked: l.picked, delivered: l.delivered, deduction: l.deduction }; });
    return { ...all, harvest: { ...base, weighers: p.weighers ?? '', rows } };
  }
  return { ...all, expense: { ...base, lines: (p.lines as ExpLine[]).map((l) => ({ ...newExpLine(), ...l, id: uid() })) } };
}

export interface EditTarget {
  report: ReportPayload & { id: number; status: string; reporter: string };
  backHref: string;
}

function load<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
}
function save(key: string, v: unknown) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage full */ } }

export default function ReportForms({ config, user, edit }: { config: AppConfig; user: SessionUser; edit?: EditTarget }) {
  const K = `bagro.${user.id}.`;
  const router = useRouter();
  const defaultFarm = user.farmId ?? config.farms[0]?.id ?? '';
  const categoryOf = (code: string) => config.activities.find((a) => a.code === code)?.categoryEn ?? '';
  const [loaded, setLoaded] = useState(!!edit); // edit mode needs nothing from phone storage
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<Kind>(edit?.report.kind ?? 'ops');
  const [drafts, setDrafts] = useState<Drafts>(() =>
    edit ? draftsFromPayload(edit.report, freshDrafts(defaultFarm), categoryOf) : freshDrafts(defaultFarm));
  const [outbox, setOutbox] = useState<OutboxItem[]>([]);
  const outboxRef = useRef<OutboxItem[]>([]);
  const [toast, setToast] = useState<{ msg: string; kind: string } | null>(null);
  const flushing = useRef(false);

  const show = useCallback((msg: string, kind = '') => {
    setToast({ msg, kind });
    window.setTimeout(() => setToast((t) => (t?.msg === msg ? null : t)), kind === 'err' ? 6000 : 3000);
  }, []);

  const setBox = useCallback((items: OutboxItem[]) => {
    outboxRef.current = items; setOutbox(items); save(K + 'outbox', items);
  }, [K]);

  /* Send waiting reports one by one. Network errors keep them waiting; server errors mark them failed. */
  const flush = useCallback(async () => {
    if (flushing.current) return;
    flushing.current = true;
    try {
      for (;;) {
        const item = outboxRef.current.find((i) => i.status === 'pending');
        if (!item) break;
        let res: Response;
        try {
          res = await fetch('/api/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(item.payload) });
        } catch {
          break; // offline - try again later
        }
        if (res.status === 401) { show('You were signed out. Sign in again - your reports are kept on this phone.', 'err'); break; }
        const body = await res.json().catch(() => ({}));
        if (res.ok) {
          setBox(outboxRef.current.filter((i) => i.payload.clientId !== item.payload.clientId));
          show('Report sent ✓', 'ok');
        } else if (res.status >= 500) {
          break; // server trouble - retry later
        } else {
          setBox(outboxRef.current.map((i) => (i.payload.clientId === item.payload.clientId ? { ...i, status: 'failed', error: body.error || `Error ${res.status}` } : i)));
          show('Report not accepted: ' + (body.error || res.status), 'err');
        }
      }
    } finally {
      flushing.current = false;
    }
  }, [setBox, show]);

  // Load drafts and outbox saved on this phone, then keep retrying in the background.
  useEffect(() => {
    if (edit) { setLoaded(true); return; } // amending: don't touch this phone's drafts or outbox
    const d = load<Drafts | null>(K + 'drafts', null);
    if (d?.ops && d.harvest && d.expense) setDrafts(d);
    setTab(load<Kind>(K + 'tab', 'ops'));
    const box = load<OutboxItem[]>(K + 'outbox', []);
    outboxRef.current = box; setOutbox(box);
    setLoaded(true);
    flush();
    const onLine = () => flush();
    window.addEventListener('online', onLine);
    const t = window.setInterval(flush, 60000);
    return () => { window.removeEventListener('online', onLine); window.clearInterval(t); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [K, flush]);

  useEffect(() => { if (loaded && !edit) save(K + 'drafts', drafts); }, [K, drafts, loaded, edit]);
  useEffect(() => { if (loaded && !edit) save(K + 'tab', tab); }, [K, tab, loaded, edit]);

  /* ---------------- helpers over config ---------------- */
  const blocksOf = (farm: string) => config.blocks.filter((b) => b.farmId === farm);
  const categories = [...new Set(config.activities.map((a) => a.categoryEn))];
  const catAm = (c: string) => config.activities.find((a) => a.categoryEn === c)?.categoryAm ?? '';
  const act = (code: string) => config.activities.find((a) => a.code === code);
  const farmName = (id: string) => { const f = config.farms.find((x) => x.id === id); return f ? `${f.nameEn} / ${f.nameAm}` : id; };

  function patch<T extends Kind>(kind: T, fn: (d: Drafts[T]) => Drafts[T]) {
    setDrafts((all) => ({ ...all, [kind]: fn(all[kind]) }));
  }

  /* ---------------- submit ---------------- */
  function submit(kind: Kind) {
    const errs: string[] = [];
    const d = drafts[kind];
    let lines: ReportPayload['lines'] = [];
    if (!d.date) errs.push('Choose the date');
    if (d.date > todayLocal()) errs.push('Date cannot be in the future');

    if (kind === 'ops') {
      drafts.ops.lines.forEach((l, i) => {
        const anyNum = has(l.actual) || has(l.labor) || has(l.birr);
        if (!l.activityCode && !anyNum && !l.block) return; // empty line
        if (!l.block) errs.push(`Activity ${i + 1}: choose block`);
        if (!l.activityCode) errs.push(`Activity ${i + 1}: choose activity`);
        if (!anyNum) errs.push(`Activity ${i + 1}: enter done, labor or payment`);
        lines.push({ block: l.block, activityCode: l.activityCode, actual: l.actual, labor: l.labor, birr: l.birr, norm: l.norm, plan: l.plan });
      });
    } else if (kind === 'harvest') {
      const h = drafts.harvest;
      lines = blocksOf(h.farm).map((b) => ({ block: b.name, ...(h.rows[b.name] ?? {}) }))
        .filter((r) => has(r.picked) || has(r.delivered));
      if (lines.length && !h.weighers.trim()) errs.push('Write who weighed the coffee');
    } else {
      drafts.expense.lines.forEach((l, i) => {
        if (!l.category && !has(l.amount)) return;
        if (!l.category) errs.push(`Expense ${i + 1}: choose type`);
        if (!has(l.amount)) errs.push(`Expense ${i + 1}: enter amount`);
        lines.push({ category: l.category, description: l.description, amount: l.amount });
      });
    }
    if (!lines.length) errs.push('Nothing to send - fill at least one line');
    if (errs.length) return show(errs[0], 'err');

    const payload: ReportPayload = {
      clientId: uid(), kind, date: d.date, farm: d.farm, remarks: d.remarks,
      weighers: kind === 'harvest' ? drafts.harvest.weighers : '', lines,
    };
    if (edit) return saveAmendment(payload);
    setBox([...outboxRef.current, { payload, status: 'pending', createdAt: new Date().toISOString() }]);
    setDrafts((all) => ({ ...all, [kind]: freshDrafts(defaultFarm, all)[kind] }));
    window.scrollTo(0, 0);
    show(navigator.onLine ? 'Sending…' : 'Saved on this phone. It will send when you are online.', 'ok');
    flush();
  }

  /* Amending: save straight to the server (office work is done online). */
  async function saveAmendment(payload: ReportPayload) {
    if (!edit) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/reports/${edit.report.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { show(body.error || `Could not save (error ${res.status})`, 'err'); return; }
      show('Changes saved ✓ - sent back for review', 'ok');
      router.push(edit.backHref);
      router.refresh();
    } catch {
      show('No connection - changes not saved. Try again when online.', 'err');
    } finally {
      setSaving(false);
    }
  }

  /* Move a rejected-by-server report back into its form so it can be fixed. */
  function fixInForm(item: OutboxItem) {
    const p = item.payload;
    setDrafts((all) => draftsFromPayload(p, all, categoryOf));
    setBox(outboxRef.current.filter((i) => i.payload.clientId !== p.clientId));
    setTab(p.kind);
    window.scrollTo(0, 0);
  }

  if (!loaded) return <main className="narrow"><p className="muted">Loading…</p></main>;

  /* ---------------- shared header fields ---------------- */
  const header = (kind: Kind) => {
    const d = drafts[kind];
    return (
      <div className="grid2">
        <label>Date / ቀን
          <input type="date" max={todayLocal()} value={d.date}
            onChange={(e) => patch(kind, (x) => ({ ...x, date: e.target.value }))} />
          <span className="eth">{ethLabelAm(d.date)}</span>
        </label>
        <label>Farm / እርሻ
          {user.farmId
            ? <input value={farmName(d.farm)} disabled />
            : <select value={d.farm} onChange={(e) => {
                const farm = e.target.value;
                if (kind === 'ops') patch('ops', (x) => ({ ...x, farm, lines: x.lines.map((l) => ({ ...l, block: '' })) }));
                else patch(kind, (x) => ({ ...x, farm }));
              }}>
                {config.farms.map((f) => <option key={f.id} value={f.id}>{f.nameEn} / {f.nameAm}</option>)}
              </select>}
        </label>
      </div>
    );
  };
  const numInput = (value: string | undefined, onChange: (v: string) => void) => (
    <input type="number" inputMode="decimal" min="0" step="any" value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
  );
  const remarksBox = (kind: Kind, label: string) => (
    <label>{label}
      <textarea rows={2} value={drafts[kind].remarks} onChange={(e) => patch(kind, (x) => ({ ...x, remarks: e.target.value }))} />
    </label>
  );
  const footer = (kind: Kind, label: string) => edit ? (
    <>
      <button className="btn primary wide" disabled={saving} onClick={() => submit(kind)}>{saving ? 'Saving…' : 'Save changes / ለውጡን አስቀምጥ'}</button>
      <Link className="btn outline small" href={edit.backHref}>Cancel</Link>
    </>
  ) : (
    <>
      <button className="btn primary wide" onClick={() => submit(kind)}>{label}</button>
      <button className="btn danger small" onClick={() => {
        if (confirm('Clear this form?')) setDrafts((all) => ({ ...all, [kind]: freshDrafts(defaultFarm, all)[kind] }));
      }}>Clear form</button>
    </>
  );

  /* ---------------- Form 1: daily operations ---------------- */
  const ops = drafts.ops;
  const updLine = (id: string, change: Partial<OpsLine>) =>
    patch('ops', (x) => ({ ...x, lines: x.lines.map((l) => (l.id === id ? { ...l, ...change } : l)) }));
  const opsForm = (
    <>
      <section className="card">
        <h2>Daily farm operations<small>የእለት እርሻ ተግባራት ክንውን ማስተላለፊያ ቅፅ</small></h2>
        {header('ops')}
      </section>
      {ops.lines.map((l, i) => {
        const a = act(l.activityCode);
        const list = l.category ? config.activities.filter((x) => x.categoryEn === l.category) : null;
        return (
          <section className="card" key={l.id}>
            <div className="line-head">
              <b>Activity {i + 1}</b>
              {ops.lines.length > 1 && <button className="icon" title="Remove" onClick={() => patch('ops', (x) => ({ ...x, lines: x.lines.filter((y) => y.id !== l.id) }))}>✕</button>}
            </div>
            <div className="grid2">
              <label>Block / ማሳ
                <select value={l.block} onChange={(e) => updLine(l.id, { block: e.target.value })}>
                  <option value="">- choose -</option>
                  {blocksOf(ops.farm).map((b) => <option key={b.name} value={b.name}>{b.name}{b.areaHa ? ` (${b.areaHa} ha)` : ''}</option>)}
                </select>
              </label>
              <label>Work type / የሥራ ዓይነት
                <select value={l.category} onChange={(e) => updLine(l.id, { category: e.target.value, activityCode: '' })}>
                  <option value="">All types</option>
                  {categories.map((c) => <option key={c} value={c}>{c} / {catAm(c)}</option>)}
                </select>
              </label>
            </div>
            <label>Activity / ተግባር
              <select value={l.activityCode} onChange={(e) => updLine(l.id, { activityCode: e.target.value, category: act(e.target.value)?.categoryEn ?? l.category })}>
                <option value="">- choose activity -</option>
                {list
                  ? list.map((x) => <option key={x.code} value={x.code}>{x.nameEn} / {x.nameAm}</option>)
                  : categories.map((c) => (
                    <optgroup key={c} label={c}>
                      {config.activities.filter((x) => x.categoryEn === c).map((x) => <option key={x.code} value={x.code}>{x.nameEn} / {x.nameAm}</option>)}
                    </optgroup>
                  ))}
              </select>
            </label>
            <div className="grid3">
              <label>Done / ክንውን <span className="unit">{a?.unit ?? 'unit'}</span>{numInput(l.actual, (v) => updLine(l.id, { actual: v }))}</label>
              <label>Labor / ጉልበት<small>man-days</small>{numInput(l.labor, (v) => updLine(l.id, { labor: v }))}</label>
              <label>Payment / ክፍያ<small>Birr</small>{numInput(l.birr, (v) => updLine(l.id, { birr: v }))}</label>
            </div>
            <details open={!!(l.norm || l.plan)}>
              <summary>Norm and plan (optional) / ተመን እና ዕቅድ</summary>
              <div className="grid2">
                <label>Norm / ተመን{numInput(l.norm, (v) => updLine(l.id, { norm: v }))}</label>
                <label>Plan / ዕቅድ{numInput(l.plan, (v) => updLine(l.id, { plan: v }))}</label>
              </div>
            </details>
          </section>
        );
      })}
      <button className="btn ghost wide" onClick={() => patch('ops', (x) => ({ ...x, lines: [...x.lines, newOpsLine(x.lines[x.lines.length - 1])] }))}>
        + Add another activity / ተግባር ጨምር
      </button>
      <section className="card">
        {remarksBox('ops', 'Daily summary / remarks — የዕለቱ ማጠቃለያ አስተያየት')}
        <div className="totals">
          <span>Activities: <b>{ops.lines.filter((l) => l.activityCode).length}</b></span>
          <span>Labor: <b>{fmt0(ops.lines.reduce((s, l) => s + toNum(l.labor), 0))}</b> man-days</span>
          <span>Payment: <b>{fmt0(ops.lines.reduce((s, l) => s + toNum(l.birr), 0))}</b> Birr</span>
        </div>
      </section>
      {footer('ops', 'Submit report / ሪፖርት ላክ')}
    </>
  );

  /* ---------------- Form 2: coffee weighing ---------------- */
  const hv = drafts.harvest;
  const hvBlocks = blocksOf(hv.farm);
  const updRow = (block: string, change: HarvestRow) =>
    patch('harvest', (x) => ({ ...x, rows: { ...x.rows, [block]: { ...x.rows[block], ...change } } }));
  const hvRows = hvBlocks.map((b) => hv.rows[b.name] ?? {});
  const harvestForm = (
    <>
      <section className="card">
        <h2>Daily coffee weighing<small>የእለት ቡና መመዝገቢያ ቅጽ</small></h2>
        {header('harvest')}
        <p className="muted">Enter kg for each block picked today. Leave a block empty if nothing was picked there.</p>
      </section>
      {hvBlocks.map((b) => {
        const r = hv.rows[b.name] ?? {};
        const diff = has(r.picked) && has(r.delivered) ? toNum(r.picked) - toNum(r.delivered) : null;
        return (
          <section className="card" key={b.name}>
            <div className="line-head">
              <b>{b.name}</b>
              {diff !== null && <span className={'diff' + (diff > 0 ? ' warn' : '')}>Difference / ልዩነት: {fmt0(diff)} kg</span>}
            </div>
            <div className="grid3">
              <label>Picked by workers<small>በሠራተኛ የተለቀመው (kg)</small>{numInput(r.picked, (v) => updRow(b.name, { picked: v }))}</label>
              <label>Reached drying site<small>ወደ አውድማ የደረሰ (kg)</small>{numInput(r.delivered, (v) => updRow(b.name, { delivered: v }))}</label>
              <label>Collected from workers<small>ከሠራተኛ የሚሰበሰብ (Birr)</small>{numInput(r.deduction, (v) => updRow(b.name, { deduction: v }))}</label>
            </div>
          </section>
        );
      })}
      <section className="card">
        <label>Who weighed / witnesses<small>ቡናውን የመዘነ እና ሲመዘን የነበሩ ሰራተኞች — name and role, one per line</small>
          <textarea rows={3} value={hv.weighers} onChange={(e) => patch('harvest', (x) => ({ ...x, weighers: e.target.value }))} />
        </label>
        {remarksBox('harvest', 'Remarks / መግለጫ')}
        <div className="totals">
          <span>Picked: <b>{fmt0(hvRows.reduce((s, r) => s + toNum(r.picked), 0))}</b> kg</span>
          <span>At drying site: <b>{fmt0(hvRows.reduce((s, r) => s + toNum(r.delivered), 0))}</b> kg</span>
          <span>Collected: <b>{fmt0(hvRows.reduce((s, r) => s + toNum(r.deduction), 0))}</b> Birr</span>
        </div>
      </section>
      {footer('harvest', 'Submit weighing / ላክ')}
    </>
  );

  /* ---------------- Form 3: expenses ---------------- */
  const ex = drafts.expense;
  const updExp = (id: string, change: Partial<ExpLine>) =>
    patch('expense', (x) => ({ ...x, lines: x.lines.map((l) => (l.id === id ? { ...l, ...change } : l)) }));
  const expenseForm = (
    <>
      <section className="card">
        <h2>Expenses<small>የደመወዝና የሥራ ማስኬጃ ወጪ</small></h2>
        {header('expense')}
      </section>
      {ex.lines.map((l, i) => (
        <section className="card" key={l.id}>
          <div className="line-head">
            <b>Expense {i + 1}</b>
            {ex.lines.length > 1 && <button className="icon" onClick={() => patch('expense', (x) => ({ ...x, lines: x.lines.filter((y) => y.id !== l.id) }))}>✕</button>}
          </div>
          <label>Type / ዓይነት
            <select value={l.category} onChange={(e) => updExp(l.id, { category: e.target.value })}>
              <option value="">- choose -</option>
              {config.expenseCategories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <div className="grid2">
            <label>Description / መግለጫ<input value={l.description} onChange={(e) => updExp(l.id, { description: e.target.value })} /></label>
            <label>Amount / መጠን<small>Birr</small>{numInput(l.amount, (v) => updExp(l.id, { amount: v }))}</label>
          </div>
        </section>
      ))}
      <button className="btn ghost wide" onClick={() => patch('expense', (x) => ({ ...x, lines: [...x.lines, newExpLine()] }))}>+ Add expense</button>
      <section className="card">
        {remarksBox('expense', 'Remarks / አስተያየት')}
        <div className="totals"><span>Total: <b>{fmt0(ex.lines.reduce((s, l) => s + toNum(l.amount), 0))}</b> Birr</span></div>
      </section>
      {footer('expense', 'Submit expenses / ላክ')}
    </>
  );

  return (
    <main className="narrow">
      {edit && (
        <div className="notice">
          <b>Amending report #{edit.report.id}</b> ({KIND_LABEL[edit.report.kind]}, sent by {edit.report.reporter}, status {edit.report.status}).<br />
          Saving replaces the report and sends it back for review. The previous version is kept.
        </div>
      )}
      {!edit && <div className="seg">
        {(['ops', 'harvest', 'expense'] as Kind[]).map((k) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {k === 'ops' ? '🌱 ' : k === 'harvest' ? '⚖️ ' : '💵 '}{KIND_LABEL[k]}
          </button>
        ))}
      </div>}

      {!edit && outbox.length > 0 && (
        <section className="card">
          <h2>Waiting to send <small>ያልተላኩ ሪፖርቶች — kept on this phone until the office receives them</small></h2>
          {outbox.map((i) => (
            <div className="sub-card" key={i.payload.clientId}>
              <div className="meta">
                <span><b>{KIND_LABEL[i.payload.kind]}</b> · {ethLabel(i.payload.date)} · {farmName(i.payload.farm)}</span>
                <span className={'status st-' + i.status}>{i.status === 'failed' ? 'Not accepted' : 'Waiting'}</span>
              </div>
              {i.error && <div className="diff warn">{i.error}</div>}
              <div className="row-actions">
                {i.status === 'failed' ? (
                  <>
                    <button className="btn small outline" onClick={() => fixInForm(i)}>Fix in form</button>
                    <button className="btn small danger" onClick={() => {
                      if (confirm('Delete this report? It has NOT reached the office.')) setBox(outboxRef.current.filter((x) => x.payload.clientId !== i.payload.clientId));
                    }}>Delete</button>
                  </>
                ) : (
                  <button className="btn small outline" onClick={() => { show('Trying…'); flush(); }}>Try now</button>
                )}
              </div>
            </div>
          ))}
        </section>
      )}

      {tab === 'ops' ? opsForm : tab === 'harvest' ? harvestForm : expenseForm}
      {toast && <div id="toast" className={toast.kind}>{toast.msg}</div>}
    </main>
  );
}
