import { Link } from 'react-router-dom';
import { useState } from 'react';
import { ACCOUNTS_NAV, Bars, ErrorBox, PageHeader, RangePicker, Stat, SubNav, useApi } from '../../components/ui.jsx';
import { fmtDate, inr, MODE_LABEL, monthStart, short, today } from '../../lib/format.js';

const TABS = [['pnl', 'Profit & Loss'], ['gst', 'GST summary'], ['cash', 'Cash flow']];
const monthLabel = (m) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'short', year: '2-digit', timeZone: 'UTC' });

export default function AccountsReports() {
  const [tab, setTab] = useState('pnl');
  const [range, setRange] = useState({ from: monthStart(), to: today() });
  const { data, error } = useApi(`/finance/reports?from=${range.from}&to=${range.to}`);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Accounts">
        <Link to="/accounts/gst-returns" className="btn-primary">GSTR-1 export</Link>
        <button type="button" className="btn-ghost" onClick={() => window.print()}>Print</button>
      </PageHeader>
      <SubNav items={ACCOUNTS_NAV} />
      <div className="flex gap-2 print:hidden" role="tablist" aria-label="Report">
        {TABS.map(([id, l]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`h-10 px-4 rounded-xl text-sm font-semibold border ${tab === id ? 'bg-ink text-white border-ink' : 'bg-white border-line'}`}>{l}</button>
        ))}
      </div>
      <RangePicker value={range} onChange={setRange} />
      <ErrorBox>{error}</ErrorBox>
      {!data ? <p className="text-muted">Loading…</p> : (
        <>
          <h2 className="hidden print:block text-lg font-bold">{TABS.find((t) => t[0] === tab)[1]} · {fmtDate(range.from)} – {fmtDate(range.to)}</h2>

          {tab === 'pnl' && (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Stat label="Income (sales before GST)" value={inr(data.pnl.income)} sub={`${data.pnl.invoices} invoices`} />
                <Stat label="Expenses (before GST)" value={inr(data.pnl.expenses)} sub={`${data.pnl.expenseEntries} entries`} />
                <Stat label={data.pnl.profit >= 0 ? 'Net profit' : 'Net loss'} value={inr(Math.abs(data.pnl.profit))} tone={data.pnl.profit >= 0 ? 'text-green-800' : 'text-red-700'} />
                <Stat label="Profit margin" value={`${data.pnl.margin}%`} />
              </div>
              <section className="card p-5">
                <h2 className="font-bold mb-3">Profit & Loss statement</h2>
                <table className="w-full max-w-xl text-sm">
                  <tbody>
                    <tr className="font-bold"><td className="py-2">Sales (taxable value)</td><td className="py-2 text-right">{inr(data.pnl.income)}</td></tr>
                    <tr><td className="pt-3 pb-1 font-bold" colSpan={2}>Less: Expenses</td></tr>
                    {data.pnl.byCategory.map((c) => <tr key={c.category} className="border-t border-gray-100"><td className="py-1.5 pl-4">{c.category}</td><td className="py-1.5 text-right">{inr(c.amount)}</td></tr>)}
                    <tr className="border-t border-line font-semibold"><td className="py-2">Total expenses</td><td className="py-2 text-right">{inr(data.pnl.expenses)}</td></tr>
                    <tr className={`border-t-2 border-ink text-base font-extrabold ${data.pnl.profit >= 0 ? 'text-green-800' : 'text-red-700'}`}><td className="py-2.5">{data.pnl.profit >= 0 ? 'Net Profit' : 'Net Loss'}</td><td className="py-2.5 text-right">{inr(data.pnl.profit)}</td></tr>
                  </tbody>
                </table>
                <p className="text-xs text-muted mt-3">GST maa dabbu kaadu (government ki), anduke income and expenses GST lekunda chupinchamu.</p>
              </section>
              {data.pnl.monthly.length > 1 && (
                <section className="card p-5 flex flex-col gap-3">
                  <h2 className="font-bold">Month-wise profit</h2>
                  <Bars data={data.pnl.monthly.map((m) => ({ label: monthLabel(m.month), total: m.profit }))} format={short} highlightLast={false} />
                </section>
              )}
            </>
          )}

          {tab === 'gst' && (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Stat label="Output GST (sales)" value={inr(data.gst.outputGst)} />
                <Stat label="Input GST (expenses)" value={inr(data.gst.inputGst)} />
                <Stat label={data.gst.netPayable >= 0 ? 'Net GST payable' : 'Input credit carried'} value={inr(Math.abs(data.gst.netPayable))} tone={data.gst.netPayable >= 0 ? 'text-red-700' : 'text-green-800'} />
                <Stat label="CGST · SGST · IGST" value={`${short(data.gst.cgst)} · ${short(data.gst.sgst)} · ${short(data.gst.igst)}`} />
              </div>
              <section className="card p-5 overflow-x-auto">
                <h2 className="font-bold mb-3">Outward supplies by GST rate (GSTR-1 / 3B ready data)</h2>
                <table className="w-full min-w-[560px] text-sm">
                  <thead><tr className="text-left text-muted border-b border-line"><th className="py-2">Rate</th><th className="py-2 text-right">Taxable value</th><th className="py-2 text-right">CGST</th><th className="py-2 text-right">SGST</th><th className="py-2 text-right">IGST</th><th className="py-2 text-right">Total tax</th></tr></thead>
                  <tbody>
                    {data.gst.outputByRate.map((r) => (
                      <tr key={r.rate} className="border-t border-gray-100">
                        <td className="py-2 font-semibold">{r.rate}%</td><td className="py-2 text-right">{inr(r.taxable)}</td><td className="py-2 text-right">{inr(r.cgst)}</td>
                        <td className="py-2 text-right">{inr(r.sgst)}</td><td className="py-2 text-right">{inr(r.igst)}</td><td className="py-2 text-right font-bold">{inr(r.total)}</td>
                      </tr>
                    ))}
                    {data.gst.outputByRate.length === 0 && <tr><td colSpan={6} className="py-4 text-center text-muted">Ee period lo sales levu.</td></tr>}
                  </tbody>
                </table>
                <p className="text-xs text-muted mt-3">Idi filing ki help chese summary. Final GST return file chese mundu mee CA tho check cheyinchandi.</p>
              </section>
            </>
          )}

          {tab === 'cash' && (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                <Stat label="Money in (payments received)" value={inr(data.cashflow.moneyIn)} tone="text-green-800" />
                <Stat label="Money out (expenses paid)" value={inr(data.cashflow.moneyOut)} tone="text-red-700" />
                <Stat label="Net cash flow" value={inr(data.cashflow.net)} tone={data.cashflow.net >= 0 ? 'text-green-800' : 'text-red-700'} />
              </div>
              <div className="grid lg:grid-cols-2 gap-4">
                {[['In by mode', data.cashflow.inByMode], ['Out by mode', data.cashflow.outByMode]].map(([title, rows]) => (
                  <section key={title} className="card p-5">
                    <h2 className="font-bold mb-2">{title}</h2>
                    <table className="w-full text-sm"><tbody>
                      {rows.map((r) => <tr key={r.mode} className="border-t border-gray-100"><td className="py-2">{MODE_LABEL[r.mode] || r.mode}</td><td className="py-2 text-right font-bold">{inr(r.amount)}</td></tr>)}
                      {rows.length === 0 && <tr><td className="py-2 text-muted">—</td></tr>}
                    </tbody></table>
                  </section>
                ))}
              </div>
              <section className="card p-5">
                <h2 className="font-bold mb-2">Account balances on {fmtDate(range.to)}</h2>
                <table className="w-full text-sm max-w-xl"><tbody>
                  {data.accounts.map((a) => <tr key={a.id} className="border-t border-gray-100"><td className="py-2">{a.name}</td><td className="py-2 text-right font-bold">{inr(a.balance)}</td></tr>)}
                </tbody></table>
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
