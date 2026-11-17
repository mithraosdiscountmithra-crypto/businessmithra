import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ACCOUNTS_NAV, ErrorBox, PageHeader, RangePicker, Stat, SubNav, useApi } from '../../components/ui.jsx';
import { fmtDate, inr, MODE_LABEL, monthStart, today } from '../../lib/format.js';

export default function DayBook() {
  const [params, setParams] = useSearchParams();
  const accountId = params.get('account') || '';
  const [range, setRange] = useState({ from: monthStart(), to: today() });
  const accounts = useApi('/finance/accounts');
  const { data, error } = useApi(`/finance/daybook?from=${range.from}&to=${range.to}&accountId=${accountId}`);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Accounts">
        <button type="button" className="btn-ghost" onClick={() => window.print()}>Print</button>
      </PageHeader>
      <SubNav items={ACCOUNTS_NAV} />
      <div className="flex flex-wrap items-end gap-3">
        <RangePicker value={range} onChange={setRange} />
        <div>
          <label className="sr-only" htmlFor="db-acc">Account</label>
          <select id="db-acc" className="input h-9 w-auto" value={accountId} onChange={(e) => setParams(e.target.value ? { account: e.target.value } : {})}>
            <option value="">All accounts</option>
            {(accounts.data?.accounts || []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
      </div>
      <ErrorBox>{error}</ErrorBox>
      {data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="Opening balance" value={inr(data.opening)} />
            <Stat label="Money in" value={inr(data.totalIn)} tone="text-green-800" />
            <Stat label="Money out" value={inr(data.totalOut)} tone="text-red-700" />
            <Stat label="Closing balance" value={inr(data.closing)} />
          </div>
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="text-left text-muted border-b border-line">
                  <th className="p-3 font-semibold">Date</th><th className="p-3 font-semibold">Details</th><th className="p-3 font-semibold">Account</th>
                  <th className="p-3 font-semibold text-right">In</th><th className="p-3 font-semibold text-right">Out</th><th className="p-3 font-semibold text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={`${r.kind}-${r.id}`} className="border-t border-gray-100">
                    <td className="p-3 whitespace-nowrap">{fmtDate(r.date)}</td>
                    <td className="p-3">
                      <span className="font-semibold">{r.title}</span>
                      {r.ref && <span className="block text-xs text-muted">{r.invoiceId ? <Link className="text-brand" to={`/sales/invoices/${r.invoiceId}`}>{r.ref}</Link> : r.ref}</span>}
                    </td>
                    <td className="p-3">{r.account} <span className="text-xs text-muted">({MODE_LABEL[r.mode] || r.mode})</span></td>
                    <td className="p-3 text-right font-semibold text-green-800">{r.kind === 'in' ? inr(r.amount) : ''}</td>
                    <td className="p-3 text-right font-semibold text-red-700">{r.kind === 'out' ? inr(r.amount) : ''}</td>
                    <td className="p-3 text-right font-bold">{inr(r.balance)}</td>
                  </tr>
                ))}
                {data.rows.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted">Ee period lo entries levu.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
