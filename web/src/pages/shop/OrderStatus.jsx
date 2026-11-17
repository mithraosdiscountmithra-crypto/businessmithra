import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { inr } from '../../lib/format.js';
import { addOrderToken } from '../../lib/shopDevice.js';
import UpiPay from '../../components/UpiPay.jsx';
import { hostShop } from '../../lib/hostShop.js';

const STEPS = { order: ['new', 'confirmed', 'ready', 'completed'], booking: ['new', 'confirmed', 'completed'], table: ['new', 'confirmed', 'completed'] };
const LABEL = { new: 'Order received', confirmed: 'Confirmed', ready: 'Ready', completed: 'Completed', cancelled: 'Cancelled' };

export default function OrderStatus() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    const load = () => api(`/shop/order/${token}`).then((d) => { if (!alive) return; setData(d); addOrderToken(d.shop.slug, token); }).catch((e) => alive && setErr(e.message));
    load();
    const t = setInterval(load, 30000);
    return () => { alive = false; clearInterval(t); };
  }, [token]);

  if (err) return <div className="min-h-screen flex items-center justify-center p-6 text-center">{err}</div>;
  if (!data) return <div className="min-h-screen flex items-center justify-center text-muted">Loading…</div>;
  const { order: o, shop } = data;
  const color = shop.color || '#3730A3';
  const steps = STEPS[o.kind] || STEPS.order;
  const at = steps.indexOf(o.status);
  const isBooking = o.kind !== 'order';
  const what = o.kind === 'table' ? 'table booking' : o.kind === 'booking' ? 'booking' : 'order';
  const lines = o.items.map((i) => `• ${i.name} × ${Number(i.qty)}`).join('\n');
  const waText = `Namaste! Nenu ${what} chesanu: ${o.number}\n${o.kind === 'table' ? `${o.guests} people` : `${lines}\nTotal: ${inr(o.total)}`}\nPeru: ${o.name}\n${o.fulfilment === 'delivery' ? `Address: ${o.address}` : ''}${o.preferredAt ? `Time: ${new Date(o.preferredAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}` : ''}\n\nStatus: ${window.location.href}`;

  return (
    <div className="min-h-screen bg-[#F6F6F8] py-6 px-4">
      <div className="max-w-lg mx-auto flex flex-col gap-4">
        <div className="bg-white rounded-3xl border border-gray-200 p-6 flex flex-col gap-2 text-center">
          <span className="mx-auto w-14 h-14 rounded-full flex items-center justify-center text-white text-2xl" style={{ background: o.status === 'cancelled' ? '#991B1B' : color }} aria-hidden="true">{o.status === 'cancelled' ? '×' : '✓'}</span>
          <h1 className="text-xl font-extrabold">{o.status === 'cancelled' ? `${what[0].toUpperCase()}${what.slice(1)} cancelled` : `${isBooking ? `${what[0].toUpperCase()}${what.slice(1)} request` : 'Order'} received!`}</h1>
          <p className="text-sm text-gray-600">{shop.name} · <strong>{o.number}</strong></p>
          {o.status !== 'cancelled' && (
            <ol className="flex justify-between gap-1 pt-4" aria-label="Status">
              {steps.map((s, i) => (
                <li key={s} className="flex-1 flex flex-col items-center gap-1.5">
                  <span className="w-full h-1.5 rounded-full" style={{ background: i <= at ? color : '#E5E7EB' }} />
                  <span className={`text-[11px] ${i === at ? 'font-extrabold' : 'text-gray-500'}`}>{s === 'new' ? 'Received' : LABEL[s]}</span>
                </li>
              ))}
            </ol>
          )}
        </div>

        {shop.phone && (
          <a href={`https://wa.me/91${shop.phone}?text=${encodeURIComponent(waText)}`} target="_blank" rel="noreferrer" className="h-14 rounded-2xl bg-green-600 text-white font-bold flex items-center justify-center">
            Send details to shop on WhatsApp
          </a>
        )}

        {o.kind === 'table' && (
          <div className="bg-white rounded-3xl border border-gray-200 p-5 text-center flex flex-col gap-1">
            <p className="text-3xl">🍽️</p>
            <p className="text-lg font-extrabold">Table for {o.guests}</p>
            <p className="font-semibold">{new Date(o.preferredAt).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</p>
            {o.note && <p className="text-sm text-muted">{o.note}</p>}
          </div>
        )}

        {shop.upiLink && o.kind !== 'table' && Number(o.total) > 0 && (
          <UpiPay upiLink={shop.upiLink} upiId={shop.upiId} amountLabel={inr(o.total)} color={color} />
        )}
        {o.paymentStatus === 'paid' && <p className="ok-box text-center font-semibold">Payment received. Thank you!</p>}

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
        <p className="text-center text-xs text-muted">Ee page ni bookmark cheyyandi – status ikkada update avutundi.</p>
      </div>
    </div>
  );
}
