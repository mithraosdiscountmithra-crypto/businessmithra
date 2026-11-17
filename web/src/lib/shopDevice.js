// What this phone remembers for online shops: the customer's name/phone and their order links.
// localStorage can be blocked (private mode) – then it just lasts for this visit.
const mem = {};
const get = (k, fallback) => {
  try {
    const v = localStorage.getItem(k);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return k in mem ? mem[k] : fallback;
  }
};
const put = (k, v) => {
  mem[k] = v;
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* blocked */
  }
};

export const getMe = () => get('bm_me', null);
export const setMe = (me) => put('bm_me', me);
export const clearMe = () => put('bm_me', null);

export const getOrderTokens = (slug) => get(`bm_orders_${slug}`, []);
export const addOrderToken = (slug, token) => {
  const list = getOrderTokens(slug).filter((t) => t !== token);
  put(`bm_orders_${slug}`, [token, ...list].slice(0, 50));
};

// Verified WhatsApp-OTP login (token signed by our server).
export const getShopToken = () => get('bm_shop_token', null);
export const setShopToken = (t) => put('bm_shop_token', t);
