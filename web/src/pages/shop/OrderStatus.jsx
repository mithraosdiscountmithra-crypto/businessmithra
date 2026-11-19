import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { inr } from '../../lib/format.js';
import { addOrderToken } from '../../lib/shopDevice.js';
import UpiPay from '../../components/UpiPay.jsx';
import { hostShop } from '../../lib/hostShop.js';
import { payWithRazorpay } from '../../lib/razorpay.js';

const STEPS = { order: ['new', 'confirmed', 'ready', 'completed'], booking: ['new', 'confirmed', 'completed'], table: ['new', 'confirmed', 'completed'] };
const LABEL = { new: 'Order received', confirmed: 'Confirmed', ready: 'Ready', completed: 'Completed', cancelled: 'Cancelled' };

export default function OrderStatus() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [payErr, setPayErr] = useState('');
  const [paying, setPaying] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = () => api(`/shop/order/${token}`).then((d) => { if (!alive) return; setData(d); addOrderToken(d.shop.slug, token); }).catch((e) => alive && setErr(e.message));
    load();
    const t = setInterval(load, 20000);
    return () => { alive = false; clearInterval(t); };
  }, [token, tick]);
  const payNow = async () => {
    setPayErr('');
    setPaying(true);
    try {
      const { pay } = await api(`/shop/order/${token}/pay`, { method: 'POST' });
      const p = await payWithRazorpay(pay);
      await api(`/shop/order/${token}/verify`, { method: 'POST', body: p });
      setTick((t) => t + 1);
    } catch (e) {
      if (!e.dismissed) setPayErr(e.message);
    } finally {
      setPaying(false);
    }
  };

  if (err) return <div className="min-h-screen flex items-center justify-center p-6 text-center">{err}</div>;
  if (!data) return <div className="min-h-screen flex items-center justify-center text-muted">Loading…</div>;
  const { order: o, shop } = data;
  const color = shop.color || '#3730A3';
  const at = Math.max(0, (STEPS[o.kind] || STEPS.order).indexOf(o.status));
  const isBooking = o.kind !== 'order';
  const what = o.kind === 'table' ? 'table booking' : o.kind === 'booking' ? 'booking' : 'order';
  const cap = (x) => x[0].toUpperCase() + x.slice(1);
  const delivery = o.fulfilment === 'delivery';
  const track = o.kind === 'order'
    ? [
      { key: 'new', label: 'Order received', icon: '📝' },
      { key: 'confirmed', label: 'Shop confirmed – preparing', icon: '👨‍🍳' },
      { key: 'ready', label: delivery ? 'Out for delivery 🛵' : 'Ready for pickup', icon: delivery ? '🛵' : '🛍️' },
      { key: 'completed', label: delivery ? 'Delivered' : 'Picked up', icon: '🏠' },
    ]
    : [
      { key: 'new', label: 'Request received', icon: '📝' },
      { key: 'confirmed', label: 'Confirmed by shop', icon: '✅' },
      { key: 'completed', label: 'Completed', icon: '🎉' },
    ];
  const MSG = {
    new: isBooking ? 'Mee request shop ki vellindi. Shop confirm chestaru, dayachesi wait cheyyandi 🙏' : 'Mee order shop ki vellindi. Shop confirm chestunnaru, dayachesi wait cheyyandi 🙏',
    confirmed: isBooking ? 'Mee booking confirm ayyindi ✅' : 'Mee order ready avtundi, dayachesi wait cheyyandi 🙏',
    ready: delivery ? 'Mee order bayaluderindi 🛵 – tvaralo meeku chervutundi' : 'Mee order ready! Shop ki vachi teesukondi 🛍️',
    completed: delivery ? 'Delivered. Thank you! 🙏' : 'Thank you! Malli randi 🙏',
  };
  const message = MSG[o.status] || MSG.new;

  return (
    <div className="min-h-screen bg-[#F6F6F8] py-6 px-4">
      <div className="max-w-lg mx-auto flex flex-col gap-4">
        <div className="bg-white rounded-3xl border border-gray-200 p-6 flex flex-col gap-3">
          <div className="text-center flex flex-col items-center gap-2">
            <span className="w-16 h-16 rounded-full flex items-center justify-center text-white text-3xl" style={{ background: o.status === 'cancelled' ? '#991B1B' : '#16A34A' }} aria-hidden="true">{o.status === 'cancelled' ? '×' : '✓'}</span>
            <h1 className="text-2xl font-extrabold">{o.status === 'cancelled' ? `${cap(what)} cancelled` : isBooking ? `${cap(what)} request received!` : 'Order received!'}</h1>
            <p className="text-sm text-gray-600">{shop.name}</p>
            <p className="text-lg">Order number: <b className="font-extrabold tracking-wide" style={{ color }}>{o.number}</b></p>
            {o.deliveryNote && o.status !== 'cancelled' && <p className="text-sm font-semibold px-3 py-1.5 rounded-full bg-amber-50 text-amber-900">{o.deliverySpeed === 'morning' ? '🌅' : o.deliverySpeed === 'fast' ? '⚡' : '🛵'} {o.deliveryNote}</p>}
          </div>
          {o.status !== 'cancelled' && (
            <>
              <p className="text-center font-semibold rounded-2xl p-3" style={{ background: `${color}14`, color }} role="status">{message}</p>
              <ol className="flex flex-col pt-1" aria-label="Order tracking">
                {track.map((t, i) => {
                  const done = i < at;
                  const now = i === at;
                  return (
                    <li key={t.key} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${now ? 'animate-pulse' : ''}`} style={done || now ? { background: color, color: '#fff' } : { background: '#E5E7EB', color: '#6B7280' }}>{done ? '✓' : t.icon}</span>
                        {i < track.length - 1 && <span className="w-0.5 flex-1 min-h-[22px]" style={{ background: done ? color : '#E5E7EB' }} />}
                      </div>
                      <div className="pb-4">
                        <p className={`text-sm ${now ? 'font-extrabold' : done ? 'font-semibold' : 'text-gray-500'}`}>{t.label}</p>
                        {now && <p className="text-xs text-gray-500">Ippudu ikkada undi</p>}
                      </div>
                    </li>
                  );
                })}
              </ol>
              <p className="text-center text-xs text-gray-500">Ee page automatic ga update avtundi 🔄</p>
            </>
          )}
        </div>

        {o.kind === 'table' && (
          <div className="bg-white rounded-3xl border border-gray-200 p-5 text-center flex flex-col gap-1">
            <p className="text-3xl">🍽️</p>
            <p className="text-lg font-extrabold">Table for {o.guests}</p>
            <p className="font-semibold">{new Date(o.preferredAt).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</p>
            {o.note && <p className="text-sm text-muted">{o.note}</p>}
          </div>
        )}

        {o.canPayOnline && Number(o.total) > 0 && (
          <div className="bg-white rounded-3xl border border-gray-200 p-5 flex flex-col gap-2">
            {o.payChoice === 'online' && <p className="text-sm font-semibold text-orange-800">Payment inka complete avvaledu.</p>}
            <button type="button" disabled={paying} onClick={payNow} className="h-14 rounded-2xl text-white font-bold text-base disabled:opacity-60" style={{ background: color }}>{paying ? 'Opening…' : `💳 Pay ${inr(o.total)} online`}</button>
            <p className="text-xs text-center text-gray-500">UPI · Card · Netbanking – secure Razorpay</p>
            {payErr && <p className="text-sm font-semibold text-red-700 text-center" role="alert">{payErr}</p>}
          </div>
        )}
        {shop.upiLink && !o.canPayOnline && o.kind !== 'table' && Number(o.total) > 0 && (
          <UpiPay upiLink={shop.upiLink} upiId={shop.upiId} amountLabel={inr(o.total)} color={color} />
        )}
        {o.paymentStatus === 'paid' && <p className="ok-box text-center font-semibold">✅ Payment received{o.paymentMode === 'online' ? ' online' : ''}. Thank you!</p>}
        {o.paymentStatus !== 'paid' && o.payChoice === 'cod' && o.kind === 'order' && o.status !== 'cancelled' && <p className="text-sm text-center text-gray-600">💵 {o.fulfilment === 'delivery' ? 'Cash on delivery' : 'Pay at shop'}</p>}

        {o.items.length > 0 && <div className="bg-white rounded-3xl border border-gray-200 p-5 flex flex-col gap-2 text-sm">
          {o.items.map((i, k) => (
            <div key={k} className="flex justify-between gap-3"><span>{i.name} × {Number(i.qty)}</span><span className="font-semibold">{inr(i.lineTotal)}</span></div>
          ))}
          {o.memberNote && <div className="flex justify-between text-green-800 font-semibold"><span>⭐ {o.memberNote}</span></div>}
          {Number(o.deliveryFee) > 0 && <div className="flex justify-between"><span>Delivery</span><span>{inr(o.deliveryFee)}</span></div>}
          <div className="flex justify-between text-base font-extrabold border-t border-gray-100 pt-2"><span>Total</span><span>{inr(o.total)}</span></div>
          <p className="text-xs text-muted pt-1">{o.fulfilment === 'delivery' ? `Delivery to: ${o.address}` : isBooking ? `Time: ${new Date(o.preferredAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}` : 'Takeaway / pickup'}</p>
        </div>}

        <Link to={hostShop() ? '/' : `/s/${shop.slug}`} className="text-center font-semibold" style={{ color }}>← Back to {shop.name} · My Orders</Link>
        {shop.phone && <p className="text-center text-sm text-gray-600">Emaina doubt unte <a className="font-bold" style={{ color }} href={`tel:${shop.phone}`}>📞 shop ki call cheyyandi</a></p>}
        <p className="text-center text-xs text-muted">Ee page ni bookmark cheyyandi – status ikkada update avutundi.</p>
      </div>
    </div>
  );
}
