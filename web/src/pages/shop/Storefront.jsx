import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { fmtDate, fmtDateTime, inr } from '../../lib/format.js';
import UpiPay from '../../components/UpiPay.jsx';
import { hostShop } from '../../lib/hostShop.js';
import { InstallButton } from '../../lib/install.jsx';
import { payWithRazorpay } from '../../lib/razorpay.js';
import { accent, autoAbout, autoTagline, emojiFor, heroArt, itemArt, tint } from '../../lib/shopTheme.js';
import { addOrderToken, clearMe, getMe, getOrderTokens, getShopToken, setMe, setShopToken } from '../../lib/shopDevice.js';

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

const keyOf = (itemId, variantId) => (variantId ? `${itemId}:${variantId}` : itemId);

function VariantChips({ it, value, onChange, color }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={`${it.name} size`}>
      {it.variants.map((v) => (
        <button
          key={v.id}
          type="button"
          aria-pressed={value === v.id}
          disabled={!v.inStock}
          onClick={() => onChange(v.id)}
          className="min-h-[32px] px-2.5 rounded-lg text-xs font-bold border disabled:opacity-40 disabled:line-through"
          style={value === v.id ? { background: color, color: '#fff', borderColor: color } : { background: '#fff', borderColor: '#D1D5DB' }}
        >
          {v.name}
        </button>
      ))}
    </div>
  );
}

const firstInStock = (it) => (it.variants.find((v) => v.inStock) || it.variants[0])?.id || null;

function ItemCard({ it, cart, color, stype, onAdd, onDec, onBook, onAsk, onOpen }) {
  const [vSel, setVSel] = useState(() => firstInStock(it));
  const v = it.variants.find((x) => x.id === vSel) || null;
  const price = v ? v.price : it.price;
  const mrp = v ? v.mrp : it.mrp;
  const key = keyOf(it.id, v?.id);
  const qty = cart[key] || 0;
  const available = it.inStock && (!v || v.inStock);
  const img = it.images[0];
  const off = mrp && mrp > price ? Math.round(((mrp - price) / mrp) * 100) : 0;
  return (
    <article className="bg-white rounded-2xl border border-gray-200 overflow-hidden flex flex-col shadow-sm hover:shadow-md transition-shadow">
      <button type="button" onClick={onOpen} className="relative aspect-square bg-gray-100 block w-full" aria-label={`View ${it.name}`}>
        <img src={img || itemArt(it.name, it.category, stype, color)} alt={it.name} loading="lazy" className="w-full h-full object-cover" />
        {off > 0 && <span className="absolute top-2 left-2 text-xs font-extrabold bg-green-700 text-white px-2 py-1 rounded-lg">{off}% OFF</span>}
        {!it.inStock && <span className="absolute inset-0 bg-white/70 flex items-center justify-center font-bold text-gray-800">Out of stock</span>}
      </button>
      <div className="p-3 flex flex-col gap-1.5 flex-1">
        <h3 className="text-sm font-bold leading-snug line-clamp-2">{it.name}</h3>
        {it.variants.length > 0 && <VariantChips it={it} value={vSel} onChange={setVSel} color={color} />}
        <div className="flex items-baseline gap-2">
          <span className="font-extrabold">{inr(price)}</span>
          {off > 0 && <span className="text-xs text-gray-500 line-through">{inr(mrp)}</span>}
        </div>
        <div className="mt-auto pt-1 flex gap-1.5">
          {it.type === 'service' && onBook ? (
            <button type="button" onClick={onBook} className="flex-1 h-10 rounded-xl text-white text-sm font-bold" style={{ background: color }}>Book</button>
          ) : !available ? (
            <button type="button" onClick={onAsk} className="flex-1 h-10 rounded-xl border border-gray-300 text-sm font-bold">Ask</button>
          ) : qty > 0 ? (
            <div className="flex-1 flex items-center justify-between h-10 rounded-xl text-white font-bold" style={{ background: color }}>
              <button type="button" aria-label={`Remove one ${it.name}`} onClick={() => onDec(key)} className="w-10 h-10 text-xl">−</button>
              <span aria-live="polite">{qty}</span>
              <button type="button" aria-label={`Add one more ${it.name}`} onClick={() => onAdd(key)} className="w-10 h-10 text-xl">+</button>
            </div>
          ) : (
            <button type="button" onClick={() => onAdd(key)} className="flex-1 h-10 rounded-xl text-white text-sm font-bold" style={{ background: color }}>Add</button>
          )}
        </div>
      </div>
    </article>
  );
}

export default function Storefront() {
  const params = useParams();
  const slug = params.slug || hostShop();
  useEffect(() => {
    // "Add to home screen" should open this shop, not the vendor app.
    const link = document.querySelector('link[rel="manifest"]');
    if (link && slug) link.setAttribute('href', `/api/shop/${slug}/manifest.webmanifest${hostShop() ? '?own=1' : ''}`);
  }, [slug]);
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [cart, setCart] = useState(() => loadCart(slug));
  const [cat, setCat] = useState('');
  const [q, setQ] = useState('');
  const [sheet, setSheet] = useState(null); // 'cart' | {type:'item'|'book'|'ask', item}
  const saved = getMe();
  const [me, setMeState] = useState(saved);
  const [form, setForm] = useState({ name: saved?.name || '', phone: saved?.phone || '', address: saved?.address || '', note: '', fulfilment: 'pickup', preferredAt: '', message: '', guests: 2 });
  const [myOrders, setMyOrders] = useState(null);
  const [otpStep, setOtpStep] = useState(false);
  const [addrs, setAddrs] = useState([]);
  const [addrSel, setAddrSel] = useState('new');
  const [loc, setLoc] = useState(saved?.lat ? { lat: saved.lat, lng: saved.lng } : null);
  const [locBusy, setLocBusy] = useState(false);
  const [locErr, setLocErr] = useState('');
  const [landmark, setLandmark] = useState(saved?.landmark || '');
  const [addrLabel, setAddrLabel] = useState('Home');
  const [saveAddr, setSaveAddr] = useState(true);
  const [benefits, setBenefits] = useState(null);
  const [memberPending, setMemberPending] = useState([]);
  const [joinPlan, setJoinPlan] = useState(null);
  const [joinResult, setJoinResult] = useState(null);
  const [otp, setOtp] = useState('');
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

  // Phone forgot its saved details (some QR scanner browsers do)? Get them back from the cookie.
  useEffect(() => {
    if (getShopToken() && getMe()?.phone) return;
    api('/shop/me/device').then((d) => {
      if (d.token && !getShopToken()) setShopToken(d.token);
      if (d.phone && !getMe()?.phone) {
        const m = { name: d.name || '', phone: d.phone, address: '', verified: Boolean(d.token) };
        setMe(m);
        setMeState(m);
        setForm((f) => ({ ...f, name: f.name || m.name, phone: f.phone || m.phone }));
      }
    }).catch(() => {});
  }, []);

  const loadMember = async () => {
    const t = getShopToken();
    if (!t) { setBenefits(null); return; }
    try {
      const r = await api(`/shop/${slug}/me`, { headers: { Authorization: `Bearer ${t}` } });
      setBenefits(r.benefits);
      setMemberPending(r.pending);
    } catch {
      /* ignore */
    }
  };
  useEffect(() => {
    if (data?.memberPlans?.length) loadMember();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const shop = data?.shop;
  const color = shop?.color || '#3730A3';
  const items = data?.items || [];
  const byId = useMemo(() => Object.fromEntries(items.map((i) => [i.id, i])), [items]);
  const categories = useMemo(() => [...new Set(items.map((i) => i.category).filter(Boolean))], [items]);
  const shown = items.filter((i) => (!cat || i.category === cat) && (!q || i.name.toLowerCase().includes(q.toLowerCase())));
  const cartLines = Object.entries(cart).flatMap(([key, n]) => {
    const [id, vId] = key.split(':');
    const it = byId[id];
    if (!it || !(n > 0)) return [];
    const v = vId ? it.variants.find((x) => x.id === vId) : null;
    if (vId && !v) return [];
    if (!vId && it.variants.length) return [];
    return [{ key, item: it, variant: v, name: v ? `${it.name} (${v.name})` : it.name, price: v ? v.price : it.price, qty: n }];
  });
  const cartCount = cartLines.reduce((a, l) => a + l.qty, 0);
  const itemsTotal = cartLines.reduce((a, l) => a + l.price * l.qty, 0);
  const memberOk = Boolean(benefits && getShopToken() && me?.phone === form.phone.trim());
  const fee = form.fulfilment === 'delivery' && !(memberOk && benefits.freeDelivery) ? shop?.deliveryFee || 0 : 0;
  const memberDisc = memberOk && benefits.discountPct ? Math.round(itemsTotal * benefits.discountPct) / 100 : 0;
  const [payChoice, setPayChoice] = useState('');
  const [couponIn, setCouponIn] = useState('');
  const [coupon, setCoupon] = useState(null);
  const [couponErr, setCouponErr] = useState('');
  const couponOff = coupon ? Math.min(coupon.off, itemsTotal - memberDisc) : 0;
  const applyCoupon = async (code = couponIn) => {
    setCouponErr('');
    try {
      const r = await api(`/shop/${slug}/coupon`, { method: 'POST', body: { code, amount: itemsTotal - memberDisc, phone: form.phone } });
      setCoupon(r);
      setCouponIn(r.code);
    } catch (x) {
      setCoupon(null);
      setCouponErr(x.message);
    }
  };

  const add = (id) => setCart((c) => ({ ...c, [id]: (c[id] || 0) + 1 }));
  const dec = (id) => setCart((c) => ({ ...c, [id]: Math.max(0, (c[id] || 0) - 1) }));
  const setF = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const finishHello = async () => {
    await api(`/shop/${slug}/hello`, { method: 'POST', body: { name: form.name, phone: form.phone } });
    const m = { name: form.name.trim(), phone: form.phone.trim(), address: me?.address || '', verified: Boolean(getShopToken()) };
    setMe(m);
    setMeState(m);
  };

  const sendOtpCode = async () => {
    await api('/shop/otp/send', { method: 'POST', body: { phone: form.phone, name: form.name } });
    setOtp('');
    setOtpStep(true);
  };

  const resendOtp = async () => {
    setFormErr('');
    try {
      await sendOtpCode();
    } catch (x) {
      setFormErr(x.message);
    }
  };

  // OTP is asked only when the customer places an order / booking (not when they open the shop).
  // Returns true when the customer is verified and the order can go.
  const ensureLogin = async () => {
    if (form.name.trim().length < 2) throw new Error('Mee peru enter cheyyandi');
    if (!/^[6-9]\d{9}$/.test(form.phone.trim())) throw new Error('Correct 10-digit mobile number enter cheyyandi');
    const verifiedSame = getShopToken() && me?.phone === form.phone.trim();
    if (!shop.otp || verifiedSame) {
      if (!me || me.phone !== form.phone.trim() || me.name !== form.name.trim()) await finishHello();
      return true;
    }
    if (!otpStep) {
      await sendOtpCode();
      return false;
    }
    const r = await api('/shop/otp/verify', { method: 'POST', body: { phone: form.phone, code: otp } });
    setShopToken(r.token);
    await finishHello();
    setOtpStep(false);
    loadMember();
    return true;
  };

  const openMyOrders = async () => {
    setSheet('orders');
    setMyOrders(null);
    try {
      const t = getShopToken();
      const r = await api('/shop/my-orders', { method: 'POST', body: { tokens: getOrderTokens(slug), slug }, headers: t ? { Authorization: `Bearer ${t}` } : {} });
      setMyOrders(r.orders);
    } catch {
      setMyOrders([]);
    }
  };

  const authHeaders = () => {
    const t = getShopToken();
    return t ? { Authorization: `Bearer ${t}` } : {};
  };

  const openCart = async () => {
    setSheet('cart');
    if (!getShopToken()) return;
    try {
      const r = await api('/shop/me/addresses', { headers: authHeaders() });
      setAddrs(r.addresses);
      if (r.addresses.length && addrSel === 'new' && !form.address) pickAddr(r.addresses[0]);
    } catch {
      /* not logged in with OTP */
    }
  };

  const pickAddr = (a) => {
    setAddrSel(a.id);
    setForm((f) => ({ ...f, address: a.address }));
    setLandmark(a.landmark || '');
    setLoc(a.lat ? { lat: a.lat, lng: a.lng } : null);
    setSaveAddr(false);
  };

  const newAddr = () => {
    setAddrSel('new');
    setForm((f) => ({ ...f, address: '' }));
    setLandmark('');
    setLoc(null);
    setSaveAddr(true);
  };

  const removeAddr = async (a) => {
    try {
      await api(`/shop/me/addresses/${a.id}`, { method: 'DELETE', headers: authHeaders() });
      setAddrs((x) => x.filter((y) => y.id !== a.id));
      if (addrSel === a.id) newAddr();
    } catch {
      /* ignore */
    }
  };

  const useMyLocation = () => {
    setLocErr('');
    if (!navigator.geolocation) return setLocErr('Mee phone location support cheyyatledu. Address type cheyyandi.');
    setLocBusy(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLoc({ lat: Number(p.coords.latitude.toFixed(6)), lng: Number(p.coords.longitude.toFixed(6)), acc: Math.round(p.coords.accuracy) });
        setLocBusy(false);
      },
      (er) => {
        setLocErr(er.code === 1 ? 'Location permission ivvaledu. Browser settings lo allow chesi malli try cheyyandi.' : 'Location dorakaledu. Phone GPS ON chesi malli try cheyyandi.');
        setLocBusy(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  };

  const placeOrder = async (e, kind, bookItem) => {
    e.preventDefault();
    setFormErr('');
    setBusy(true);
    try {
      if (!(await ensureLogin())) return;
      const body = {
        kind,
        name: form.name, phone: form.phone, address: form.address, note: form.note,
        fulfilment: kind === 'order' ? form.fulfilment : 'pickup',
        couponCode: kind === 'order' && coupon ? coupon.code : null,
        payChoice: kind === 'order' ? (payChoice || (shop.cod ? 'cod' : 'online')) : 'cod',
        guests: kind === 'table' ? Number(form.guests) : null,
        ...(kind === 'order' && form.fulfilment === 'delivery' ? { lat: loc?.lat ?? null, lng: loc?.lng ?? null, landmark, saveAddress: saveAddr, addressLabel: addrLabel } : {}),
        preferredAt: form.preferredAt ? new Date(form.preferredAt).toISOString() : '',
        items: kind === 'table' ? [] : kind === 'booking' ? [{ itemId: bookItem.id, variantId: firstInStock(bookItem), qty: 1 }] : cartLines.map((l) => ({ itemId: l.item.id, variantId: l.variant?.id || null, qty: l.qty })),
      };
      const r = await api(`/shop/${slug}/orders`, { method: 'POST', body, headers: authHeaders() });
      addOrderToken(slug, r.token);
      const delivered = form.fulfilment === 'delivery' && kind === 'order';
      setMe({
        ...(me || {}), name: form.name, phone: form.phone,
        address: delivered ? form.address : me?.address || '',
        landmark: delivered ? landmark : me?.landmark || '',
        lat: delivered ? loc?.lat ?? null : me?.lat ?? null,
        lng: delivered ? loc?.lng ?? null : me?.lng ?? null,
      });
      if (kind === 'order') { setCart({}); setCoupon(null); setCouponIn(''); }
      if (r.pay) {
        // Online payment: open Razorpay now. If they close it, the order page shows "Pay now".
        try {
          const p = await payWithRazorpay(r.pay);
          await api(`/shop/order/${r.token}/verify`, { method: 'POST', body: p });
        } catch { /* order is saved; payment can be finished from the order page */ }
      }
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

  const joinMembership = async (e) => {
    e.preventDefault();
    setFormErr('');
    setBusy(true);
    try {
      if (!(await ensureLogin())) return;
      const r = await api(`/shop/${slug}/membership`, { method: 'POST', body: { planId: joinPlan.id, name: form.name }, headers: authHeaders() });
      setJoinResult(r);
      loadMember();
    } catch (x) {
      setFormErr(x.message);
    } finally {
      setBusy(false);
    }
  };

  if (err) return <div className="min-h-screen flex items-center justify-center p-6 text-center"><div><p className="text-xl font-bold">Shop not found</p><p className="text-muted mt-1">Ee link lo shop ledu leda temporary ga close ayyindi.</p></div></div>;
  if (!data) return <div className="min-h-screen flex items-center justify-center text-muted">Loading shop…</div>;

  const verified = Boolean(me && getShopToken() && me.phone === form.phone.trim());
  const ready = Boolean(me && (!shop.otp || verified) && me.phone === form.phone.trim());
  const cta = (base) => (ready || !shop.otp ? base : otpStep ? `Verify OTP & ${base}` : 'Send OTP & continue');

  const contactAuth = ready ? (
    <p className="text-sm bg-gray-50 rounded-xl p-3">
      {shop.otp ? '✅ ' : ''}<strong>{me.name}</strong> · {me.phone}{' '}
      <button type="button" className="underline font-semibold text-xs ml-1" onClick={() => { clearMe(); setShopToken(null); api('/shop/me/forget', { method: 'POST' }).catch(() => {}); setMeState(null); setOtpStep(false); setForm((f) => ({ ...f, name: '', phone: '' })); }}>Change</button>
    </p>
  ) : (
    <>
      <div><label className="label" htmlFor="s-name">Mee peru</label><input id="s-name" required className="input" value={form.name} onChange={setF('name')} autoComplete="name" disabled={otpStep} /></div>
      <div><label className="label" htmlFor="s-phone">{shop.otp ? 'WhatsApp number' : 'Mobile number'}</label><input id="s-phone" required inputMode="numeric" maxLength={10} className="input" value={form.phone} onChange={setF('phone')} autoComplete="tel-national" disabled={otpStep} /></div>
      {otpStep && (
        <div className="flex flex-col gap-2 rounded-xl bg-green-50 p-3">
          <label className="label mb-0" htmlFor="s-otp">WhatsApp lo vachina 6-digit OTP</label>
          <input id="s-otp" required inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="input text-center text-2xl tracking-[0.5em] font-bold h-14" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} autoFocus />
          <p className="text-xs text-muted">+91 {form.phone} ki pampamu · <button type="button" className="underline font-semibold" onClick={() => { setOtpStep(false); setFormErr(''); }}>Number marchandi</button> · <button type="button" className="underline font-semibold" onClick={resendOtp}>Malli pampandi</button></p>
        </div>
      )}
      {shop.otp && !otpStep && <p className="text-xs text-muted">Order confirm cheyyadaniki WhatsApp lo OTP vastundi. Okkasari chaalu.</p>}
    </>
  );

  const foodish = /restaurant|food|cafe|hotel|bakery|sweet|tiffin|mess|juice|cloud/i.test(shop.type || '');
  // Vendor's own words first; otherwise professional text made from the business details.
  const autoInfo = { name: shop.name, type: shop.type, city: shop.city, categories, allowDelivery: shop.allowDelivery, allowPickup: shop.allowPickup, allowTable: shop.allowTable, allowBooking: shop.allowBooking, onlinePay: shop.onlinePay };
  const tagline = shop.tagline || autoTagline(autoInfo);
  const about = shop.about || autoAbout(autoInfo);
  const color2 = accent(color);
  const menuLabel = shop.allowBooking && !shop.allowPickup && !shop.allowDelivery ? 'Our Services' : foodish ? 'Our Menu' : 'Our Products';
  const dirUrl = shop.lat ? `https://www.google.com/maps/dir/?api=1&destination=${shop.lat},${shop.lng}` : shop.mapUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([shop.name, shop.address, shop.city].filter(Boolean).join(', '))}`;

  const contactFields = (
    <>
      <div><label className="label" htmlFor="s-name">Mee peru</label><input id="s-name" required className="input" value={form.name} onChange={setF('name')} autoComplete="name" /></div>
      <div><label className="label" htmlFor="s-phone">Mobile number</label><input id="s-phone" required inputMode="numeric" maxLength={10} className="input" value={form.phone} onChange={setF('phone')} autoComplete="tel-national" /></div>
    </>
  );

  return (
    <div className="min-h-screen bg-[#F6F6F8] pb-24">
      {/* ── Top bar ── */}
      <nav className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-gray-200" aria-label="Shop">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center gap-3">
          <a href="#top" className="flex items-center gap-2.5 min-w-0">
            <span className="w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center shrink-0 text-white font-extrabold" style={{ background: color }}>
              {shop.logo ? <img src={shop.logo} alt="" className="w-full h-full object-cover" /> : shop.name.slice(0, 1)}
            </span>
            <span className="font-extrabold text-lg truncate">{shop.name}</span>
          </a>
          <div className="hidden md:flex items-center gap-6 ml-auto text-sm font-semibold text-gray-700">
            <a href="#menu" className="hover:text-black">{menuLabel}</a>
            {data.offers?.length > 0 && <a href="#offers" className="hover:text-black">Offers</a>}
            <a href="#about" className="hover:text-black">About</a>
            <a href="#contact" className="hover:text-black">Contact</a>
          </div>
          <div className="flex items-center gap-2 ml-auto md:ml-4">
            {(me || getOrderTokens(slug).length > 0) && <button type="button" onClick={openMyOrders} className="hidden sm:flex h-10 px-3 rounded-xl border border-gray-300 font-bold text-sm items-center">My Orders</button>}
            {shop.phone && <a href={`tel:${shop.phone}`} aria-label="Call" className="h-10 px-4 rounded-xl text-white font-bold text-sm flex items-center" style={{ background: color }}>📞 Call</a>}
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <header id="top" className="relative overflow-hidden">
        <div className="absolute inset-0" style={{ backgroundImage: shop.cover ? `url(${shop.cover})` : heroArt(shop.type, color), backgroundSize: 'cover', backgroundPosition: 'center' }} aria-hidden="true" />
        <div className={`absolute inset-0 ${shop.cover ? 'bg-gradient-to-t from-black/80 via-black/45 to-black/25' : 'bg-gradient-to-t from-black/45 via-black/10 to-transparent'}`} aria-hidden="true" />
        <div className="relative max-w-6xl mx-auto px-4 py-16 sm:py-24 text-white flex flex-col gap-4">
          <h1 className="text-4xl sm:text-6xl font-extrabold leading-tight max-w-3xl drop-shadow-lg">{shop.name}</h1>
          <p className="text-lg sm:text-xl text-white/95 max-w-2xl drop-shadow">{tagline}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-white/90">
            {shop.timings && <span>🕒 {shop.timings}</span>}
            {shop.city && <span>📍 {[shop.address, shop.city].filter(Boolean).join(', ')}</span>}
          </div>
          <div className="flex flex-wrap gap-3 pt-2">
            {(shop.allowPickup || shop.allowDelivery) && <a href="#menu" className="h-12 px-6 rounded-xl font-bold flex items-center bg-white text-gray-900 shadow">🛒 Order online</a>}
            {shop.allowTable && <button type="button" onClick={() => { setFormErr(''); setSheet('table'); }} className="h-12 px-6 rounded-xl font-bold text-white shadow" style={{ background: color }}>🍽️ Book a table</button>}
            {shop.phone && <a href={`https://wa.me/91${shop.phone}`} target="_blank" rel="noreferrer" className="h-12 px-6 rounded-xl font-bold flex items-center bg-green-600 text-white shadow">WhatsApp</a>}
            {(shop.lat || shop.mapUrl || shop.address || shop.city) && (
              <a href={dirUrl} target="_blank" rel="noreferrer" className="h-12 px-6 rounded-xl font-bold flex items-center bg-white/15 border border-white/40 text-white backdrop-blur">📍 Directions</a>
            )}
          </div>
        </div>
      </header>

      {/* ── What we offer ── */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-5 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          {[
            shop.allowPickup && ['🥡', 'Takeaway', 'Order & pick up'],
            shop.allowDelivery && ['🚚', 'Home delivery', shop.deliveryFee ? `₹${shop.deliveryFee} delivery` : 'Free delivery'],
            shop.allowTable && ['🍽️', 'Table booking', 'Reserve in advance'],
            shop.allowBooking && ['📅', 'Appointments', 'Book a slot'],
            shop.onlinePay && ['💳', 'Pay online', 'UPI · Cards'],
            shop.minOrder > 0 && ['🧾', 'Min. order', inr(shop.minOrder)],
          ].filter(Boolean).slice(0, 4).map(([i, t, sub], n) => (
            <div key={t} className="flex items-center gap-3 rounded-2xl p-3" style={{ background: n % 2 ? tint(color, 0.08) : `color-mix(in srgb, ${color2} 12%, white)` }}>
              <span className="w-11 h-11 rounded-xl flex items-center justify-center text-2xl bg-white shadow-sm shrink-0" aria-hidden="true">{i}</span>
              <span><b className="block">{t}</b><span className="text-xs text-gray-600">{sub}</span></span>
            </div>
          ))}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 pt-4 flex flex-wrap gap-2 text-sm">
          {data.memberPlans?.length > 0 && (
            <button type="button" onClick={() => { setFormErr(''); setJoinPlan(null); setJoinResult(null); setSheet('member'); }} className="h-10 px-4 rounded-xl font-bold border-2" style={{ borderColor: '#F59E0B', background: benefits ? '#FEF3C7' : '#fff', color: '#92400E' }}>
              {benefits ? `⭐ ${benefits.planName}` : '⭐ Membership'}
            </button>
          )}
          <button type="button" onClick={() => { setSent(false); setSheet({ type: 'ask' }); }} className="h-10 px-4 rounded-xl bg-white border border-gray-300 font-bold">Ask a question</button>
          <InstallButton className="h-10 px-4 rounded-xl bg-white border border-gray-300 font-bold" label="📲 Add to home screen" />
          {(me || getOrderTokens(slug).length > 0) && <button type="button" onClick={openMyOrders} className="h-10 px-4 rounded-xl bg-white border border-gray-300 font-bold">My Orders</button>}
      </div>
        {data.offers?.length > 0 && (
          <section id="offers" className="max-w-6xl mx-auto px-4 pt-4 flex gap-2 overflow-x-auto scroll-mt-20">
            {data.offers.map((o) => (
              <button key={o.code} type="button" onClick={() => { setCouponIn(o.code); setCoupon(null); setCouponErr(''); }} className="shrink-0 text-left rounded-xl border-2 border-dashed px-3 py-2 bg-white" style={{ borderColor: color }}>
                <span className="block text-sm font-extrabold" style={{ color }}>🏷️ {o.label}</span>
                <span className="block text-xs text-gray-600">Code <b>{o.code}</b>{o.minOrder ? ` · min ${inr(o.minOrder)}` : ''}{o.description ? ` · ${o.description}` : ''}</span>
              </button>
            ))}
          </section>
        )}
        {me && (
          <p className="max-w-6xl mx-auto px-4 pt-2 text-xs text-gray-600">
            Namaste <strong>{me.name}</strong> ({me.phone}) ·{' '}
            <button type="button" className="underline font-semibold" onClick={() => { clearMe(); setShopToken(null); api('/shop/me/forget', { method: 'POST' }).catch(() => {}); setMeState(null); setOtpStep(false); setForm((f) => ({ ...f, name: '', phone: '' })); }}>Not you?</button>
          </p>
        )}
        {benefits && (
          <p className="max-w-6xl mx-auto px-4 pt-2 text-sm font-semibold text-amber-900">
            ⭐ Meeru {benefits.planName} member · {[benefits.discountPct ? `${benefits.discountPct}% off` : null, benefits.freeDelivery ? 'free delivery' : null].filter(Boolean).join(' + ')} · {fmtDate(benefits.endsAt)} varaku
          </p>
        )}


      <main id="menu" className="max-w-6xl mx-auto px-4 pt-8 flex flex-col gap-4 scroll-mt-16">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold">{menuLabel}</h2>
          <span className="block h-1.5 w-20 rounded-full mt-2" style={{ background: `linear-gradient(90deg, ${color}, ${color2})` }} aria-hidden="true" />
        </div>
        <div className="flex flex-col gap-3 sticky top-16 z-20 bg-[#F6F6F8] py-2">
          <label className="sr-only" htmlFor="shop-q">Search</label>
          <input id="shop-q" type="search" className="input bg-white" placeholder={`Search in ${shop.name}`} value={q} onChange={(e) => setQ(e.target.value)} />
          {categories.length > 0 && (
            <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1">
              {['', ...categories].map((c) => (
                <button key={c || 'all'} type="button" aria-pressed={cat === c} onClick={() => setCat(c)} className="h-9 px-4 rounded-full text-sm font-semibold whitespace-nowrap border" style={cat === c ? { background: color, color: '#fff', borderColor: color } : { background: '#fff', borderColor: '#E5E7EB' }}>
                  {c ? `${emojiFor(c, shop.type)} ${c}` : '✨ All'}
                </button>
              ))}
            </div>
          )}
        </div>
        {shown.length === 0 ? <p className="text-center text-muted py-10">Items levu.</p> : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {shown.map((it) => (
              <ItemCard
                key={it.id} it={it} cart={cart} color={color} stype={shop.type}
                onAdd={add} onDec={dec}
                onBook={shop.allowBooking ? () => setSheet({ type: 'book', item: it }) : null}
                onAsk={() => { setSent(false); setSheet({ type: 'ask', item: it }); }}
                onOpen={() => setSheet({ type: 'item', item: it })}
              />
            ))}
          </div>
        )}
        <p className="text-center text-xs text-gray-500 pt-2">Prices include GST</p>
      </main>

      {/* ── About + gallery ── */}
      <div className="mt-14 py-12" style={{ background: `linear-gradient(135deg, ${tint(color, 0.1)}, color-mix(in srgb, ${color2} 14%, white))` }}>
        <section id="about" className="max-w-6xl mx-auto px-4 scroll-mt-20 grid md:grid-cols-2 gap-8 items-center">
          <div>
            <p className="text-sm font-bold uppercase tracking-wider" style={{ color }}>About us</p>
            <h2 className="text-2xl sm:text-3xl font-extrabold mt-1 mb-4">Welcome to {shop.name}</h2>
            <p className="text-base text-gray-700 leading-relaxed whitespace-pre-line">{about}</p>
            <div className="flex flex-wrap gap-2 mt-5">
              {categories.slice(0, 6).map((c) => <span key={c} className="px-3 py-1.5 rounded-full bg-white text-sm font-semibold shadow-sm">{emojiFor(c, shop.type)} {c}</span>)}
            </div>
          </div>
          {shop.gallery?.length > 0 ? (
            <div className="grid grid-cols-3 gap-3">
              {shop.gallery.slice(0, 7).map((src, i) => (
                <img key={src} src={src} alt={`${shop.name} photo ${i + 1}`} loading="lazy" className={`w-full object-cover rounded-2xl shadow ${i === 0 ? 'col-span-2 row-span-2 aspect-square' : 'aspect-square'}`} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3" aria-hidden="true">
              {items.filter((i) => i.images[0]).slice(0, 5).map((i, n) => (
                <img key={i.id} src={i.images[0]} alt="" loading="lazy" className={`w-full object-cover rounded-2xl shadow ${n === 0 ? 'col-span-2 row-span-2 aspect-square' : 'aspect-square'}`} />
              ))}
              {items.filter((i) => i.images[0]).length === 0 && <div className="col-span-3 aspect-[16/9] rounded-3xl shadow" style={{ backgroundImage: heroArt(shop.type, color), backgroundSize: 'cover' }} />}
            </div>
          )}
        </section>
      </div>

      {/* ── Contact ── */}
      <section id="contact" className="max-w-6xl mx-auto px-4 pt-14 scroll-mt-16">
        <p className="text-sm font-bold uppercase tracking-wider" style={{ color }}>Contact</p>
        <h2 className="text-2xl sm:text-3xl font-extrabold mt-1 mb-4">Visit us</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl border border-gray-200 p-5 flex flex-col gap-3">
            {(shop.address || shop.city) && <p className="flex gap-3"><span aria-hidden="true">📍</span><span>{[shop.address, shop.city, shop.state].filter(Boolean).join(', ')}</span></p>}
            {shop.timings && <p className="flex gap-3"><span aria-hidden="true">🕒</span><span>{shop.timings}</span></p>}
            {shop.phone && <p className="flex gap-3"><span aria-hidden="true">📞</span><a className="font-semibold" href={`tel:${shop.phone}`}>+91 {shop.phone}</a></p>}
            <div className="flex flex-wrap gap-2 pt-1">
              {shop.phone && <a href={`https://wa.me/91${shop.phone}`} target="_blank" rel="noreferrer" className="h-11 px-4 rounded-xl bg-green-600 text-white font-bold flex items-center">WhatsApp</a>}
              {(shop.lat || shop.mapUrl || shop.address || shop.city) && <a href={dirUrl} target="_blank" rel="noreferrer" className="h-11 px-4 rounded-xl border border-gray-300 font-bold flex items-center">Get directions</a>}
              <button type="button" onClick={() => { setSent(false); setSheet({ type: 'ask' }); }} className="h-11 px-4 rounded-xl border border-gray-300 font-bold">Send a message</button>
            </div>
          </div>
          {shop.lat ? (
            <iframe title={`${shop.name} on map`} className="w-full h-64 md:h-full min-h-[16rem] rounded-2xl border border-gray-200" loading="lazy" referrerPolicy="no-referrer-when-downgrade"
              src={`https://maps.google.com/maps?q=${shop.lat},${shop.lng}&z=16&output=embed`} />
          ) : (
            <div className="rounded-2xl min-h-[12rem] flex items-center justify-center text-center p-6 text-white" style={{ backgroundImage: heroArt(shop.type, color), backgroundSize: 'cover' }}>
              <p className="text-xl font-extrabold drop-shadow">{tagline}</p>
            </div>
          )}
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="mt-14 text-white/80" style={{ background: `linear-gradient(135deg, #111827, ${color})` }}>
        <div className="max-w-6xl mx-auto px-4 py-10 grid sm:grid-cols-3 gap-6 text-sm">
          <div>
            <p className="text-white text-lg font-extrabold">{shop.name}</p>
            <p className="mt-1">{tagline}</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <a href="#menu" className="hover:text-white">{menuLabel}</a>
            <a href="#about" className="hover:text-white">About</a>
            <a href="#contact" className="hover:text-white">Contact</a>
            {(me || getOrderTokens(slug).length > 0) && <button type="button" onClick={openMyOrders} className="text-left hover:text-white">My Orders</button>}
          </div>
          <div className="flex flex-col gap-3">
            {(shop.instagram || shop.facebook || shop.youtube) && (
              <div className="flex gap-2">
                {[['Instagram', shop.instagram, '📸'], ['Facebook', shop.facebook, '👍'], ['YouTube', shop.youtube, '▶️']].filter((x) => x[1]).map(([n, href, i]) => (
                  <a key={n} href={href} target="_blank" rel="noreferrer" className="h-10 px-3 rounded-xl bg-white/10 hover:bg-white/20 flex items-center gap-1.5 font-semibold text-white">{i} {n}</a>
                ))}
              </div>
            )}
            {shop.phone && <a href={`tel:${shop.phone}`} className="text-white font-semibold">📞 +91 {shop.phone}</a>}
          </div>
        </div>
        <p className="border-t border-white/10 text-center text-xs py-4">© {new Date().getFullYear()} {shop.name} · Powered by BusinessMithra</p>
      </footer>

      {/* Floating WhatsApp */}
      {shop.phone && !(cartCount > 0 && (shop.allowPickup || shop.allowDelivery)) && (
        <a href={`https://wa.me/91${shop.phone}`} target="_blank" rel="noreferrer" aria-label="Chat on WhatsApp" className="fixed bottom-5 right-5 z-30 w-14 h-14 rounded-full bg-green-600 text-white text-2xl flex items-center justify-center shadow-xl">💬</a>
      )}

      {cartCount > 0 && (shop.allowPickup || shop.allowDelivery) && (
        <div className="fixed bottom-0 inset-x-0 p-3 z-30">
          <button type="button" onClick={openCart} className="max-w-xl mx-auto w-full h-14 rounded-2xl text-white font-bold flex items-center justify-between px-5 shadow-lg" style={{ background: color }}>
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
            {sheet.item.variants.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {sheet.item.variants.map((v) => (
                  <li key={v.id} className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 p-3">
                    <span className="font-semibold">{v.name}</span>
                    <span className="ml-auto font-extrabold">{inr(v.price)} {v.mrp > v.price && <span className="text-xs text-gray-500 line-through font-normal">{inr(v.mrp)}</span>}</span>
                    {v.inStock && sheet.item.inStock && (shop.allowPickup || shop.allowDelivery) && sheet.item.type !== 'service'
                      ? <button type="button" className="h-10 px-4 rounded-xl text-white text-sm font-bold" style={{ background: color }} onClick={() => add(keyOf(sheet.item.id, v.id))}>{cart[keyOf(sheet.item.id, v.id)] ? `Added (${cart[keyOf(sheet.item.id, v.id)]}) +` : 'Add'}</button>
                      : !v.inStock && <span className="text-xs font-bold text-gray-500">Out of stock</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xl font-extrabold">{inr(sheet.item.price)} {sheet.item.mrp > sheet.item.price && <span className="text-sm text-gray-500 line-through font-normal">{inr(sheet.item.mrp)}</span>} <span className="text-xs text-muted font-normal">/ {sheet.item.unit}</span></p>
            )}
            {sheet.item.description && <p className="text-sm text-gray-700 whitespace-pre-line">{sheet.item.description}</p>}
            <div className="flex gap-2">
              {sheet.item.type === 'service' && shop.allowBooking ? (
                <button type="button" className="flex-1 h-12 rounded-xl text-white font-bold" style={{ background: color }} onClick={() => setSheet({ type: 'book', item: sheet.item })}>Book appointment</button>
              ) : sheet.item.inStock && !sheet.item.variants.length && (shop.allowPickup || shop.allowDelivery) ? (
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
                <li key={l.key} className="flex items-center gap-3 py-2.5">
                  <div className="flex-1 min-w-0"><p className="font-semibold text-sm truncate">{l.name}</p><p className="text-xs text-muted">{inr(l.price)} each</p></div>
                  <div className="flex items-center gap-1 border border-gray-300 rounded-xl">
                    <button type="button" aria-label={`Remove one ${l.name}`} className="w-9 h-9 text-lg" onClick={() => dec(l.key)}>−</button>
                    <span className="w-6 text-center font-bold">{l.qty}</span>
                    <button type="button" aria-label={`Add one ${l.name}`} className="w-9 h-9 text-lg" onClick={() => add(l.key)}>+</button>
                  </div>
                  <span className="w-20 text-right font-bold">{inr(l.price * l.qty)}</span>
                </li>
              ))}
            </ul>
            {shop.allowPickup && shop.allowDelivery && (
              <fieldset className="grid grid-cols-2 gap-2">
                <legend className="label">Ela teeskuntaru?</legend>
                {[['pickup', 'Takeaway / Pickup'], ['delivery', 'Home delivery']].map(([v, l]) => (
                  <label key={v} className="h-12 rounded-xl border-2 flex items-center justify-center gap-2 font-semibold text-sm cursor-pointer" style={form.fulfilment === v ? { borderColor: color } : { borderColor: '#E5E7EB' }}>
                    <input type="radio" name="ful" value={v} checked={form.fulfilment === v} onChange={setF('fulfilment')} className="accent-current" /> {l}
                  </label>
                ))}
              </fieldset>
            )}
            {contactAuth}
            {form.fulfilment === 'delivery' && (
              <fieldset className="flex flex-col gap-3 rounded-2xl border border-gray-200 p-3">
                <legend className="label px-1">Delivery address</legend>
                {addrs.length > 0 && (
                  <div className="flex flex-col gap-2">
                    {addrs.map((a) => (
                      <div key={a.id} className="flex items-start gap-2 rounded-xl border-2 p-2.5" style={{ borderColor: addrSel === a.id ? color : '#E5E7EB' }}>
                        <label className="flex-1 flex items-start gap-2 cursor-pointer text-sm">
                          <input type="radio" name="addr" className="mt-1" checked={addrSel === a.id} onChange={() => pickAddr(a)} />
                          <span><strong>{a.label}</strong>{a.lat ? ' · 📍' : ''}<span className="block text-gray-600">{a.address}{a.landmark ? ` · ${a.landmark}` : ''}</span></span>
                        </label>
                        <button type="button" aria-label={`Delete ${a.label} address`} className="w-9 h-9 rounded-lg text-gray-500 hover:bg-gray-100" onClick={() => removeAddr(a)}>×</button>
                      </div>
                    ))}
                    <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
                      <input type="radio" name="addr" checked={addrSel === 'new'} onChange={newAddr} /> + Kotha address
                    </label>
                  </div>
                )}
                {addrSel === 'new' && (
                  <>
                    <button type="button" onClick={useMyLocation} disabled={locBusy} className="h-12 rounded-xl border-2 font-bold text-sm flex items-center justify-center gap-2" style={{ borderColor: color, color }}>
                      {locBusy ? 'Location teeskuntunnam…' : loc ? '📍 Location captured ✓ (malli teeskondi)' : '📍 Use my current location'}
                    </button>
                    {loc && <a className="text-xs font-semibold underline -mt-1" style={{ color }} href={`https://www.google.com/maps?q=${loc.lat},${loc.lng}`} target="_blank" rel="noreferrer">Map lo chudandi{loc.acc ? ` (~${loc.acc} m accuracy)` : ''}</a>}
                    {locErr && <p className="text-xs font-semibold text-red-700">{locErr}</p>}
                    <div><label className="label" htmlFor="s-addr">House / flat no., street, area</label><textarea id="s-addr" required rows={2} className="input h-auto py-2.5" value={form.address} onChange={setF('address')} autoComplete="street-address" /></div>
                    <div><label className="label" htmlFor="s-land">Landmark (optional)</label><input id="s-land" className="input" value={landmark} onChange={(e) => setLandmark(e.target.value)} placeholder="e.g. Near Hanuman temple" /></div>
                    {getShopToken() ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" className="w-5 h-5" checked={saveAddr} onChange={(e) => setSaveAddr(e.target.checked)} /> Save as</label>
                        {['Home', 'Work', 'Other'].map((l) => (
                          <button key={l} type="button" aria-pressed={addrLabel === l} onClick={() => setAddrLabel(l)} className="h-9 px-3 rounded-lg text-xs font-bold border" style={addrLabel === l ? { background: color, color: '#fff', borderColor: color } : { borderColor: '#D1D5DB' }}>{l}</button>
                        ))}
                      </div>
                    ) : <p className="text-xs text-muted">Ee address ee phone lo gurthupettukuntam.</p>}
                  </>
                )}
              </fieldset>
            )}
            <div><label className="label" htmlFor="s-note">Note (optional)</label><input id="s-note" className="input" value={form.note} onChange={setF('note')} placeholder="Size, colour, timing…" /></div>
            {shop.onlinePay && (
              <fieldset className="flex flex-col gap-2">
                <legend className="label">Payment</legend>
                {[['online', '💳 Pay online now', 'UPI · Card · Netbanking'], ...(shop.cod ? [['cod', form.fulfilment === 'delivery' ? '💵 Cash on delivery' : '💵 Pay at shop', 'Order teesukune appudu pay cheyyandi']] : [])].map(([k, l, sub]) => {
                  const on = (payChoice || (shop.cod ? 'cod' : 'online')) === k;
                  return (
                    <label key={k} className="flex items-center gap-3 rounded-xl border-2 p-3 cursor-pointer" style={{ borderColor: on ? color : '#E5E7EB' }}>
                      <input type="radio" name="paychoice" className="w-5 h-5" checked={on} onChange={() => setPayChoice(k)} style={{ accentColor: color }} />
                      <span><b className="block text-sm">{l}</b><span className="text-xs text-gray-600">{sub}</span></span>
                    </label>
                  );
                })}
              </fieldset>
            )}
            <div className="flex flex-col gap-1">
              <label className="label" htmlFor="s-cpn">Coupon code</label>
              <div className="flex gap-2">
                <input id="s-cpn" className="input uppercase" value={couponIn} onChange={(e) => { setCouponIn(e.target.value.toUpperCase()); setCoupon(null); }} placeholder="e.g. FIRST10" />
                <button type="button" className="h-12 px-4 rounded-xl font-bold border-2 shrink-0" style={{ borderColor: color, color }} disabled={!couponIn.trim()} onClick={() => applyCoupon()}>Apply</button>
              </div>
              {coupon && <p className="text-xs font-semibold text-green-800">🎉 {coupon.code} applied – {coupon.label}</p>}
              {couponErr && <p className="text-xs font-semibold text-red-700">{couponErr}</p>}
            </div>
            <div className="text-sm flex flex-col gap-1 bg-gray-50 rounded-xl p-3">
              <div className="flex justify-between"><span>Items</span><span>{inr(itemsTotal)}</span></div>
              {couponOff > 0 && <div className="flex justify-between text-green-800 font-semibold"><span>🏷️ Coupon {coupon.code}</span><span>− {inr(couponOff)}</span></div>}
              {memberDisc > 0 && <div className="flex justify-between text-green-800 font-semibold"><span>⭐ {benefits.planName} ({benefits.discountPct}% off)</span><span>− {inr(memberDisc)}</span></div>}
              {fee > 0 && <div className="flex justify-between"><span>Delivery</span><span>{inr(fee)}</span></div>}
              {memberOk && benefits.freeDelivery && form.fulfilment === 'delivery' && <div className="flex justify-between text-green-800 font-semibold"><span>⭐ Delivery</span><span>FREE</span></div>}
              <div className="flex justify-between text-base font-extrabold pt-1"><span>Total</span><span>{inr(Math.round(itemsTotal - memberDisc - couponOff + fee))}</span></div>
            </div>
            {shop.minOrder > 0 && itemsTotal < shop.minOrder && <p className="text-sm font-semibold text-orange-800">Minimum order {inr(shop.minOrder)}. Inka {inr(shop.minOrder - itemsTotal)} add cheyyandi.</p>}
            {formErr && <p className="error-box" role="alert">{formErr}</p>}
            <button type="submit" disabled={busy || (shop.minOrder > 0 && itemsTotal < shop.minOrder)} className="h-14 rounded-2xl text-white font-bold text-base disabled:opacity-60" style={{ background: color }}>
              {busy ? 'Please wait…' : (payChoice || (shop.cod ? 'cod' : 'online')) === 'online' && shop.onlinePay ? `Pay ${inr(Math.round(itemsTotal - memberDisc - couponOff + fee))} & place order` : cta('Place order')}
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
            {contactAuth}
            <div><label className="label" htmlFor="s-bnote">Note (optional)</label><input id="s-bnote" className="input" value={form.note} onChange={setF('note')} /></div>
            {formErr && <p className="error-box" role="alert">{formErr}</p>}
            <button type="submit" disabled={busy} className="h-14 rounded-2xl text-white font-bold text-base disabled:opacity-60" style={{ background: color }}>{busy ? 'Please wait…' : cta('Request booking')}</button>
            <p className="text-xs text-center text-muted">Shop vaallu time confirm chesi meeku cheptaru.</p>
          </form>
        </Sheet>
      )}

      {sheet === 'orders' && (
        <Sheet title="My Orders" onClose={() => setSheet(null)}>
          {myOrders === null ? <p className="text-muted">Loading…</p> : myOrders.length === 0 ? (
            <p className="text-sm text-muted py-6 text-center">Ee phone nunchi inka orders levu.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-gray-100">
              {myOrders.map((o) => (
                <li key={o.token}>
                  <a href={`/o/${o.token}`} onClick={(e) => { e.preventDefault(); navigate(`/o/${o.token}`); }} className="flex items-center justify-between gap-3 py-3">
                    <div>
                      <p className="font-bold">{o.number} <span className="text-xs font-semibold text-muted">· {o.kind === 'booking' ? 'Booking' : `${o.itemCount} item${o.itemCount > 1 ? 's' : ''}`}</span></p>
                      <p className="text-xs text-muted">{fmtDateTime(o.createdAt)} · {{ new: 'Received', confirmed: 'Confirmed', ready: 'Ready', completed: 'Completed', cancelled: 'Cancelled' }[o.status]}{o.paymentStatus === 'paid' ? ' · Paid' : ''}</p>
                    </div>
                    <span className="font-extrabold">{inr(o.total)} →</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Sheet>
      )}

      {sheet === 'member' && (
        <Sheet title="⭐ Membership plans" onClose={() => { setSheet(null); setOtpStep(false); }}>
          {joinResult ? (
            <div className="flex flex-col gap-3 text-center">
              <p className="text-lg font-extrabold">Request pampamu! 🙏</p>
              <p className="text-sm text-gray-600">{joinResult.price > 0 ? `${inr(joinResult.price)} pay cheyyandi. Shop vaallu payment chusi membership activate chestaru.` : 'Shop vaallu activate chestaru.'}</p>
              {joinResult.upiLink && <UpiPay upiLink={joinResult.upiLink} upiId={joinResult.upiId} amountLabel={inr(joinResult.price)} color={color} />}
              {!joinResult.upiLink && <p className="text-sm">Shop lo cash / UPI tho pay cheyyandi.</p>}
              <button type="button" className="btn-ghost" onClick={() => setSheet(null)}>Close</button>
            </div>
          ) : joinPlan ? (
            <form onSubmit={joinMembership} className="flex flex-col gap-4">
              <div className="rounded-2xl p-4 border-2" style={{ borderColor: '#F59E0B', background: '#FFFBEB' }}>
                <p className="font-extrabold text-lg">⭐ {joinPlan.name}</p>
                <p className="text-2xl font-extrabold">{inr(joinPlan.price)} <span className="text-sm font-normal text-gray-600">/ {joinPlan.durationDays >= 365 ? `${Math.round(joinPlan.durationDays / 365)} year` : joinPlan.durationDays >= 30 ? `${Math.round(joinPlan.durationDays / 30)} month` : `${joinPlan.durationDays} days`}</span></p>
              </div>
              {contactAuth}
              {formErr && <p className="error-box" role="alert">{formErr}</p>}
              <button type="submit" disabled={busy} className="h-14 rounded-2xl text-white font-bold text-base disabled:opacity-60" style={{ background: color }}>{busy ? 'Please wait…' : cta('Join now')}</button>
              <button type="button" className="text-sm font-semibold underline" onClick={() => setJoinPlan(null)}>← Plans</button>
            </form>
          ) : (
            <div className="flex flex-col gap-3">
              {benefits && <p className="ok-box font-semibold">✅ Meeru already {benefits.planName} member ({fmtDate(benefits.endsAt)} varaku). Renew kooda cheyyochu.</p>}
              {memberPending.length > 0 && <p className="text-sm font-semibold text-amber-900 bg-amber-50 rounded-xl p-3">⏳ {memberPending.map((m) => m.plan).join(', ')} request shop approval kosam waiting.</p>}
              {data.memberPlans.map((p) => (
                <div key={p.id} className="rounded-2xl border-2 border-gray-200 p-4 flex items-center gap-3">
                  <div className="flex-1">
                    <p className="font-extrabold">⭐ {p.name}</p>
                    <p className="text-sm font-semibold text-green-800">{[p.discountPct ? `${p.discountPct}% off on every order` : null, p.freeDelivery ? 'Free home delivery' : null].filter(Boolean).join(' + ')}</p>
                    <p className="text-xs text-gray-600">{p.durationDays >= 365 ? `${Math.round(p.durationDays / 365)} year` : p.durationDays >= 30 ? `${Math.round(p.durationDays / 30)} month(s)` : `${p.durationDays} days`} validity{p.description ? ` · ${p.description}` : ''}</p>
                  </div>
                  <button type="button" className="h-12 px-4 rounded-xl text-white font-bold whitespace-nowrap" style={{ background: color }} onClick={() => { setFormErr(''); setJoinPlan(p); }}>{inr(p.price)}</button>
                </div>
              ))}
              <p className="text-xs text-center text-gray-500">Benefits OTP login tho order chesinappudu automatic ga apply avutayi.</p>
            </div>
          )}
        </Sheet>
      )}

      {sheet === 'table' && (
        <Sheet title="Book a table" onClose={() => { setSheet(null); setOtpStep(false); }}>
          <form onSubmit={(e) => placeOrder(e, 'table')} className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><label className="label" htmlFor="t-when">Date & time</label><input id="t-when" type="datetime-local" required className="input" value={form.preferredAt} onChange={setF('preferredAt')} /></div>
              <div className="col-span-2">
                <span className="label">Enta mandi?</span>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Number of people">
                  {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => (
                    <button key={n} type="button" aria-pressed={Number(form.guests) === n} onClick={() => setForm({ ...form, guests: n })} className="w-12 h-11 rounded-xl border-2 font-bold" style={Number(form.guests) === n ? { borderColor: color, background: color, color: '#fff' } : { borderColor: '#E5E7EB' }}>{n}</button>
                  ))}
                  <label className="sr-only" htmlFor="t-more">More people</label>
                  <input id="t-more" type="number" min="1" max="100" className="input w-20 h-11" placeholder="More" value={[1, 2, 3, 4, 5, 6, 8, 10].includes(Number(form.guests)) ? '' : form.guests} onChange={(e) => setForm({ ...form, guests: e.target.value })} />
                </div>
              </div>
            </div>
            {contactAuth}
            <div><label className="label" htmlFor="t-note">Note (optional)</label><input id="t-note" className="input" value={form.note} onChange={setF('note')} placeholder="e.g. Birthday, AC section, high chair" /></div>
            {formErr && <p className="error-box" role="alert">{formErr}</p>}
            <button type="submit" disabled={busy} className="h-14 rounded-2xl text-white font-bold text-base disabled:opacity-60" style={{ background: color }}>{busy ? 'Please wait…' : cta('Book table')}</button>
            <p className="text-xs text-center text-muted">Restaurant vaallu confirm chesi meeku WhatsApp lo cheptaru.</p>
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
