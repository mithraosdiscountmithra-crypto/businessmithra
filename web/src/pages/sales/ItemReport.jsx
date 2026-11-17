import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ErrorBox, PageHeader, RangePicker, SALES_NAV, Stat, SubNav, useApi } from '../../components/ui.jsx';
import { fmtDate, inr, monthStart, today } from '../../lib/format.js';
import { downloadCsv } from '../../lib/csv.js';

export default function ItemReport() {
  const [range, setRange] = useState({ from: monthStart(), to: today() });
  const { data, error } = useApi(`/reports/sales/items?from=${range.from}&to=${range.to}`);
  const exportCsv = () => downloadCsv(`item-sales-${range.from}-to-${range.to}`, ['Item', 'Category', 'Qty sold', 'Sales (before GST)', 'Cost', 'Profit'],
    data.items.map((x) => [x.name, x.category, x.qty, x.sales, x.hasCost ? x.cost : '', x.profit ?? '']));
  const max = Math.max(1, ...(data?.items || []).map((x) => x.sales));
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Sales & Customers" subtitle="Item-wise sales & profit">
        <Link to="/sales/reports" className="btn-ghost">← Reports</Link>
        {data?.items?.length > 0 && <button type="button" className="btn-ghost" onClick={exportCsv}>⬇️ Excel</button>}
        <button type="button" className="btn-ghost" onClick={() => window.print()}>Print</button>
      </PageHeader>
      <SubNav items={SALES_NAV} />
      <RangePicker value={range} onChange={setRange} />
      <ErrorBox>{error}</ErrorBox>
      {!data ? <p className="text-muted">Loading…</p> : (
        <>
          <h2 className="hidden print:block text-lg font-bold">Item-wise sales · {fmtDate(range.from)} – {fmtDate(range.to)}</h2>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <Stat label="Sales (before GST)" value={inr(data.totals.sales)} />
            <Stat label="Gross profit" value={inr(data.totals.profit)} tone="text-green-800" sub={data.totals.sales ? `${Math.round((data.totals.profit / data.totals.sales) * 100)}% margin` : ''} />
            <Stat label="Items sold" value={data.items.length} />
          </div>
          {data.totals.missingCost > 0 && <p className="text-sm bg-amber-50 border border-amber-200 rounded-xl p-3">{data.totals.missingCost} items ki cost price ledu – profit lo lekkaloki raledu. Items edit lo "Cost price" ivvandi leda purchase bill add cheyyandi.</p>}
          {data.categories.length > 1 && (
            <section className="card p-4">
              <h2 className="font-bold mb-3">Category wise</h2>
              <div className="flex flex-col gap-2">
                {data.categories.map((c) => (
                  <div key={c.category} className="grid grid-cols-[120px_1fr_auto] gap-3 items-center text-sm">
                    <span className="font-semibold truncate">{c.category}</span>
                    <div className="h-3 bg-gray-100 rounded"><div className="h-full bg-indigo-400 rounded" style={{ width: `${(c.sales / Math.max(1, data.categories[0].sales)) * 100}%` }} /></div>
                    <span className="font-bold">{inr(c.sales)}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead><tr className="text-left text-muted border-b border-line"><th className="p-3">Item</th><th className="p-3 text-right">Qty</th><th className="p-3 text-right">Sales</th><th className="p-3 text-right">Cost</th><th className="p-3 text-right">Profit</th></tr></thead>
              <tbody>
                {data.items.map((x) => (
                  <tr key={x.key} className="border-t border-gray-100">
                    <td className="p-3"><span className="font-semibold">{x.name}</span><div className="h-1.5 bg-gray-100 rounded mt-1 print:hidden"><div className="h-full bg-brand rounded" style={{ width: `${(Math.max(0, x.sales) / max) * 100}%` }} /></div></td>
                    <td className="p-3 text-right">{x.qty}</td>
                    <td className="p-3 text-right font-bold">{inr(x.sales)}</td>
                    <td className="p-3 text-right">{x.hasCost ? inr(x.cost) : '—'}</td>
                    <td className={`p-3 text-right font-bold ${x.profit < 0 ? 'text-red-700' : 'text-green-800'}`}>{x.profit === null ? '—' : inr(x.profit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
