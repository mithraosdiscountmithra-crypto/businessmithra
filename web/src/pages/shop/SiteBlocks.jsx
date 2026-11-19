// Website design templates for the shop page + the extra sections (stats, why us, steps, call-to-action).
import { accent, emojiFor, heroArt, tint, typeInfo } from '../../lib/shopTheme.js';

export const TEMPLATES = {
  classic: { name: 'Classic', desc: 'Pedda photo banner, clean & simple', page: '#F6F6F8', dark: false, h: 'font-extrabold', radius: 'rounded-2xl' },
  modern: { name: 'Modern', desc: 'Text left, photo right, trust badges', page: '#FFFFFF', dark: false, h: 'font-extrabold tracking-tight', radius: 'rounded-3xl' },
  bold: { name: 'Bold Dark', desc: 'Dark look, bright colours – restaurants, cafes', page: '#0B0F19', dark: true, h: 'font-black uppercase tracking-tight', radius: 'rounded-2xl' },
  elegant: { name: 'Elegant', desc: 'Soft colours, classy fonts – sarees, jewellery, salon', page: '#FBF8F3', dark: false, h: 'font-semibold', serif: true, radius: 'rounded-xl' },
  fresh: { name: 'Fresh & Colourful', desc: 'Fun, colourful – grocery, sweets, kids', page: '#FFFDF5', dark: false, h: 'font-black', radius: 'rounded-[28px]' },
};
export const tplOf = (key) => TEMPLATES[key] || TEMPLATES.classic;
export const serifStyle = { fontFamily: 'Georgia, "Times New Roman", serif' };

// ── Hero (top banner) in 5 styles ──
export function Hero({ tpl, tKey, shop, tagline, color, dirUrl, onTable, cover, stats }) {
  const c2 = accent(color);
  const bg = cover ? `url(${cover})` : heroArt(shop.type, color);
  const hStyle = tpl.serif ? serifStyle : undefined;
  const Buttons = ({ light }) => (
    <div className="flex flex-wrap gap-3 pt-2">
      {(shop.allowPickup || shop.allowDelivery) && <a href="#menu" className="h-12 px-6 rounded-xl font-bold flex items-center shadow" style={light ? { background: color, color: '#fff' } : { background: '#fff', color: '#111827' }}>🛒 Order online</a>}
      {shop.allowTable && <button type="button" onClick={onTable} className="h-12 px-6 rounded-xl font-bold text-white shadow" style={{ background: light ? c2 : color }}>🍽️ Book a table</button>}
      {shop.phone && <a href={`https://wa.me/91${shop.phone}`} target="_blank" rel="noreferrer" className="h-12 px-6 rounded-xl font-bold flex items-center bg-green-600 text-white shadow">WhatsApp</a>}
      {dirUrl && <a href={dirUrl} target="_blank" rel="noreferrer" className={`h-12 px-6 rounded-xl font-bold flex items-center border ${light ? 'border-gray-300 bg-white text-gray-900' : 'bg-white/15 border-white/40 text-white backdrop-blur'}`}>📍 Directions</a>}
    </div>
  );
  const Meta = ({ light }) => (
    <div className={`flex flex-wrap gap-x-4 gap-y-1 text-sm ${light ? 'text-gray-600' : 'text-white/90'}`}>
      {shop.timings && <span>🕒 {shop.timings}</span>}
      {shop.city && <span>📍 {[shop.address, shop.city].filter(Boolean).join(', ')}</span>}
    </div>
  );

  if (tKey === 'modern') {
    return (
      <header id="top" className="relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${tint(color, 0.08)}, #fff 55%, color-mix(in srgb, ${c2} 10%, white))` }}>
        <div className="max-w-6xl mx-auto px-4 py-12 sm:py-20 grid md:grid-cols-2 gap-10 items-center">
          <div className="flex flex-col gap-4">
            <span className="self-start px-3 py-1.5 rounded-full text-xs font-bold" style={{ background: tint(color, 0.12), color }}>✨ {typeInfo(shop.type).hero}</span>
            <h1 className={`text-4xl sm:text-6xl ${tpl.h} leading-[1.05] text-gray-900`}>{shop.name}</h1>
            <p className="text-lg sm:text-xl text-gray-600">{tagline}</p>
            <Meta light />
            <Buttons light />
            {stats.length > 0 && (
              <div className="flex flex-wrap gap-6 pt-4">
                {stats.map(([v, l]) => <div key={l}><p className="text-2xl font-black" style={{ color }}>{v}</p><p className="text-xs text-gray-500 font-semibold">{l}</p></div>)}
              </div>
            )}
          </div>
          <div className="relative">
            <div className="absolute -inset-4 rounded-[40px] rotate-3" style={{ background: `linear-gradient(135deg, ${color}, ${c2})`, opacity: 0.18 }} aria-hidden="true" />
            <div className="relative aspect-[4/3] rounded-[32px] shadow-2xl" style={{ backgroundImage: bg, backgroundSize: 'cover', backgroundPosition: 'center' }} role="img" aria-label={`${shop.name}`} />
          </div>
        </div>
      </header>
    );
  }

  if (tKey === 'elegant') {
    return (
      <header id="top" className="relative">
        <div className="h-[46vh] min-h-[280px] w-full" style={{ backgroundImage: bg, backgroundSize: 'cover', backgroundPosition: 'center' }} role="img" aria-label={shop.name} />
        <div className="max-w-3xl mx-auto px-4 -mt-24 relative">
          <div className="bg-white/95 backdrop-blur rounded-xl shadow-xl px-6 py-8 text-center flex flex-col items-center gap-3 border" style={{ borderColor: tint(color, 0.25) }}>
            <span className="text-xs tracking-[0.3em] uppercase font-semibold" style={{ color }}>Welcome to</span>
            <h1 className="text-4xl sm:text-5xl text-gray-900" style={serifStyle}>{shop.name}</h1>
            <span className="h-px w-24" style={{ background: color }} aria-hidden="true" />
            <p className="text-lg text-gray-600 italic" style={serifStyle}>{tagline}</p>
            <Meta light />
            <div className="flex justify-center"><Buttons light /></div>
          </div>
        </div>
      </header>
    );
  }

  if (tKey === 'bold') {
    return (
      <header id="top" className="relative overflow-hidden bg-[#0B0F19]">
        <div className="absolute inset-0 opacity-50" style={{ backgroundImage: bg, backgroundSize: 'cover', backgroundPosition: 'center' }} aria-hidden="true" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0B0F19] via-[#0B0F19]/85 to-transparent" aria-hidden="true" />
        <div className="relative max-w-6xl mx-auto px-4 py-20 sm:py-28 text-white flex flex-col gap-5">
          <span className="self-start h-1.5 w-24 rounded-full" style={{ background: `linear-gradient(90deg, ${color}, ${c2})` }} aria-hidden="true" />
          <h1 className={`text-5xl sm:text-7xl ${tpl.h} leading-[0.95] max-w-3xl`}>{shop.name}</h1>
          <p className="text-xl text-white/80 max-w-xl">{tagline}</p>
          <Meta />
          <Buttons />
        </div>
      </header>
    );
  }

  if (tKey === 'fresh') {
    const t = typeInfo(shop.type);
    return (
      <header id="top" className="relative overflow-hidden" style={{ background: `linear-gradient(160deg, color-mix(in srgb, ${c2} 22%, white), ${tint(color, 0.15)})` }}>
        <div className="max-w-6xl mx-auto px-4 py-12 sm:py-16 grid md:grid-cols-[1.2fr_1fr] gap-8 items-center">
          <div className="flex flex-col gap-4">
            <h1 className={`text-4xl sm:text-6xl ${tpl.h} leading-tight`} style={{ color }}>{shop.name}</h1>
            <p className="text-lg sm:text-xl font-semibold text-gray-700">{tagline}</p>
            <Meta light />
            <Buttons light />
          </div>
          <div className="grid grid-cols-3 gap-3" aria-hidden="true">
            {t.emojis.slice(0, 6).map((e, i) => (
              <div key={e} className="aspect-square rounded-[28px] flex items-center justify-center text-5xl shadow-md bg-white" style={{ transform: `rotate(${i % 2 ? 4 : -4}deg)`, background: i % 3 === 0 ? tint(color, 0.15) : i % 3 === 1 ? '#fff' : `color-mix(in srgb, ${c2} 20%, white)` }}>{e}</div>
            ))}
          </div>
        </div>
      </header>
    );
  }

  // classic
  return (
    <header id="top" className="relative overflow-hidden">
      <div className="absolute inset-0" style={{ backgroundImage: bg, backgroundSize: 'cover', backgroundPosition: 'center' }} aria-hidden="true" />
      <div className={`absolute inset-0 ${cover ? 'bg-gradient-to-t from-black/80 via-black/45 to-black/25' : 'bg-gradient-to-t from-black/45 via-black/10 to-transparent'}`} aria-hidden="true" />
      <div className="relative max-w-6xl mx-auto px-4 py-16 sm:py-24 text-white flex flex-col gap-4">
        <h1 className="text-4xl sm:text-6xl font-extrabold leading-tight max-w-3xl drop-shadow-lg" style={hStyle}>{shop.name}</h1>
        <p className="text-lg sm:text-xl text-white/95 max-w-2xl drop-shadow">{tagline}</p>
        <Meta />
        <Buttons />
      </div>
    </header>
  );
}

// Trust numbers shown in the hero / under it.
export function makeStats(shop, items, categories) {
  const out = [];
  if (shop.since) out.push([`${shop.since}`, 'Since']);
  if (items.length) out.push([`${items.length}+`, typeInfo(shop.type).word === 'food' ? 'Dishes' : typeInfo(shop.type).word === 'services' ? 'Services' : 'Products']);
  if (categories.length) out.push([`${categories.length}`, 'Categories']);
  if (shop.allowDelivery) out.push(['🚚', 'Home delivery']);
  return out.slice(0, 4);
}

export function StatsStrip({ stats, color, dark }) {
  if (!stats.length) return null;
  return (
    <div className={dark ? 'bg-[#111827] text-white' : 'bg-white border-b border-gray-200'}>
      <div className="max-w-6xl mx-auto px-4 py-5 grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
        {stats.map(([v, l]) => (
          <div key={l}><p className="text-2xl font-black" style={{ color: dark ? '#fff' : color }}>{v}</p><p className={`text-xs font-semibold ${dark ? 'text-white/60' : 'text-gray-500'}`}>{l}</p></div>
        ))}
      </div>
    </div>
  );
}

const WHY = {
  restaurant: [['🥬', 'Fresh ingredients', 'Cooked fresh every day'], ['🧼', 'Clean kitchen', 'Hygiene comes first'], ['⚡', 'Quick service', 'Hot food, on time'], ['💰', 'Fair prices', 'Great taste, honest rates']],
  salon: [['🧑‍🎨', 'Trained experts', 'Skilled, friendly team'], ['🧴', 'Quality products', 'Branded & safe'], ['🧼', 'Hygienic', 'Clean tools, every time'], ['📅', 'Easy booking', 'Book your slot online']],
  clinic: [['👨‍⚕️', 'Experienced care', 'Trusted doctors & staff'], ['🧼', 'Safe & clean', 'Strict hygiene'], ['⏱️', 'Less waiting', 'Book ahead'], ['❤️', 'Caring service', 'We listen to you']],
  education: [['👩‍🏫', 'Expert teachers', 'Clear, simple teaching'], ['📝', 'Regular tests', 'Track progress'], ['👥', 'Small batches', 'Personal attention'], ['🏆', 'Results', 'Students who succeed']],
};
const WHY_DEFAULT = [['✅', 'Quality assured', 'Only good products'], ['💰', 'Best prices', 'Honest, fair rates'], ['🚚', 'Fast service', 'Quick pickup & delivery'], ['🤝', 'Trusted by locals', 'Friendly, reliable service']];

export function WhyUs({ shop, tpl, color }) {
  const list = WHY[shop.type] || WHY_DEFAULT;
  const c2 = accent(color);
  return (
    <section className="max-w-6xl mx-auto px-4 pt-14">
      <p className="text-sm font-bold uppercase tracking-wider text-center" style={{ color }}>Why choose us</p>
      <h2 className={`text-2xl sm:text-3xl ${tpl.h} text-center mt-1 mb-6 ${tpl.dark ? 'text-white' : ''}`} style={tpl.serif ? serifStyle : undefined}>Why customers love {shop.name}</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {list.map(([i, t, sub], n) => (
          <div key={t} className={`${tpl.radius} p-5 flex flex-col gap-2 ${tpl.dark ? 'bg-white/5 border border-white/10 text-white' : 'bg-white border border-gray-200 shadow-sm'}`}>
            <span className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl" style={{ background: n % 2 ? tint(color, 0.12) : `color-mix(in srgb, ${c2} 18%, white)` }} aria-hidden="true">{i}</span>
            <b>{t}</b>
            <span className={`text-sm ${tpl.dark ? 'text-white/60' : 'text-gray-600'}`}>{sub}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function Steps({ shop, tpl, color }) {
  if (!(shop.allowPickup || shop.allowDelivery)) return null;
  const steps = [
    ['Choose', `Pick from our ${shop.type === 'restaurant' ? 'menu' : 'items'}`],
    ['Order', 'Add to cart & place order'],
    ['Pay', [shop.onlinePay && 'Online', shop.upi && 'UPI', shop.cod && 'Cash'].filter(Boolean).join(' / ') || 'Easy payment'],
    ['Enjoy', shop.allowDelivery ? 'Delivered to your door' : 'Pick up from the shop'],
  ];
  return (
    <section className="max-w-6xl mx-auto px-4 pt-14">
      <h2 className={`text-2xl sm:text-3xl ${tpl.h} text-center mb-6 ${tpl.dark ? 'text-white' : ''}`} style={tpl.serif ? serifStyle : undefined}>How to order</h2>
      <ol className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {steps.map(([t, sub], i) => (
          <li key={t} className={`${tpl.radius} p-5 ${tpl.dark ? 'bg-white/5 text-white' : 'bg-white border border-gray-200'}`}>
            <span className="text-3xl font-black" style={{ color }}>{String(i + 1).padStart(2, '0')}</span>
            <b className="block mt-1">{t}</b>
            <span className={`text-sm ${tpl.dark ? 'text-white/60' : 'text-gray-600'}`}>{sub}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function CtaBand({ shop, tpl, color }) {
  const c2 = accent(color);
  return (
    <section className="max-w-6xl mx-auto px-4 pt-14">
      <div className={`${tpl.radius} px-6 py-10 text-center text-white flex flex-col items-center gap-4 shadow-lg`} style={{ background: `linear-gradient(120deg, ${color}, ${c2})` }}>
        <h2 className={`text-2xl sm:text-3xl ${tpl.h}`} style={tpl.serif ? serifStyle : undefined}>{!(shop.allowPickup || shop.allowDelivery) ? 'Have a question? We are happy to help!' : shop.type === 'restaurant' ? 'Hungry for something good? Order now!' : 'Ready to shop? Order online now!'}</h2>
        <p className="text-white/90">{emojiFor('', shop.type)} {shop.name}{shop.city ? ` · ${shop.city}` : ''}</p>
        <div className="flex flex-wrap justify-center gap-3">
          {(shop.allowPickup || shop.allowDelivery) && <a href="#menu" className="h-12 px-6 rounded-xl font-bold flex items-center bg-white text-gray-900">🛒 Order online</a>}
          {shop.phone && <a href={`https://wa.me/91${shop.phone}`} target="_blank" rel="noreferrer" className="h-12 px-6 rounded-xl font-bold flex items-center bg-green-600 text-white">WhatsApp</a>}
          {shop.phone && <a href={`tel:${shop.phone}`} className="h-12 px-6 rounded-xl font-bold flex items-center bg-white/20 border border-white/50">📞 Call</a>}
        </div>
      </div>
    </section>
  );
}
