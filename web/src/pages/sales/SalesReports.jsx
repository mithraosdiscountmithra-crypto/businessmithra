import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ErrorBox, PageHeader, RangePicker, SALES_NAV, Stat, SubNav, useApi, Bars } from '../../components/ui.jsx';
import { fmtDate, fmtDay, inr, monthStart, short, STAGE_LABEL, today, waLink } from '../../lib/format.js';

export default function SalesReports() {
  const [range, setRange] = useState({ from: monthStart(), to: today() });
  const { data, error } = useApi(`/reports/sales?from=${range.from}&to=${range.to}`);
  const s = data?.summary;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Sales & Customers">
        <button type="button" className="btn-ghost" onClick={() => window.print()}>Print</button>
      </PageHeader>
      <SubNav items={SALES_NAV} />
      <RangePicker value={range} onChange={setRange} />
      <ErrorBox>{error}</ErrorBox>
      {!data ? <p className="text-muted">Loading…</p> : (
        <>
          <h2 className="hidden print:block text-lg font-bold">Sales report · {fmtDate(range.from)} – {fmtDate(range.to)}</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="Total sales" value={inr(s.sales)} sub={s.returns ? `${s.invoices} invoices · returns ${inr(s.returns)}` : `${s.invoices} invoices`} />
            <Stat label="Collected" value={inr(s.collected)} tone="text-green-800" />
            <Stat label="Average bill" value={inr(s.avgBill)} />
            <Stat label="Total pending (all time)" value={inr(s.totalDue)} tone={s.totalDue > 0 ? 'text-red-700' : ''} />
          </div>

          <section className="card p-5 flex flex-col gap-3">
            <h2 className="font-bold">Daily sales</h2>
            {data.daily.length === 0 ? <p className="text-sm text-muted">Ee period lo sales levu.</p> : (
              <Bars data={data.daily.map((d) => ({ label: fmtDay(d.date), total: d.total }))} format={short} highlightLast={false} />
            )}
            <p className="text-xs text-muted">Taxable value {inr(s.taxableValue)} · GST collected {inr(s.gst)}</p>
          </section>

          <div className="grid lg:grid-cols-2 gap-4">
            <section className="card p-5 flex flex-col gap-3">
              <h2 className="font-bold">Top customers</h2>
              <table className="w-full text-sm">
                <tbody>
                  {data.topCustomers.map((c, i) => (
                    <tr key={c.id} className="border-t border-gray-100">
                      <td className="py-2 w-6 text-muted">{i + 1}</td>
                      <td className="py-2"><Link to={`/sales/customers/${c.id}`} className="font-semibold text-brand">{c.name}</Link></td>
                      <td className="py-2 text-right text-muted">{c.invoices} bills</td>
                      <td className="py-2 text-right font-bold">{inr(c.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.topCustomers.length === 0 && <p className="text-sm text-muted">—</p>}
            </section>

            <section className="card p-5 flex flex-col gap-3">
              <h2 className="font-bold">Staff-wise sales</h2>
              <table className="w-full text-sm">
                <tbody>
                  {data.staff.map((u) => (
                    <tr key={u.name} className="border-t border-gray-100">
                      <td className="py-2 font-semibold">{u.name}</td>
                      <td className="py-2 text-right text-muted">{u.invoices} bills</td>
                      <td className="py-2 text-right font-bold">{inr(u.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.staff.length === 0 && <p className="text-sm text-muted">—</p>}
            </section>
          </div>

          <section className="card p-5 flex flex-col gap-4">
            <h2 className="font-bold">Pending payments (dues aging)</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {data.aging.map((a, i) => (
                <div key={a.label} className={`rounded-xl p-3 ${['bg-amber-50', 'bg-orange-50', 'bg-red-50', 'bg-red-100'][i]}`}>
                  <p className="text-xs font-semibold text-gray-700">{a.label}</p>
                  <p className="text-lg font-extrabold">{inr(a.amount)}</p>
                  <p className="text-xs text-gray-700">{a.count} invoices</p>
                </div>
              ))}
            </div>
            {data.dues.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead><tr className="text-left text-muted"><th className="py-2">Invoice</th><th className="py-2">Customer</th><th className="py-2 text-right">Days</th><th className="py-2 text-right">Due</th><th className="py-2 print:hidden"><span className="sr-only">Remind</span></th></tr></thead>
                  <tbody>
                    {data.dues.map((d) => (
                      <tr key={d.id} className="border-t border-gray-100">
                        <td className="py-2"><Link to={`/sales/invoices/${d.id}`} className="font-semibold text-brand">{d.number}</Link></td>
                        <td className="py-2">{d.customer.name}</td>
                        <td className={`py-2 text-right ${d.days > 30 ? 'text-red-700 font-bold' : ''}`}>{d.days}</td>
                        <td className="py-2 text-right font-bold">{inr(d.due)}</td>
                        <td className="py-2 text-right print:hidden">
                          {d.customer.phone && <a className="text-xs font-bold text-green-800 underline" target="_blank" rel="noreferrer" href={waLink(d.customer.phone, `Namaste ${d.customer.name} garu, invoice ${d.number} ki ${inr(d.due)} balance pending undi. Veelainantha tondaraga pay cheyyandi. Dhanyavaadalu!`)}>Remind</a>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="card p-5 flex flex-col gap-4">
            <h2 className="font-bold">Leads conversion · {data.leads.conversion}% ({data.leads.won} of {data.leads.total})</h2>
            <div className="flex flex-col gap-2">
              {data.leads.stages.map((st) => (
                <div key={st.stage} className="flex items-center gap-3 text-sm">
                  <span className="w-28 shrink-0">{STAGE_LABEL[st.stage]}</span>
                  <div className="flex-1 h-6 bg-gray-100 rounded-md overflow-hidden">
                    <div className="h-full bg-indigo-400 rounded-md" style={{ width: `${data.leads.total ? (st.count / data.leads.total) * 100 : 0}%` }} />
                  </div>
                  <span className="w-10 text-right font-bold">{st.count}</span>
                </div>
              ))}
            </div>
            {data.leads.sources.length > 0 && (
              <table className="w-full text-sm max-w-md">
                <thead><tr className="text-left text-muted"><th className="py-1.5">Source</th><th className="py-1.5 text-right">Leads</th><th className="py-1.5 text-right">Won</th></tr></thead>
                <tbody>{data.leads.sources.map((x) => <tr key={x.source} className="border-t border-gray-100"><td className="py-1.5">{x.source}</td><td className="py-1.5 text-right">{x.leads}</td><td className="py-1.5 text-right font-bold">{x.won}</td></tr>)}</tbody>
              </table>
            )}
          </section>
        </>
      )}
    </div>
  );
}
