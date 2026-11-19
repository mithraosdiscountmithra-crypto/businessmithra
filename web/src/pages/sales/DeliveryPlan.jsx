import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ErrorBox, PageHeader, useApi } from '../../components/ui.jsx';
import { inr, waLink } from '../../lib/format.js';
import { downloadCsv } from '../../lib/csv.js';

// Groups delivery orders by area and gives the shortest-looking route, so one rider covers
// one area at a time instead of going back and forth.

const R = 6371;
const km = (a, b) => {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
const fmtKm = (d) => (d < 1 ? `${Math.round(d * 1000)} m` : `${d.toFixed(1)} km`);
const COLORS = ['#DC2626', '#2563EB', '#16A34A', '#D97706', '#7C3AED', '#DB2777', '#0891B2', '#65A30D'];

// Nearest-next order from where the rider is now.
function routeFrom(start, pts) {
  const left = [...pts];
  const out = [];
  let cur = start;
  while (left.length) {
    let bi = 0;
    left.forEach((p, i) => { if (km(cur, p) < km(cur, left[bi])) bi = i; });
    const [p] = left.splice(bi, 1);
    out.push({ ...p, hop: km(cur, p) });
    cur = p;
  }
  return out;
}

// Orders within `radius` km of each other go in one area.
function makeAreas(pts, radius) {
  const areas = [];
  for (const p of pts) {
    const near = areas.find((a) => a.points.some((q) => km(q, p) <= radius));
    if (near) near.points.push(p);
    else areas.push({ points: [p] });
  }
  // Merge areas that became close after growing.
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < areas.length; i += 1) {
      for (let j = i + 1; j < areas.length; j += 1) {
        if (areas[i].points.some((p) => areas[j].points.some((q) => km(p, q) <= radius))) {
          areas[i].points.push(...areas[j].points);
          areas.splice(j, 1);
          merged = true;
          break outer;
        }
      }
    }
  }
  return areas.map((a) => {
    const c = { lat: a.points.reduce((s, p) => s + p.lat, 0) / a.points.length, lng: a.points.reduce((s, p) => s + p.lng, 0) / a.points.length };
    // Area name: the most common first part of the typed addresses.
    const words = {};
    a.points.forEach((p) => {
      const part = String(p.address || '').split(/[,\n]/).map((x) => x.trim()).find((x) => x.length > 2 && !/^\d+[-/\d]*$/.test(x) && !/^(h\.?no|door|flat|plot)/i.test(x));
      if (part) words[part] = (words[part] || 0) + 1;
    });
    const name = Object.entries(words).sort((x, y) => y[1] - x[1])[0]?.[0];
    return { ...a, center: c, name };
  });
}

const mapsRoute = (start, stops) => {
  if (!stops.length) return null;
  const dest = stops[stops.length - 1];
  const way = stops.slice(0, -1).slice(0, 9).map((p) => `${p.lat},${p.lng}`).join('|');
  return `https://www.google.com/maps/dir/?api=1${start ? `&origin=${start.lat},${start.lng}` : ''}&destination=${dest.lat},${dest.lng}${way ? `&waypoints=${encodeURIComponent(way)}` : ''}&travelmode=driving`;
};

// Leaflet (OpenStreetMap) loaded on demand.
let leafletLoading;
const loadLeaflet = () => {
  if (window.L) return Promise.resolve(window.L);
  leafletLoading ||= new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(css);
    const js = document.createElement('script');
    js.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    js.onload = () => resolve(window.L);
    js.onerror = () => { leafletLoading = null; reject(new Error('Map load avvaledu')); };
    document.body.appendChild(js);
  });
  return leafletLoading;
};

function DeliveryMap({ shop, areas, onPick }) {
  const box = useRef(null);
  const map = useRef(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let live = true;
    loadLeaflet().then((L) => {
      if (!live || !box.current) return;
      if (!map.current) {
        map.current = L.map(box.current, { scrollWheelZoom: false });
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors', referrerPolicy: 'strict-origin-when-cross-origin' }).addTo(map.current);
      }
      const m = map.current;
      m.eachLayer((l) => { if (!l.getAttribution?.()) m.removeLayer(l); });
      const bounds = [];
      if (shop.lat) {
        L.marker([shop.lat, shop.lng], { icon: L.divIcon({ className: '', html: '<div style="font-size:28px;line-height:28px">🏪</div>', iconSize: [28, 28], iconAnchor: [14, 14] }) }).addTo(m).bindPopup(shop.name);
        bounds.push([shop.lat, shop.lng]);
      }
      areas.forEach((a, ai) => {
        const color = COLORS[ai % COLORS.length];
        a.route.forEach((p, i) => {
          L.marker([p.lat, p.lng], {
            icon: L.divIcon({ className: '', html: `<div style="background:${color};color:#fff;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)">${i + 1}</div>`, iconSize: [28, 28], iconAnchor: [14, 14] }),
          }).addTo(m).bindPopup(`<b>${p.number}</b> · ${p.name}<br>${(p.address || '').replace(/</g, '&lt;')}`).on('click', () => onPick?.(p.id));
          bounds.push([p.lat, p.lng]);
        });
        const line = [...(shop.lat ? [[shop.lat, shop.lng]] : []), ...a.route.map((p) => [p.lat, p.lng])];
        if (line.length > 1) L.polyline(line, { color, weight: 3, opacity: 0.7, dashArray: '6 6' }).addTo(m);
      });
      if (bounds.length) m.fitBounds(bounds, { padding: [30, 30], maxZoom: 16 });
      setTimeout(() => m.invalidateSize(), 50);
    }).catch((e) => setErr(e.message));
    return () => { live = false; };
  }, [shop, areas, onPick]);
  useEffect(() => () => { map.current?.remove(); map.current = null; }, []);
  return (
    <div className="card overflow-hidden">
      {err ? <p className="p-4 text-sm text-red-700">{err}</p> : <div ref={box} className="h-80 sm:h-96 w-full" role="img" aria-label="Delivery orders on map" />}
    </div>
  );
}

export default function DeliveryPlan() {
  const [withNew, setWithNew] = useState(true);
  const [radius, setRadius] = useState(1.5);
  const { data, error, reload } = useApi(`/shop-admin/delivery-plan${withNew ? '?include=new' : ''}`);
  const [picked, setPicked] = useState(null);

  const plan = useMemo(() => {
    if (!data) return null;
    const shop = data.shop.lat ? { lat: data.shop.lat, lng: data.shop.lng } : null;
    const gps = data.orders.filter((o) => o.lat && o.lng);
    const noGps = data.orders.filter((o) => !(o.lat && o.lng));
    const areas = makeAreas(gps, radius).map((a) => {
      const route = routeFrom(shop || a.points[0], a.points);
      return { ...a, route, dist: shop ? km(shop, a.center) : 0, routeKm: route.reduce((s, p) => s + p.hop, 0) };
    }).sort((x, y) => x.dist - y.dist);
    return { shop, areas, noGps };
  }, [data, radius]);

  // Excel (CSV) list: area by area, in delivery order.
  const download = (only) => {
    const list = only === undefined ? plan.areas.map((a, i) => [a, i]) : [[plan.areas[only], only]];
    const rows = list.flatMap(([a, ai]) => a.route.map((p, i) => [
      `Area ${ai + 1}`, a.name || '', i + 1, p.number, p.name, p.phone, p.address || '', p.items,
      Number(p.total), p.paymentStatus === 'paid' ? 'Paid' : 'Collect', i === 0 && !plan.shop ? '' : fmtKm(p.hop), `https://maps.google.com/?q=${p.lat},${p.lng}`, '',
    ]));
    plan.noGps.forEach((p) => rows.push(['No location', '', '', p.number, p.name, p.phone, p.address || '', p.items, Number(p.total), p.paymentStatus === 'paid' ? 'Paid' : 'Collect', '', '', '']));
    const day = new Date().toISOString().slice(0, 10);
    downloadCsv(`delivery-${only === undefined ? 'all' : `area-${only + 1}`}-${day}`, ['Area', 'Area name', 'Stop', 'Order', 'Customer', 'Phone', 'Address', 'Items', 'Amount', 'Payment', 'Distance', 'Map link', 'Delivered ✓'], rows);
  };

  const shareArea = (a, idx) => {
    const lines = a.route.map((p, i) => `${i + 1}. ${p.number} – ${p.name} (${p.phone})\n   ${p.address || ''}\n   ${p.paymentStatus === 'paid' ? '✅ Paid' : `💵 Collect ${inr(p.total)}`}\n   📍 https://maps.google.com/?q=${p.lat},${p.lng}`);
    const text = `🛵 Delivery – Area ${idx + 1}${a.name ? ` (${a.name})` : ''}\n${a.route.length} orders\n\n${lines.join('\n\n')}\n\n🗺️ Route: ${mapsRoute(plan.shop, a.route)}`;
    window.open(waLink('', text), '_blank', 'noopener');
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="🛵 Delivery plan" subtitle="Orders area wise – okka area lo unna orders okkasari deliver cheyyandi">
        <Link to="/sales/orders" className="btn-ghost">← Orders</Link>
        <button type="button" className="btn-ghost" onClick={reload}>↻ Refresh</button>
        {plan && (plan.areas.length > 0 || plan.noGps.length > 0) && (
          <>
            <button type="button" className="btn-primary" onClick={() => download()}>⬇️ Excel (all areas)</button>
            <button type="button" className="btn-ghost" onClick={() => window.print()}>🖨️ Print / PDF</button>
          </>
        )}
      </PageHeader>
      <ErrorBox>{error}</ErrorBox>
      <div className="flex flex-wrap gap-4 items-center text-sm print:hidden">
        <label className="flex items-center gap-2 font-semibold"><input type="checkbox" className="w-5 h-5 accent-brand" checked={withNew} onChange={(e) => setWithNew(e.target.checked)} /> Kotha (confirm cheyyani) orders kuda chupinchu</label>
        <label className="flex items-center gap-2 font-semibold" htmlFor="dp-r">Area size
          <select id="dp-r" className="input h-9 w-auto" value={radius} onChange={(e) => setRadius(Number(e.target.value))}>
            <option value={0.5}>500 m</option><option value={1}>1 km</option><option value={1.5}>1.5 km</option><option value={3}>3 km</option><option value={5}>5 km</option>
          </select>
        </label>
      </div>
      {!plan ? <p className="text-muted">Loading…</p> : (
        <>
          {!plan.shop && (
            <div className="text-sm bg-amber-50 border border-amber-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2">
              <span>Shop location save avvaledu. <b>Online Shop → 📍 Shop location</b> lo "Use my current location" nokki, page kindha <b>Save</b> nokkandi.</span>
              <Link to="/shop" className="btn-primary h-9 px-3">📍 Location set cheyyandi</Link>
            </div>
          )}
          {plan.areas.length === 0 && plan.noGps.length === 0 && <p className="card p-8 text-center text-muted">Delivery orders levu 🎉</p>}
          {plan.areas.length > 0 && <DeliveryMap shop={data.shop} areas={plan.areas} onPick={setPicked} />}
          <div className="grid lg:grid-cols-2 gap-4">
            {plan.areas.map((a, ai) => {
              const link = mapsRoute(plan.shop, a.route);
              return (
                <section key={ai} className="card p-4 flex flex-col gap-3 border-l-8 break-inside-avoid" style={{ borderLeftColor: COLORS[ai % COLORS.length] }}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h2 className="font-extrabold text-lg">Area {ai + 1}{a.name ? ` · ${a.name}` : ''}</h2>
                      <p className="text-sm text-muted">{a.route.length} orders{plan.shop ? ` · shop nunchi ${fmtKm(a.dist)}` : ''} · route ~{fmtKm(a.routeKm)}</p>
                    </div>
                    <div className="flex gap-2">
                      {link && <a href={link} target="_blank" rel="noreferrer" className="btn-primary h-10 px-3 text-sm print:hidden">🗺️ Route</a>}
                      <button type="button" className="btn h-10 px-3 text-sm bg-green-600 text-white print:hidden" onClick={() => shareArea(a, ai)}>Rider ki pampu</button>
                      <button type="button" className="btn-ghost h-10 px-3 text-sm print:hidden" onClick={() => download(ai)} aria-label={`Download area ${ai + 1}`}>⬇️</button>
                    </div>
                  </div>
                  <ol className="flex flex-col divide-y divide-gray-100">
                    {a.route.map((p, i) => (
                      <li key={p.id} className={`py-2 flex gap-3 text-sm ${picked === p.id ? 'bg-amber-50 -mx-2 px-2 rounded-lg' : ''}`}>
                        <span className="w-7 h-7 rounded-full text-white font-bold flex items-center justify-center shrink-0" style={{ background: COLORS[ai % COLORS.length] }}>{i + 1}</span>
                        <span className="flex-1 min-w-0">
                          <b>{p.number}</b>{p.deliverySpeed === 'fast' && <span className="ml-1 text-xs font-bold text-red-700">⚡ FAST</span>}{p.deliverySpeed === 'morning' && <span className="ml-1 text-xs font-bold text-amber-700">🌅 Morning</span>} · {p.name} <a className="text-brand font-semibold" href={`tel:${p.phone}`}>{p.phone}</a>
                          <span className="block text-xs text-muted truncate">{p.address}</span>
                          <span className="block text-xs">{p.items}</span>
                        </span>
                        <span className="text-right shrink-0">
                          <b>{inr(p.total)}</b>
                          <span className={`block text-xs font-semibold ${p.paymentStatus === 'paid' ? 'text-green-700' : 'text-amber-700'}`}>{p.paymentStatus === 'paid' ? 'Paid' : 'Collect'}</span>
                          <span className="block text-xs text-muted">{i === 0 ? '' : `+${fmtKm(p.hop)}`}</span>
                        </span>
                      </li>
                    ))}
                  </ol>
                </section>
              );
            })}
          </div>
          {plan.noGps.length > 0 && (
            <section className="card p-4 flex flex-col gap-2">
              <h2 className="font-bold">📍 Location ivvani orders ({plan.noGps.length})</h2>
              <p className="text-xs text-muted">Customer GPS location ivvaledu – address chusi paina e area ki daggaro chudandi.</p>
              <ul className="flex flex-col divide-y divide-gray-100">
                {[...plan.noGps].sort((x, y) => String(x.address).localeCompare(String(y.address))).map((p) => (
                  <li key={p.id} className="py-2 text-sm flex justify-between gap-3">
                    <span><b>{p.number}</b> · {p.name} <a className="text-brand" href={`tel:${p.phone}`}>{p.phone}</a><span className="block text-xs text-muted">{p.address}</span></span>
                    <b>{inr(p.total)}</b>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
