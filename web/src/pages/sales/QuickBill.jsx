import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { ErrorBox } from '../../components/ui.jsx';
import Icon from '../../components/Icon.jsx';
import { fmtDate, inrExact, MODE_LABEL } from '../../lib/format.js';

const GST = [5, 12, 18, 28, 3];
const newLine = () => ({ key: Math.random().toString(36).slice(2), name: '', qty: 1, amount: '' });
const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

function buildMessage(inv, business, url, discountPct, gstRate) {
  const sep = '------------------------';
  const lines = inv.items.map((l) => `${l.name}${Number(l.qty) !== 1 ? ` × ${Number(l.qty)}` : ''} — ${inrExact(Number(l.amount))}`);
  const due = Number(inv.total) - Number(inv.amountPaid);
  return [
    `*${business.name}*`,
    [business.address, business.city].filter(Boolean).join(', '),
    [business.phone && `📞 ${business.phone}`, business.gstin && `GSTIN: ${business.gstin}`].filter(Boolean).join(' | '),
    sep,
    `Bill No: ${inv.number} | ${fmtDate(inv.date)}`,
    inv.customer?.name && !inv.customer.name.startsWith('Customer ') ? `Customer: ${inv.customer.name}` : null,
    sep,
    ...lines,
    sep,
    `Subtotal: ${inrExact(inv.subtotal)}`,
    Number(inv.discount) > 0 ? `Discount (${discountPct}%): −${inrExact(inv.discount)}` : null,
    Number(inv.taxTotal) > 0 ? `GST (${gstRate}%): ${inrExact(inv.taxTotal)}  [CGST ${inrExact(inv.cgst)} + SGST ${inrExact(inv.sgst)}]` : null,
    Number(inv.roundOff) !== 0 ? `Round off: ${inrExact(inv.roundOff)}` : null,
    `*Total: ${inrExact(inv.total)}*`,
    due <= 0 ? `Paid ✅${inv.payments?.[0] ? ` (${MODE_LABEL[inv.payments[0].mode] || inv.payments[0].mode})` : ''}` : `Balance due: ${inrExact(due)}`,
    business.bankDetails && due > 0 ? `Pay to: ${business.bankDetails}` : null,
    sep,
    `Bill chudandi / download: ${url}`,
    'Thank you! 🙏',
  ].filter((x) => x !== null && x !== '').join('\n');
}

export default function QuickBill() {
  const { me } = useAuth();
  const b = me.business;
  const [lines, setLines] = useState([newLine()]);
  const [gstOn, setGstOn] = useState(false);
  const [gstRate, setGstRate] = useState(5);
  const [discOn, setDiscOn] = useState(false);
  const [discountPct, setDiscountPct] = useState('');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [paid, setPaid] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null); // { invoice, waUrl }

  const t = useMemo(() => {
    const gross = lines.map((l) => r2((Number(l.qty) || 0) * (Number(l.amount) || 0)));
    const subtotal = r2(gross.reduce((a, x) => a + x, 0));
    const disc = discOn ? r2((subtotal * (Number(discountPct) || 0)) / 100) : 0;
    const taxable = subtotal - disc;
    const gst = gstOn ? r2((taxable * gstRate) / 100) : 0;
    const raw = r2(taxable + gst);
    const total = Math.round(raw);
    return { gross, subtotal, disc, gst, roundOff: r2(total - raw), total };
  }, [lines, gstOn, gstRate, discOn, discountPct]);

  const setLine = (key, patch) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const send = async (e) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const r = await api('/invoices/quick', {
        method: 'POST',
        body: {
          phone: phone.trim(), customerName: name,
          lines: lines.filter((l) => l.name.trim() || Number(l.amount)).map((l) => ({ name: l.name, qty: Number(l.qty) || 1, amount: Number(l.amount) })),
          gstRate: gstOn ? gstRate : 0, discountPct: discOn ? Number(discountPct) || 0 : 0, paidMode: paid || null,
        },
      });
      const url = `${window.location.origin}/i/${r.invoice.shareToken}`;
      const text = buildMessage(r.invoice, b, url, discOn ? Number(discountPct) || 0 : 0, gstOn ? gstRate : 0);
      const waUrl = `https://wa.me/91${phone.trim()}?text=${encodeURIComponent(text)}`;
      setDone({ invoice: r.invoice, waUrl });
      window.location.href = waUrl; // opens WhatsApp with the bill ready to send
    } catch (x) {
      setErr(x.message);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setLines([newLine()]);
    setPhone('');
    setName('');
    setPaid('');
    setDone(null);
    setErr('');
  };

  if (done) {
    return (
      <div className="max-w-lg mx-auto flex flex-col gap-4 text-center">
        <div className="card p-6 flex flex-col gap-2 items-center">
          <span className="w-14 h-14 rounded-full bg-green-600 text-white text-2xl flex items-center justify-center" aria-hidden="true">✓</span>
          <h1 className="text-xl font-extrabold">Bill {done.invoice.number} ready</h1>
          <p className="text-muted">{inrExact(done.invoice.total)} · +91 {phone}</p>
        </div>
        <a href={done.waUrl} className="btn h-14 text-base bg-green-600 text-white hover:bg-green-700">Open WhatsApp & Send</a>
        <div className="flex gap-2">
          <Link to={`/sales/invoices/${done.invoice.id}`} className="btn-ghost flex-1">View / Print bill</Link>
          <button type="button" className="btn-primary flex-1" onClick={reset}>⚡ New bill</button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={send} className="max-w-2xl mx-auto flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold">⚡ Send Bill</h1>
        <Link to="/sales/invoices/new" className="text-sm font-semibold text-brand">Full GST invoice →</Link>
      </div>
      <ErrorBox>{err}</ErrorBox>

      <section className="card p-5 flex flex-col gap-1 border-t-4" style={{ borderTopColor: '#3730A3' }}>
        <p className="text-lg font-extrabold">{b.name}</p>
        {(b.address || b.city) && <p className="text-sm text-gray-700">{[b.address, b.city, b.state].filter(Boolean).join(', ')}</p>}
        <p className="text-sm text-gray-700">{[b.phone && `📞 ${b.phone}`, b.email].filter(Boolean).join(' · ')}</p>
        {b.gstin && <p className="text-sm font-semibold">GSTIN: {b.gstin}</p>}
        {(!b.address || !b.gstin) && me.user.isOwner && <Link to="/settings" className="text-xs font-semibold text-brand mt-1">Address / GSTIN add cheyyandi (Settings) →</Link>}
      </section>

      <section className="card p-5 flex flex-col gap-3">
        <h2 className="font-bold">Services / items</h2>
        {lines.map((l, i) => (
          <div key={l.key} className="grid grid-cols-12 gap-2 items-end">
            <div className="col-span-12 sm:col-span-6">
              <label className="label" htmlFor={`qn-${l.key}`}>{i === 0 ? 'Service / item name' : <span className="sr-only">Service / item name</span>}</label>
              <input id={`qn-${l.key}`} className="input" value={l.name} onChange={(e) => setLine(l.key, { name: e.target.value })} placeholder="e.g. Haircut, AC service, Saree" />
            </div>
            <div className="col-span-3 sm:col-span-2">
              <label className="label" htmlFor={`qq-${l.key}`}>{i === 0 ? 'Qty' : <span className="sr-only">Qty</span>}</label>
              <input id={`qq-${l.key}`} type="number" min="0.001" step="any" className="input px-2" value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value })} />
            </div>
            <div className="col-span-7 sm:col-span-3">
              <label className="label" htmlFor={`qa-${l.key}`}>{i === 0 ? 'Amount ₹' : <span className="sr-only">Amount</span>}</label>
              <input id={`qa-${l.key}`} type="number" min="0" step="0.01" inputMode="decimal" className="input" value={l.amount} onChange={(e) => setLine(l.key, { amount: e.target.value })} />
            </div>
            <button type="button" aria-label={`Remove line ${i + 1}`} disabled={lines.length === 1} onClick={() => setLines(lines.filter((x) => x.key !== l.key))} className="col-span-2 sm:col-span-1 h-11 rounded-xl text-red-700 hover:bg-red-50 disabled:opacity-30 flex items-center justify-center">
              <Icon name="close" />
            </button>
          </div>
        ))}
        <button type="button" className="btn-ghost self-start" onClick={() => setLines([...lines, newLine()])}><Icon name="plus" size={18} /> Add line</button>
      </section>

      <section className="card p-5 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 font-semibold"><input type="checkbox" className="w-5 h-5 accent-brand" checked={discOn} onChange={(e) => setDiscOn(e.target.checked)} /> Discount</label>
          {discOn && (
            <div className="flex items-center gap-1">
              <label className="sr-only" htmlFor="q-disc">Discount percent</label>
              <input id="q-disc" type="number" min="0" max="100" step="0.01" className="input h-10 w-24" value={discountPct} onChange={(e) => setDiscountPct(e.target.value)} placeholder="10" />
              <span className="font-bold">%</span>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 font-semibold"><input type="checkbox" className="w-5 h-5 accent-brand" checked={gstOn} onChange={(e) => setGstOn(e.target.checked)} /> GST</label>
          {gstOn && (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="GST rate">
              {GST.map((g) => (
                <button key={g} type="button" aria-pressed={gstRate === g} onClick={() => setGstRate(g)} className={`h-10 px-3 rounded-lg border text-sm font-bold ${gstRate === g ? 'bg-brand text-white border-brand' : 'bg-white border-line'}`}>{g}%</button>
              ))}
            </div>
          )}
        </div>
        {gstOn && <p className="text-xs text-muted">GST amount meeda add avutundi (CGST + SGST).</p>}

        <div className="border-t border-line pt-3 flex flex-col gap-1 text-sm">
          <div className="flex justify-between"><span>Subtotal</span><span>{inrExact(t.subtotal)}</span></div>
          {t.disc > 0 && <div className="flex justify-between text-green-800"><span>Discount ({Number(discountPct) || 0}%)</span><span>− {inrExact(t.disc)}</span></div>}
          {t.gst > 0 && <div className="flex justify-between"><span>GST ({gstRate}%)</span><span>{inrExact(t.gst)}</span></div>}
          {t.roundOff !== 0 && <div className="flex justify-between text-muted"><span>Round off</span><span>{inrExact(t.roundOff)}</span></div>}
          <div className="flex justify-between text-2xl font-extrabold pt-1"><span>Total</span><span>{inrExact(t.total)}</span></div>
        </div>
      </section>

      <section className="card p-5 flex flex-col gap-3">
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="q-phone">Customer WhatsApp number</label>
            <div className="flex items-center rounded-xl border border-gray-300 bg-white overflow-hidden focus-within:border-brand">
              <span className="pl-3 text-muted font-semibold">+91</span>
              <input id="q-phone" required inputMode="numeric" maxLength={10} className="flex-1 h-11 px-2 outline-none text-[15px]" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="q-name">Customer name (optional)</label>
            <input id="q-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">Payment:</span>
          {[['', 'Not paid yet'], ['cash', 'Cash'], ['upi', 'UPI'], ['card', 'Card']].map(([v, l]) => (
            <button key={v || 'none'} type="button" aria-pressed={paid === v} onClick={() => setPaid(v)} className={`h-10 px-3 rounded-lg border text-sm font-bold ${paid === v ? 'bg-ink text-white border-ink' : 'bg-white border-line'}`}>{l}</button>
          ))}
        </div>
        <button type="submit" disabled={busy || t.total <= 0} className="btn h-14 text-base bg-green-600 text-white hover:bg-green-700 disabled:opacity-50">
          {busy ? 'Creating bill…' : `Send on WhatsApp · ${inrExact(t.total)}`}
        </button>
        <p className="text-xs text-muted text-center">Bill automatic ga Invoices, Customers, Accounts lo save avutundi.</p>
      </section>
    </form>
  );
}
