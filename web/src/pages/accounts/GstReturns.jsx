import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ACCOUNTS_NAV, ErrorBox, PageHeader, SubNav, useApi } from '../../components/ui.jsx';
import { fmtDate, inr } from '../../lib/format.js';
import { d10, downloadCsv } from '../../lib/csv.js';

const lastMonth = () => {
  const d = new Date();
  const from = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  const to = new Date(d.getFullYear(), d.getMonth(), 0);
  const f = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  return { from: f(from), to: f(to) };
};

export default function GstReturns() {
  const [range, setRange] = useState(lastMonth);
  const { data, error } = useApi(`/finance/gstr1?from=${range.from}&to=${range.to}`);
  const tag = `${range.from}-to-${range.to}`;
  const sheets = data && [
    ['B2B invoices (customer GSTIN unnavi)', data.b2b.length, () => downloadCsv(`GSTR1-B2B-${tag}`, ['GSTIN of recipient', 'Receiver name', 'Invoice number', 'Invoice date', 'Invoice value', 'Place of supply', 'Rate', 'Taxable value', 'IGST', 'CGST', 'SGST'],
      data.b2b.map((x) => [x.gstin, x.name, x.number, d10(x.date), x.value, x.pos, x.rate, x.taxable, x.igst, x.cgst, x.sgst]))],
    ['B2C summary (normal customers)', data.b2c.length, () => downloadCsv(`GSTR1-B2CS-${tag}`, ['Type', 'Place of supply', 'Rate', 'Taxable value', 'IGST', 'CGST', 'SGST'],
      data.b2c.map((x) => [x.type, data.business.state || '', x.rate, x.taxable, x.igst, x.cgst, x.sgst]))],
    ['HSN summary', data.hsn.length, () => downloadCsv(`GSTR1-HSN-${tag}`, ['HSN', 'Description', 'UQC', 'Total quantity', 'Rate', 'Taxable value', 'IGST', 'CGST', 'SGST'],
      data.hsn.map((x) => [x.hsn, x.description, x.uqc, x.qty, x.rate, x.taxable, x.igst, x.cgst, x.sgst]))],
    ['Credit notes (returns)', data.creditNotes.length, () => downloadCsv(`GSTR1-CDNR-${tag}`, ['Note number', 'Date', 'Customer', 'GSTIN', 'Taxable value', 'IGST', 'CGST', 'SGST', 'Total'],
      data.creditNotes.map((x) => [x.number, d10(x.date), x.name, x.gstin, x.taxable, x.igst, x.cgst, x.sgst, x.total]))],
  ];
  const b2cTotal = data ? data.b2c.reduce((a, x) => a + x.taxable, 0) : 0;
  const b2bTotal = data ? data.b2b.reduce((a, x) => a + x.taxable, 0) : 0;
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Accounts" subtitle="GSTR-1 – mee CA ki pampandi">
        <Link to="/accounts/reports" className="btn-ghost">← Reports</Link>
      </PageHeader>
      <SubNav items={ACCOUNTS_NAV} />
      <div className="flex flex-wrap gap-2 items-center">
        <label htmlFor="g-f" className="text-sm font-semibold">From</label>
        <input id="g-f" type="date" className="input h-10 w-auto" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
        <label htmlFor="g-t" className="text-sm font-semibold">To</label>
        <input id="g-t" type="date" className="input h-10 w-auto" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
      </div>
      <ErrorBox>{error}</ErrorBox>
      {!data ? <p className="text-muted">Loading…</p> : (
        <>
          {!data.business.gstin && <p className="text-sm bg-amber-50 border border-amber-200 rounded-xl p-3">Settings lo mee GSTIN add cheyyandi.</p>}
          <p className="text-sm">{fmtDate(range.from)} – {fmtDate(range.to)} · B2B taxable {inr(b2bTotal)} · B2C taxable {inr(b2cTotal)}</p>
          <div className="card divide-y divide-gray-100">
            {sheets.map(([label, count, fn]) => (
              <div key={label} className="flex items-center justify-between gap-3 p-4">
                <span><b>{label}</b><span className="block text-xs text-muted">{count} rows</span></span>
                <button type="button" className="btn-ghost" disabled={!count} onClick={fn}>⬇️ Download</button>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted">Ee files Excel lo open avtayi. Mee CA / GST portal offline tool lo copy-paste cheyyochu. Customer GSTIN Customers lo add cheste B2B lo vastundi.</p>
        </>
      )}
    </div>
  );
}
