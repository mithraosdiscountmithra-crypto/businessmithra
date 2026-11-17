import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { ErrorBox, Field, Modal, PageHeader, useApi } from '../components/ui.jsx';
import { MODULE_INFO } from '../constants.js';
import { fmtDate, fmtDateTime, inr } from '../lib/format.js';

const STATUS = { pending: ['Waiting for approval', 'bg-amber-100 text-amber-900'], approved: ['Approved', 'bg-green-100 text-green-800'], rejected: ['Rejected', 'bg-red-100 text-red-800'] };
const MODE = { cash: 'Cash', upi: 'UPI', bank: 'Bank transfer' };

function RequestForm({ plan, cycle, payTo, onClose, onSent }) {
  const [f, setF] = useState({ paymentMode: 'cash', reference: '', note: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const amount = cycle === 'yearly' ? plan.priceYearly : plan.priceMonthly;
  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      await api('/billing/request', { method: 'POST', body: { planCode: plan.code, cycle, ...f } });
      onSent();
    } catch (x) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  };
  const upiLink = payTo.upi ? `upi://pay?pa=${encodeURIComponent(payTo.upi)}&pn=${encodeURIComponent(payTo.name)}&am=${Number(amount).toFixed(2)}&cu=INR&tn=${encodeURIComponent(`${plan.name} plan`)}` : null;
  return (
    <Modal title={`${plan.name} plan · ${cycle === 'yearly' ? 'Yearly' : 'Monthly'}`} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <ErrorBox>{err}</ErrorBox>
        <div className="rounded-xl bg-brand-light p-4 flex flex-col gap-1">
          <p className="text-sm">Pay cheyyalsina amount</p>
          <p className="text-3xl font-extrabold">{inr(amount)}</p>
          <p className="text-xs text-muted">{cycle === 'yearly' ? '12 months' : '1 month'} · Approve ayina roju nunchi</p>
        </div>
        <div className="text-sm flex flex-col gap-1.5">
          <p className="font-bold">Ela pay cheyyali:</p>
          <p>💵 <strong>Cash:</strong> BusinessMithra team ki direct ga ivvandi.</p>
          {payTo.upi && <p>📱 <strong>UPI:</strong> {payTo.upi} {upiLink && <a href={upiLink} className="ml-1 font-bold text-brand underline">Pay now</a>}</p>}
          {payTo.phone && <p>📞 Help: <a className="font-semibold text-brand" href={`tel:${payTo.phone}`}>{payTo.phone}</a></p>}
        </div>
        <Field label="Meeru ela pay chesaru?" id="b-mode">
          <select id="b-mode" className="input" value={f.paymentMode} onChange={(e) => setF({ ...f, paymentMode: e.target.value })}>
            <option value="cash">Cash</option><option value="upi">UPI</option><option value="bank">Bank transfer</option>
          </select>
        </Field>
        {f.paymentMode !== 'cash' && (
          <Field label="UPI / transaction reference no." id="b-ref"><input id="b-ref" className="input" value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} /></Field>
        )}
        <Field label="Note (optional)" id="b-note"><input id="b-note" className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder={f.paymentMode === 'cash' ? 'e.g. Ravi garu ki cash icchanu' : ''} /></Field>
        <button type="submit" className="btn-primary h-12" disabled={busy}>{busy ? 'Sending…' : 'Send request for approval'}</button>
        <p className="text-xs text-muted text-center">BusinessMithra team payment check chesi approve chestaru. Approve ayina ventane plan start avutundi.</p>
      </form>
    </Modal>
  );
}

export default function Billing() {
  const { refresh } = useAuth();
  const { data, error, reload } = useApi('/billing');
  const [cycle, setCycle] = useState('monthly');
  const [picked, setPicked] = useState(null);
  const [err, setErr] = useState('');

  if (error) return <ErrorBox>{error}</ErrorBox>;
  if (!data) return <p className="text-muted">Loading…</p>;
  const c = data.current;
  const pending = data.requests.find((r) => r.status === 'pending');

  const cancel = async (r) => {
    if (!window.confirm('Cancel this request?')) return;
    try {
      await api(`/billing/request/${r.id}`, { method: 'DELETE' });
      reload();
    } catch (x) {
      setErr(x.message);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Plan & Billing" subtitle="Mee BusinessMithra subscription" />
      <ErrorBox>{err}</ErrorBox>

      <section className={`card p-5 flex flex-wrap items-center justify-between gap-4 ${c.active ? '' : 'border-red-300 bg-red-50'}`}>
        <div className="flex flex-col gap-1">
          <p className="text-sm text-muted">Current plan</p>
          <p className="text-2xl font-extrabold">{c.planName}</p>
          <p className={`text-sm font-semibold ${c.active ? 'text-green-800' : 'text-red-700'}`}>
            {!c.active ? (c.plan === 'trial' ? 'Free trial ayipoyindi' : 'Plan expire ayyindi') : c.daysLeft === null ? 'Active' : `${c.daysLeft} days left · ${fmtDate(c.endsAt)} varaku`}
          </p>
        </div>
        {!c.active && <p className="text-sm text-red-800 max-w-md">Mee data anta safe ga undi. Plan renew chesina ventane anni malli open avutayi.</p>}
      </section>

      {pending && (
        <section className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-bold">⏳ Request waiting for approval</p>
            <p className="text-sm">{pending.planCode.toUpperCase()} · {pending.cycle} · {inr(pending.amount)} · {MODE[pending.paymentMode]} · {fmtDateTime(pending.createdAt)}</p>
          </div>
          <button type="button" className="btn-ghost h-10" onClick={() => cancel(pending)}>Cancel request</button>
        </section>
      )}

      <div className="flex items-center gap-2" role="group" aria-label="Billing cycle">
        {[['monthly', 'Monthly'], ['yearly', 'Yearly (2 months free)']].map(([v, l]) => (
          <button key={v} type="button" aria-pressed={cycle === v} onClick={() => setCycle(v)} className={`h-10 px-4 rounded-xl text-sm font-bold border ${cycle === v ? 'bg-ink text-white border-ink' : 'bg-white border-line'}`}>{l}</button>
        ))}
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {data.plans.map((p) => {
          const price = cycle === 'yearly' ? p.priceYearly : p.priceMonthly;
          const current = c.plan === p.code && c.active;
          return (
            <article key={p.code} className={`card p-5 flex flex-col gap-3 ${p.code === 'pro' ? 'border-2 border-brand' : ''}`}>
              {p.code === 'pro' && <span className="self-start text-xs font-bold px-2.5 py-1 rounded-full bg-brand text-white">Best value</span>}
              <h2 className="text-xl font-extrabold">{p.name}</h2>
              <p><span className="text-3xl font-extrabold">{inr(price)}</span> <span className="text-sm text-muted">/ {cycle === 'yearly' ? 'year' : 'month'}</span></p>
              {p.description && <p className="text-sm text-muted">{p.description}</p>}
              <ul className="text-sm flex flex-col gap-1">
                <li>👥 {p.maxUsers === 0 ? 'Unlimited users' : `${p.maxUsers} user${p.maxUsers > 1 ? 's' : ''}`}</li>
                {p.modules.filter((m) => m !== 'management').map((m) => <li key={m}>✓ {MODULE_INFO[m]?.label || m}</li>)}
                <li>✓ Online shop, reports</li>
              </ul>
              <div className="mt-auto pt-2">
                {p.code === 'free' ? (
                  <button type="button" className="btn-ghost w-full" disabled={current || !!pending} onClick={() => setPicked(p)}>{current ? 'Current plan' : 'Switch to Free'}</button>
                ) : (
                  <button type="button" className="btn-primary w-full" disabled={!!pending} onClick={() => setPicked(p)}>{current ? 'Renew' : c.plan === p.code ? 'Renew' : 'Choose'} {p.name}</button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {data.requests.length > 0 && (
        <section className="card p-5 flex flex-col gap-2">
          <h2 className="font-bold">Request history</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <tbody>
                {data.requests.map((r) => (
                  <tr key={r.id} className="border-t border-gray-100">
                    <td className="py-2.5">{fmtDate(r.createdAt)}</td>
                    <td className="py-2.5 font-semibold">{r.planCode.toUpperCase()} · {r.cycle}</td>
                    <td className="py-2.5">{inr(r.amount)} · {MODE[r.paymentMode]}</td>
                    <td className="py-2.5">{r.validTill ? `till ${fmtDate(r.validTill)}` : r.adminNote || ''}</td>
                    <td className="py-2.5 text-right"><span className={`text-xs font-bold px-2.5 py-1 rounded-full ${STATUS[r.status][1]}`}>{STATUS[r.status][0]}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {picked && <RequestForm plan={picked} cycle={cycle} payTo={data.payTo} onClose={() => setPicked(null)} onSent={() => { setPicked(null); reload(); refresh(); }} />}
    </div>
  );
}
