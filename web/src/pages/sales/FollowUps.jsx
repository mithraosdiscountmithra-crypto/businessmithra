import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { Empty, ErrorBox, Field, Modal, PageHeader, SALES_NAV, SubNav, useApi } from '../../components/ui.jsx';
import Icon from '../../components/Icon.jsx';
import { fmtDateTime, waLink } from '../../lib/format.js';

const pad = (n) => String(n).padStart(2, '0');
const localInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

export function FollowUpForm({ customerId, leadId, onClose, onSaved }) {
  const { data } = useApi(customerId || leadId ? null : '/customers?limit=500');
  const tomorrow10 = new Date();
  tomorrow10.setDate(tomorrow10.getDate() + 1);
  tomorrow10.setHours(10, 0, 0, 0);
  const [f, setF] = useState({ title: '', dueAt: localInput(tomorrow10), customerId: customerId || '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      await api('/followups', { method: 'POST', body: { ...f, leadId, dueAt: new Date(f.dueAt).toISOString() } });
      onSaved();
    } catch (x) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="New follow-up" onClose={onClose}>
      <form onSubmit={save} className="flex flex-col gap-4">
        <ErrorBox>{err}</ErrorBox>
        <Field label="Em cheyyali?" id="f-title"><input id="f-title" required className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Payment reminder call" /></Field>
        <Field label="Eppudu?" id="f-due"><input id="f-due" type="datetime-local" required className="input" value={f.dueAt} onChange={(e) => setF({ ...f, dueAt: e.target.value })} /></Field>
        {!customerId && !leadId && (
          <Field label="Customer (optional)" id="f-cust">
            <select id="f-cust" className="input" value={f.customerId} onChange={(e) => setF({ ...f, customerId: e.target.value })}>
              <option value="">None</option>
              {(data?.customers || []).map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ''}</option>)}
            </select>
          </Field>
        )}
        <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      </form>
    </Modal>
  );
}

const VIEWS = [['today', 'Today & overdue'], ['upcoming', 'Upcoming'], ['done', 'Done']];

export default function FollowUps() {
  const { me } = useAuth();
  const can = me.permissions.sales;
  const [view, setView] = useState('today');
  const { data, error, reload } = useApi(`/followups?view=${view}`);
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState('');

  const toggle = async (f) => {
    try {
      await api(`/followups/${f.id}`, { method: 'PUT', body: { done: !f.done } });
      reload();
    } catch (x) {
      setErr(x.message);
    }
  };

  const now = Date.now();
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Sales & Customers">
        {can.add && <button type="button" className="btn-primary" onClick={() => setAdding(true)}><Icon name="plus" size={18} /> Add Follow-up</button>}
      </PageHeader>
      <SubNav items={SALES_NAV} />
      <ErrorBox>{error || err}</ErrorBox>
      <div className="flex gap-2" role="group" aria-label="Filter">
        {VIEWS.map(([v, l]) => (
          <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={`h-10 px-4 rounded-xl text-sm font-semibold border ${view === v ? 'bg-brand text-white border-brand' : 'bg-white border-line'}`}>{l}</button>
        ))}
      </div>
      {data?.followUps?.length === 0 ? (
        <Empty title="Emi pending levu 🎉" text="Kotha follow-up add cheyyandi, time ki gurtu chestam." />
      ) : (
        <ul className="card divide-y divide-gray-100">
          {(data?.followUps || []).map((f) => {
            const who = f.customer || f.lead;
            const late = !f.done && new Date(f.dueAt).getTime() < now;
            return (
              <li key={f.id} className="flex items-center gap-3 p-4">
                <input type="checkbox" className="w-5 h-5 accent-brand shrink-0" checked={f.done} disabled={!can.edit} onChange={() => toggle(f)} aria-label={`Mark ${f.title} done`} />
                <div className="flex-1 min-w-0">
                  <p className={`font-semibold ${f.done ? 'line-through text-muted' : ''}`}>{f.title}</p>
                  <p className="text-xs text-muted">
                    <span className={late ? 'text-red-700 font-bold' : ''}>{fmtDateTime(f.dueAt)}{late ? ' · late' : ''}</span>
                    {who && <> · {f.customer ? <Link to={`/sales/customers/${f.customer.id}`} className="text-brand font-semibold">{who.name}</Link> : who.name}</>}
                  </p>
                </div>
                {who?.phone && <a href={waLink(who.phone, `Namaste ${who.name} garu,`)} target="_blank" rel="noreferrer" className="h-10 px-3 rounded-xl bg-green-100 text-green-800 text-sm font-bold flex items-center">WhatsApp</a>}
                {who?.phone && <a href={`tel:${who.phone}`} className="h-10 px-3 rounded-xl bg-gray-100 text-sm font-bold flex items-center">Call</a>}
              </li>
            );
          })}
        </ul>
      )}
      {adding && <FollowUpForm onClose={() => setAdding(false)} onSaved={() => { setAdding(false); reload(); }} />}
    </div>
  );
}
