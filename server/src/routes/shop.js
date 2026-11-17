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

const publicBusiness = (b) => ({
  name: b.name, slug: b.slug, type: b.type, tagline: b.shopTagline, about: b.shopAbout, logo: b.shopLogo, cover: b.shopCover,
  color: b.shopColor, timings: b.shopTimings, phone: b.phone, address: b.address, city: b.city, state: b.state,
  upi: Boolean(b.upiId), allowPickup: b.allowPickup, allowDelivery: b.allowDelivery, deliveryFee: num(b.deliveryFee),
  minOrder: num(b.minOrder), allowBooking: b.allowBooking, allowTable: b.allowTable, otp: otpEnabled(),
  lat: b.shopLat, lng: b.shopLng, mapUrl: b.shopMapUrl,
});

router.get('/:slug', h(async (req, res) => {
  const b = await loadShop(req.params.slug);
  const items = await prisma.item.findMany({
    where: { businessId: b.id, active: true, showInShop: true },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
    take: 1000,
  });
  const memberPlans = b.membershipsEnabled
    ? await prisma.membershipPlan.findMany({ where: { businessId: b.id, active: true }, orderBy: { price: 'asc' } })
    : [];
  res.json({
    shop: publicBusiness(b),
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
  const c = computeDoc({ items: lines, discount: memberDiscount, interState: false });
  const itemsTotal = r2(c.subtotal - c.discount + c.taxTotal);
  if (d.kind === 'order' && num(b.minOrder) > 0 && itemsTotal < num(b.minOrder)) throw new HttpError(400, `Minimum order is ₹${num(b.minOrder)}`);
  const deliveryFee = d.kind === 'order' && d.fulfilment === 'delivery' && !benefits?.freeDelivery ? num(b.deliveryFee) : 0;
  const memberNote = benefits && (memberDiscount > 0 || (benefits.freeDelivery && d.fulfilment === 'delivery'))
    ? `${benefits.planName} member${benefits.discountPct ? ` · ${benefits.discountPct}% off` : ''}${benefits.freeDelivery && d.fulfilment === 'delivery' ? ' · free delivery' : ''}`
    : null;
  const total = Math.round(itemsTotal + deliveryFee);

  if (d.address && d.landmark) d.address = `${d.address} (Landmark: ${d.landmark})`;
  const customerId = await findOrCreateCustomer(b.id, d.name, d.phone, d.address);
  const order = await prisma.$transaction(async (tx) => {
    const bb = await tx.business.update({ where: { id: b.id }, data: { nextOrderNo: { increment: 1 } } });
    return tx.shopOrder.create({
      data: {
        businessId: b.id,
        number: `${{ booking: 'BK', table: 'TB' }[d.kind] || 'ORD'}-${bb.nextOrderNo - 1}`,
        kind: d.kind,
        guests: d.kind === 'table' ? d.guests : null,
        token: crypto.randomBytes(16).toString('hex'),
        customerId, name: d.name, phone: d.phone, address: d.address, note: d.note,
        fulfilment: d.kind === 'order' ? d.fulfilment : 'pickup',
        lat: d.fulfilment === 'delivery' ? d.lat ?? null : null,
        lng: d.fulfilment === 'delivery' ? d.lng ?? null : null,
        preferredAt: d.preferredAt,
        subtotal: c.subtotal, discount: c.discount, memberNote, taxTotal: c.taxTotal, deliveryFee, total,
        items: { create: c.lines.map(({ sort, ...l }) => l) },
      },
    });
  });
  await logActivity(b.id, null, 'online_order', 'shop_order', order.id);

  // Save the delivery address for this verified mobile, for next time.
  const verified = shopPhone(req);
  if (d.kind === 'order' && d.fulfilment === 'delivery' && d.saveAddress && verified === d.phone) {
    const plain = String(req.body.address || '').trim().slice(0, 400);
    const same = await prisma.savedAddress.findFirst({ where: { phone: verified, address: plain } });
    const data = { label: d.addressLabel || 'Home', address: plain, landmark: d.landmark, lat: d.lat ?? null, lng: d.lng ?? null };
    if (same) await prisma.savedAddress.update({ where: { id: same.id }, data });
    else if ((await prisma.savedAddress.count({ where: { phone: verified } })) < 10) await prisma.savedAddress.create({ data: { ...data, phone: verified } });
  }
  res.status(201).json({ token: order.token, number: order.number });
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
  res.json({ token });
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
  const upiLink = b.upiId && num(plan.price) > 0
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

// Order status page for the customer.
router.get('/order/:token', h(async (req, res) => {
  const token = String(req.params.token || '');
  if (!/^[a-f0-9]{32}$/.test(token)) throw new HttpError(404, 'Order not found');
  const o = await prisma.shopOrder.findUnique({ where: { token }, include: { items: true, business: true } });
  if (!o) throw new HttpError(404, 'Order not found');
  const b = o.business;
  const upi = b.upiId && o.paymentStatus !== 'paid' && o.status !== 'cancelled'
    ? `upi://pay?pa=${encodeURIComponent(b.upiId)}&pn=${encodeURIComponent(b.name)}&am=${num(o.total).toFixed(2)}&cu=INR&tn=${encodeURIComponent(o.number)}`
    : null;
  res.json({
    order: {
      number: o.number, kind: o.kind, guests: o.guests, status: o.status, name: o.name, phone: o.phone, address: o.address, note: o.note,
      fulfilment: o.fulfilment, preferredAt: o.preferredAt, subtotal: o.subtotal, discount: o.discount, memberNote: o.memberNote, taxTotal: o.taxTotal, deliveryFee: o.deliveryFee,
      total: o.total, paymentStatus: o.paymentStatus, createdAt: o.createdAt,
      items: o.items.map((i) => ({ name: i.name, qty: i.qty, unit: i.unit, lineTotal: r2(num(i.amount) + num(i.taxAmount)) })),
    },
    shop: { ...publicBusiness(b), upiLink: upi, upiId: upi ? b.upiId : null },
  });
}));

export default router;
