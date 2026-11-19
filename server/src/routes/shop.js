// PUBLIC online shop API – no login. Customers browse, order, book and ask questions here.
import { Router } from 'express';
import crypto from 'node:crypto';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { prisma, logActivity } from '../lib/prisma.js';
import { h } from '../lib/route.js';
import { computeDoc, num, r2 } from '../lib/money.js';
import { HttpError } from '../middleware/auth.js';
import { otpEnabled, sendOtp, shopPhone, verifyOtp } from '../lib/otp.js';
import { accessState, getPlans } from '../lib/plans.js';
import { activeBenefits } from '../lib/membership.js';
import { available } from '../lib/stock.js';
import { sendTemplate } from '../lib/aisensy.js';
import { checkCoupon } from '../lib/coupons.js';
import { capturedPayment, createOrder, shopKeys, validSignature } from '../lib/razorpay.js';
import { markOrderPaidOnline } from '../lib/shopPay.js';

const router = Router();

const writeLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again after some time.' },
});

const priceWithTax = (it) => r2(num(it.price) * (1 + num(it.taxRate) / 100));

async function loadShop(slug) {
  const b = await prisma.business.findUnique({ where: { slug: String(slug || '').toLowerCase() } });
  if (!b || !b.shopEnabled || b.status === 'blocked') throw new HttpError(404, 'Shop not found');
  if (!accessState(b, await getPlans()).active) throw new HttpError(404, 'This shop is closed for now');
  return b;
}

// Which ways a customer can pay at this shop (vendor turns each on/off). Never leaves the shop with none.
function payOptions(b) {
  const onlinePay = Boolean(b.allowOnlinePay && shopKeys(b));
  const upi = Boolean(b.upiId && b.allowUpiPay !== false);
  const cod = b.allowCod !== false || (!onlinePay && !upi);
  return { onlinePay, upi, cod };
}

const publicBusiness = (b) => ({
  name: b.name, slug: b.slug, type: b.type, tagline: b.shopTagline, about: b.shopAbout, logo: b.shopLogo, cover: b.shopCover,
  color: b.shopColor, timings: b.shopTimings, phone: b.phone, address: b.address, city: b.city, state: b.state,
  ...payOptions(b), allowPickup: b.allowPickup, allowDelivery: b.allowDelivery, deliveryFee: num(b.deliveryFee),
  minOrder: num(b.minOrder), allowBooking: b.allowBooking, allowTable: b.allowTable, otp: otpEnabled(),
  lat: b.shopLat, lng: b.shopLng, mapUrl: b.shopMapUrl,
  gallery: b.shopGallery || [], template: b.shopTemplate || 'classic', since: b.shopSince || null, instagram: b.shopInstagram, facebook: b.shopFacebook, youtube: b.shopYoutube,
  ownDomain: b.customDomainStatus === 'live' ? b.customDomain : null,
});

router.get('/:slug', h(async (req, res) => {
  const b = await loadShop(req.params.slug);
  const items = await prisma.item.findMany({
    where: { businessId: b.id, active: true, showInShop: true },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
    take: 1000,
  });
  const offers = await prisma.coupon.findMany({
    where: { businessId: b.id, active: true, showInShop: true, OR: [{ validTill: null }, { validTill: { gte: new Date(Date.now() - 86400000) } }] },
    orderBy: { createdAt: 'desc' }, take: 5,
  });
  const memberPlans = b.membershipsEnabled
    ? await prisma.membershipPlan.findMany({ where: { businessId: b.id, active: true }, orderBy: { price: 'asc' } })
    : [];
  res.json({
    shop: publicBusiness(b),
    offers: offers.filter((o) => !o.usageLimit || o.usedCount < o.usageLimit).map((o) => ({ code: o.code, label: o.type === 'flat' ? `₹${num(o.value)} OFF` : `${num(o.value)}% OFF`, minOrder: num(o.minOrder), description: o.description })),
    memberPlans: memberPlans.map((p) => ({ id: p.id, name: p.name, price: num(p.price), durationDays: p.durationDays, discountPct: num(p.discountPct), freeDelivery: p.freeDelivery, description: p.description })),
    items: items.map((it) => ({
      id: it.id, name: it.name, type: it.type, unit: it.unit, description: it.description, category: it.category,
      images: it.images, inStock: it.inStock && (!it.trackStock || num(it.stock) > 0), price: priceWithTax(it), mrp: it.mrp ? num(it.mrp) : null,
      variants: (Array.isArray(it.variants) ? it.variants : []).map((v) => ({
        id: v.id, name: v.name, inStock: v.inStock !== false && (!it.trackStock || num(v.stock) > 0),
        price: r2(num(v.price) * (1 + num(it.taxRate) / 100)), mrp: v.mrp ? num(v.mrp) : null,
      })),
    })),
  });
}));

const phone = z.string().trim().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number');
const orderSchema = z.object({
  kind: z.enum(['order', 'booking', 'table']).default('order'),
  couponCode: z.string().trim().max(30).optional().nullable(),
  payChoice: z.enum(['online', 'upi', 'cod']).default('cod'),
  guests: z.preprocess((v) => (v === null || v === '' || v === undefined ? null : Number(v)), z.number().int().min(1, 'How many people?').max(100).nullable()),
  name: z.string().trim().min(2, 'Enter your name').max(80),
  phone,
  address: z.string().trim().max(400).optional().nullable().or(z.literal('')).transform((v) => v || null),
  note: z.string().trim().max(500).optional().nullable().or(z.literal('')).transform((v) => v || null),
  fulfilment: z.enum(['pickup', 'delivery']).default('pickup'),
  lat: z.preprocess((v) => (v === null || v === '' || v === undefined ? null : Number(v)), z.number().min(-90).max(90).nullable()),
  lng: z.preprocess((v) => (v === null || v === '' || v === undefined ? null : Number(v)), z.number().min(-180).max(180).nullable()),
  landmark: z.string().trim().max(120).optional().nullable().or(z.literal('')).transform((v) => v || null),
  saveAddress: z.boolean().optional(),
  addressLabel: z.enum(['Home', 'Work', 'Other']).optional(),
  preferredAt: z.string().optional().nullable().or(z.literal('')).transform((v) => (v ? new Date(v) : null)),
  items: z.array(z.object({
    itemId: z.string().min(1),
    variantId: z.string().max(24).optional().nullable(),
    qty: z.coerce.number().positive().max(10000),
  })).max(100).default([]),
});

async function findOrCreateCustomer(businessId, name, phoneNo, address) {
  const existing = await prisma.customer.findFirst({ where: { businessId, phone: phoneNo } });
  if (existing) {
    if (address && !existing.address) await prisma.customer.update({ where: { id: existing.id }, data: { address } });
    return existing.id;
  }
  const c = await prisma.customer.create({ data: { businessId, name, phone: phoneNo, address, tags: ['Online'] } });
  return c.id;
}

router.post('/:slug/orders', writeLimiter, h(async (req, res) => {
  const b = await loadShop(req.params.slug);
  const d = orderSchema.parse(req.body);
  if (d.kind === 'booking' && !b.allowBooking) throw new HttpError(400, 'This shop is not taking bookings online');
  if (d.kind === 'table' && !b.allowTable) throw new HttpError(400, 'Table booking is not available');
  if (d.kind === 'table' && !d.guests) throw new HttpError(400, 'How many people are coming?');
  if (d.kind !== 'table' && d.items.length === 0) throw new HttpError(400, 'Your cart is empty');
  if (d.kind === 'order') {
    if (d.fulfilment === 'delivery' && !b.allowDelivery) throw new HttpError(400, 'Home delivery is not available');
    if (d.fulfilment === 'pickup' && !b.allowPickup) throw new HttpError(400, 'Store pickup is not available');
    if (d.fulfilment === 'delivery' && !d.address) throw new HttpError(400, 'Enter your delivery address');
  }
  if (d.preferredAt && Number.isNaN(d.preferredAt.getTime())) throw new HttpError(400, 'Choose a valid date and time');
  if (d.kind !== 'order' && !d.preferredAt) throw new HttpError(400, 'Choose a date and time');
  if (d.preferredAt && d.preferredAt.getTime() < Date.now() - 3600000) throw new HttpError(400, 'Please choose a future date and time');

  const ids = [...new Set(d.items.map((i) => i.itemId))];
  const dbItems = await prisma.item.findMany({ where: { id: { in: ids }, businessId: b.id, active: true, showInShop: true } });
  const byId = Object.fromEntries(dbItems.map((i) => [i.id, i]));
  const lines = d.items.map((l) => {
    const it = byId[l.itemId];
    if (!it) throw new HttpError(400, 'Some items in your cart are no longer available. Please refresh.');
    if (!it.inStock) throw new HttpError(400, `${it.name} is out of stock`);
    const variants = Array.isArray(it.variants) ? it.variants : [];
    if (variants.length) {
      const v = variants.find((x) => x.id === l.variantId);
      if (!v) throw new HttpError(400, `Please choose a size for ${it.name}`);
      if (v.inStock === false) throw new HttpError(400, `${it.name} (${v.name}) is out of stock`);
      const left = available(it, v.id);
      if (left !== null && l.qty > left) throw new HttpError(400, left > 0 ? `Only ${left} left of ${it.name} (${v.name})` : `${it.name} (${v.name}) is out of stock`);
      return { itemId: it.id, variantId: v.id, name: `${it.name} (${v.name})`, hsn: it.hsn, unit: it.unit, qty: l.qty, rate: num(v.price), taxRate: num(it.taxRate) };
    }
    const left = available(it, null);
    if (left !== null && l.qty > left) throw new HttpError(400, left > 0 ? `Only ${left} left of ${it.name}` : `${it.name} is out of stock`);
    return { itemId: it.id, name: it.name, hsn: it.hsn, unit: it.unit, qty: l.qty, rate: num(it.price), taxRate: num(it.taxRate) };
  });
  // Member benefits only for a mobile verified by OTP.
  const verifiedPhone = shopPhone(req);
  const benefits = b.membershipsEnabled && verifiedPhone && verifiedPhone === d.phone ? await activeBenefits(b.id, d.phone) : null;
  const gross = lines.reduce((a, l) => a + l.qty * l.rate, 0);
  const memberDiscount = benefits?.discountPct ? r2((gross * benefits.discountPct) / 100) : 0;
  let c = computeDoc({ items: lines, discount: memberDiscount, interState: false });
  let itemsTotal = r2(c.subtotal - c.discount + c.taxTotal);
  if (d.kind === 'order' && num(b.minOrder) > 0 && itemsTotal < num(b.minOrder)) throw new HttpError(400, `Minimum order is ₹${num(b.minOrder)}`);
  // Coupon: discount the customer sees (with GST) → same cut before GST.
  const cp = d.kind === 'order' && d.couponCode ? await checkCoupon(b.id, d.couponCode, d.phone, itemsTotal) : null;
  if (cp) {
    const base = c.subtotal - c.discount;
    const ratio = base > 0 ? (base + c.taxTotal) / base : 1;
    c = computeDoc({ items: lines, discount: r2(memberDiscount + cp.off / ratio), interState: false });
    itemsTotal = r2(c.subtotal - c.discount + c.taxTotal);
  }
  const deliveryFee = d.kind === 'order' && d.fulfilment === 'delivery' && !benefits?.freeDelivery ? num(b.deliveryFee) : 0;
  const memberNote = [
    benefits && (memberDiscount > 0 || (benefits.freeDelivery && d.fulfilment === 'delivery'))
      ? `${benefits.planName} member${benefits.discountPct ? ` · ${benefits.discountPct}% off` : ''}${benefits.freeDelivery && d.fulfilment === 'delivery' ? ' · free delivery' : ''}`
      : null,
    cp ? `Coupon ${cp.code} (${cp.label})` : null,
  ].filter(Boolean).join(' · ') || null;
  const total = Math.round(itemsTotal + deliveryFee);

  // Payment choice: online (Razorpay) or cash on delivery / pay at shop.
  const po = payOptions(b);
  const allowed = { online: po.onlinePay && total > 0, upi: po.upi && total > 0, cod: po.cod || total <= 0 };
  if (d.kind === 'order' && !allowed[d.payChoice]) {
    const names = { online: 'Online payment', upi: 'UPI', cod: 'Cash' };
    throw new HttpError(400, `${names[d.payChoice]} is not available at this shop. Please choose another payment option.`);
  }
  const payChoice = d.kind === 'order' ? d.payChoice : 'cod';

  if (d.address && d.landmark) d.address = `${d.address} (Landmark: ${d.landmark})`;
  const customerId = await findOrCreateCustomer(b.id, d.name, d.phone, d.address);
  const order = await prisma.$transaction(async (tx) => {
    const bb = await tx.business.update({ where: { id: b.id }, data: { nextOrderNo: { increment: 1 } } });
    return tx.shopOrder.create({
      data: {
        businessId: b.id,
        number: `${{ booking: 'BK', table: 'TB' }[d.kind] || 'ORD'}-${bb.nextOrderNo - 1}`,
        kind: d.kind,
        payChoice,
        guests: d.kind === 'table' ? d.guests : null,
        token: crypto.randomBytes(16).toString('hex'),
        customerId, name: d.name, phone: d.phone, address: d.address, note: d.note,
        fulfilment: d.kind === 'order' ? d.fulfilment : 'pickup',
        lat: d.fulfilment === 'delivery' ? d.lat ?? null : null,
        lng: d.fulfilment === 'delivery' ? d.lng ?? null : null,
        preferredAt: d.preferredAt,
        subtotal: c.subtotal, discount: c.discount, memberNote, couponCode: cp?.code || null, taxTotal: c.taxTotal, deliveryFee, total,
        items: { create: c.lines.map(({ sort, ...l }) => l) },
      },
    });
  });
  await logActivity(b.id, null, 'online_order', 'shop_order', order.id);
  if (cp) await prisma.coupon.update({ where: { id: cp.coupon.id }, data: { usedCount: { increment: 1 } } });
  // WhatsApp alert to the shop owner (AiSensy template: {{1}} shop, {{2}} order no, {{3}} customer, {{4}} details).
  const what = d.kind === 'table' ? `Table for ${d.guests || ''}` : d.kind === 'booking' ? 'Booking' : `₹${num(total)} · ${d.fulfilment === 'delivery' ? 'Delivery' : 'Pickup'}`;
  sendTemplate({ campaignEnv: 'AISENSY_ORDER_CAMPAIGN', phone: b.orderAlertPhone || b.phone, userName: b.name, params: [b.name, order.number, `${d.name} (${d.phone})`, what] }).catch(() => {});

  // Save the delivery address for this verified mobile, for next time.
  const verified = shopPhone(req);
  if (d.kind === 'order' && d.fulfilment === 'delivery' && d.saveAddress && verified === d.phone) {
    const plain = String(req.body.address || '').trim().slice(0, 400);
    const same = await prisma.savedAddress.findFirst({ where: { phone: verified, address: plain } });
    const data = { label: d.addressLabel || 'Home', address: plain, landmark: d.landmark, lat: d.lat ?? null, lng: d.lng ?? null };
    if (same) await prisma.savedAddress.update({ where: { id: same.id }, data });
    else if ((await prisma.savedAddress.count({ where: { phone: verified } })) < 10) await prisma.savedAddress.create({ data: { ...data, phone: verified } });
  }
  let pay = null;
  if (payChoice === 'online') pay = await startOnlinePay(b, order).catch((e) => { console.error('rzp order', e.message); return null; });
  res.status(201).json({ token: order.token, number: order.number, pay });
}));

const helloSchema = z.object({ name: z.string().trim().min(2, 'Enter your name').max(80), phone });

// Customer says hello when they first open the shop (QR scan). Saved as a customer for the vendor.
router.post('/:slug/hello', writeLimiter, h(async (req, res) => {
  const b = await loadShop(req.params.slug);
  const d = helloSchema.parse(req.body);
  const existing = await prisma.customer.findFirst({ where: { businessId: b.id, phone: d.phone } });
  if (!existing) {
    const c = await prisma.customer.create({ data: { businessId: b.id, name: d.name, phone: d.phone, tags: ['Online'] } });
    await logActivity(b.id, null, 'shop_visit', 'customer', c.id);
  }
  rememberDevice(res, 'bm_shop_me', JSON.stringify({ name: d.name.slice(0, 60), phone: d.phone }));
  res.json({ ok: true });
}));

const otpLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many requests. Please try again later.' } });

router.post('/otp/send', otpLimiter, h(async (req, res) => {
  const d = z.object({ phone, name: z.string().trim().max(80).optional() }).parse(req.body);
  await sendOtp(d.phone, d.name);
  res.json({ sent: true });
}));

router.post('/otp/verify', otpLimiter, h(async (req, res) => {
  const d = z.object({ phone, code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit OTP') }).parse(req.body);
  const token = await verifyOtp(d.phone, d.code);
  rememberDevice(res, 'bm_shop', token);
  res.json({ token });
}));

// Second memory for this phone (a cookie), in case the browser forgets its local storage.
const DEVICE_COOKIE = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 180 * 86400000, path: '/api/shop' };
function rememberDevice(res, name, value) {
  res.cookie(name, value, DEVICE_COOKIE);
}

router.post('/me/forget', (_req, res) => {
  res.clearCookie('bm_shop', { path: '/api/shop' });
  res.clearCookie('bm_shop_me', { path: '/api/shop' });
  res.json({ ok: true });
});

// Who is this phone? Lets the shop skip asking name / mobile / OTP again.
router.get('/me/device', h(async (req, res) => {
  const phoneNo = shopPhone(req);
  let me = null;
  try { me = req.cookies?.bm_shop_me ? JSON.parse(req.cookies.bm_shop_me) : null; } catch { me = null; }
  if (me && !(typeof me.name === 'string' && /^[6-9]\d{9}$/.test(String(me.phone)))) me = null;
  res.json({ token: phoneNo ? req.cookies?.bm_shop || null : null, name: me?.name || null, phone: phoneNo || me?.phone || null });
}));

// "My Orders": with OTP login → every order of that mobile in this shop; otherwise only orders saved on this phone.
router.post('/my-orders', h(async (req, res) => {
  const tokens = Array.isArray(req.body?.tokens) ? req.body.tokens.filter((t) => /^[a-f0-9]{32}$/.test(String(t))).slice(0, 50) : [];
  const verified = shopPhone(req);
  const or = [];
  if (tokens.length) or.push({ token: { in: tokens } });
  if (verified && req.body?.slug) {
    const b = await prisma.business.findUnique({ where: { slug: String(req.body.slug).toLowerCase() } });
    if (b) or.push({ businessId: b.id, phone: verified });
  }
  if (!or.length) return res.json({ orders: [] });
  const orders = await prisma.shopOrder.findMany({
    where: { OR: or },
    take: 100,
    select: { token: true, number: true, kind: true, status: true, total: true, paymentStatus: true, createdAt: true, preferredAt: true, _count: { select: { items: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ orders: orders.map(({ _count, ...o }) => ({ ...o, itemCount: _count.items })) });
}));

// Saved delivery addresses (OTP login required).
const needPhone = (req) => {
  const p = shopPhone(req);
  if (!p) throw new HttpError(401, 'Please login with OTP');
  return p;
};
router.get('/me/addresses', h(async (req, res) => {
  const p = needPhone(req);
  res.json({ addresses: await prisma.savedAddress.findMany({ where: { phone: p }, orderBy: { updatedAt: 'desc' } }) });
}));
router.delete('/me/addresses/:id', h(async (req, res) => {
  const p = needPhone(req);
  await prisma.savedAddress.deleteMany({ where: { id: req.params.id, phone: p } });
  res.json({ ok: true });
}));

// Customer's membership at this shop (OTP login).
router.get('/:slug/me', h(async (req, res) => {
  const b = await loadShop(req.params.slug);
  const p = shopPhone(req);
  if (!p) return res.json({ benefits: null, pending: [] });
  const [benefits, pending] = await Promise.all([
    activeBenefits(b.id, p),
    prisma.membership.findMany({ where: { businessId: b.id, phone: p, status: 'pending' }, include: { plan: { select: { name: true, price: true } } } }),
  ]);
  res.json({ benefits, pending: pending.map((m) => ({ id: m.id, plan: m.plan.name, price: num(m.plan.price), createdAt: m.createdAt })) });
}));

router.post('/:slug/membership', writeLimiter, h(async (req, res) => {
  const b = await loadShop(req.params.slug);
  if (!b.membershipsEnabled) throw new HttpError(400, 'Memberships are not available');
  const p = shopPhone(req);
  if (!p) throw new HttpError(401, 'Please login with OTP first');
  const plan = await prisma.membershipPlan.findFirst({ where: { id: String(req.body?.planId || ''), businessId: b.id, active: true } });
  if (!plan) throw new HttpError(400, 'Plan not found');
  const name = String(req.body?.name || '').trim().slice(0, 80);
  const customer = await prisma.customer.findFirst({ where: { businessId: b.id, phone: p } })
    || await prisma.customer.create({ data: { businessId: b.id, name: name || `Customer ${p.slice(-4)}`, phone: p, tags: ['Online'] } });
  const existing = await prisma.membership.findFirst({ where: { businessId: b.id, phone: p, planId: plan.id, status: 'pending' } });
  const m = existing || await prisma.membership.create({ data: { businessId: b.id, planId: plan.id, customerId: customer.id, phone: p, source: 'shop' } });
  await logActivity(b.id, null, 'membership_request', 'membership', m.id);
  const upiLink = b.upiId && b.allowUpiPay !== false && num(plan.price) > 0
    ? `upi://pay?pa=${encodeURIComponent(b.upiId)}&pn=${encodeURIComponent(b.name)}&am=${num(plan.price).toFixed(2)}&cu=INR&tn=${encodeURIComponent(`${plan.name} membership`)}`
    : null;
  res.status(201).json({ ok: true, upiLink, upiId: upiLink ? b.upiId : null, price: num(plan.price) });
}));

const enquirySchema = z.object({
  name: z.string().trim().min(2, 'Enter your name').max(80),
  phone,
  message: z.string().trim().min(3, 'Write your question').max(500),
  itemId: z.string().optional().nullable(),
});

// Questions become Leads in the vendor's pipeline.
router.post('/:slug/enquiry', writeLimiter, h(async (req, res) => {
  const b = await loadShop(req.params.slug);
  const d = enquirySchema.parse(req.body);
  let need = d.message;
  if (d.itemId) {
    const it = await prisma.item.findFirst({ where: { id: d.itemId, businessId: b.id } });
    if (it) need = `${it.name}: ${d.message}`;
  }
  const lead = await prisma.lead.create({
    data: { businessId: b.id, name: d.name, phone: d.phone, need: need.slice(0, 300), source: 'Online shop', priority: 'warm' },
  });
  await logActivity(b.id, null, 'online_enquiry', 'lead', lead.id);
  res.status(201).json({ ok: true });
}));

// ── Online payment for shop orders (Razorpay) ──
async function startOnlinePay(b, order) {
  const keys = shopKeys(b);
  if (!keys) throw new HttpError(400, 'Online payment is not available at this shop');
  const rz = await createOrder(keys, { amount: num(order.total), receipt: order.number, notes: { kind: 'shop', orderId: order.id, businessId: b.id } });
  await prisma.shopOrder.update({ where: { id: order.id }, data: { rzpOrderId: rz.id } });
  return {
    keyId: keys.keyId, orderId: rz.id, amount: rz.amount, name: b.name, description: `Order ${order.number}`,
    image: b.shopLogo || undefined, color: b.shopColor || '#3730A3', prefill: { name: order.name, contact: order.phone }, test: keys.keyId.startsWith('rzp_test_'),
  };
}

async function orderByToken(token) {
  if (!/^[a-f0-9]{32}$/.test(String(token || ''))) throw new HttpError(404, 'Order not found');
  const o = await prisma.shopOrder.findUnique({ where: { token: String(token) }, include: { business: true } });
  if (!o) throw new HttpError(404, 'Order not found');
  return o;
}

router.post('/order/:token/pay', writeLimiter, h(async (req, res) => {
  const o = await orderByToken(req.params.token);
  if (o.paymentStatus === 'paid') throw new HttpError(400, 'This order is already paid');
  if (o.status === 'cancelled') throw new HttpError(400, 'This order is cancelled');
  if (o.kind !== 'order' || !o.business.allowOnlinePay) throw new HttpError(400, 'Online payment is not available for this order');
  res.json({ pay: await startOnlinePay(o.business, o) });
}));

router.post('/order/:token/verify', h(async (req, res) => {
  const o = await orderByToken(req.params.token);
  const d = z.object({ razorpay_order_id: z.string(), razorpay_payment_id: z.string(), razorpay_signature: z.string() }).parse(req.body);
  if (o.paymentStatus === 'paid') return res.json({ ok: true });
  const keys = shopKeys(o.business);
  if (!keys || d.razorpay_order_id !== o.rzpOrderId || !validSignature(keys.keySecret, d.razorpay_order_id, d.razorpay_payment_id, d.razorpay_signature)) {
    throw new HttpError(400, 'Payment could not be verified. If money was taken, the shop will confirm it.');
  }
  await markOrderPaidOnline(o.id, d.razorpay_payment_id);
  res.json({ ok: true });
}));

// Order status page for the customer.
router.get('/order/:token', h(async (req, res) => {
  const token = String(req.params.token || '');
  if (!/^[a-f0-9]{32}$/.test(token)) throw new HttpError(404, 'Order not found');
  let o = await prisma.shopOrder.findUnique({ where: { token }, include: { items: true, business: true } });
  if (!o) throw new HttpError(404, 'Order not found');
  // Paid online but the page closed before confirming? Check with Razorpay.
  if (o.rzpOrderId && o.paymentStatus !== 'paid') {
    const keys = shopKeys(o.business);
    const p = keys ? await capturedPayment(keys, o.rzpOrderId).catch(() => null) : null;
    if (p && p.amount === Math.round(num(o.total) * 100)) {
      await markOrderPaidOnline(o.id, p.id);
      o = await prisma.shopOrder.findUnique({ where: { token }, include: { items: true, business: true } });
    }
  }
  const b = o.business;
  const upi = b.upiId && b.allowUpiPay !== false && o.paymentStatus !== 'paid' && o.status !== 'cancelled'
    ? `upi://pay?pa=${encodeURIComponent(b.upiId)}&pn=${encodeURIComponent(b.name)}&am=${num(o.total).toFixed(2)}&cu=INR&tn=${encodeURIComponent(o.number)}`
    : null;
  res.json({
    order: {
      number: o.number, kind: o.kind, guests: o.guests, status: o.status, name: o.name, phone: o.phone, address: o.address, note: o.note,
      fulfilment: o.fulfilment, preferredAt: o.preferredAt, subtotal: o.subtotal, discount: o.discount, memberNote: o.memberNote, taxTotal: o.taxTotal, deliveryFee: o.deliveryFee,
      total: o.total, paymentStatus: o.paymentStatus, paymentMode: o.paymentMode, payChoice: o.payChoice, createdAt: o.createdAt,
      canPayOnline: o.kind === 'order' && o.paymentStatus !== 'paid' && o.status !== 'cancelled' && Boolean(b.allowOnlinePay && shopKeys(b)),
      items: o.items.map((i) => ({ name: i.name, qty: i.qty, unit: i.unit, lineTotal: r2(num(i.amount) + num(i.taxAmount)) })),
    },
    shop: { ...publicBusiness(b), upiLink: upi, upiId: upi ? b.upiId : null },
  });
}));

// Customer types a coupon in the cart: show how much they save.
router.post('/:slug/coupon', writeLimiter, h(async (req, res) => {
  const b = await loadShop(req.params.slug);
  const amount = Number(req.body?.amount) || 0;
  const phone = /^[6-9]\d{9}$/.test(String(req.body?.phone || '')) ? String(req.body.phone) : null;
  const cp = await checkCoupon(b.id, req.body?.code, phone, amount);
  if (!cp) throw new HttpError(400, 'Enter a coupon code');
  res.json({ code: cp.code, off: cp.off, label: cp.label });
}));

// Install-as-app manifest for a shop (customers get the shop's own icon on their home screen).
router.get('/:slug/manifest.webmanifest', h(async (req, res) => {
  const b = await prisma.business.findUnique({ where: { slug: String(req.params.slug).toLowerCase() } });
  if (!b || !b.shopEnabled) throw new HttpError(404, 'Shop not found');
  const start = req.query.own ? '/' : `/s/${b.slug}`;
  const icons = [
    { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
  ];
  res.type('application/manifest+json').set('Cache-Control', 'public, max-age=3600').send(JSON.stringify({
    name: b.name, short_name: b.name.slice(0, 12), start_url: start, scope: start, display: 'standalone',
    background_color: '#ffffff', theme_color: b.shopColor || '#3730A3', icons,
  }));
}));

export default router;
