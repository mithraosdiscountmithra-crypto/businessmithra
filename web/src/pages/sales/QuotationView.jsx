import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { Badge, ErrorBox, useApi } from '../../components/ui.jsx';
import InvoicePaper from '../../components/InvoicePaper.jsx';
import { fmtDate, inr, waLink } from '../../lib/format.js';

export default function QuotationView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { me } = useAuth();
  const can = me.permissions.sales;
  const { data, error, setData } = useApi(`/quotations/${id}`);
  const [err, setErr] = useState('');

  if (error) return <ErrorBox>{error}</ErrorBox>;
  if (!data) return <p className="text-muted">Loading…</p>;
  const q = data.quotation;
  const business = me.business;
  const lines = q.items.map((l) => `• ${l.name} – ${Number(l.qty)} × ${inr(l.rate)}`).join('\n');
  const msg = `Namaste ${q.customer.name} garu,\n${business.name} nunchi quotation ${q.number}\n\n${lines}\n\nTotal (GST tho): ${inr(q.total)}${q.validTill ? `\nValid till: ${fmtDate(q.validTill)}` : ''}`;

  const setStatus = async (status) => {
    setErr('');
    try {
      const r = await api(`/quotations/${q.id}/status`, { method: 'PUT', body: { status } });
      setData({ quotation: r.quotation });
    } catch (x) {
      setErr(x.message);
    }
  };
  const convert = async () => {
    setErr('');
    try {
      const r = await api(`/quotations/${q.id}/convert`, { method: 'POST' });
      navigate(`/sales/invoices/${r.invoiceId}`);
    } catch (x) {
      setErr(x.message);
    }
  };
  const remove = async () => {
    if (!window.confirm('Delete this quotation?')) return;
    try {
      await api(`/quotations/${q.id}`, { method: 'DELETE' });
      navigate('/sales/quotations');
    } catch (x) {
      setErr(x.message);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex flex-col gap-1">
          <Link to="/sales/quotations" className="text-sm font-semibold text-brand">← Quotations</Link>
          <div className="flex items-center gap-3"><h1 className="text-2xl font-extrabold">{q.number}</h1><Badge status={q.status} /></div>
          <p className="text-sm text-muted">{q.customer.name} · {fmtDate(q.date)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {q.status === 'converted' ? (
            <Link className="btn-primary" to={`/sales/invoices/${q.invoiceId}`}>Open invoice</Link>
          ) : (
            <>
              {can.add && <button type="button" className="btn-primary" onClick={convert}>Convert to Invoice</button>}
              <a className="btn bg-green-100 text-green-800 hover:bg-green-200" href={waLink(q.customer.phone, msg)} target="_blank" rel="noreferrer" onClick={() => q.status === 'draft' && can.edit && setStatus('sent')}>Share on WhatsApp</a>
              {can.edit && (
                <>
                  <label className="sr-only" htmlFor="qs">Status</label>
                  <select id="qs" className="input h-11 w-auto" value={q.status} onChange={(e) => setStatus(e.target.value)}>
                    <option value="draft">Draft</option><option value="sent">Sent</option><option value="accepted">Accepted</option><option value="rejected">Rejected</option>
                  </select>
                  <Link className="btn-ghost" to={`/sales/quotations/${q.id}/edit`}>Edit</Link>
                </>
              )}
            </>
          )}
          <button type="button" className="btn-ghost" onClick={() => window.print()}>Print / PDF</button>
          {can.delete && q.status !== 'converted' && <button type="button" className="btn-ghost text-red-700" onClick={remove}>Delete</button>}
        </div>
      </div>
      <ErrorBox>{err}</ErrorBox>
      <InvoicePaper doc={q} business={business} kind="quotation" />
    </div>
  );
}
