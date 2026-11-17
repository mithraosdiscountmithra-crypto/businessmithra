import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { Badge, ErrorBox, PageHeader, invoiceDisplayStatus, useApi } from '../../components/ui.jsx';
import { fmtDate, fmtDateTime, inr, MODE_LABEL, waLink } from '../../lib/format.js';
import { CustomerForm } from './Customers.jsx';
import { FollowUpForm } from './FollowUps.jsx';

export default function CustomerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { me } = useAuth();
  const can = me.permissions.sales;
  const { data, error, reload } = useApi(`/customers/${id}`);
  const [editing, setEditing] = useState(false);
  const [follow, setFollow] = useState(false);
  const [err, setErr] = useState('');

  if (error) return <ErrorBox>{error}</ErrorBox>;
  if (!data) return <p className="text-muted">Loading…</p>;
  const { customer: c, stats, invoices, payments, followUps } = data;

  const timeline = [
    ...invoices.map((i) => ({ at: i.date, text: `Invoice ${i.number} · ${inr(i.total)}`, sub: i.status === 'cancelled' ? 'Cancelled' : '', link: `/sales/invoices/${i.id}` })),
    ...payments.map((p) => ({ at: p.date, text: `Paid ${inr(p.amount)} · ${MODE_LABEL[p.mode] || p.mode}`, sub: p.invoice?.number || '' })),
    ...followUps.map((f) => ({ at: f.dueAt, text: `Follow-up: ${f.title}`, sub: f.done ? 'Done' : fmtDateTime(f.dueAt) })),
    { at: c.createdAt, text: 'Added as customer', sub: '' },
  ].sort((a, b) => new Date(b.at) - new Date(a.at));

  const remove = async () => {
    if (!window.confirm(`Delete ${c.name}?`)) return;
    try {
      await api(`/customers/${c.id}`, { method: 'DELETE' });
      navigate('/sales/customers');
    } catch (x) {
      setErr(x.message);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <Link to="/sales/customers" className="text-sm font-semibold text-brand">← Customers</Link>
      <PageHeader title={c.name} subtitle={[c.phone, c.city].filter(Boolean).join(' · ')}>
        {c.phone && <a className="btn bg-green-100 text-green-800" href={waLink(c.phone, `Namaste ${c.name} garu,`)} target="_blank" rel="noreferrer">WhatsApp</a>}
        {c.phone && <a className="btn-ghost" href={`tel:${c.phone}`}>Call</a>}
        <Link className="btn-ghost" to={`/sales/customers/${c.id}/statement`}>📒 Statement</Link>
        {can.add && <Link className="btn-primary" to={`/sales/invoices/new?customer=${c.id}`}>New Invoice</Link>}
      </PageHeader>
      <ErrorBox>{err}</ErrorBox>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="card p-4"><p className="text-xs font-semibold text-muted">Total purchases</p><p className="text-xl font-extrabold">{inr(stats.totalPurchases)}</p></div>
        <div className="card p-4"><p className="text-xs font-semibold text-muted">Invoices</p><p className="text-xl font-extrabold">{stats.invoiceCount}</p></div>
        <div className="card p-4"><p className="text-xs font-semibold text-muted">Last purchase</p><p className="text-xl font-extrabold">{fmtDate(stats.lastPurchase)}</p></div>
        <div className="card p-4"><p className="text-xs font-semibold text-muted">Balance due</p><p className={`text-xl font-extrabold ${stats.balanceDue > 0 ? 'text-red-700' : ''}`}>{inr(stats.balanceDue)}</p></div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <section className="card p-5 flex flex-col gap-3">
          <h2 className="font-bold">Details</h2>
          <dl className="text-sm grid grid-cols-[110px_1fr] gap-y-2">
            <dt className="text-muted">Email</dt><dd>{c.email || '—'}</dd>
            <dt className="text-muted">GSTIN</dt><dd>{c.gstin || '—'}</dd>
            <dt className="text-muted">Address</dt><dd>{[c.address, c.city, c.state].filter(Boolean).join(', ') || '—'}</dd>
            <dt className="text-muted">Birthday</dt><dd>{c.birthday ? fmtDate(c.birthday) : '—'}</dd>
            <dt className="text-muted">Tags</dt><dd className="flex flex-wrap gap-1">{c.tags.length ? c.tags.map((t) => <span key={t} className="text-xs font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-800">{t}</span>) : '—'}</dd>
            <dt className="text-muted">Notes</dt><dd className="whitespace-pre-line">{c.notes || '—'}</dd>
          </dl>
          <div className="flex flex-wrap gap-2 pt-2">
            {can.edit && <button type="button" className="btn-ghost h-9 px-3" onClick={() => setEditing(true)}>Edit</button>}
            {can.add && <button type="button" className="btn-ghost h-9 px-3" onClick={() => setFollow(true)}>Add follow-up</button>}
            {can.delete && <button type="button" className="btn-ghost h-9 px-3 text-red-700" onClick={remove}>Delete</button>}
          </div>
        </section>

        <section className="card p-5 flex flex-col gap-3 lg:col-span-2">
          <h2 className="font-bold">Invoices</h2>
          {invoices.length === 0 ? <p className="text-sm text-muted">Inka invoices levu.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <tbody>
                  {invoices.map((i) => (
                    <tr key={i.id} className="border-t border-gray-100">
                      <td className="py-2.5 pr-3"><Link to={`/sales/invoices/${i.id}`} className="font-bold text-brand hover:underline">{i.number}</Link></td>
                      <td className="py-2.5 pr-3 text-gray-600">{fmtDate(i.date)}</td>
                      <td className="py-2.5 pr-3 text-right font-semibold">{inr(i.total)}</td>
                      <td className="py-2.5 text-right"><Badge status={invoiceDisplayStatus(i)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <h2 className="font-bold pt-3">Timeline</h2>
          <ol className="flex flex-col gap-3">
            {timeline.slice(0, 25).map((t, i) => (
              <li key={i} className="flex gap-3">
                <span className="w-2.5 h-2.5 mt-1.5 rounded-full bg-indigo-500 shrink-0" />
                <div className="text-sm">
                  {t.link ? <Link to={t.link} className="font-semibold hover:underline">{t.text}</Link> : <span className="font-semibold">{t.text}</span>}
                  <span className="block text-xs text-muted">{fmtDate(t.at)}{t.sub ? ` · ${t.sub}` : ''}</span>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>

      {editing && <CustomerForm customer={c} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); reload(); }} />}
      {follow && <FollowUpForm customerId={c.id} onClose={() => setFollow(false)} onSaved={() => { setFollow(false); reload(); }} />}
    </div>
  );
}
