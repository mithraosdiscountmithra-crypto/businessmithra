import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth.jsx';
import { Badge, Empty, ErrorBox, PageHeader, SALES_NAV, SubNav, invoiceDisplayStatus, useApi } from '../../components/ui.jsx';
import Icon from '../../components/Icon.jsx';
import { fmtDate, inr } from '../../lib/format.js';

const INVOICE_FILTERS = [['', 'All'], ['due', 'Unpaid'], ['overdue', 'Overdue'], ['paid', 'Paid'], ['cancelled', 'Cancelled']];
const QUOTE_FILTERS = [['', 'All'], ['draft', 'Draft'], ['sent', 'Sent'], ['accepted', 'Accepted'], ['converted', 'Invoiced'], ['rejected', 'Rejected']];

export default function DocList({ kind }) {
  const isInvoice = kind === 'invoice';
  const navigate = useNavigate();
  const { me } = useAuth();
  const can = me.permissions.sales;
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const path = `/${isInvoice ? 'invoices' : 'quotations'}?status=${status}&q=${encodeURIComponent(query)}`;
  const { data, error, loading } = useApi(path);
  const list = (isInvoice ? data?.invoices : data?.quotations) || [];
  const base = `/sales/${isInvoice ? 'invoices' : 'quotations'}`;
  const filters = isInvoice ? INVOICE_FILTERS : QUOTE_FILTERS;
  const totalDue = isInvoice ? list.filter((i) => i.status !== 'cancelled').reduce((a, i) => a + Number(i.total) - Number(i.amountPaid), 0) : 0;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Sales & Customers">
        {can.add && <Link className="btn-primary" to={`${base}/new`}><Icon name="plus" size={18} /> New {isInvoice ? 'Invoice' : 'Quotation'}</Link>}
      </PageHeader>
      <SubNav items={SALES_NAV} />
      <ErrorBox>{error}</ErrorBox>
      <div className="flex flex-wrap items-center gap-2">
        {filters.map(([v, l]) => (
          <button key={v} type="button" aria-pressed={status === v} onClick={() => setStatus(v)} className={`h-9 px-3.5 rounded-lg text-sm font-semibold border ${status === v ? 'bg-brand text-white border-brand' : 'bg-white border-line'}`}>{l}</button>
        ))}
        <form onSubmit={(e) => { e.preventDefault(); setQuery(q); }} className="flex gap-2 ml-auto w-full sm:w-auto">
          <label className="sr-only" htmlFor="dq">Search</label>
          <input id="dq" type="search" className="input h-9" placeholder="Number or customer" value={q} onChange={(e) => setQ(e.target.value)} />
          <button type="submit" className="btn-ghost h-9 px-3">Search</button>
        </form>
      </div>
      {isInvoice && ['due', 'overdue'].includes(status) && list.length > 0 && <p className="text-sm font-semibold">Total pending: <span className="text-red-700">{inr(totalDue)}</span></p>}
      {!loading && list.length === 0 ? (
        <Empty title={isInvoice ? 'Invoices levu' : 'Quotations levu'} text={isInvoice ? 'Modati GST invoice create cheyyandi.' : 'Customer ki quotation pampi, accept ayyaka okka click tho invoice cheyyochu.'}>
          {can.add && <Link className="btn-primary" to={`${base}/new`}>New {isInvoice ? 'Invoice' : 'Quotation'}</Link>}
        </Empty>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-muted border-b border-line">
                <th className="p-3 font-semibold">Number</th><th className="p-3 font-semibold">Customer</th><th className="p-3 font-semibold">Date</th>
                <th className="p-3 font-semibold text-right">Total</th>
                {isInvoice && <th className="p-3 font-semibold text-right">Due</th>}
                <th className="p-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {list.map((d) => (
                <tr key={d.id} className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`${base}/${d.id}`)}>
                  <td className="p-3"><Link to={`${base}/${d.id}`} className="font-bold text-brand" onClick={(e) => e.stopPropagation()}>{d.number}</Link></td>
                  <td className="p-3">{d.customer.name}</td>
                  <td className="p-3 text-gray-600">{fmtDate(d.date)}</td>
                  <td className="p-3 text-right font-semibold">{inr(d.total)}</td>
                  {isInvoice && <td className="p-3 text-right">{d.status === 'cancelled' ? '—' : inr(Number(d.total) - Number(d.amountPaid))}</td>}
                  <td className="p-3"><Badge status={isInvoice ? invoiceDisplayStatus(d) : d.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
