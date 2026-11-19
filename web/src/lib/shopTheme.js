// Auto look & words for a shop website, from its business type, name, city and item categories.
// No outside images: banners and placeholders are drawn as SVG, so they always load fast.

const TYPES = {
  restaurant: { emojis: ['🍛', '🍲', '🥘', '🍗', '🥗', '☕', '🍜', '🫓'], word: 'food', hero: 'Fresh, tasty & made with love' },
  retail: { emojis: ['🛍️', '🎁', '👗', '🧺', '✨', '🏷️', '🛒', '💫'], word: 'products', hero: 'Quality products at the best prices' },
  salon: { emojis: ['💇', '💅', '💄', '✂️', '🌸', '🪞', '✨', '💆'], word: 'services', hero: 'Look good, feel great' },
  clinic: { emojis: ['🩺', '💊', '🏥', '❤️', '🦷', '🌿', '👨‍⚕️', '🩹'], word: 'care', hero: 'Caring for you and your family' },
  education: { emojis: ['📚', '✏️', '🎓', '🧠', '📐', '💡', '🏆', '📝'], word: 'courses', hero: 'Learn better, grow faster' },
  services: { emojis: ['🛠️', '⚙️', '🔧', '🏠', '⚡', '🚚', '✅', '📞'], word: 'services', hero: 'Reliable service you can trust' },
  wholesale: { emojis: ['📦', '🚚', '🏬', '🧾', '🛒', '🏷️', '📊', '🤝'], word: 'products', hero: 'Bulk orders at the best rates' },
  manufacturing: { emojis: ['🏭', '⚙️', '📦', '🔩', '🧰', '🚚', '✅', '🤝'], word: 'products', hero: 'Made with quality, delivered on time' },
  others: { emojis: ['⭐', '🛍️', '✨', '🎉', '💫', '📍', '🤝', '❤️'], word: 'products', hero: 'Welcome! We are happy to serve you' },
};

// Category / item word → emoji (works for Telugu-English item names too).
const WORDS = [
  [/biryani|rice|pulao|meals|thali|annam/i, '🍛'], [/chicken|mutton|meat|kodi|fish|chepa|prawn|egg|guddu/i, '🍗'], [/pizza/i, '🍕'], [/burger/i, '🍔'],
  [/dosa|idli|tiffin|vada|upma|puri|breakfast/i, '🥞'], [/tea|coffee|chai|kaapi/i, '☕'], [/juice|shake|lassi|drink|soda|beverage/i, '🥤'],
  [/cake|bakery|pastry|bread|cookie|biscuit/i, '🎂'], [/sweet|mithai|laddu|jalebi|halwa|kova/i, '🍬'], [/ice ?cream|kulfi/i, '🍦'],
  [/noodle|fried rice|chinese|manchurian/i, '🍜'], [/curry|kura|dal|pappu|sambar/i, '🍲'], [/roti|chapati|naan|paratha/i, '🫓'], [/starter|snack|chaat|samosa|pakoda/i, '🥟'],
  [/veg|vegetable|kooragayalu|sabzi/i, '🥦'], [/fruit|pandlu|mango|banana|apple/i, '🍎'], [/grocery|kirana|dal|atta|oil|masala|spice/i, '🧺'], [/milk|dairy|curd|paneer|ghee/i, '🥛'],
  [/saree|silk|cotton|dress|kurti|lehenga|blouse|fashion|cloth|shirt|jeans|wear/i, '👗'], [/shoe|chappal|footwear|sandal/i, '👟'], [/jewel|gold|silver|bangle|necklace/i, '💍'],
  [/mobile|phone|laptop|electronic|charger|tv|gadget/i, '📱'], [/book|stationery|pen|notebook/i, '📚'], [/toy|kids|baby/i, '🧸'], [/flower|pooja|puja|garland/i, '🌸'],
  [/medicine|tablet|pharma|syrup/i, '💊'], [/hair|cut|salon|beard|shave/i, '💇'], [/facial|spa|massage|skin|beauty/i, '💆'], [/nail|manicure|pedicure/i, '💅'],
  [/bridal|makeup|mehendi/i, '👰'], [/repair|service|fix/i, '🛠️'], [/clean|wash|laundry/i, '🧼'], [/class|course|tuition|coaching/i, '📚'],
];
export const emojiFor = (text, type = 'others') => {
  const hit = WORDS.find(([re]) => re.test(text || ''));
  return hit ? hit[1] : (TYPES[type] || TYPES.others).emojis[0];
};

export const typeInfo = (type) => TYPES[type] || TYPES.others;

// Colour helpers
const hex = (h) => {
  const n = parseInt(String(h || '#3730A3').replace('#', ''), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
};
export const tint = (h, a) => { const [r, g, b] = hex(h); return `rgba(${r}, ${g}, ${b}, ${a})`; };
const mix = (h, amt) => { const [r, g, b] = hex(h); const c = (v) => Math.max(0, Math.min(255, Math.round(v + amt))); return `rgb(${c(r)}, ${c(g)}, ${c(b)})`; };

// Second colour that goes well with the shop colour (rotated hue) – for gradients and accents.
export function accent(h) {
  const [r, g, b] = hex(h).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let hue = 0;
  const d = max - min;
  if (d) {
    if (max === r) hue = ((g - b) / d) % 6;
    else if (max === g) hue = (b - r) / d + 2;
    else hue = (r - g) / d + 4;
  }
  hue = (hue * 60 + 360 + 40) % 360;
  return `hsl(${Math.round(hue)}, 85%, 55%)`;
}

// Big colourful banner (used when the shop has no cover photo).
export function heroArt(type, color) {
  const t = typeInfo(type);
  const a = accent(color);
  const spots = [[90, 120, 70], [1250, 90, 80], [1080, 420, 64], [230, 470, 58], [660, 70, 52], [1400, 330, 60], [470, 300, 44], [880, 250, 46]];
  const emo = spots.map(([x, y, s], i) => `<text x="${x}" y="${y}" font-size="${s}" opacity=".9" transform="rotate(${(i % 2 ? 1 : -1) * (8 + i * 3)} ${x} ${y})">${t.emojis[i % t.emojis.length]}</text>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1500 560" preserveAspectRatio="xMidYMid slice">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${mix(color, 25)}"/><stop offset=".55" stop-color="${color}"/><stop offset="1" stop-color="${a}"/></linearGradient>
<radialGradient id="r" cx=".8" cy=".2" r=".7"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>
<rect width="1500" height="560" fill="url(#g)"/><rect width="1500" height="560" fill="url(#r)"/>
<circle cx="1320" cy="80" r="220" fill="#fff" opacity=".08"/><circle cx="120" cy="520" r="260" fill="#fff" opacity=".07"/><circle cx="760" cy="600" r="180" fill="#000" opacity=".06"/>
<g font-family="Apple Color Emoji,Segoe UI Emoji,Noto Color Emoji,sans-serif">${emo}</g></svg>`;
  return `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`;
}

// Colourful placeholder for an item without a photo.
export function itemArt(name, category, type, color) {
  const e = emojiFor(`${category || ''} ${name || ''}`, type);
  const a = accent(color);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${tint(color, 0.18)}"/><stop offset="1" stop-color="${a}" stop-opacity=".28"/></linearGradient></defs><rect width="200" height="200" fill="#fff"/><rect width="200" height="200" fill="url(#g)"/><circle cx="160" cy="40" r="50" fill="#fff" opacity=".45"/><text x="100" y="128" font-size="84" text-anchor="middle" font-family="Apple Color Emoji,Segoe UI Emoji,Noto Color Emoji,sans-serif">${e}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

// ── Auto words ──
const pick = (list, seed) => list[Math.abs([...String(seed)].reduce((a, c) => a * 31 + c.charCodeAt(0), 7)) % list.length];

export function autoTagline({ name, type, city, categories = [] }) {
  const top = categories.slice(0, 3).join(', ');
  const t = typeInfo(type);
  const where = city ? ` in ${city}` : '';
  const options = {
    restaurant: [`Delicious ${top || 'home-style food'}${where}`, `Fresh & hot ${top || 'food'} – order online`, `Taste you will love${where}`],
    retail: [`${top || 'Quality products'} at the best prices${where}`, `Your trusted shop for ${top || 'everyday needs'}`, `Latest collection${where} – shop online`],
    salon: [`Hair, beauty & grooming experts${where}`, `Look good, feel great${where}`, `Premium ${top || 'beauty'} services${where}`],
    clinic: [`Trusted care for your family${where}`, `Expert ${top || 'health'} care${where}`],
    education: [`Learn ${top || 'with the best teachers'}${where}`, `Shaping bright futures${where}`],
    wholesale: [`Wholesale ${top || 'supplies'} at the best rates${where}`, `Bulk orders, fast delivery${where}`],
  }[type] || [`${t.hero}${where}`, `${top ? `${top} and more` : 'Quality you can trust'}${where}`];
  return pick(options, name).replace(/\s+/g, ' ').trim();
}

export function autoAbout({ name, type, city, categories = [], allowDelivery, allowPickup, allowTable, allowBooking, onlinePay }) {
  const t = typeInfo(type);
  const list = categories.slice(0, 5);
  const where = city ? ` in ${city}` : '';
  const offer = list.length ? `From ${list.slice(0, -1).join(', ')}${list.length > 1 ? ' and ' : ''}${list[list.length - 1]}, we have something for everyone.` : `We offer a wide range of ${t.word} for everyone.`;
  const ways = [allowDelivery && 'home delivery', allowPickup && 'quick takeaway', allowTable && 'table booking', allowBooking && 'easy appointments', onlinePay && 'secure online payment'].filter(Boolean);
  const intro = {
    restaurant: `Welcome to ${name}${where}! We serve fresh, tasty food made with quality ingredients and lots of love.`,
    salon: `Welcome to ${name}${where}! Our trained team takes care of your hair, skin and grooming with hygiene and style.`,
    clinic: `Welcome to ${name}${where}. We provide caring, reliable treatment for you and your family.`,
    education: `Welcome to ${name}${where}. We help students learn with care, clear teaching and regular practice.`,
    wholesale: `Welcome to ${name}${where}. We supply quality ${t.word} in bulk at the best rates for shops and businesses.`,
  }[type] || `Welcome to ${name}${where}! We bring you quality ${t.word} at honest prices with friendly service.`;
  const end = ways.length ? `Enjoy ${ways.join(', ')} – order right here in a few taps.` : 'Visit us or message us on WhatsApp – we are happy to help.';
  return `${intro} ${offer} ${end}`;
}
