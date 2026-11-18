// Razorpay: create orders, check signatures, look up payments. Plain HTTPS – no SDK needed.
import crypto from 'node:crypto';

export const platformKeys = () => (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET
  ? { keyId: process.env.RAZORPAY_KEY_ID.trim(), keySecret: process.env.RAZORPAY_KEY_SECRET.trim() }
  : null);
export const isTestKey = (k) => Boolean(k?.keyId?.startsWith('rzp_test_'));

// Vendor's own secret is stored encrypted.
const box = () => crypto.createHash('sha256').update(`${process.env.JWT_SECRET || 'bm'}:razorpay`).digest();
export function sealSecret(plain) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', box(), iv);
  const enc = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map((x) => x.toString('base64')).join('.');
}
function openSecret(sealed) {
  try {
    const [iv, tag, enc] = String(sealed).split('.').map((x) => Buffer.from(x, 'base64'));
    const d = crypto.createDecipheriv('aes-256-gcm', box(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
  } catch {
    return null;
  }
}

// Money for shop orders goes to the vendor's own Razorpay. While BusinessMithra uses TEST keys,
// shops without their own keys can use the platform test keys so everyone can try it.
export function shopKeys(b) {
  if (b.rzpKeyId && b.rzpKeySecret) {
    const keySecret = openSecret(b.rzpKeySecret);
    if (keySecret) return { keyId: b.rzpKeyId, keySecret, own: true };
  }
  const p = platformKeys();
  return isTestKey(p) ? { ...p, own: false } : null;
}

async function call(keys, method, path, body) {
  const r = await fetch(`https://api.razorpay.com/v1${path}`, {
    method,
    headers: { Authorization: `Basic ${Buffer.from(`${keys.keyId}:${keys.keySecret}`).toString('base64')}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    console.error('Razorpay error', r.status, JSON.stringify(data).slice(0, 300));
    const e = new Error(data?.error?.description || 'Online payment is not available right now');
    e.status = r.status === 401 ? 400 : 502;
    throw e;
  }
  return data;
}

export const createOrder = (keys, { amount, receipt, notes }) => call(keys, 'POST', '/orders', {
  amount: Math.round(Number(amount) * 100), currency: 'INR', receipt: String(receipt).slice(0, 40), notes, payment_capture: 1,
});

export function validSignature(secret, orderId, paymentId, signature) {
  const expected = crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Returns the captured payment for an order, if any (used when the browser closed before confirming).
export async function capturedPayment(keys, orderId) {
  const list = await call(keys, 'GET', `/orders/${orderId}/payments`);
  return (list.items || []).find((p) => p.status === 'captured') || null;
}

export function validWebhook(rawBody, signature) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Quick check that a vendor's keys are real before saving them.
export const checkKeys = (keys) => call(keys, 'GET', '/orders?count=1');
