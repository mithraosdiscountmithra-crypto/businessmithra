import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { MODULE_INFO, MODULE_ORDER } from '../constants.js';

export default function Settings() {
  const { refresh } = useAuth();
  const [b, setB] = useState(null);
  const [mods, setMods] = useState([]);
  const [msg, setMsg] = useState({ ok: '', err: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [{ business }, { modules }] = await Promise.all([api('/settings/business'), api('/settings/modules')]);
        setB({
          name: business.name || '', phone: business.phone || '', email: business.email || '',
          gstin: business.gstin || '', address: business.address || '', city: business.city || '', state: business.state || '',
          invoicePrefix: business.invoicePrefix || 'INV-', quotePrefix: business.quotePrefix || 'QT-',
          invoiceTerms: business.invoiceTerms || '', bankDetails: business.bankDetails || '',
        });
        setMods(modules);
      } catch (e) {
        setMsg({ ok: '', err: e.message });
      }
    })();
  }, []);

  const set = (k) => (e) => setB({ ...b, [k]: e.target.value });

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMsg({ ok: '', err: '' });
    try {
      await api('/settings/business', { method: 'PUT', body: b });
      await refresh();
      setMsg({ ok: 'Saved', err: '' });
    } catch (err) {
      setMsg({ ok: '', err: err.message });
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (module, enabled) => {
    setMods(mods.map((m) => (m.module === module ? { ...m, enabled } : m)));
    try {
      await api('/settings/modules', { method: 'PUT', body: { module, enabled } });
      await refresh();
    } catch (err) {
      setMods(mods);
      setMsg({ ok: '', err: err.message });
    }
  };

  if (!b) return <p className="text-muted">{msg.err || 'Loading…'}</p>;

  const fields = [
    ['name', 'Business name'], ['phone', 'Mobile number'], ['email', 'Email'], ['gstin', 'GSTIN (optional)'],
    ['city', 'Town / City'], ['state', 'State'],
  ];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-extrabold">Settings</h1>
      {msg.err && <div className="error-box" role="alert">{msg.err}</div>}

      <form onSubmit={save} className="card p-5 lg:p-6 flex flex-col gap-4">
        <h2 className="text-lg font-bold">Business details</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {fields.map(([k, label]) => (
            <div key={k}>
              <label className="label" htmlFor={`f-${k}`}>{label}</label>
              <input id={`f-${k}`} className="input" value={b[k]} onChange={set(k)} />
            </div>
          ))}
          <div className="sm:col-span-2">
            <label className="label" htmlFor="f-address">Address</label>
            <textarea id="f-address" rows={2} className="input h-auto py-2.5" value={b.address} onChange={set('address')} />
          </div>
        </div>
        <h2 className="text-lg font-bold pt-2">Invoice settings</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="f-ip">Invoice number prefix</label>
            <input id="f-ip" className="input" value={b.invoicePrefix} onChange={set('invoicePrefix')} />
            <p className="text-xs text-muted mt-1">e.g. INV- → INV-1, INV-2…</p>
          </div>
          <div>
            <label className="label" htmlFor="f-qp">Quotation number prefix</label>
            <input id="f-qp" className="input" value={b.quotePrefix} onChange={set('quotePrefix')} />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="f-bank">Bank / UPI details (invoice lo print avutundi)</label>
            <textarea id="f-bank" rows={2} className="input h-auto py-2.5" value={b.bankDetails} onChange={set('bankDetails')} placeholder="SBI A/c 1234… IFSC SBIN000… · UPI: shop@upi" />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="f-terms">Terms & conditions</label>
            <textarea id="f-terms" rows={2} className="input h-auto py-2.5" value={b.invoiceTerms} onChange={set('invoiceTerms')} placeholder="Goods once sold will not be taken back." />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
          {msg.ok && <span className="text-sm font-semibold text-green-700">{msg.ok}</span>}
        </div>
      </form>

      <section className="card p-5 lg:p-6 flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-bold">Modules ON / OFF</h2>
          <p className="text-sm text-muted">OFF chesina module menu lo kanipinchadu, staff kooda vaadalekaru.</p>
        </div>
        <ul className="divide-y divide-line">
          {MODULE_ORDER.map((m) => {
            const row = mods.find((x) => x.module === m);
            const on = !!row?.enabled;
            const locked = m === 'management' || row?.inPlan === false;
            return (
              <li key={m} className="flex items-center justify-between gap-4 py-3">
                <div>
                  <p className="font-semibold">{MODULE_INFO[m].label}</p>
                  <p className="text-sm text-muted">{m === 'management' ? 'Always on' : row?.inPlan === false ? 'Mee plan lo ledu – Plan & Billing lo upgrade cheyyandi' : MODULE_INFO[m].desc}</p>
                </div>
                <label className={`relative inline-flex items-center ${locked ? 'opacity-60' : 'cursor-pointer'}`}>
                  <span className="sr-only">{MODULE_INFO[m].label}</span>
                  <input type="checkbox" className="sr-only peer" checked={on && row?.inPlan !== false} disabled={locked} onChange={(e) => toggle(m, e.target.checked)} />
                  <span className="w-12 h-7 rounded-full bg-gray-300 peer-checked:bg-brand transition after:content-[''] after:absolute after:top-1 after:left-1 after:w-5 after:h-5 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-brand/40" />
                </label>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
