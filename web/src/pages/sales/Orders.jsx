import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { Empty, ErrorBox, PageHeader, SALES_NAV, SubNav } from '../../components/ui.jsx';
import { fmtDateTime, inr, MODE_LABEL, waLink } from '../../lib/format.js';

const FILTERS = [['open', 'Open'], ['new', 'New'], ['completed', 'Completed'], ['cancelled', 'Cancelled'], ['all', 'All']];
const STATUS = {
  new: ['New', 'bg-red-100 text-red-800'],
  confirmed: ['Confirmed', 'bg-blue-100 text-blue-800'],
  ready: ['Ready', 'bg-amber-100 text-amber-900'],
  completed: ['Completed', 'bg-green-100 text-green-800'],
  cancelled: ['Cancelled', 'bg-gray-100 text-gray-700'],
};
const NEXT = { new: ['confirmed', 'Confirm'], confirmed: ['ready', 'Mark ready'], ready: ['completed', 'Complete'] };

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.25].forEach((t) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      o.connect(g);
      g.connect(ctx.destination);
      g.gain.setValueAtTime(0.25, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.2);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.2);
    });
  } catch {
    /* sound not allowed */
  }
}

export default function Orders() {
  const { me } = useAuth();
  const can = me.permissions.sales;
  const navigate = useNavigate();
  const [filter, setFilter] = useState('open');
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const lastNew = useRef(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const d = await api(`/shop-admin/orders?status=${filter}`);
        if (!alive) return;
        if (lastNew.current !== null && d.newCount > lastNew.current) beep();
        lastNew.current = d.newCount;
        setData(d);
      } catch (e) {
        if (alive) setErr(e.message);
      }
    };
    load();
    const t = setInterval(load, 30000);
    return () => { alive = false; clearInterval(t); };
  }, [filter]);

  const replace = (o) => setData((d) => ({ ...d, orders: d.orders.map((x) => (x.id === o.id ? o : x)) }));
  const act = async (fn) => {
    setErr('');
    try {
      await fn();
    } catch (e) {
      setErr(e.message);
    }
  };
  const setStatus = (o, status) => act(async () => replace((await api(`/shop-admin/orders/${o.id}/status`, { method: 'PUT', body: { status } })).order));
  const markPaid = (o, mode) => act(async () => replace((await api(`/shop-admin/orders/${o.id}/paid`, { method: 'POST', body: { mode } })).order));
  const toInvoice = (o) => act(async () => navigate(`/sales/invoices/${(await api(`/shop-admin/orders/${o.id}/invoice`, { method: 'POST' })).invoiceId}`));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Sales & Customers" subtitle="Online shop nunchi vachina orders & bookings. Prati 30 seconds ki auto refresh.">
        <Link className="btn-primary" to="/sales/delivery">🛵 Delivery plan</Link>
        {me.user.isOwner && <Link className="btn-ghost" to="/shop">Shop settings</Link>}
      </PageHeader>
      <SubNav items={SALES_NAV} />
      <ErrorBox>{err}</ErrorBox>
      <div className="flex flex-wrap gap-2">
        {FILTERS.map(([v, l]) => (
          <button key={v} type="button" aria-pressed={filter === v} onClick={() => setFilter(v)} className={`h-9 px-3.5 rounded-lg text-sm font-semibold border ${filter === v ? 'bg-brand text-white border-brand' : 'bg-white border-line'}`}>
            {l}{v === 'new' && data?.newCount ? ` (${data.newCount})` : ''}
          </button>
        ))}
      </div>
      {data && data.orders.length === 0 ? (
        <Empty title="Orders levu" text="Mee shop link customers ki share cheyyandi. Orders ikkada vastayi.">
          {me.user.isOwner && <Link className="btn-primary" to="/shop">Open shop settings</Link>}
        </Empty>
      ) : (
        <div className="grid lg:grid-cols-2 gap-4">
          {(data?.orders || []).map((o) => {
            const [label, cls] = STATUS[o.status];
            const nxt = o.kind !== 'order' && o.status === 'confirmed' ? ['completed', o.kind === 'table' ? 'Guests came ✓' : 'Complete'] : NEXT[o.status];
            const lines = o.items.map((i) => `• ${i.name} × ${Number(i.qty)}`).join('\n');
            return (
              <article key={o.id} className={`card p-4 flex flex-col gap-3 ${o.status === 'new' ? 'ring-2 ring-red-300' : ''}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-extrabold">{o.number} <span className="text-xs font-semibold text-muted">· {o.kind === 'table' ? `🍽️ Table for ${o.guests}` : o.kind === 'booking' ? 'Appointment' : o.fulfilment === 'delivery' ? (o.deliveryNote ? `${o.deliverySpeed === 'morning' ? '🌅' : o.deliverySpeed === 'fast' ? '⚡' : '🚚'} ${o.deliveryNote}` : '🚚 Home delivery') : '🥡 Takeaway'}</span></p>
                    <p className="text-sm">{o.customer ? <Link to={`/sales/customers/${o.customer.id}`} className="font-semibold text-brand">{o.name}</Link> : o.name} · {o.phone}</p>
                    <p className="text-xs text-muted">{fmtDateTime(o.createdAt)}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${cls}`}>{label}</span>
                    <span className={`text-xs font-bold ${Number(o.total) === 0 ? 'hidden' : ''} ${o.paymentStatus === 'paid' ? 'text-green-800' : 'text-orange-800'}`}>{o.paymentStatus === 'paid' ? `Paid${o.paymentMode ? ` · ${MODE_LABEL[o.paymentMode]}` : ''}` : o.payChoice === 'online' ? 'Online pay pending' : o.payChoice === 'upi' ? 'UPI – check & mark paid' : o.kind === 'order' ? (o.fulfilment === 'delivery' ? 'COD – not paid' : 'Pay at shop') : 'Not paid'}</span>
                  </div>
                </div>
                {o.items.length > 0 && <ul className="text-sm bg-gray-50 rounded-xl p-3 flex flex-col gap-1">
                  {o.items.map((i) => <li key={i.id} className="flex justify-between gap-2"><span>{i.name} × {Number(i.qty)}</span><span>{inr(Number(i.amount) + Number(i.taxAmount))}</span></li>)}
                  {Number(o.deliveryFee) > 0 && <li className="flex justify-between"><span>Delivery</span><span>{inr(o.deliveryFee)}</span></li>}
                  <li className="flex justify-between font-extrabold border-t border-gray-200 pt-1 mt-1"><span>Total</span><span>{inr(o.total)}</span></li>
                </ul>}
                {o.preferredAt && <p className={o.kind === 'table' ? 'text-base font-bold' : 'text-sm'}><strong>{o.kind === 'table' ? '🕗 ' : 'Time: '}</strong>{fmtDateTime(o.preferredAt)}{o.kind === 'table' ? ` · ${o.guests} people` : ''}</p>}
                {o.address && <p className="text-sm"><strong>Address:</strong> {o.address}</p>}
                {o.fulfilment === 'delivery' && (() => {
                  const map = o.lat ? `https://www.google.com/maps/dir/?api=1&destination=${o.lat},${o.lng}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(o.address || '')}`;
                  const pin = o.lat ? `https://www.google.com/maps?q=${o.lat},${o.lng}` : map;
                  const text = `Delivery: ${o.number}\n${o.name} · ${o.phone}\n${o.address || ''}\n${lines}\nTotal: ${inr(o.total)} (${o.paymentStatus === 'paid' ? 'PAID' : 'Collect cash/UPI'})\n\n📍 ${pin}`;
                  return (
                    <div className="flex flex-wrap gap-2">
                      <a className="btn-ghost h-10 px-4" href={map} target="_blank" rel="noreferrer">🗺️ Open in Maps{o.lat ? '' : ' (address)'}</a>
                      <a className="btn-ghost h-10 px-4" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">Send to delivery boy</a>
                    </div>
                  );
                })()}
                {o.note && <p className="text-sm"><strong>Note:</strong> {o.note}</p>}
                {o.memberNote && <p className="text-sm font-bold text-amber-900">⭐ {o.memberNote}</p>}
                <div className="flex flex-wrap gap-2">
                  {can.edit && nxt && <button type="button" className="btn-primary h-10 px-4" onClick={() => setStatus(o, nxt[0])}>{nxt[1]}</button>}
                  <a className="btn h-10 px-4 bg-green-100 text-green-800" target="_blank" rel="noreferrer" href={waLink(o.phone, o.kind === 'table' ? `Namaste ${o.name} garu, mee table booking ${o.number} (${o.guests} people, ${fmtDateTime(o.preferredAt)}) ${o.status === 'confirmed' ? 'confirm ayyindi ✅' : 'maaku andindi'}.\n\nDhanyavaadalu – ${me.business.name}` : `Namaste ${o.name} garu, mee ${o.kind === 'booking' ? 'booking' : 'order'} ${o.number} ${o.status === 'new' ? 'maaku andindi' : `status: ${STATUS[o.status][0]}`}.\n${lines}\nTotal: ${inr(o.total)}\n\nDhanyavaadalu – ${me.business.name}`)}>WhatsApp</a>
                  {can.edit && o.paymentStatus !== 'paid' && o.status !== 'cancelled' && Number(o.total) > 0 && (
                    <>
                      <label className="sr-only" htmlFor={`pm-${o.id}`}>Mark paid</label>
                      <select id={`pm-${o.id}`} className="input h-10 w-auto" value="" onChange={(e) => e.target.value && markPaid(o, e.target.value)}>
                        <option value="">Mark paid…</option>
                        {Object.entries(MODE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </>
                  )}
                  {o.invoiceId ? (
                    <Link className="btn-ghost h-10 px-4" to={`/sales/invoices/${o.invoiceId}`}>Invoice</Link>
                  ) : can.add && o.status !== 'cancelled' && o.items.length > 0 && (
                    <button type="button" className="btn-ghost h-10 px-4" onClick={() => toInvoice(o)}>Make invoice</button>
                  )}
                  {can.edit && !['completed', 'cancelled'].includes(o.status) && (
                    <button type="button" className="btn-ghost h-10 px-4 text-red-700" onClick={() => window.confirm(`Cancel ${o.number}?`) && setStatus(o, 'cancelled')}>Cancel</button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
