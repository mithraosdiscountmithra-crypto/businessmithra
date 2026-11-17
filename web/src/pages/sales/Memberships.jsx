import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { Empty, ErrorBox, Field, Modal, PageHeader, useApi } from '../../components/ui.jsx';
import Icon from '../../components/Icon.jsx';
import { fmtDate, inr, MODE_LABEL, waLink } from '../../lib/format.js';

const DURATIONS = [[30, '1 month'], [90, '3 months'], [180, '6 months'], [365, '1 year']];
const durLabel = (d) => (DURATIONS.find((x) => x[0] === d)?.[1]) || `${d} days`;
const benefitText = (p) => [Number(p.discountPct) > 0 && `${Number(p.discountPct)}% off every time`, p.freeDelivery && 'Free delivery'].filter(Boolean).join(' + ');

function PlanForm({ plan, onClose, onSaved }) {
  const [f, setF] = useState({
    name: plan?.name || '', price: plan?.price ?? '', durationDays: plan?.durationDays ?? 365, discountPct: plan?.discountPct ?? '',
    freeDelivery: plan?.freeDelivery ?? false, description: plan?.description || '', active: plan?.active ?? true,
  });
  const [err, setErr] = useState('');
  const custom = !DURATIONS.some((d) => d[0] === Number(f.durationDays));
  const save = async (e) => {
    e.preventDefault();
    setErr('');
    try {
      await api(plan ? `/memberships/plans/${plan.id}` : '/memberships/plans', {
        method: plan ? 'PUT' : 'POST',
        body: { ...f, price: Number(f.price || 0), durationDays: Number(f.durationDays), discountPct: Number(f.discountPct || 0) },
      });
      onSaved();
    } catch (x) {
      setErr(x.message);
    }
  };
  return (
    <Modal title={plan ? 'Edit plan' : 'New membership plan'} onClose={onClose}>
      <form onSubmit={save} className="flex flex-col gap-4">
        <ErrorBox>{err}</ErrorBox>
        {!plan && (
          <div className="flex flex-wrap gap-2">
            {[['Silver', 499, 365, 10, false], ['Gold', 999, 365, 20, false], ['Delivery Pass', 99, 30, 0, true]].map(([n, p, d, pct, fd]) => (
              <button key={n} type="button" className="h-9 px-3 rounded-lg border border-line text-sm font-semibold hover:border-brand" onClick={() => setF({ ...f, name: n, price: p, durationDays: d, discountPct: pct || '', freeDelivery: fd })}>
                {n}: ₹{p} · {durLabel(d)} · {pct ? `${pct}%` : 'free delivery'}
              </button>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <Field label="Plan name" id="mp-n" className="col-span-2"><input id="mp-n" required className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Gold Member" /></Field>
          <Field label="Price (₹)" id="mp-p"><input id="mp-p" type="number" min="0" step="1" required className="input" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} /></Field>
          <Field label="Validity" id="mp-d">
            <select id="mp-d" className="input" value={custom ? 'custom' : f.durationDays} onChange={(e) => setF({ ...f, durationDays: e.target.value === 'custom' ? 15 : Number(e.target.value) })}>
              {DURATIONS.map(([d, l]) => <option key={d} value={d}>{l}</option>)}
              <option value="custom">Custom days</option>
            </select>
          </Field>
          {custom && <Field label="Days" id="mp-dd"><input id="mp-dd" type="number" min="1" className="input" value={f.durationDays} onChange={(e) => setF({ ...f, durationDays: e.target.value })} /></Field>}
          <Field label="Discount % on every order/bill" id="mp-pct" hint="0 ante discount ledu"><input id="mp-pct" type="number" min="0" max="100" step="0.5" className="input" value={f.discountPct} onChange={(e) => setF({ ...f, discountPct: e.target.value })} /></Field>
          <label className="col-span-2 flex items-center gap-2 font-semibold"><input type="checkbox" className="w-5 h-5 accent-brand" checked={f.freeDelivery} onChange={(e) => setF({ ...f, freeDelivery: e.target.checked })} /> 🚚 Free home delivery (delivery charges padavu)</label>
          <Field label="Short description (optional)" id="mp-desc" className="col-span-2"><input id="mp-desc" className="input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="e.g. Birthday gift extra" /></Field>
          {plan && <label className="col-span-2 flex items-center gap-2 text-sm font-semibold"><input type="checkbox" className="w-5 h-5 accent-brand" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Active (shop lo amme plan)</label>}
        </div>
        <button type="submit" className="btn-primary">Save plan</button>
      </form>
    </Modal>
  );
}

function SellForm({ plans, onClose, onSaved }) {
  const [f, setF] = useState({ planId: plans[0]?.id || '', phone: '', name: '', paidMode: 'cash', reference: '', price: '' });
  const [err, setErr] = useState('');
  const plan = plans.find((p) => p.id === f.planId);
  const save = async (e) => {
    e.preventDefault();
    setErr('');
    try {
      const r = await api('/memberships', { method: 'POST', body: { ...f, price: f.price === '' ? '' : Number(f.price) } });
      onSaved(r.membership);
    } catch (x) {
      setErr(x.message);
    }
  };
  return (
    <Modal title="Add member (counter lo ammadam)" onClose={onClose}>
      <form onSubmit={save} className="flex flex-col gap-4">
        <ErrorBox>{err}</ErrorBox>
        <Field label="Plan" id="ms-plan">
          <select id="ms-plan" required className="input" value={f.planId} onChange={(e) => setF({ ...f, planId: e.target.value })}>
            {plans.map((p) => <option key={p.id} value={p.id}>{p.name} · {inr(p.price)} · {durLabel(p.durationDays)}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Customer mobile" id="ms-ph"><input id="ms-ph" required inputMode="numeric" maxLength={10} className="input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value.replace(/\D/g, '') })} /></Field>
          <Field label="Name" id="ms-nm"><input id="ms-nm" className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Paid by" id="ms-mode">
            <select id="ms-mode" className="input" value={f.paidMode} onChange={(e) => setF({ ...f, paidMode: e.target.value })}>{Object.entries(MODE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </Field>
          <Field label="Amount received (₹)" id="ms-amt" hint={plan ? `Plan price ${inr(plan.price)}` : ''}><input id="ms-amt" type="number" min="0" className="input" value={f.price} placeholder={plan ? String(plan.price) : ''} onChange={(e) => setF({ ...f, price: e.target.value })} /></Field>
        </div>
        <button type="submit" className="btn-primary">✓ Payment received – Activate</button>
      </form>
    </Modal>
  );
}

export default function Memberships() {
  const { me } = useAuth();
  const can = me.permissions.sales;
  const settings = useApi('/memberships/settings');
  const plans = useApi('/memberships/plans');
  const [tab, setTab] = useState('active');
  const members = useApi(`/memberships?status=${tab}`);
  const [editPlan, setEditPlan] = useState(null);
  const [selling, setSelling] = useState(false);
  const [err, setErr] = useState('');

  const enabled = settings.data?.membershipsEnabled;
  const toggle = async () => {
    setErr('');
    try {
      await api('/memberships/settings', { method: 'PUT', body: { membershipsEnabled: !enabled } });
      settings.reload();
    } catch (x) {
      setErr(x.message);
    }
  };
  const decide = async (m, action) => {
    setErr('');
    try {
      if (action === 'approve') {
        const mode = window.prompt('Payment ela vachindi? (upi / cash / card / bank)', 'upi');
        if (mode === null) return;
        await api(`/memberships/${m.id}/approve`, { method: 'POST', body: { paidMode: mode.trim().toLowerCase() } });
      } else {
        if (!window.confirm(action === 'reject' ? 'Reject this request?' : 'Cancel this membership?')) return;
        await api(`/memberships/${m.id}/reject`, { method: 'POST' });
      }
      members.reload();
      plans.reload();
    } catch (x) {
      setErr(x.message);
    }
  };
  const activePlans = (plans.data?.plans || []).filter((p) => p.active);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="⭐ Customer Memberships" subtitle="Customers ki membership ammandi: prati sari discount, free delivery">
        {can.add && activePlans.length > 0 && <button type="button" className="btn-primary" onClick={() => setSelling(true)}><Icon name="plus" size={18} /> Add member</button>}
      </PageHeader>
      <ErrorBox>{err || settings.error || plans.error}</ErrorBox>

      <section className={`card p-5 flex flex-wrap items-center justify-between gap-3 ${enabled ? '' : 'bg-gray-50'}`}>
        <div>
          <p className="font-bold">{enabled ? '✅ Memberships ON' : 'Memberships OFF'}</p>
          <p className="text-sm text-muted">{enabled ? 'Online shop lo customers plans chusi buy cheyyochu. Benefits automatic ga apply avutayi.' : 'ON chesthe shop lo plans kanipistayi.'}</p>
        </div>
        {me.user.isOwner && <button type="button" className={enabled ? 'btn-ghost' : 'btn-primary'} onClick={toggle}>{enabled ? 'Turn OFF' : 'Turn ON'}</button>}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Plans</h2>
          {can.add && <button type="button" className="btn-ghost h-10" onClick={() => setEditPlan('new')}><Icon name="plus" size={16} /> New plan</button>}
        </div>
        {plans.data?.plans?.length === 0 ? (
          <Empty title="Inka plans levu" text="e.g. Silver ₹499/year = 10% off, Gold ₹999/year = 20% off, Delivery Pass ₹99/month = free delivery">
            {can.add && <button type="button" className="btn-primary" onClick={() => setEditPlan('new')}>Create first plan</button>}
          </Empty>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {(plans.data?.plans || []).map((p) => (
              <article key={p.id} className={`card p-4 flex flex-col gap-1.5 ${p.active ? '' : 'opacity-60'}`}>
                <div className="flex justify-between gap-2"><h3 className="font-extrabold">⭐ {p.name}</h3>{!p.active && <span className="text-xs font-bold text-muted">Hidden</span>}</div>
                <p><span className="text-2xl font-extrabold">{inr(p.price)}</span> <span className="text-sm text-muted">/ {durLabel(p.durationDays)}</span></p>
                <p className="text-sm font-semibold text-green-800">{benefitText(p)}</p>
                {p.description && <p className="text-xs text-muted">{p.description}</p>}
                <p className="text-xs text-muted">{p.activeMembers} active members</p>
                {can.edit && <button type="button" className="btn-ghost h-9 self-start mt-1" onClick={() => setEditPlan(p)}>Edit</button>}
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          {[['active', 'Active members'], ['pending', `Requests${members.data?.pending ? ` (${members.data.pending})` : ''}`], ['expired', 'Expired'], ['all', 'All']].map(([v, l]) => (
            <button key={v} type="button" aria-pressed={tab === v} onClick={() => setTab(v)} className={`h-9 px-3.5 rounded-lg text-sm font-semibold border ${tab === v ? 'bg-brand text-white border-brand' : 'bg-white border-line'}`}>{l}</button>
          ))}
        </div>
        {members.data?.expiringSoon > 0 && tab === 'active' && <p className="text-sm font-semibold text-amber-900">⏳ {members.data.expiringSoon} memberships 7 rojullo expire avutayi. Renew kosam WhatsApp cheyyandi.</p>}
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead><tr className="text-left text-muted border-b border-line"><th className="p-3">Customer</th><th className="p-3">Plan</th><th className="p-3">Valid till</th><th className="p-3">Paid</th><th className="p-3"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {(members.data?.members || []).map((m) => {
                const expired = m.endsAt && new Date(m.endsAt) <= new Date();
                return (
                  <tr key={m.id} className="border-t border-gray-100">
                    <td className="p-3"><Link to={`/sales/customers/${m.customer.id}`} className="font-bold text-brand">{m.customer.name}</Link><span className="block text-xs text-muted">{m.phone}{m.source === 'shop' ? ' · online' : ''}</span></td>
                    <td className="p-3 font-semibold">⭐ {m.plan.name}<span className="block text-xs text-green-800 font-normal">{benefitText(m.plan)}</span></td>
                    <td className="p-3">{m.status === 'pending' ? <span className="font-bold text-amber-800">Waiting for payment</span> : m.status !== 'active' ? <span className="capitalize">{m.status}</span> : <span className={expired ? 'text-red-700 font-bold' : ''}>{fmtDate(m.endsAt)}{expired ? ' (expired)' : ''}</span>}</td>
                    <td className="p-3">{m.status === 'pending' ? inr(m.plan.price) : `${inr(m.pricePaid)}${m.paymentMode ? ` · ${MODE_LABEL[m.paymentMode] || m.paymentMode}` : ''}`}</td>
                    <td className="p-3 text-right whitespace-nowrap">
                      {m.status === 'pending' && can.edit && (
                        <>
                          <button type="button" className="btn-primary h-9 px-3" onClick={() => decide(m, 'approve')}>✓ Paid – Approve</button>
                          <button type="button" className="btn-ghost h-9 px-3 ml-2 text-red-700" onClick={() => decide(m, 'reject')}>Reject</button>
                        </>
                      )}
                      {m.status === 'active' && (
                        <a className="text-xs font-bold text-green-800 underline" target="_blank" rel="noreferrer" href={waLink(m.phone, expired
                          ? `Namaste ${m.customer.name} garu, mee ${m.plan.name} membership ${fmtDate(m.endsAt)} ki ayipoyindi. Renew chesi malli ${benefitText(m.plan)} pondandi! – ${me.business.name}`
                          : `Namaste ${m.customer.name} garu, mee ${m.plan.name} membership active ✅ (${fmtDate(m.endsAt)} varaku). ${benefitText(m.plan)}. – ${me.business.name}`)}
                        >WhatsApp</a>
                      )}
                      {m.status === 'active' && !expired && can.edit && <button type="button" className="text-xs font-semibold text-red-700 underline ml-3" onClick={() => decide(m, 'cancel')}>Cancel</button>}
                    </td>
                  </tr>
                );
              })}
              {members.data?.members?.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted">Emi levu</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {editPlan && <PlanForm plan={editPlan === 'new' ? null : editPlan} onClose={() => setEditPlan(null)} onSaved={() => { setEditPlan(null); plans.reload(); }} />}
      {selling && <SellForm plans={activePlans} onClose={() => setSelling(false)} onSaved={() => { setSelling(false); members.reload(); plans.reload(); }} />}
    </div>
  );
}
