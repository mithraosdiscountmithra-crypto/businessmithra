import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { ErrorBox, Field, PageHeader } from '../components/ui.jsx';
import ImageUpload from '../components/ImageUpload.jsx';

const COLORS = ['#3730A3', '#C2410C', '#0F766E', '#BE185D', '#1D4ED8', '#7C2D12', '#111827'];

export default function ShopSettings() {
  const [f, setF] = useState(null);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [locBusy, setLocBusy] = useState(false);
  const [locMsg, setLocMsg] = useState('');

  useEffect(() => {
    api('/shop-admin/settings').then((r) => setF(r.settings)).catch((e) => setErr(e.message));
  }, []);

  if (!f) return <p className="text-muted">{err || 'Loading…'}</p>;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const link = `${window.location.origin}/s/${f.slug}`;

  const save = async (e) => {
    e.preventDefault();
    setErr('');
    setOk('');
    setBusy(true);
    try {
      const r = await api('/shop-admin/settings', { method: 'PUT', body: { ...f, deliveryFee: Number(f.deliveryFee) || 0, minOrder: Number(f.minOrder) || 0, shopMapUrl: f.shopMapUrl || '' } });
      setF(r.settings);
      setOk('Saved');
    } catch (x) {
      setErr(x.message);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setBusy(false);
    }
  };

  const captureLocation = () => {
    setLocMsg('');
    if (!navigator.geolocation) return setLocMsg('Ee phone/browser location support cheyyatledu. Google Maps link paste cheyyandi.');
    setLocBusy(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setF((x) => ({ ...x, shopLat: Number(p.coords.latitude.toFixed(6)), shopLng: Number(p.coords.longitude.toFixed(6)) }));
        setLocMsg(`Location captured ✓ (~${Math.round(p.coords.accuracy)} m). "Save" click cheyyandi.`);
        setLocBusy(false);
      },
      (er) => {
        setLocMsg(er.code === 1 ? 'Location permission ivvaledu. Browser lo allow chesi malli try cheyyandi.' : 'Location dorakaledu. GPS ON chesi malli try cheyyandi.');
        setLocBusy(false);
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <form onSubmit={save} className="flex flex-col gap-5">
      <PageHeader title="Online Shop" subtitle="Mee customers direct ga order, booking, enquiry chese mee own shop page">
        <Link className="btn-ghost" to="/sales/items">Manage items & photos</Link>
        <Link className="btn-ghost" to="/sales/orders">Orders</Link>
      </PageHeader>
      <ErrorBox>{err}</ErrorBox>

      <section className="card p-5 flex flex-col sm:flex-row gap-5 items-start">
        <div className="flex-1 flex flex-col gap-3 min-w-0">
          <label className="flex items-center gap-3 font-bold">
            <input type="checkbox" className="w-6 h-6 accent-brand" checked={f.shopEnabled} onChange={set('shopEnabled')} />
            Shop ON (customers ki kanipistundi)
          </label>
          <Field label="Shop link" id="sh-slug" hint="Small letters, numbers, - matrame">
            <div className="flex items-center rounded-xl border border-gray-300 bg-gray-50 overflow-hidden">
              <span className="pl-3 text-sm text-muted whitespace-nowrap">{window.location.host}/s/</span>
              <input id="sh-slug" className="flex-1 h-11 px-1 bg-white outline-none min-w-0" value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value.toLowerCase() })} />
            </div>
          </Field>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-ghost h-10" onClick={copy}>{copied ? 'Copied ✓' : 'Copy link'}</button>
            <a className="btn h-10 bg-green-100 text-green-800" target="_blank" rel="noreferrer" href={`https://wa.me/?text=${encodeURIComponent(`Maa online shop chudandi, direct ga order cheyyochu 👇\n${link}`)}`}>Share on WhatsApp</a>
            <a className="btn-ghost h-10" href={link} target="_blank" rel="noreferrer">Open shop</a>
          </div>
          <p className="text-xs text-muted">Link marchina tarvata "Save" click cheyyandi.</p>
        </div>
        <div className="flex flex-col items-center gap-2">
          <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=8&data=${encodeURIComponent(link)}`} alt="QR code for your shop link" width="160" height="160" className="rounded-xl border border-line" />
          <a className="text-xs font-semibold text-brand" href={`https://api.qrserver.com/v1/create-qr-code/?size=1000x1000&margin=20&data=${encodeURIComponent(link)}`} target="_blank" rel="noreferrer">Download QR (counter lo pettandi)</a>
        </div>
      </section>

      <section className="card p-5 flex flex-col gap-4">
        <h2 className="text-lg font-bold">Shop look</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <ImageUpload label="Logo" images={f.shopLogo ? [f.shopLogo] : []} max={1} onChange={(a) => setF({ ...f, shopLogo: a[0] || '' })} />
          <ImageUpload label="Cover photo (shop front / banner)" images={f.shopCover ? [f.shopCover] : []} max={1} onChange={(a) => setF({ ...f, shopCover: a[0] || '' })} />
          <Field label="Tagline" id="sh-tag" className="sm:col-span-2"><input id="sh-tag" className="input" maxLength={120} value={f.shopTagline} onChange={set('shopTagline')} placeholder="e.g. Pure silk & cotton sarees since 1995" /></Field>
          <Field label="About the shop" id="sh-about" className="sm:col-span-2"><textarea id="sh-about" rows={3} className="input h-auto py-2.5" value={f.shopAbout} onChange={set('shopAbout')} /></Field>
          <Field label="Timings" id="sh-time"><input id="sh-time" className="input" value={f.shopTimings} onChange={set('shopTimings')} placeholder="Mon–Sat 10 AM – 9 PM" /></Field>
          <fieldset>
            <legend className="label">Theme colour</legend>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button key={c} type="button" aria-label={`Colour ${c}`} aria-pressed={f.shopColor === c} onClick={() => setF({ ...f, shopColor: c })} className="w-11 h-11 rounded-xl border-4" style={{ background: c, borderColor: f.shopColor === c ? '#F59E0B' : 'white', boxShadow: '0 0 0 1px #E5E7EB' }} />
              ))}
            </div>
          </fieldset>
        </div>
      </section>

      <section className="card p-5 flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-bold">📍 Shop location (Directions kosam)</h2>
          <p className="text-sm text-muted">Shop lo nilabadi "Use my current location" tap cheyyandi. Leda Google Maps lo mee shop open chesi <strong>Share → Copy link</strong> chesi paste cheyyandi.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn-primary" onClick={captureLocation} disabled={locBusy}>{locBusy ? 'Location teeskuntunnam…' : '📍 Use my current location'}</button>
          {f.shopLat && <a className="text-sm font-semibold text-brand underline" href={`https://www.google.com/maps?q=${f.shopLat},${f.shopLng}`} target="_blank" rel="noreferrer">Map lo chudandi</a>}
          {f.shopLat && <button type="button" className="text-sm font-semibold text-red-700 underline" onClick={() => setF({ ...f, shopLat: null, shopLng: null })}>Remove</button>}
        </div>
        {locMsg && <p className="text-sm font-semibold">{locMsg}</p>}
        <Field label="Leda Google Maps link" id="sh-map" hint="e.g. https://maps.app.goo.gl/…"><input id="sh-map" className="input" value={f.shopMapUrl} onChange={set('shopMapUrl')} /></Field>
      </section>

      <section className="card p-5 flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-bold">Customers ki em options kanipinchali?</h2>
          <p className="text-sm text-muted">ON chesinave shop lo kanipistayi.</p>
        </div>
        <div className="flex flex-col gap-3">
          <label className="flex items-center gap-3 font-semibold"><input type="checkbox" className="w-5 h-5 accent-brand" checked={f.allowPickup} onChange={set('allowPickup')} /> 🥡 Takeaway / Store pickup</label>
          <label className="flex items-center gap-3 font-semibold"><input type="checkbox" className="w-5 h-5 accent-brand" checked={f.allowDelivery} onChange={set('allowDelivery')} /> 🚚 Home delivery</label>
          <label className="flex items-center gap-3 font-semibold"><input type="checkbox" className="w-5 h-5 accent-brand" checked={f.allowTable} onChange={set('allowTable')} /> 🍽️ Table booking (restaurants, cafés)</label>
          <label className="flex items-center gap-3 font-semibold"><input type="checkbox" className="w-5 h-5 accent-brand" checked={f.allowBooking} onChange={set('allowBooking')} /> 📅 Appointment booking (services – salon, clinic, repair…)</label>
        </div>
        <div className="grid sm:grid-cols-3 gap-4">
          {f.allowDelivery && <Field label="Delivery charge (₹)" id="sh-fee"><input id="sh-fee" type="number" min="0" step="1" className="input" value={f.deliveryFee} onChange={set('deliveryFee')} /></Field>}
          <Field label="Minimum order (₹)" id="sh-min"><input id="sh-min" type="number" min="0" step="1" className="input" value={f.minOrder} onChange={set('minOrder')} /></Field>
          <Field label="UPI ID (customers direct ga pay chestaru)" id="sh-upi" hint="e.g. srisai@okaxis"><input id="sh-upi" className="input" value={f.upiId} onChange={set('upiId')} /></Field>
        </div>
      </section>

      <div className="flex items-center gap-3 sticky bottom-0 bg-ground py-3">
        <button type="submit" className="btn-primary h-12 px-8" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        {ok && <span className="text-sm font-semibold text-green-700">{ok}</span>}
      </div>
    </form>
  );
}
