import type { TableModel } from '@/lib/types';

const fmt = (n: number) => (!n ? '' : n.toLocaleString('en-US', { maximumFractionDigits: 2 }));

export function Kpis({ items }: { items: [string, string][] }) {
  return (
    <div className="kpis">
      {items.map(([label, value]) => (
        <div className="kpi" key={label}><div className="v">{value}</div><div className="l">{label}</div></div>
      ))}
    </div>
  );
}

export default function SummaryTable({ model }: { model: TableModel }) {
  const ncols = model.flat.length - (model.skipFirst ? 1 : 0);
  return (
    <div className="tablewrap">
      <table className="grid">
        <thead>
          {model.head.map((row, i) => (
            <tr key={i}>
              {row.map((c, j) => (typeof c === 'string'
                ? <th key={j}>{c}</th>
                : <th key={j} colSpan={c.cs} rowSpan={c.rs}>{c.t}</th>))}
            </tr>
          ))}
        </thead>
        <tbody>
          {model.rows.map((r, i) => {
            if (r.cls === 'cat') return <tr key={i} className="cat"><td colSpan={ncols}>{r.c[0]}</td></tr>;
            const cells = model.skipFirst ? r.c.slice(1) : r.c;
            return (
              <tr key={i} className={r.cls}>
                {cells.map((v, j) => (typeof v === 'number'
                  ? <td key={j} className="n">{fmt(v)}</td>
                  : <td key={j} title={v}>{v}</td>))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
