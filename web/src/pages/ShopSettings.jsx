import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { ErrorBox, Field, PageHeader } from '../components/ui.jsx';
import ImageUpload from '../components/ImageUpload.jsx';
import { useAuth } from '../auth.jsx';
import { autoAbout, autoTagline } from '../lib/shopTheme.js';

const COLORS = ['#3730A3', '#C2410C', '#0F766E', '#BE185D', '#1D4ED8', '#7C2D12', '#111827'];

// Online payment (Razorpay) + cash on delivery.
function PaymentsCard({ initial }) {
  const [p, setP] = useState({ allowOnlinePay: initial.allowOnlinePay, allowCod: initial.allowCod, allowUpiPay: initial.allowUpiPay ?? true, rzpKeyId: initial.rzpKeyId, rzpKeySecret: '' });
  const [info, setInfo] = useState(initial);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async (extra = {}) => {
    setBusy(true);
    setErr('');
    setMsg('');
    try {
      const r = await api('/shop-admin/payments', { method: 'PUT', body: { ...p, ...extra } });
      setInfo(r.settings);
      setP({ allowOnlinePay: r.settings.allowOnlinePay, allowCod: r.settings.allowCod, allowUpiPay: r.settings.allowUpiPay, rzpKeyId: r.settings.rzpKeyId, rzpKeySecret: '' });
      setMsg('Saved ✓');
    } catch (x) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="card p-5 flex flex-col gap-4">
      <h2 className="font-bold text-lg">💳 Payments – online shop</h2>
      <p className="text-sm text-muted -mt-2">Customer ki e options kanipinchalo on / off cheyyandi. Kanisam okkati on lo undali.</p>
      <ErrorBox>{err}</ErrorBox>
      <label className="flex items-start gap-3"><input type="checkbox" className="w-5 h-5 mt-0.5 accent-brand" checked={p.allowOnlinePay} onChange={(e) => setP({ ...p, allowOnlinePay: e.target.checked })} />
        <span><b>💳 Online payment – Razorpay (UPI / Card / Netbanking)</b><span className="block text-xs text-muted">Customer order chesetappude Razorpay lo pay chestaru, order automatic ga "Paid" avtundi.</span></span></label>
      <label className="flex items-start gap-3"><input type="checkbox" className="w-5 h-5 mt-0.5 accent-brand" checked={p.allowCod} onChange={(e) => setP({ ...p, allowCod: e.target.checked })} />
        <span><b>💵 Cash (delivery / at shop)</b><span className="block text-xs text-muted">Order teesukune appudu cash.</span></span></label>
      <label className="flex items-start gap-3"><input type="checkbox" className="w-5 h-5 mt-0.5 accent-brand" checked={p.allowUpiPay} onChange={(e) => setP({ ...p, allowUpiPay: e.target.checked })} />
        <span><b>📱 UPI to my UPI ID (manual)</b><span className="block text-xs text-muted">Customer GPay / PhonePe tho mee UPI ID ki pay chestaru. Dabbulu vachaka meeru order lo "Paid" mark cheyyali.{!initial.upiId && ' Paina "UPI ID" box lo mee UPI ID pettandi.'}</span></span></label>
      {info.platformTest && !info.rzpSecretSaved && (
        <p className="text-sm bg-amber-50 border border-amber-200 rounded-xl p-3">🧪 <b>Test mode:</b> mee keys lekapoyina BusinessMithra test keys tho online payment try cheyyochu. Test lo real money povu – Razorpay test UPI <code>success@razorpay</code> leda test card vaadandi.</p>
      )}
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Razorpay Key ID" id="rz-id" hint="Razorpay Dashboard → Account & Settings → API Keys"><input id="rz-id" className="input" value={p.rzpKeyId} onChange={(e) => setP({ ...p, rzpKeyId: e.target.value.trim() })} placeholder="rzp_live_…" autoComplete="off" /></Field>
        <Field label="Razorpay Key Secret" id="rz-sec" hint={info.rzpSecretSaved ? 'Saved ✓ (marchalante kotha secret ivvandi)' : 'Dabbulu direct ga mee bank ki vastayi'}><input id="rz-sec" type="password" className="input" value={p.rzpKeySecret} onChange={(e) => setP({ ...p, rzpKeySecret: e.target.value.trim() })} placeholder={info.rzpSecretSaved ? '••••••••' : ''} autoComplete="new-password" /></Field>
      </div>
      <div className="flex flex-wrap gap-3 items-center">
        <button type="button" className="btn-primary" disabled={busy} onClick={() => save()}>{busy ? 'Checking…' : 'Save payments'}</button>
        {info.rzpSecretSaved && <button type="button" className="btn-ghost text-red-700" disabled={busy} onClick={() => window.confirm('Remove Razorpay keys?') && save({ removeKeys: true, rzpKeyId: '', rzpKeySecret: '' })}>Remove keys</button>}
        {msg && <span className="text-sm font-semibold text-green-800">{msg}</span>}
      </div>
    </section>
  );
}

export default function ShopSettings() {
  const { me } = useAuth();
  const [f, setF] = useState(null);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [locBusy, setLocBusy] = useState(false);
  const [locMsg, setLocMsg] = useState('');
  const [cname, setCname] = useState(null);
  const [domain, setDomain] = useState('');
  const [domMsg, setDomMsg] = useState('');

  useEffect(() => {
    api('/shop-admin/settings').then((r) => { setF(r.settings); setCname(r.cnameTarget); setDomain((r.settings.customDomain || '').replace(/^www\./, '')); }).catch((e) => setErr(e.message));
  }, []);

  if (!f) return <p className="text-muted">{err || 'Loading…'}</p>;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const link = f.customDomain && f.customDomainStatus === 'live' ? `https://${f.customDomain}` : `${window.location.origin}/s/${f.slug}`;
  const saveDomain = async (value) => {
    setDomMsg('');
    try {
      const r = await api('/shop-admin/domain', { method: 'PUT', body: { domain: value } });
      setF({ ...f, ...r });
      setDomMsg(value ? 'Request pampamu ✓ Kinda DNS steps cheyyandi.' : 'Domain teesesamu.');
    } catch (x) {
      setDomMsg(x.message);
    }
  };

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

      <PaymentsCard initial={f} />
      <section className="card p-5 flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-bold">🌐 Mee own website domain (optional)</h2>
          <p className="text-sm text-muted">e.g. <strong>srisaitextiles.in</strong>. Customers Google lo mee peru search chesthe mee own website ga vastundi. Domain GoDaddy / Hostinger / BigRock lo konandi.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="sr-only" htmlFor="sh-dom">Domain</label>
          <input id="sh-dom" className="input flex-1 min-w-[220px]" value={domain} onChange={(e) => setDomain(e.target.value.toLowerCase())} placeholder="srisaitextiles.in" />
          <button type="button" className="btn-primary" onClick={() => saveDomain(domain)}>{f.customDomain ? 'Update' : 'Connect'}</button>
          {f.customDomain && <button type="button" className="btn-ghost text-red-700" onClick={() => { setDomain(''); saveDomain(''); }}>Remove</button>}
        </div>
        {domMsg && <p className="text-sm font-semibold">{domMsg}</p>}
        {f.customDomain && (
          <div className={`rounded-xl p-4 text-sm flex flex-col gap-2 ${f.customDomainStatus === 'live' ? 'bg-green-50' : 'bg-amber-50'}`}>
            <p className="font-bold">{f.customDomainStatus === 'live' ? `✅ Live: https://${f.customDomain}` : `⏳ ${f.customDomain} – setup jarugutundi`}</p>
            {f.customDomainStatus !== 'live' && (
              <>
                <p>Mee domain company (GoDaddy / Hostinger…) DNS settings lo ee 2 cheyyandi:</p>
                <ol className="list-decimal pl-5 flex flex-col gap-1">
                  <li><strong>CNAME</strong> record: Name/Host <code className="bg-white px-1 rounded">www</code> → Value/Points to <code className="bg-white px-1 rounded">{cname || 'BusinessMithra team cheptaru'}</code></li>
                  <li><strong>Domain forwarding</strong>: <code className="bg-white px-1 rounded">{f.customDomain.replace(/^www\./, '')}</code> → <code className="bg-white px-1 rounded">https://{f.customDomain}</code> (permanent / 301)</li>
                </ol>
                <p>Taruvata BusinessMithra team server lo connect chesi live chestaru (24 gantallo). Help kavalante maaku WhatsApp cheyyandi.</p>
              </>
            )}
          </div>
        )}
      </section>

      <section className="card p-5 flex flex-col gap-4">
        <h2 className="text-lg font-bold">Shop look</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <ImageUpload label="Logo" images={f.shopLogo ? [f.shopLogo] : []} max={1} onChange={(a) => setF({ ...f, shopLogo: a[0] || '' })} />
          <ImageUpload label="Cover photo (shop front / banner)" images={f.shopCover ? [f.shopCover] : []} max={1} onChange={(a) => setF({ ...f, shopCover: a[0] || '' })} />
          <ImageUpload label="Gallery photos (shop, food, products – website lo chupistam)" images={f.shopGallery || []} max={8} onChange={(a) => setF({ ...f, shopGallery: a })} />
          <div className="grid sm:grid-cols-3 gap-3">
            <Field label="Instagram link" id="sh-ig"><input id="sh-ig" className="input" value={f.shopInstagram || ''} onChange={(e) => setF({ ...f, shopInstagram: e.target.value })} placeholder="https://instagram.com/…" /></Field>
            <Field label="Facebook page link" id="sh-fb"><input id="sh-fb" className="input" value={f.shopFacebook || ''} onChange={(e) => setF({ ...f, shopFacebook: e.target.value })} placeholder="https://facebook.com/…" /></Field>
            <Field label="YouTube link" id="sh-yt"><input id="sh-yt" className="input" value={f.shopYoutube || ''} onChange={(e) => setF({ ...f, shopYoutube: e.target.value })} placeholder="https://youtube.com/…" /></Field>
          </div>
          <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-2 rounded-xl p-3" style={{ background: 'linear-gradient(90deg,#EEF2FF,#FDF2F8)' }}>
            <span className="text-sm"><b>✨ Auto write</b> – mee business type, peru, city, items batti professional tagline + about raastundi. Taruvatha marchukovachu.</span>
            <button type="button" className="btn-ghost h-10 bg-white" onClick={async () => {
              let categories = [];
              try { const r = await api('/items'); categories = [...new Set((r.items || []).filter((i) => i.showInShop !== false).map((i) => i.category).filter(Boolean))]; } catch { /* ignore */ }
              const info = { name: me.business.name, type: me.business.type, city: me.business.city, categories, allowDelivery: f.allowDelivery, allowPickup: f.allowPickup, allowTable: f.allowTable, allowBooking: f.allowBooking, onlinePay: f.allowOnlinePay };
              setF({ ...f, shopTagline: autoTagline(info), shopAbout: autoAbout(info) });
            }}>✨ Write for me</button>
          </div>
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
          <h2 className="text-lg font-bold">📍 Shop location (Directions & delivery kosam)</h2>
          <p className="text-sm text-muted">Shop lo nilabadi "Use my current location" tap cheyyandi. Leda Google Maps lo mee shop open chesi <strong>Share → Copy link</strong> chesi paste cheyyandi.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn-primary" onClick={captureLocation} disabled={locBusy}>{locBusy ? 'Location teeskuntunnam…' : '📍 Use my current location'}</button>
          {f.shopLat && <a className="text-sm font-semibold text-brand underline" href={`https://www.google.com/maps?q=${f.shopLat},${f.shopLng}`} target="_blank" rel="noreferrer">Map lo chudandi</a>}
          {f.shopLat && <button type="button" className="text-sm font-semibold text-red-700 underline" onClick={() => setF({ ...f, shopLat: null, shopLng: null })}>Remove</button>}
        </div>
        {locMsg && <p className="text-sm font-semibold">{locMsg}</p>}
        <Field label="Leda Google Maps link" id="sh-map" hint="e.g. https://maps.app.goo.gl/…"><input id="sh-map" className="input" value={f.shopMapUrl} onChange={set('shopMapUrl')} /></Field>
        <label className="flex items-start gap-3 rounded-xl border border-line p-3">
          <input type="checkbox" className="w-5 h-5 mt-0.5 accent-brand" checked={f.showLocation !== false} onChange={(e) => setF({ ...f, showLocation: e.target.checked })} />
          <span><b>Customers ki location chupinchu</b>
            <span className="block text-xs text-muted">Off chesthe shop website lo map, Directions buttons raavu. Location mee Delivery plan (route, distance) kosam matrame vaadatam.</span></span>
        </label>
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
          <Field label="New order WhatsApp alert number" id="sh-alert" hint="Kotha order vaste ee number ki WhatsApp msg. Khaali ga unte business number."><input id="sh-alert" inputMode="numeric" maxLength={10} className="input" value={f.orderAlertPhone || ''} onChange={set('orderAlertPhone')} /></Field>
        </div>
      </section>

      <div className="flex items-center gap-3 sticky bottom-0 bg-ground py-3">
        <button type="submit" className="btn-primary h-12 px-8" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        {ok && <span className="text-sm font-semibold text-green-700">{ok}</span>}
      </div>
    </form>
  );
}
