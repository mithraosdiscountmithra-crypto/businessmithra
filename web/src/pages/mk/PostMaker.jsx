import { useEffect, useMemo, useRef, useState } from 'react';
import { ErrorBox, Field, MK_NAV, PageHeader, SubNav, useApi } from '../../components/ui.jsx';

// Social post maker: builds a ready-to-post image (Instagram / Facebook / WhatsApp Status) + caption.
const SIZES = { post: [1080, 1080, 'Post (square)'], story: [1080, 1920, 'Status / Story'] };
const KINDS = { offer: '🏷️ Offer / Coupon', product: '🛍️ Product', festival: '🎉 Festival wish', shop: '🏪 Shop / Order online' };
const FESTIVALS = [
  ['Sankranti', '🪁', 'Happy Sankranti', 'సంక్రాంతి శుభాకాంక్షలు'],
  ['Ugadi', '🌿', 'Happy Ugadi', 'ఉగాది శుభాకాంక్షలు'],
  ['Diwali', '🪔', 'Happy Diwali', 'దీపావళి శుభాకాంక్షలు'],
  ['Dasara', '🏹', 'Happy Dasara', 'దసరా శుభాకాంక్షలు'],
  ['Vinayaka Chavithi', '🐘', 'Happy Vinayaka Chavithi', 'వినాయక చవితి శుభాకాంక్షలు'],
  ['Christmas', '🎄', 'Merry Christmas', 'క్రిస్మస్ శుభాకాంక్షలు'],
  ['Ramzan', '🌙', 'Ramzan Mubarak', 'రంజాన్ శుభాకాంక్షలు'],
  ['New Year', '🎆', 'Happy New Year', 'నూతన సంవత్సర శుభాకాంక్షలు'],
  ['Independence Day', '🇮🇳', 'Happy Independence Day', 'స్వాతంత్ర్య దినోత్సవ శుభాకాంక్షలు'],
];
const FONT = '"Noto Sans Telugu", "Nirmala UI", system-ui, sans-serif';

const loadImg = (src) => new Promise((resolve) => {
  if (!src) return resolve(null);
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => resolve(img);
  img.onerror = () => resolve(null);
  img.src = src;
});

const shade = (hex, amt) => {
  const n = parseInt(hex.replace('#', ''), 16);
  const c = (v) => Math.max(0, Math.min(255, v + amt));
  return `rgb(${c(n >> 16)}, ${c((n >> 8) & 255)}, ${c(n & 255)})`;
};

function wrap(ctx, text, maxW) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}

function text(ctx, str, x, y, { size = 48, weight = 700, color = '#fff', align = 'center', maxW = 900, lineH = 1.2, maxLines = 3 } = {}) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  const lines = wrap(ctx, str, maxW).slice(0, maxLines);
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * size * lineH));
  return y + lines.length * size * lineH;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function cover(ctx, img, x, y, w, h) {
  const s = Math.max(w / img.width, h / img.height);
  const iw = img.width * s;
  const ih = img.height * s;
  ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
}

async function draw(canvas, o) {
  const [W, H] = SIZES[o.size];
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const tall = H > W;
  const [logo, photo, qr] = await Promise.all([loadImg(o.logo), loadImg(o.photo), loadImg(o.qrUrl)]);

  // Background
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, shade(o.color, 30));
  g.addColorStop(1, shade(o.color, -60));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = '#fff';
  [[W * 0.9, H * 0.08, 260], [W * 0.05, H * 0.55, 200], [W * 0.85, H * 0.85, 320]].forEach(([x, y, r]) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); });
  ctx.globalAlpha = 1;

  // Header: logo + shop name
  const top = tall ? 110 : 60;
  let nameX = 60;
  if (logo) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(60 + 55, top + 55, 55, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.clip();
    cover(ctx, logo, 60, top, 110, 110);
    ctx.restore();
    nameX = 190;
  }
  text(ctx, o.shopName, nameX, top + (o.tagline ? 12 : 30), { size: 46, weight: 800, align: 'left', maxW: W - nameX - 60, maxLines: 1 });
  if (o.tagline) text(ctx, o.tagline, nameX, top + 68, { size: 28, weight: 500, align: 'left', color: 'rgba(255,255,255,.85)', maxW: W - nameX - 60, maxLines: 1 });

  // Main area
  const footerH = 200;
  const mainTop = top + 160;
  const mainBottom = H - footerH - (tall ? 120 : 30);
  const cx = W / 2;
  let y = mainTop;

  if (o.kind === 'festival') {
    ctx.font = `${tall ? 260 : 190}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(o.emoji, cx, y + (tall ? 120 : 10));
    y += tall ? 460 : 230;
    y = text(ctx, o.headline, cx, y, { size: tall ? 96 : 80, weight: 900, maxW: W - 120 });
    y = text(ctx, o.subline, cx, y + 24, { size: 44, weight: 600, color: 'rgba(255,255,255,.92)', maxW: W - 160 });
    if (o.offerLine) {
      ctx.font = `800 44px ${FONT}`;
      const w = Math.min(W - 120, ctx.measureText(o.offerLine).width + 80);
      roundRect(ctx, cx - w / 2, y + 40, w, 90, 45);
      ctx.fillStyle = '#FDE047';
      ctx.fill();
      text(ctx, o.offerLine, cx, y + 62, { size: 44, weight: 800, color: '#1F2937', maxW: w - 40, maxLines: 1 });
    }
  } else if (o.kind === 'product' || (o.kind === 'offer' && photo)) {
    const boxH = Math.min(tall ? 820 : 470, mainBottom - mainTop - 260);
    const boxW = tall ? W - 140 : Math.min(W - 140, boxH * 1.4);
    if (photo) {
      ctx.save();
      roundRect(ctx, cx - boxW / 2, y, boxW, boxH, 36);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.clip();
      cover(ctx, photo, cx - boxW / 2, y, boxW, boxH);
      ctx.restore();
      if (o.badge) {
        ctx.font = `900 46px ${FONT}`;
        const bw = ctx.measureText(o.badge).width + 60;
        roundRect(ctx, cx + boxW / 2 - bw - 20, y + 20, bw, 80, 40);
        ctx.fillStyle = '#DC2626';
        ctx.fill();
        text(ctx, o.badge, cx + boxW / 2 - bw / 2 - 20, y + 36, { size: 46, weight: 900, maxLines: 1, maxW: bw });
      }
      y += boxH + 36;
    }
    y = text(ctx, o.headline, cx, y, { size: tall ? 76 : 62, weight: 900, maxW: W - 120, maxLines: 2 });
    if (o.priceLine) {
      ctx.font = `900 ${tall ? 92 : 76}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#FDE047';
      ctx.fillText(o.priceLine, cx, y + 14);
      if (o.mrpLine) {
        const pw = ctx.measureText(o.priceLine).width;
        ctx.font = `600 44px ${FONT}`;
        ctx.fillStyle = 'rgba(255,255,255,.75)';
        ctx.textAlign = 'left';
        const mx = cx + pw / 2 + 24;
        ctx.fillText(o.mrpLine, mx, y + 40);
        const mw = ctx.measureText(o.mrpLine).width;
        ctx.fillRect(mx, y + 66, mw, 4);
      }
      y += (tall ? 92 : 76) * 1.25;
    }
    if (o.subline) text(ctx, o.subline, cx, y + 6, { size: 38, weight: 600, color: 'rgba(255,255,255,.92)', maxW: W - 160, maxLines: 2 });
  } else {
    // Offer without photo / shop promo: big typography
    y += tall ? 160 : 20;
    if (o.badge) {
      y = text(ctx, o.badge, cx, y, { size: tall ? 220 : 170, weight: 900, color: '#FDE047', maxW: W - 80, maxLines: 1, lineH: 1.05 });
    }
    y = text(ctx, o.headline, cx, y + 20, { size: tall ? 88 : 72, weight: 900, maxW: W - 120 });
    y = text(ctx, o.subline, cx, y + 24, { size: 44, weight: 600, color: 'rgba(255,255,255,.92)', maxW: W - 160 });
    if (o.code) {
      ctx.setLineDash([18, 12]);
      ctx.lineWidth = 6;
      ctx.strokeStyle = '#fff';
      ctx.font = `900 64px ${FONT}`;
      const w = ctx.measureText(o.code).width + 140;
      roundRect(ctx, cx - w / 2, y + 50, w, 130, 24);
      ctx.stroke();
      ctx.setLineDash([]);
      text(ctx, 'USE CODE', cx, y + 62, { size: 26, weight: 700, color: 'rgba(255,255,255,.8)', maxLines: 1 });
      text(ctx, o.code, cx, y + 96, { size: 64, weight: 900, maxLines: 1, maxW: w });
    }
  }

  // Footer card
  const fy = H - footerH - (tall ? 110 : 40);
  roundRect(ctx, 40, fy, W - 80, footerH, 32);
  ctx.fillStyle = '#fff';
  ctx.fill();
  const qrSize = footerH - 40;
  const hasQr = Boolean(qr);
  if (hasQr) ctx.drawImage(qr, W - 60 - qrSize, fy + 20, qrSize, qrSize);
  const tx = 80;
  const tw = W - 80 - (hasQr ? qrSize + 60 : 40) - tx;
  text(ctx, o.cta, tx, fy + 26, { size: 40, weight: 900, color: shade(o.color, -40), align: 'left', maxW: tw, maxLines: 1 });
  if (o.link) text(ctx, o.link, tx, fy + 84, { size: 30, weight: 700, color: '#1F2937', align: 'left', maxW: tw, maxLines: 1 });
  const contact = [o.phone && `📞 ${o.phone}`, o.city && `📍 ${o.city}`].filter(Boolean).join('   ');
  if (contact) text(ctx, contact, tx, fy + 132, { size: 30, weight: 600, color: '#4B5563', align: 'left', maxW: tw, maxLines: 1 });
}

const tags = (shop, extra = []) => {
  const base = [shop.name.replace(/[^A-Za-z0-9]/g, ''), shop.city ? shop.city.replace(/\s+/g, '') : '', ...extra, 'shoplocal', 'supportlocalbusiness'];
  return base.filter(Boolean).map((t) => `#${t}`).join(' ');
};

export default function PostMaker() {
  const { data, error } = useApi('/marketing/post-kit');
  const canvas = useRef(null);
  const [kind, setKind] = useState('offer');
  const [size, setSize] = useState('post');
  const [lang, setLang] = useState('en');
  const [itemId, setItemId] = useState('');
  const [code, setCode] = useState('');
  const [fest, setFest] = useState(0);
  const [headline, setHeadline] = useState('');
  const [subline, setSubline] = useState('');
  const [badge, setBadge] = useState('');
  const [offerLine, setOfferLine] = useState('');
  const [color, setColor] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [caption, setCaption] = useState('');

  const shop = data?.shop;
  const link = shop ? (shop.domain ? `https://${shop.domain}` : shop.slug ? `${window.location.origin}/s/${shop.slug}` : '') : '';
  const item = data?.items.find((i) => i.id === itemId);
  const coupon = data?.coupons.find((c) => c.code === code);
  const te = lang === 'te';

  // Fill sensible text whenever the template / item / coupon changes.
  useEffect(() => {
    if (!data) return;
    if (!color) setColor(data.shop.color || '#3730A3');
    if (kind === 'festival') {
      const f = FESTIVALS[fest];
      setHeadline(te ? f[3] : f[2]);
      setSubline(te ? `${data.shop.name} tarafuna meeku, mee kutumbaniki subhakankshalu` : `Warm wishes to you and your family from ${data.shop.name}`);
      setBadge('');
    } else if (kind === 'offer') {
      setBadge(coupon ? coupon.label : '20% OFF');
      setHeadline(te ? 'Special Offer మీ కోసం!' : 'Special Offer for you!');
      setSubline(coupon?.minOrder ? (te ? `₹${coupon.minOrder} paina order ki` : `On orders above ₹${coupon.minOrder}`) : (te ? 'Limited time matrame. Ippude randi!' : 'Limited time only. Hurry!'));
    } else if (kind === 'product') {
      setHeadline(item ? item.name : (te ? 'Kotha stock vachindi!' : 'New arrival!'));
      setSubline(te ? 'Ippude order cheyyandi' : 'Order now – limited stock');
      setBadge(item?.mrp && item.mrp > item.price ? `${Math.round((1 - item.price / item.mrp) * 100)}% OFF` : '');
    } else {
      setBadge('');
      setHeadline(te ? 'Ippudu online lo order cheyyandi!' : 'Now order online!');
      setSubline(te ? 'Home delivery · Pickup · Easy UPI payment' : 'Home delivery · Pickup · Easy UPI payment');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, kind, itemId, code, fest, lang]);

  const opts = useMemo(() => shop && ({
    size, kind, color: color || shop.color, shopName: shop.name, tagline: shop.tagline, logo: shop.logo, phone: shop.phone, city: shop.city,
    photo: kind === 'product' || kind === 'offer' ? item?.image || null : null,
    headline, subline, badge, offerLine: kind === 'festival' ? offerLine : '', emoji: FESTIVALS[fest][1],
    priceLine: kind === 'product' && item ? `${item.from ? (te ? 'నుండి ' : 'From ') : ''}₹${item.price}` : '',
    mrpLine: kind === 'product' && item?.mrp && item.mrp > item.price ? `₹${item.mrp}` : '',
    code: kind === 'offer' ? code : '',
    cta: link ? (te ? 'Scan చేసి order చేయండి' : 'Scan & order online') : (te ? 'Ippude call cheyyandi' : 'Call us now'),
    link: link.replace(/^https?:\/\//, ''),
    qrUrl: link ? `https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=6&data=${encodeURIComponent(link)}` : null,
  }), [shop, size, kind, color, item, headline, subline, badge, offerLine, fest, code, link, te]);

  useEffect(() => {
    if (!opts || !canvas.current) return undefined;
    let live = true;
    const tmr = setTimeout(() => { if (live) draw(canvas.current, opts); }, 150);
    return () => { live = false; clearTimeout(tmr); };
  }, [opts]);

  useEffect(() => {
    if (!shop) return;
    const lines = [];
    if (kind === 'festival') lines.push(`${FESTIVALS[fest][1]} ${headline}! ${FESTIVALS[fest][1]}`, subline, offerLine);
    else if (kind === 'offer') lines.push(`🎉 ${headline} ${badge}`, subline, code ? (te ? `Code: ${code} vaadandi 🏷️` : `Use code: ${code} 🏷️`) : '');
    else if (kind === 'product') lines.push(`✨ ${headline}${opts?.priceLine ? ` – ${opts.priceLine}` : ''}`, subline);
    else lines.push(`🛒 ${headline}`, subline);
    lines.push('', link ? `👉 ${link}` : '', shop.phone ? `📞 ${shop.phone}` : '', shop.city ? `📍 ${shop.city}` : '', '', tags(shop, kind === 'festival' ? [FESTIVALS[fest][0].replace(/\s+/g, '')] : kind === 'offer' ? ['offer', 'discount'] : ['newarrival']));
    setCaption(lines.filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n').trim());
  }, [shop, kind, fest, headline, subline, offerLine, badge, code, link, te, opts]);

  const toBlob = () => new Promise((resolve, reject) => {
    try { canvas.current.toBlob((b) => (b ? resolve(b) : reject(new Error('Image ready avvaledu'))), 'image/png'); } catch (e) { reject(e); }
  });
  const fileName = `${(shop?.name || 'post').replace(/[^A-Za-z0-9]+/g, '-')}-${kind}.png`;
  const download = async () => {
    setMsg('');
    try {
      const blob = await toBlob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = fileName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      await navigator.clipboard?.writeText(caption).catch(() => {});
      setMsg('✅ Image download ayyindi, caption copy ayyindi. Instagram / Facebook lo upload chesi caption paste cheyyandi.');
    } catch (e) {
      setMsg(`Image save avvaledu: ${e.message}`);
    }
  };
  const share = async () => {
    setBusy(true);
    setMsg('');
    try {
      const blob = await toBlob();
      const file = new File([blob], fileName, { type: 'image/png' });
      await navigator.clipboard?.writeText(caption).catch(() => {});
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text: caption });
        setMsg('✅ Caption copy ayyindi – Instagram lo kavalante paste cheyyandi.');
      } else {
        await download();
      }
    } catch (e) {
      if (e.name !== 'AbortError') setMsg(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Marketing" subtitle="Instagram, Facebook, WhatsApp Status posts – okka click lo" />
      <SubNav items={MK_NAV} />
      <ErrorBox>{error}</ErrorBox>
      {!data ? <p className="text-muted">Loading…</p> : (
        <div className="grid lg:grid-cols-[1fr_420px] gap-5 items-start">
          <section className="flex flex-col gap-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {Object.entries(KINDS).map(([k, l]) => (
                <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className={`h-12 rounded-xl border text-sm font-bold ${kind === k ? 'bg-brand text-white border-brand' : 'bg-white border-line'}`}>{l}</button>
              ))}
            </div>
            <div className="card p-4 grid sm:grid-cols-2 gap-4">
              <Field label="Size" id="pm-size">
                <select id="pm-size" className="input" value={size} onChange={(e) => setSize(e.target.value)}>{Object.entries(SIZES).map(([k, v]) => <option key={k} value={k}>{v[2]}</option>)}</select>
              </Field>
              <Field label="Language" id="pm-lang">
                <select id="pm-lang" className="input" value={lang} onChange={(e) => setLang(e.target.value)}><option value="en">English</option><option value="te">Telugu mix</option></select>
              </Field>
              {kind === 'festival' && (
                <Field label="Festival" id="pm-fest" className="sm:col-span-2">
                  <select id="pm-fest" className="input" value={fest} onChange={(e) => setFest(Number(e.target.value))}>{FESTIVALS.map((f, i) => <option key={f[0]} value={i}>{f[1]} {f[0]}</option>)}</select>
                </Field>
              )}
              {(kind === 'product' || kind === 'offer') && (
                <Field label={kind === 'offer' ? 'Photo kosam item (optional)' : 'Item'} id="pm-item" className="sm:col-span-2">
                  <select id="pm-item" className="input" value={itemId} onChange={(e) => setItemId(e.target.value)}>
                    <option value="">{kind === 'offer' ? 'Photo vaddu' : 'Select item'}</option>
                    {data.items.map((i) => <option key={i.id} value={i.id}>{i.name}{i.image ? ' 📷' : ''} – ₹{i.price}</option>)}
                  </select>
                </Field>
              )}
              {kind === 'offer' && (
                <Field label="Coupon" id="pm-cpn" className="sm:col-span-2" hint={data.coupons.length ? '' : 'Marketing → Coupons lo create cheste ikkada vastundi'}>
                  <select id="pm-cpn" className="input" value={code} onChange={(e) => setCode(e.target.value)}>
                    <option value="">Coupon lekunda</option>
                    {data.coupons.map((c) => <option key={c.code} value={c.code}>{c.code} – {c.label}</option>)}
                  </select>
                </Field>
              )}
              <Field label="Heading" id="pm-h" className="sm:col-span-2"><input id="pm-h" className="input" maxLength={60} value={headline} onChange={(e) => setHeadline(e.target.value)} /></Field>
              <Field label="Small text" id="pm-s" className="sm:col-span-2"><input id="pm-s" className="input" maxLength={90} value={subline} onChange={(e) => setSubline(e.target.value)} /></Field>
              {kind !== 'festival' && kind !== 'shop' && <Field label="Big badge" id="pm-b" hint="e.g. 20% OFF, BUY 1 GET 1"><input id="pm-b" className="input" maxLength={16} value={badge} onChange={(e) => setBadge(e.target.value)} /></Field>}
              {kind === 'festival' && <Field label="Festival offer (optional)" id="pm-o" className="sm:col-span-2"><input id="pm-o" className="input" maxLength={40} value={offerLine} onChange={(e) => setOfferLine(e.target.value)} placeholder="e.g. Flat 15% OFF this week" /></Field>}
              <Field label="Colour" id="pm-c"><input id="pm-c" type="color" className="input h-11 p-1" value={color || shop.color} onChange={(e) => setColor(e.target.value)} /></Field>
            </div>
            <div className="card p-4 flex flex-col gap-2">
              <label htmlFor="pm-cap" className="font-bold text-sm">Caption + hashtags</label>
              <textarea id="pm-cap" rows={7} className="input h-auto py-2.5 text-sm" value={caption} onChange={(e) => setCaption(e.target.value)} />
            </div>
            {!shop.slug && <p className="text-sm bg-amber-50 border border-amber-200 rounded-xl p-3">Online Shop on chesthe post lo QR code + order link kuda vastayi.</p>}
            {!shop.logo && <p className="text-sm text-muted">Tip: Online Shop settings lo logo upload chesthe post lo kanipistundi.</p>}
          </section>

          <aside className="flex flex-col gap-3 lg:sticky lg:top-4">
            <div className="card p-3 bg-gray-50">
              <canvas ref={canvas} role="img" aria-label="Post preview" className="w-full h-auto rounded-xl shadow" />
            </div>
            <button type="button" className="btn-primary h-12" disabled={busy} onClick={share}>📤 Share (Instagram / WhatsApp / Facebook)</button>
            <button type="button" className="btn-ghost" onClick={download}>⬇️ Download image + copy caption</button>
            {msg && <p className="text-sm font-semibold" role="status">{msg}</p>}
            <p className="text-xs text-muted">Phone lo "Share" nokkithe Instagram, Facebook, WhatsApp Status options vastayi. Caption automatic ga copy avtundi – Instagram lo paste cheyyandi.</p>
          </aside>
        </div>
      )}
    </div>
  );
}
