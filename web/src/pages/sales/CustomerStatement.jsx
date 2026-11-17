import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ErrorBox, useApi } from '../../components/ui.jsx';
import { fmtDate, inr, inrExact, waLink } from '../../lib/format.js';
import { d10, downloadCsv } from '../../lib/csv.js';

const fyStart = () => {
  const d = new Date();
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}-04-01`;
};

export default function CustomerStatement() {
  const { id } = useParams();
  const [range, setRange] = useState({ from: fyStart(), to: new Date().toISOString().slice(0, 10) });
  const { data, error } = useApi(`/customers/${id}/statement?from=${range.from}&to=${range.to}`);
  if (error) return <ErrorBox>{error}</ErrorBox>;
  if (!data) return <p className="text-muted">Loading…</p>;
  const { customer: c, business: b } = data;
  const msg = `Namaste ${c.name} garu,\n${b.name} account statement (${fmtDate(range.from)} – ${fmtDate(range.to)})\nTotal bills: ${inr(data.totals.debit)}\nPaid / returns: ${inr(data.totals.credit)}\nBalance: ${inr(data.closing)}\n\nDhanyavadalu 🙏`;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link to={`/sales/customers/${c.id}`} className="text-sm font-semibold text-brand">← {c.name}</Link>
        <div className="flex flex-wrap gap-2 items-center">
          <input aria-label="From" type="date" className="input h-10 w-auto" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
          <input aria-label="To" type="date" className="input h-10 w-auto" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
          {c.phone && <a className="btn bg-green-600 text-white" href={waLink(c.phone, msg)} target="_blank" rel="noreferrer">💬 WhatsApp</a>}
          <button type="button" className="btn-ghost" onClick={() => downloadCsv(`statement-${c.name}`, ['Date', 'Type', 'Ref', 'Debit', 'Credit', 'Balance'], [['', 'Opening balance', '', '', '', data.opening], ...data.rows.map((r) => [d10(r.date), r.type, r.ref, r.debit || '', r.credit || '', r.balance])])}>⬇️ Excel</button>
          <button type="button" className="btn-primary" onClick={() => window.print()}>Print / PDF</button>
        </div>
      </div>
      <div className="card p-6 print:shadow-none print:border-0">
        <div className="flex flex-wrap justify-between gap-4 border-b border-line pb-4">
          <div><h1 className="text-xl font-extrabold">{b.name}</h1><p className="text-sm text-muted">{[b.address, b.city].filter(Boolean).join(', ')}{b.phone && ` · ${b.phone}`}{b.gstin && ` · GSTIN ${b.gstin}`}</p></div>
          <div className="text-right"><h2 className="font-bold">Account Statement</h2><p className="text-sm">{fmtDate(range.from)} – {fmtDate(range.to)}</p></div>
        </div>
        <p className="py-3 text-sm"><b>{c.name}</b>{c.phone && ` · ${c.phone}`}{c.gstin && ` · GSTIN ${c.gstin}`}</p>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-muted border-b border-line"><th className="py-2">Date</th><th className="py-2">Particulars</th><th className="py-2 text-right">Debit</th><th className="py-2 text-right">Credit</th><th className="py-2 text-right">Balance</th></tr></thead>
          <tbody>
            <tr className="border-t border-gray-100"><td className="py-2" /><td className="py-2 font-semibold">Opening balance</td><td /><td /><td className="py-2 text-right font-semibold">{inrExact(data.opening)}</td></tr>
            {data.rows.map((r, i) => (
              <tr key={i} className="border-t border-gray-100">
                <td className="py-2 whitespace-nowrap">{fmtDate(r.date)}</td>
                <td className="py-2">{r.type}{r.ref && <span className="text-muted"> · {r.ref}</span>}</td>
                <td className="py-2 text-right">{r.debit ? inrExact(r.debit) : ''}</td>
                <td className="py-2 text-right">{r.credit ? inrExact(r.credit) : ''}</td>
                <td className="py-2 text-right">{inrExact(r.balance)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-ink font-bold"><td /><td className="py-2">Closing balance</td><td className="py-2 text-right">{inrExact(data.totals.debit)}</td><td className="py-2 text-right">{inrExact(data.totals.credit)}</td><td className={`py-2 text-right ${data.closing > 0 ? 'text-red-700' : ''}`}>{inrExact(data.closing)}</td></tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
