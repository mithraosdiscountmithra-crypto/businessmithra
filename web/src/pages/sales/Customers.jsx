import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { Empty, ErrorBox, Field, Modal, PageHeader, SALES_NAV, SubNav, useApi, useForm } from '../../components/ui.jsx';
import Icon from '../../components/Icon.jsx';
import { fmtDate, inr, isoDay } from '../../lib/format.js';

export function CustomerForm({ customer, onClose, onSaved }) {
  const [f, , set] = useForm({
    name: customer?.name || '', phone: customer?.phone || '', email: customer?.email || '',
    address: customer?.address || '', city: customer?.city || '', state: customer?.state || '',
    gstin: customer?.gstin || '', tags: (customer?.tags || []).join(', '), notes: customer?.notes || '',
    birthday: isoDay(customer?.birthday),
  });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const body = { ...f, tags: f.tags.split(',').map((t) => t.trim()).filter(Boolean) };
      const r = await api(customer ? `/customers/${customer.id}` : '/customers', { method: customer ? 'PUT' : 'POST', body });
      onSaved(r.customer);
    } catch (x) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={customer ? 'Edit customer' : 'New customer'} onClose={onClose}>
      <form onSubmit={save} className="flex flex-col gap-4">
        <ErrorBox>{err}</ErrorBox>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Name" id="c-name"><input id="c-name" required className="input" value={f.name} onChange={set('name')} /></Field>
          <Field label="Mobile" id="c-phone"><input id="c-phone" inputMode="numeric" maxLength={10} className="input" value={f.phone} onChange={set('phone')} /></Field>
          <Field label="Email" id="c-email"><input id="c-email" type="email" className="input" value={f.email} onChange={set('email')} /></Field>
          <Field label="GSTIN (business customers)" id="c-gst"><input id="c-gst" className="input uppercase" maxLength={15} value={f.gstin} onChange={set('gstin')} /></Field>
          <Field label="Address" id="c-addr" className="sm:col-span-2"><input id="c-addr" className="input" value={f.address} onChange={set('address')} /></Field>
          <Field label="Town / City" id="c-city"><input id="c-city" className="input" value={f.city} onChange={set('city')} /></Field>
          <Field label="State" id="c-state"><input id="c-state" className="input" value={f.state} onChange={set('state')} /></Field>
          <Field label="Birthday" id="c-bd"><input id="c-bd" type="date" className="input" value={f.birthday} onChange={set('birthday')} /></Field>
          <Field label="Tags" id="c-tags" hint="Comma tho veru cheyyandi: VIP, Wholesale"><input id="c-tags" className="input" value={f.tags} onChange={set('tags')} /></Field>
          <Field label="Notes" id="c-notes" className="sm:col-span-2"><textarea id="c-notes" rows={2} className="input h-auto py-2.5" value={f.notes} onChange={set('notes')} /></Field>
        </div>
        <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save customer'}</button>
      </form>
    </Modal>
  );
}

export default function Customers() {
  const { me } = useAuth();
  const can = me.permissions.sales;
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const { data, error, loading, reload } = useApi(`/customers?q=${encodeURIComponent(query)}`);
  const [adding, setAdding] = useState(false);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Sales & Customers">
        {can.add && <button type="button" className="btn-primary" onClick={() => setAdding(true)}><Icon name="plus" size={18} /> Add Customer</button>}
      </PageHeader>
      <SubNav items={SALES_NAV} />
      <ErrorBox>{error}</ErrorBox>

      <form onSubmit={(e) => { e.preventDefault(); setQuery(q); }} className="flex gap-2 max-w-lg">
        <label className="sr-only" htmlFor="cq">Search customers</label>
        <input id="cq" type="search" className="input" placeholder="Search name, mobile, email" value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="submit" className="btn-ghost">Search</button>
      </form>

      {!loading && data?.customers?.length === 0 ? (
        <Empty title="Inka customers levu" text="Modati customer ni add cheyyandi. Invoice create chesetappudu kooda add cheyyochu.">
          {can.add && <button type="button" className="btn-primary" onClick={() => setAdding(true)}>Add Customer</button>}
        </Empty>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="text-left text-muted border-b border-line">
                <th className="p-3 font-semibold">Customer</th>
                <th className="p-3 font-semibold">Mobile</th>
                <th className="p-3 font-semibold">Tags</th>
                <th className="p-3 font-semibold text-right">Total purchases</th>
                <th className="p-3 font-semibold text-right">Balance due</th>
                <th className="p-3 font-semibold">Last purchase</th>
              </tr>
            </thead>
            <tbody>
              {(data?.customers || []).map((c) => (
                <tr key={c.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="p-3"><Link to={`/sales/customers/${c.id}`} className="font-bold text-brand hover:underline">{c.name}</Link>{c.city && <span className="block text-xs text-muted">{c.city}</span>}</td>
                  <td className="p-3">{c.phone || '—'}</td>
                  <td className="p-3"><div className="flex flex-wrap gap-1">{c.tags.map((t) => <span key={t} className="text-xs font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-800">{t}</span>)}</div></td>
                  <td className="p-3 text-right font-semibold">{inr(c.totalPurchases)}</td>
                  <td className={`p-3 text-right font-bold ${c.balanceDue > 0 ? 'text-red-700' : ''}`}>{inr(c.balanceDue)}</td>
                  <td className="p-3 text-gray-600">{fmtDate(c.lastPurchase)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {adding && <CustomerForm onClose={() => setAdding(false)} onSaved={() => { setAdding(false); reload(); }} />}
    </div>
  );
}
