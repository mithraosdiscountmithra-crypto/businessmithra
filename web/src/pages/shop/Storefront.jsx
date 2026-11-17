import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { inr } from '../../lib/format.js';

const CART_KEY = (slug) => `bm_cart_${slug}`;
const loadCart = (slug) => {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY(slug)) || '{}');
  } catch {
    return {};
  }
};
const saveCart = (slug, cart) => {
  try {
    localStorage.setItem(CART_KEY(slug), JSON.stringify(cart));
  } catch {
    /* storage blocked – cart still works for this visit */
  }
};

function Sheet({ title, onClose, children }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50" role="dialog" aria-modal="true" aria-label={title}>
      <div className="bg-white w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl">
        <div className="sticky top-0 bg-white flex items-center justify-between px-5 py-4 border-b border-gray-100 z-10">
          <h2 className="text-lg font-extrabold">{title}</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="w-11 h-11 -mr-2 rounded-full hover:bg-gray-100 text-2xl leading-none">×</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function ItemCard({ it, qty, color, onAdd, onDec, onBook, onAsk, onOpen }) {
  const img = it.images[0];
  const off = it.mrp && it.mrp > it.price ? Math.round(((it.mrp - it.price) / it.mrp) * 100) : 0;
  return (
    <article className="bg-white rounded-2xl border border-gray-200 overflow-hidden flex flex-col">
      <button type="button" onClick={onOpen} className="relative aspect-square bg-gray-100 block w-full" aria-label={`View ${it.name}`}>
        {img ? <img src={img} alt={it.name} loading="lazy" className="w-full h-full object-cover" /> : <span className="absolute inset-0 flex items-center justify-center text-4xl font-extrabold text-gray-300">{it.name.slice(0, 1)}</span>}
        {off > 0 && <span className="absolute top-2 left-2 text-xs font-extrabold bg-green-700 text-white px-2 py-1 rounded-lg">{off}% OFF</span>}
        {!it.inStock && <span className="absolute inset-0 bg-white/70 flex items-center justify-center font-bold text-gray-800">Out of stock</span>}
      </button>
      <div className="p-3 flex flex-col gap-1.5 flex-1">
        <h3 className="text-sm font-bold leading-snug line-clamp-2">{it.name}</h3>
        <div className="flex items-baseline gap-2">
          <span className="font-extrabold">{inr(it.price)}</span>
          {off > 0 && <span className="text-xs text-gray-500 line-through">{inr(it.mrp)}</span>}
        </div>
        <div className="mt-auto pt-1 flex gap-1.5">
          {it.type === 'service' && onBook ? (
            <button type="button" onClick={onBook} className="flex-1 h-10 rounded-xl text-white text-sm font-bold" style={{ background: color }}>Book</button>
          ) : !it.inStock ? (
            <button type="button" onClick={onAsk} className="flex-1 h-10 rounded-xl border border-gray-300 text-sm font-bold">Ask</button>
          ) : qty > 0 ? (
            <div className="flex-1 flex items-center justify-between h-10 rounded-xl text-white font-bold" style={{ background: color }}>
              <button type="button" aria-label={`Remove one ${it.name}`} onClick={onDec} className="w-10 h-10 text-xl">−</button>
              <span aria-live="polite">{qty}</span>
              <button type="button" aria-label={`Add one more ${it.name}`} onClick={onAdd} className="w-10 h-10 text-xl">+</button>
            </div>
          ) : (
            <button type="button" onClick={onAdd} className="flex-1 h-10 rounded-xl text-white text-sm font-bold" style={{ background: color }}>Add</button>
          )}
        </div>
      </div>
    </article>
  );
}

export default function Storefront() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [cart, setCart] = useState(() => loadCart(slug));
  const [cat, setCat] = useState('');
  const [q, setQ] = useState('');
  const [sheet, setSheet] = useState(null); // 'cart' | {type:'item'|'book'|'ask', item}
  const [form, setForm] = useState({ name: '', phone: '', address: '', note: '', fulfilment: 'pickup', preferredAt: '', message: '' });
  const [busy, setBusy] = useState(false);
  const [formErr, setFormErr] = useState('');
  const [sent, setSent] = useState(false);

  useEffect(() => {
    api(`/shop/${slug}`)
      .then((d) => {
        setData(d);
        if (!d.shop.allowPickup && d.shop.allowDelivery) setForm((f) => ({ ...f, fulfilment: 'delivery' }));
        document.title = `${d.shop.name} – Online Shop`;
      })
      .catch((e) => setErr(e.message));
  }, [slug]);

  useEffect(() => saveCart(slug, cart), [slug, cart]);

  const shop = data?.shop;
  const color = shop?.color || '#3730A3';
  const items = data?.items || [];
  const byId = useMemo(() => Object.fromEntries(items.map((i) => [i.id, i])), [items]);
  const categories = useMemo(() => [...new Set(items.map((i) => i.category).filter(Boolean))], [items]);
  const shown = items.filter((i) => (!cat || i.category === cat) && (!q || i.name.toLowerCase().includes(q.toLowerCase())));
  const cartLines = Object.entries(cart).filter(([id, n]) => byId[id] && n > 0).map(([id, n]) => ({ item: byId[id], qty: n }));
  const cartCount = cartLines.reduce((a, l) => a + l.qty, 0);
  const itemsTotal = cartLines.reduce((a, l) => a + l.item.price * l.qty, 0);
  const fee = form.fulfilment === 'delivery' ? shop?.deliveryFee || 0 : 0;

  const add = (id) => setCart((c) => ({ ...c, [id]: (c[id] || 0) + 1 }));
  const dec = (id) => setCart((c) => ({ ...c, [id]: Math.max(0, (c[id] || 0) - 1) }));
  const setF = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const placeOrder = async (e, kind, bookItem) => {
    e.preventDefault();
    setFormErr('');
    setBusy(true);
    try {
      const body = {
        kind,
        name: form.name, phone: form.phone, address: form.address, note: form.note,
        fulfilment: kind === 'booking' ? 'pickup' : form.fulfilment,
        preferredAt: form.preferredAt ? new Date(form.preferredAt).toISOString() : '',
        items: kind === 'booking' ? [{ itemId: bookItem.id, qty: 1 }] : cartLines.map((l) => ({ itemId: l.item.id, qty: l.qty })),
      };
      const r = await api(`/shop/${slug}/orders`, { method: 'POST', body });
      if (kind === 'order') setCart({});
      navigate(`/o/${r.token}`);
    } catch (x) {
      setFormErr(x.message);
    } finally {
      setBusy(false);
    }
  };

  const sendEnquiry = async (e, item) => {
    e.preventDefault();
    setFormErr('');
    setBusy(true);
    try {
      await api(`/shop/${slug}/enquiry`, { method: 'POST', body: { name: form.name, phone: form.phone, message: form.message, itemId: item?.id || null } });
      setSent(true);
    } catch (x) {
      setFormErr(x.message);
    } finally {
      setBusy(false);
    }
  };

  if (err) return <div className="min-h-screen flex items-center justify-center p-6 text-center"><div><p className="text-xl font-bold">Shop not found</p><p className="text-muted mt-1">Ee link lo shop ledu leda temporary ga close ayyindi.</p></div></div>;
  if (!data) return <div className="min-h-screen flex items-center justify-center text-muted">Loading shop…</div>;

  const contactFields = (
    <>
      <div><label className="label" htmlFor="s-name">Mee peru</label><input id="s-name" required className="input" value={form.name} onChange={setF('name')} autoComplete="name" /></div>
      <div><label className="label" htmlFor="s-phone">Mobile number</label><input id="s-phone" required inputMode="numeric" maxLength={10} className="input" value={form.phone} onChange={setF('phone')} autoComplete="tel-national" /></div>
    </>
  );

  return (
    <div className="min-h-screen bg-[#F6F6F8] pb-28">
      <header className="relative">
        <div className="h-40 sm:h-56 w-full bg-gray-200" style={shop.cover ? { backgroundImage: `url(${shop.cover})`, backgroundSize: 'cover', backgroundPosition: 'center' } : { background: `linear-gradient(135deg, ${color}, #111827)` }} />
        <div className="max-w-5xl mx-auto px-4 -mt-12 relative flex items-end gap-4">
          <div className="w-24 h-24 rounded-2xl border-4 border-white bg-white shadow-md overflow-hidden flex items-center justify-center shrink-0">
            {shop.logo ? <img src={shop.logo} alt={`${shop.name} logo`} className="w-full h-full object-cover" /> : <span className="text-3xl font-extrabold" style={{ color }}>{shop.name.slice(0, 1)}</span>}
          </div>
          <div className="pb-1 min-w-0">
            <h1 className="text-xl sm:text-2xl font-extrabold truncate">{shop.name}</h1>
            {shop.tagline && <p className="text-sm text-gray-600 truncate">{shop.tagline}</p>}
          </div>
        </div>
        <div className="max-w-5xl mx-auto px-4 pt-3 flex flex-wrap gap-2 text-sm">
          {shop.phone && <a href={`https://wa.me/91${shop.phone}`} target="_blank" rel="noreferrer" className="h-10 px-4 rounded-xl bg-green-600 text-white font-bold flex items-center">WhatsApp</a>}
          {shop.phone && <a href={`tel:${shop.phone}`} className="h-10 px-4 rounded-xl bg-white border border-gray-300 font-bold flex items-center">Call</a>}
          {(shop.address || shop.city) && <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([shop.name, shop.address, shop.city].filter(Boolean).join(', '))}`} target="_blank" rel="noreferrer" className="h-10 px-4 rounded-xl bg-white border border-gray-300 font-bold flex items-center">Directions</a>}
          <button type="button" onClick={() => { setSent(false); setSheet({ type: 'ask' }); }} className="h-10 px-4 rounded-xl bg-white border border-gray-300 font-bold">Ask a question</button>
        </div>
        <div className="max-w-5xl mx-auto px-4 pt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
          {shop.timings && <span>🕒 {shop.timings}</span>}
          {shop.city && <span>📍 {[shop.address, shop.city].filter(Boolean).join(', ')}</span>}
          {shop.allowDelivery && <span>🚚 Home delivery{shop.deliveryFee ? ` ₹${shop.deliveryFee}` : ' free'}</span>}
          {shop.minOrder > 0 && <span>Min. order {inr(shop.minOrder)}</span>}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 pt-5 flex flex-col gap-4">
        {shop.about && <p className="text-sm text-gray-700 bg-white rounded-2xl border border-gray-200 p-4 whitespace-pre-line">{shop.about}</p>}
        <div className="flex flex-col gap-3 sticky top-0 z-20 bg-[#F6F6F8] py-2">
          <label className="sr-only" htmlFor="shop-q">Search</label>
          <input id="shop-q" type="search" className="input bg-white" placeholder={`Search in ${shop.name}`} value={q} onChange={(e) => setQ(e.target.value)} />
          {categories.length > 0 && (
            <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1">
              {['', ...categories].map((c) => (
                <button key={c || 'all'} type="button" aria-pressed={cat === c} onClick={() => setCat(c)} className="h-9 px-4 rounded-full text-sm font-semibold whitespace-nowrap border" style={cat === c ? { background: color, color: '#fff', borderColor: color } : { background: '#fff', borderColor: '#E5E7EB' }}>
                  {c || 'All'}
                </button>
              ))}
            </div>
          )}
        </div>
        {shown.length === 0 ? <p className="text-center text-muted py-10">Items levu.</p> : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {shown.map((it) => (
              <ItemCard
                key={it.id} it={it} qty={cart[it.id] || 0} color={color}
                onAdd={() => add(it.id)} onDec={() => dec(it.id)}
                onBook={shop.allowBooking ? () => setSheet({ type: 'book', item: it }) : null}
                onAsk={() => { setSent(false); setSheet({ type: 'ask', item: it }); }}
                onOpen={() => setSheet({ type: 'item', item: it })}
              />
            ))}
          </div>
        )}
        <p className="text-center text-xs text-gray-500 pt-6">Prices include GST · Powered by BusinessMithra</p>
      </main>

      {cartCount > 0 && (shop.allowPickup || shop.allowDelivery) && (
        <div className="fixed bottom-0 inset-x-0 p-3 z-30">
          <button type="button" onClick={() => setSheet('cart')} className="max-w-xl mx-auto w-full h-14 rounded-2xl text-white font-bold flex items-center justify-between px-5 shadow-lg" style={{ background: color }}>
            <span>{cartCount} item{cartCount > 1 ? 's' : ''} · {inr(itemsTotal)}</span>
            <span>View cart →</span>
          </button>
        </div>
      )}

      {sheet?.type === 'item' && (
        <Sheet title={sheet.item.name} onClose={() => setSheet(null)}>
          <div className="flex flex-col gap-3">
            {sheet.item.images.length > 0 && (
              <div className="flex gap-2 overflow-x-auto snap-x">
                {sheet.item.images.map((src, i) => <img key={src + i} src={src} alt={`${sheet.item.name} photo ${i + 1}`} className="w-full max-w-[420px] aspect-square object-cover rounded-2xl snap-center shrink-0" />)}
              </div>
            )}
            <p className="text-xl font-extrabold">{inr(sheet.item.price)} {sheet.item.mrp > sheet.item.price && <span className="text-sm text-gray-500 line-through font-normal">{inr(sheet.item.mrp)}</span>} <span className="text-xs text-muted font-normal">/ {sheet.item.unit}</span></p>
            {sheet.item.description && <p className="text-sm text-gray-700 whitespace-pre-line">{sheet.item.description}</p>}
            <div className="flex gap-2">
              {sheet.item.type === 'service' && shop.allowBooking ? (
                <button type="button" className="flex-1 h-12 rounded-xl text-white font-bold" style={{ background: color }} onClick={() => setSheet({ type: 'book', item: sheet.item })}>Book appointment</button>
              ) : sheet.item.inStock && (shop.allowPickup || shop.allowDelivery) ? (
                <button type="button" className="flex-1 h-12 rounded-xl text-white font-bold" style={{ background: color }} onClick={() => { add(sheet.item.id); setSheet(null); }}>Add to cart</button>
              ) : null}
              <button type="button" className="flex-1 h-12 rounded-xl border border-gray-300 font-bold" onClick={() => { setSent(false); setSheet({ type: 'ask', item: sheet.item }); }}>Ask a question</button>
            </div>
          </div>
        </Sheet>
      )}

      {sheet === 'cart' && (
        <Sheet title="Your cart" onClose={() => setSheet(null)}>
          <form onSubmit={(e) => placeOrder(e, 'order')} className="flex flex-col gap-4">
            <ul className="flex flex-col divide-y divide-gray-100">
              {cartLines.map((l) => (
                <li key={l.item.id} className="flex items-center gap-3 py-2.5">
                  <div className="flex-1 min-w-0"><p className="font-semibold text-sm truncate">{l.item.name}</p><p className="text-xs text-muted">{inr(l.item.price)} each</p></div>
                  <div className="flex items-center gap-1 border border-gray-300 rounded-xl">
                    <button type="button" aria-label={`Remove one ${l.item.name}`} className="w-9 h-9 text-lg" onClick={() => dec(l.item.id)}>−</button>
                    <span className="w-6 text-center font-bold">{l.qty}</span>
                    <button type="button" aria-label={`Add one ${l.item.name}`} className="w-9 h-9 text-lg" onClick={() => add(l.item.id)}>+</button>
                  </div>
                  <span className="w-20 text-right font-bold">{inr(l.item.price * l.qty)}</span>
                </li>
              ))}
            </ul>
            {shop.allowPickup && shop.allowDelivery && (
              <fieldset className="grid grid-cols-2 gap-2">
                <legend className="label">Ela teeskuntaru?</legend>
                {[['pickup', 'Store pickup'], ['delivery', 'Home delivery']].map(([v, l]) => (
                  <label key={v} className="h-12 rounded-xl border-2 flex items-center justify-center gap-2 font-semibold text-sm cursor-pointer" style={form.fulfilment === v ? { borderColor: color } : { borderColor: '#E5E7EB' }}>
                    <input type="radio" name="ful" value={v} checked={form.fulfilment === v} onChange={setF('fulfilment')} className="accent-current" /> {l}
                  </label>
                ))}
              </fieldset>
            )}
            {contactFields}
            {form.fulfilment === 'delivery' && <div><label className="label" htmlFor="s-addr">Delivery address</label><textarea id="s-addr" required rows={2} className="input h-auto py-2.5" value={form.address} onChange={setF('address')} autoComplete="street-address" /></div>}
            <div><label className="label" htmlFor="s-note">Note (optional)</label><input id="s-note" className="input" value={form.note} onChange={setF('note')} placeholder="Size, colour, timing…" /></div>
            <div className="text-sm flex flex-col gap-1 bg-gray-50 rounded-xl p-3">
              <div className="flex justify-between"><span>Items</span><span>{inr(itemsTotal)}</span></div>
              {fee > 0 && <div className="flex justify-between"><span>Delivery</span><span>{inr(fee)}</span></div>}
              <div className="flex justify-between text-base font-extrabold pt-1"><span>Total</span><span>{inr(Math.round(itemsTotal + fee))}</span></div>
            </div>
            {shop.minOrder > 0 && itemsTotal < shop.minOrder && <p className="text-sm font-semibold text-orange-800">Minimum order {inr(shop.minOrder)}. Inka {inr(shop.minOrder - itemsTotal)} add cheyyandi.</p>}
            {formErr && <p className="error-box" role="alert">{formErr}</p>}
            <button type="submit" disabled={busy || (shop.minOrder > 0 && itemsTotal < shop.minOrder)} className="h-14 rounded-2xl text-white font-bold text-base disabled:opacity-60" style={{ background: color }}>
              {busy ? 'Placing order…' : 'Place order'}
            </button>
            <p className="text-xs text-center text-muted">Order ayyaka shop vaallu confirm chestaru.{shop.upi ? ' UPI tho ventane pay cheyyochu.' : ''}</p>
          </form>
        </Sheet>
      )}

      {sheet?.type === 'book' && (
        <Sheet title={`Book: ${sheet.item.name}`} onClose={() => setSheet(null)}>
          <form onSubmit={(e) => placeOrder(e, 'booking', sheet.item)} className="flex flex-col gap-4">
            <p className="text-sm">{inr(sheet.item.price)}</p>
            <div><label className="label" htmlFor="s-when">Eppudu raavali?</label><input id="s-when" type="datetime-local" required className="input" value={form.preferredAt} onChange={setF('preferredAt')} /></div>
            {contactFields}
            <div><label className="label" htmlFor="s-bnote">Note (optional)</label><input id="s-bnote" className="input" value={form.note} onChange={setF('note')} /></div>
            {formErr && <p className="error-box" role="alert">{formErr}</p>}
            <button type="submit" disabled={busy} className="h-14 rounded-2xl text-white font-bold text-base disabled:opacity-60" style={{ background: color }}>{busy ? 'Booking…' : 'Request booking'}</button>
            <p className="text-xs text-center text-muted">Shop vaallu time confirm chesi meeku cheptaru.</p>
          </form>
        </Sheet>
      )}

      {sheet?.type === 'ask' && (
        <Sheet title={sheet.item ? `Ask about ${sheet.item.name}` : 'Ask a question'} onClose={() => setSheet(null)}>
          {sent ? (
            <div className="text-center py-6 flex flex-col gap-2">
              <p className="text-lg font-extrabold">Thank you! 🙏</p>
              <p className="text-sm text-muted">Mee question {shop.name} ki vellindi. Tondaraga call/WhatsApp chestaru.</p>
              <button type="button" className="btn-ghost mt-3" onClick={() => setSheet(null)}>Close</button>
            </div>
          ) : (
            <form onSubmit={(e) => sendEnquiry(e, sheet.item)} className="flex flex-col gap-4">
              {contactFields}
              <div><label className="label" htmlFor="s-msg">Mee question</label><textarea id="s-msg" required rows={3} className="input h-auto py-2.5" value={form.message} onChange={setF('message')} placeholder="e.g. Ee saree red colour lo unda?" /></div>
              {formErr && <p className="error-box" role="alert">{formErr}</p>}
              <button type="submit" disabled={busy} className="h-12 rounded-xl text-white font-bold disabled:opacity-60" style={{ background: color }}>{busy ? 'Sending…' : 'Send'}</button>
            </form>
          )}
        </Sheet>
      )}
    </div>
  );
}
