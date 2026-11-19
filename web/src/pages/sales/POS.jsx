import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { ErrorBox, Modal, useApi } from '../../components/ui.jsx';
import { inr, inrExact, MODE_LABEL } from '../../lib/format.js';
import { printReceipt } from '../../lib/print.js';
import { shareBillPdf } from '../../lib/billPdf.js';
import { canScan } from '../../lib/barcode.js';

const HOLD_KEY = 'bm_pos_held';
const readHeld = () => {
  try { return JSON.parse(localStorage.getItem(HOLD_KEY) || '[]'); } catch { return []; }
};
const withTax = (price, tax) => Math.round(price * (1 + tax / 100) * 100) / 100;

function totals(cart, pct) {
  const sub = cart.reduce((a, l) => a + l.qty * l.rate, 0);
  const disc = Math.round(sub * (Number(pct) || 0)) / 100;
  const f = sub > 0 ? (sub - disc) / sub : 1;
  const tax = cart.reduce((a, l) => a + l.qty * l.rate * f * (l.taxRate / 100), 0);
  return { sub, disc, tax, total: Math.round(sub - disc + tax) };
}

function CameraScan({ onCode, onClose }) {
  const video = useRef(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let stream;
    let stop = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        video.current.srcObject = stream;
        await video.current.play();
        const det = new window.BarcodeDetector();
        const tick = async () => {
          if (stop) return;
          try {
            const found = await det.detect(video.current);
            if (found[0]?.rawValue) return onCode(found[0].rawValue);
          } catch { /* keep trying */ }
          setTimeout(tick, 250);
        };
        tick();
      } catch {
        setErr('Camera open avvaledu. Browser lo camera permission ivvandi.');
      }
    })();
    return () => { stop = true; stream?.getTracks().forEach((t) => t.stop()); };
  }, [onCode]);
  return (
    <Modal title="Scan barcode" onClose={onClose}>
      <ErrorBox>{err}</ErrorBox>
      <video ref={video} className="w-full rounded-xl bg-black aspect-video object-cover" muted playsInline />
      <p className="text-sm text-muted mt-2">Barcode ni camera mundu pettandi.</p>
    </Modal>
  );
}

export default function POS() {
  const { data, error } = useApi('/items');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [cart, setCart] = useState([]);
  const [pct, setPct] = useState('');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [sizeFor, setSizeFor] = useState(null);
  const [paying, setPaying] = useState(false);
  const [split, setSplit] = useState({ cash: '', upi: '', card: '' });
  const [done, setDone] = useState(null);
  const [held, setHeld] = useState(readHeld);
  const [scan, setScan] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [width, setWidth] = useState(localStorage.getItem('bm_receipt_width') || '80');
  const search = useRef(null);

  const items = (data?.items || []).filter((i) => i.active !== false);
  const cats = useMemo(() => [...new Set(items.map((i) => i.category).filter(Boolean))], [items]);
  const shown = items.filter((i) => (!cat || i.category === cat) && (!q || `${i.name} ${i.sku || ''} ${i.barcode || ''}`.toLowerCase().includes(q.toLowerCase())));
  const t = totals(cart, pct);

  const add = (it, v = null) => {
    if (!v && it.variants?.length) return setSizeFor(it);
    const key = `${it.id}|${v?.id || ''}`;
    setCart((c) => {
      const ex = c.find((l) => l.key === key);
      if (ex) return c.map((l) => (l.key === key ? { ...l, qty: l.qty + 1 } : l));
      return [...c, { key, itemId: it.id, variantId: v?.id || null, name: v ? `${it.name} (${v.name})` : it.name, rate: Number(v ? v.price : it.price), taxRate: Number(it.taxRate), unit: it.unit, qty: 1 }];
    });
    setSizeFor(null);
  };
  const setQty = (key, qty) => setCart((c) => (qty <= 0 ? c.filter((l) => l.key !== key) : c.map((l) => (l.key === key ? { ...l, qty } : l))));

  // USB barcode scanners type the code + Enter into the search box.
  const findCode = (code) => {
    const c = code.trim().toLowerCase();
    const it = items.find((i) => (i.barcode || '').toLowerCase() === c || (i.sku || '').toLowerCase() === c);
    if (it) { add(it); setQ(''); return true; }
    return false;
  };
  const onSearchKey = (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (findCode(q)) return;
    if (shown.length === 1) { add(shown[0]); setQ(''); }
  };

  const reset = () => { setCart([]); setPct(''); setPhone(''); setName(''); setSplit({ cash: '', upi: '', card: '' }); setErr(''); search.current?.focus(); };
  const hold = () => {
    if (!cart.length) return;
    const next = [...held, { id: Date.now(), at: new Date().toISOString(), cart, pct, phone, name }];
    setHeld(next);
    localStorage.setItem(HOLD_KEY, JSON.stringify(next));
    reset();
  };
  const resume = (h) => {
    if (cart.length && !window.confirm('Current bill hold cheyyakunda clear avtundi. OK?')) return;
    setCart(h.cart); setPct(h.pct); setPhone(h.phone); setName(h.name);
    const next = held.filter((x) => x.id !== h.id);
    setHeld(next);
    localStorage.setItem(HOLD_KEY, JSON.stringify(next));
  };

  const pay = async (payments) => {
    setErr('');
    setBusy(true);
    try {
      const r = await api('/invoices/pos', { method: 'POST', body: {
        phone, customerName: name, discount: t.disc,
        lines: cart.map((l) => ({ itemId: l.itemId, variantId: l.variantId, qty: l.qty })),
        payments: payments.filter((p) => p.amount > 0),
      } });
      setDone(r);
      setPaying(false);
      reset();
    } catch (x) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  };
  const splitTotal = ['cash', 'upi', 'card'].reduce((a, k) => a + (Number(split[k]) || 0), 0);

  useEffect(() => { search.current?.focus(); }, []);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-extrabold">🧾 POS Counter</h1>
        <div className="flex items-center gap-2 text-sm">
          <label htmlFor="rw" className="font-semibold">Printer</label>
          <select id="rw" className="input h-9 w-auto" value={width} onChange={(e) => { setWidth(e.target.value); localStorage.setItem('bm_receipt_width', e.target.value); }}>
            <option value="80">80 mm</option><option value="58">58 mm</option>
          </select>
          <Link to="/ops/labels" className="btn-ghost h-9 px-3">Barcode labels</Link>
        </div>
      </div>
      <ErrorBox>{error}</ErrorBox>
      <div className="grid lg:grid-cols-[1fr_380px] gap-4 items-start">
        <section className="flex flex-col gap-3">
          <div className="flex gap-2">
            <label htmlFor="pos-q" className="sr-only">Search or scan</label>
            <input id="pos-q" ref={search} className="input" placeholder="Search item / scan barcode + Enter" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onSearchKey} />
            {canScan() && <button type="button" className="btn-ghost shrink-0" onClick={() => setScan(true)}>📷 Scan</button>}
          </div>
          {cats.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {['', ...cats].map((c) => (
                <button key={c || 'all'} type="button" onClick={() => setCat(c)} className={`h-9 px-3 rounded-full text-sm font-semibold whitespace-nowrap border ${cat === c ? 'bg-brand text-white border-brand' : 'bg-white border-line'}`}>{c || 'All'}</button>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2">
            {shown.map((it) => {
              const out = it.trackStock && Number(it.stock) <= 0;
              return (
                <button key={it.id} type="button" onClick={() => add(it)} className={`card p-3 text-left flex flex-col gap-1 hover:border-brand active:scale-[.98] ${out ? 'opacity-60' : ''}`}>
                  {it.images?.[0] && <img src={it.images[0]} alt="" className="w-full h-20 object-cover rounded-lg" />}
                  <span className="font-semibold text-sm leading-tight">{it.name}</span>
                  <span className="text-sm font-bold text-brand">{it.variants?.length ? `${it.variants.length} sizes` : inr(withTax(Number(it.price), Number(it.taxRate)))}</span>
                  {it.trackStock && <span className={`text-xs ${out ? 'text-red-700 font-bold' : 'text-muted'}`}>{out ? 'Out of stock' : `Stock ${Number(it.stock)}`}</span>}
                </button>
              );
            })}
            {data && shown.length === 0 && <p className="text-muted col-span-full">Items levu. <Link to="/sales/items" className="text-brand font-semibold">Items add cheyyandi</Link></p>}
          </div>
        </section>

        <aside className="card p-4 flex flex-col gap-3 lg:sticky lg:top-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">Bill ({cart.reduce((a, l) => a + l.qty, 0)} items)</h2>
            {cart.length > 0 && <button type="button" className="text-xs font-semibold text-red-700" onClick={reset}>Clear</button>}
          </div>
          {cart.length === 0 ? <p className="text-sm text-muted py-6 text-center">Items tap / scan cheyyandi</p> : (
            <ul className="flex flex-col divide-y divide-gray-100 max-h-[40vh] overflow-y-auto">
              {cart.map((l) => (
                <li key={l.key} className="py-2 flex items-center gap-2">
                  <span className="flex-1 text-sm"><b>{l.name}</b><span className="block text-xs text-muted">{inrExact(withTax(l.rate, l.taxRate))} each</span></span>
                  <button type="button" aria-label={`Less ${l.name}`} className="w-8 h-8 rounded-lg border border-line font-bold" onClick={() => setQty(l.key, l.qty - 1)}>−</button>
                  <input type="number" min="0" step="any" aria-label={`Quantity ${l.name}`} className="w-14 h-8 text-center border border-line rounded-lg" value={l.qty} onChange={(e) => setQty(l.key, Number(e.target.value))} />
                  <button type="button" aria-label={`More ${l.name}`} className="w-8 h-8 rounded-lg border border-line font-bold" onClick={() => setQty(l.key, l.qty + 1)}>+</button>
                </li>
              ))}
            </ul>
          )}
          <div className="grid grid-cols-2 gap-2">
            <input aria-label="Customer mobile (optional)" inputMode="numeric" maxLength={10} className="input h-10" placeholder="Mobile (optional)" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} />
            <input aria-label="Customer name" className="input h-10" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <label className="flex items-center justify-between text-sm">Discount %
            <input type="number" min="0" max="100" step="any" className="input h-9 w-20" value={pct} onChange={(e) => setPct(e.target.value)} />
          </label>
          <div className="text-sm flex flex-col gap-1 border-t border-line pt-2">
            <div className="flex justify-between"><span>Subtotal</span><span>{inrExact(t.sub)}</span></div>
            {t.disc > 0 && <div className="flex justify-between text-green-800"><span>Discount</span><span>−{inrExact(t.disc)}</span></div>}
            <div className="flex justify-between"><span>GST</span><span>{inrExact(t.tax)}</span></div>
            <div className="flex justify-between text-xl font-extrabold"><span>Total</span><span>{inr(t.total)}</span></div>
          </div>
          <ErrorBox>{err}</ErrorBox>
          <div className="grid grid-cols-3 gap-2">
            {['cash', 'upi', 'card'].map((m) => (
              <button key={m} type="button" disabled={!cart.length || busy} className="h-12 rounded-xl bg-green-600 text-white font-bold disabled:opacity-40" onClick={() => pay([{ mode: m, amount: t.total }])}>{MODE_LABEL[m]}</button>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button type="button" disabled={!cart.length} className="btn-ghost h-10 px-2 text-sm" onClick={() => setPaying(true)}>Split pay</button>
            <button type="button" disabled={!cart.length || busy} className="btn-ghost h-10 px-2 text-sm" onClick={() => pay([])} title="Customer mobile kavali">Udhaar</button>
            <button type="button" disabled={!cart.length} className="btn-ghost h-10 px-2 text-sm" onClick={hold}>Hold</button>
          </div>
          {held.length > 0 && (
            <div className="border-t border-line pt-2">
              <p className="text-xs font-semibold text-muted mb-1">Held bills</p>
              <div className="flex flex-wrap gap-1.5">
                {held.map((h) => <button key={h.id} type="button" className="text-xs px-2.5 py-1.5 rounded-lg bg-amber-100 text-amber-900 font-semibold" onClick={() => resume(h)}>{h.name || h.phone || new Date(h.at).toLocaleTimeString('en-IN', { timeStyle: 'short' })} · {h.cart.length}</button>)}
              </div>
            </div>
          )}
        </aside>
      </div>

      {sizeFor && (
        <Modal title={sizeFor.name} onClose={() => setSizeFor(null)}>
          <div className="grid grid-cols-2 gap-2">
            {sizeFor.variants.map((v) => (
              <button key={v.id} type="button" className="card p-3 text-left hover:border-brand" onClick={() => add(sizeFor, v)}>
                <b>{v.name}</b><span className="block text-brand font-bold">{inr(withTax(Number(v.price), Number(sizeFor.taxRate)))}</span>
                {sizeFor.trackStock && <span className="text-xs text-muted">{sizeFor.sharedStock ? `Stock ${Number(sizeFor.stock)} ${sizeFor.unit}` : `Stock ${Number(v.stock) || 0}`}</span>}
              </button>
            ))}
          </div>
        </Modal>
      )}
      {paying && (
        <Modal title={`Split payment · ${inr(t.total)}`} onClose={() => setPaying(false)}>
          <div className="flex flex-col gap-3">
            {['cash', 'upi', 'card'].map((m) => (
              <label key={m} className="flex items-center justify-between gap-3 text-sm font-semibold">{MODE_LABEL[m]}
                <input type="number" min="0" step="0.01" className="input h-10 w-40" value={split[m]} onChange={(e) => setSplit({ ...split, [m]: e.target.value })} />
              </label>
            ))}
            <p className="text-sm">Paid {inr(splitTotal)} · {splitTotal < t.total ? <span className="text-red-700 font-semibold">Balance {inr(t.total - splitTotal)} (udhaar)</span> : 'Full paid'}</p>
            <ErrorBox>{err}</ErrorBox>
            <button type="button" className="btn-primary" disabled={busy} onClick={() => pay(['cash', 'upi', 'card'].map((m) => ({ mode: m, amount: Number(split[m]) || 0 })))}>{busy ? 'Saving…' : 'Save bill'}</button>
          </div>
        </Modal>
      )}
      {done && (
        <Modal title={`✅ ${done.invoice.number} saved · ${inr(done.invoice.total)}`} onClose={() => setDone(null)}>
          <div className="flex flex-col gap-2">
            <button type="button" className="btn-primary" onClick={() => printReceipt(done.invoice, done.business, width)}>🖨️ Print receipt</button>
            <button type="button" className="btn bg-green-600 text-white" onClick={() => shareBillPdf(done.invoice, done.business, { message: `${done.business.name} – ${done.invoice.number}` }).catch((x) => setErr(x.message))}>📄 Share PDF (WhatsApp)</button>
            <Link to={`/sales/invoices/${done.invoice.id}`} className="btn-ghost">Open invoice</Link>
            <button type="button" className="btn-ghost" onClick={() => { setDone(null); search.current?.focus(); }}>Next bill →</button>
          </div>
        </Modal>
      )}
      {scan && <CameraScan onClose={() => setScan(false)} onCode={(c) => { setScan(false); if (!findCode(c)) setErr(`Barcode ${c} – item dorakaledu`); }} />}
    </div>
  );
}
