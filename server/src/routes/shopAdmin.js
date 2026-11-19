// Vendor side of the online shop: settings, photo upload signing, incoming orders.
import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { prisma, logActivity } from '../lib/prisma.js';
import { h } from '../lib/route.js';
import { computeDoc, dateOnly, istToday, num } from '../lib/money.js';
import { HttpError, requireAuth, requireOwner, requirePermission } from '../middleware/auth.js';
import { defaultAccountId, MODES, recalcInvoice } from './invoices.js';
import { clearDomainCache, normalizeDomain } from '../lib/domains.js';
import { applyLines, reverseRef } from '../lib/stock.js';
import { checkKeys, isTestKey, platformKeys, sealSecret, shopKeys } from '../lib/razorpay.js';

const router = Router();
router.use(requireAuth());

const slugify = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'shop';
const RESERVED = new Set(['api', 'admin', 'login', 'signup', 'sales', 'accounts', 'settings', 'staff', 'shop', 'i', 's', 'o', 'm', 'www', 'app', 'help', 'otp', 'order', 'my-orders', 'me']);

async function ensureSlug(b) {
  if (b.slug) return b.slug;
  const base = slugify(b.name);
  let slug = RESERVED.has(base) ? `${base}-shop` : base;
  for (let n = 2; await prisma.business.findFirst({ where: { slug, NOT: { id: b.id } } }); n += 1) slug = `${base}-${n}`;
  await prisma.business.update({ where: { id: b.id }, data: { slug } });
  return slug;
}

const shopFields = (b) => ({
  slug: b.slug, shopEnabled: b.shopEnabled, shopTagline: b.shopTagline || '', shopAbout: b.shopAbout || '', shopLogo: b.shopLogo || '',
  shopCover: b.shopCover || '', shopColor: b.shopColor, shopTimings: b.shopTimings || '', upiId: b.upiId || '', orderAlertPhone: b.orderAlertPhone || '',
  allowPickup: b.allowPickup, allowDelivery: b.allowDelivery, deliveryFee: num(b.deliveryFee), minOrder: num(b.minOrder), allowBooking: b.allowBooking,
  allowTable: b.allowTable, shopLat: b.shopLat, shopLng: b.shopLng, shopMapUrl: b.shopMapUrl || '',
  normalDelivery: b.normalDelivery !== false, normalEta: b.normalEta || 'Same day', morningDelivery: b.morningDelivery, morningFee: Number(b.morningFee) || 0, morningCutoff: b.morningCutoff || '22:00', morningSlot: b.morningSlot || '6 – 9 AM',
  fastDelivery: b.fastDelivery, fastFee: Number(b.fastFee) || 0, fastEta: b.fastEta || '30 – 45 min',
  showLocation: b.showLocation !== false, shopGallery: b.shopGallery || [], shopTemplate: b.shopTemplate || 'classic', shopSince: b.shopSince || '', shopInstagram: b.shopInstagram || '', shopFacebook: b.shopFacebook || '', shopYoutube: b.shopYoutube || '',
  customDomain: b.customDomain || '', customDomainStatus: b.customDomainStatus || null,
  allowOnlinePay: b.allowOnlinePay, allowCod: b.allowCod, allowUpiPay: b.allowUpiPay, rzpKeyId: b.rzpKeyId || '', rzpSecretSaved: Boolean(b.rzpKeySecret),
  onlineReady: Boolean(shopKeys(b)), platformTest: isTestKey(platformKeys()),
});

const url = z.string().trim().max(500).refine((v) => v === '' || /^https:\/\//.test(v), 'Image link must start with https://').transform((v) => v || null);
const settingsSchema = z.object({
  slug: z.string().trim().toLowerCase().min(3, 'Shop link must be at least 3 characters').max(40)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use only small letters, numbers and -')
    .refine((v) => !RESERVED.has(v), 'This link name is reserved, please choose another'),
  shopEnabled: z.boolean(),
  shopTagline: z.string().trim().max(120).transform((v) => v || null),
  shopAbout: z.string().trim().max(1000).transform((v) => v || null),
  shopLogo: url,
  shopCover: url,
  shopColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Pick a colour'),
  shopTimings: z.string().trim().max(120).transform((v) => v || null),
  orderAlertPhone: z.string().trim().refine((v) => v === '' || /^[6-9]\d{9}$/.test(v), 'Enter a valid 10-digit WhatsApp number').transform((v) => v || null).optional(),
  upiId: z.string().trim().max(60).refine((v) => v === '' || /^[\w.\-]{2,}@[a-zA-Z]{2,}$/.test(v), 'Enter a valid UPI ID like shop@okaxis').transform((v) => v || null),
  allowPickup: z.boolean(),
  allowDelivery: z.boolean(),
  deliveryFee: z.coerce.number().min(0).max(100000),
  minOrder: z.coerce.number().min(0).max(10000000),
  allowBooking: z.boolean(),
  allowTable: z.boolean().default(false),
  shopLat: z.preprocess((v) => (v === null || v === '' || v === undefined ? null : Number(v)), z.number().min(-90).max(90).nullable()),
  shopLng: z.preprocess((v) => (v === null || v === '' || v === undefined ? null : Number(v)), z.number().min(-180).max(180).nullable()),
  showLocation: z.boolean().optional(),
  normalDelivery: z.boolean().optional(),
  normalEta: z.string().trim().min(1).max(40).optional(),
  morningDelivery: z.boolean().optional(),
  morningFee: z.coerce.number().min(0).max(10000).optional(),
  morningCutoff: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Cut-off time like 22:00').optional(),
  morningSlot: z.string().trim().min(1).max(40).optional(),
  fastDelivery: z.boolean().optional(),
  fastFee: z.coerce.number().min(0).max(10000).optional(),
  fastEta: z.string().trim().min(1).max(40).optional(),
  shopTemplate: z.enum(['classic', 'modern', 'bold', 'elegant', 'fresh']).optional(),
  shopSince: z.preprocess((v) => (v === '' || v === null || v === undefined ? null : Number(v)), z.number().int().min(1900).max(2100).nullable()).optional(),
  shopGallery: z.array(z.string().trim().max(500).regex(/^https:\/\//)).max(8).optional(),
  shopInstagram: z.string().trim().max(200).refine((v) => v === '' || /^https:\/\/(www\.)?instagram\.com\//.test(v), 'Paste your Instagram link (https://instagram.com/…)').transform((v) => v || null).optional(),
  shopFacebook: z.string().trim().max(200).refine((v) => v === '' || /^https:\/\/(www\.|m\.)?(facebook|fb)\.com\//.test(v), 'Paste your Facebook page link (https://facebook.com/…)').transform((v) => v || null).optional(),
  shopYoutube: z.string().trim().max(200).refine((v) => v === '' || /^https:\/\/(www\.)?(youtube\.com|youtu\.be)\//.test(v), 'Paste your YouTube link').transform((v) => v || null).optional(),
  shopMapUrl: z.string().trim().max(500).refine((v) => v === '' || /^https:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps|(www\.)?google\.[a-z.]+\/maps|maps\.google\.[a-z.]+)/.test(v), 'Paste a Google Maps link (https://maps.app.goo.gl/…)').transform((v) => v || null).optional(),
});

router.get('/settings', requireOwner, h(async (req, res) => {
  const b = await prisma.business.findUnique({ where: { id: req.businessId } });
  b.slug = await ensureSlug(b);
  res.json({ settings: shopFields(b) });
}));

// Vendor asks to connect their own domain; BusinessMithra team adds it on the server and marks it live.
router.put('/domain', requireOwner, h(async (req, res) => {
  const raw = normalizeDomain(req.body?.domain);
  if (raw && !/^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(raw)) throw new HttpError(400, 'Enter a valid domain like srisaitextiles.in');
  if (raw && /onrender\.com$|businessmithra/.test(raw)) throw new HttpError(400, 'Please enter your own domain');
  const domain = raw ? `www.${raw}` : null;
  if (domain) {
    const dup = await prisma.business.findFirst({ where: { customDomain: domain, NOT: { id: req.businessId } } });
    if (dup) throw new HttpError(409, 'This domain is already connected to another shop');
  }
  const b = await prisma.business.update({ where: { id: req.businessId }, data: { customDomain: domain, customDomainStatus: domain ? 'requested' : null } });
  clearDomainCache();
  await logActivity(req.businessId, req.user.id, domain ? 'domain_request' : 'domain_remove', 'shop', b.id);
  res.json({ customDomain: b.customDomain, customDomainStatus: b.customDomainStatus });
}));

function coordsIn(text) {
  const t = decodeURIComponent(String(text || ''));
  const m = /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/.exec(t) || /@(-?\d+\.\d+),(-?\d+\.\d+)/.exec(t) || /[?&](?:q|query|ll|destination|center)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/.exec(t);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}

// Short links (maps.app.goo.gl) are followed to the full Google Maps address, which has the coordinates.
async function coordsFromMapLink(url) {
  let cur = url;
  for (let i = 0; i < 4; i += 1) {
    const hit = coordsIn(cur);
    if (hit) return hit;
    const r = await fetch(cur, { redirect: 'manual', signal: AbortSignal.timeout(5000), headers: { 'User-Agent': 'Mozilla/5.0' } });
    const next = r.headers.get('location');
    if (!next) {
      const body = r.status === 200 ? (await r.text()).slice(0, 200000) : '';
      return coordsIn(body);
    }
    cur = new URL(next, cur).toString();
  }
  return coordsIn(cur);
}

router.put('/settings', requireOwner, h(async (req, res) => {
  const d = settingsSchema.parse(req.body);
  if (!d.allowPickup && !d.allowDelivery && !d.allowBooking && !d.allowTable) throw new HttpError(400, 'Turn on at least one: takeaway, delivery, table booking or appointment');
  if (d.allowDelivery && d.normalDelivery === false && !d.morningDelivery && !d.fastDelivery) throw new HttpError(400, 'Turn on at least one delivery type: normal, morning or fast');
  const dup = await prisma.business.findFirst({ where: { slug: d.slug, NOT: { id: req.businessId } } });
  if (dup) throw new HttpError(409, 'This shop link is already taken. Try another.');
  // Only a Google Maps link given? Read the location (lat, lng) from it for distance & routes.
  if (d.shopMapUrl && (d.shopLat === null || d.shopLat === undefined)) {
    const pt = await coordsFromMapLink(d.shopMapUrl).catch(() => null);
    if (pt) Object.assign(d, { shopLat: pt.lat, shopLng: pt.lng });
  }
  const b = await prisma.business.update({ where: { id: req.businessId }, data: d });
  await logActivity(req.businessId, req.user.id, 'update', 'shop', b.id);
  res.json({ settings: shopFields(b) });
}));

// Online payment (Razorpay) + cash on delivery choices for the shop.
router.put('/payments', requireOwner, h(async (req, res) => {
  const d = z.object({
    allowOnlinePay: z.boolean(),
    allowCod: z.boolean(),
    allowUpiPay: z.boolean().default(true),
    rzpKeyId: z.string().trim().max(60).optional().nullable(),
    rzpKeySecret: z.string().trim().max(100).optional().nullable(),
    removeKeys: z.boolean().optional(),
  }).parse(req.body);
  if (!d.allowOnlinePay && !d.allowCod && !d.allowUpiPay) throw new HttpError(400, 'Keep at least one payment option on');
  const cur = await prisma.business.findUnique({ where: { id: req.businessId }, select: { upiId: true } });
  if (d.allowUpiPay && !d.allowCod && !d.allowOnlinePay && !cur.upiId) throw new HttpError(400, 'Add your UPI ID in shop settings first');
  const data = { allowOnlinePay: d.allowOnlinePay, allowCod: d.allowCod, allowUpiPay: d.allowUpiPay };
  if (d.removeKeys) Object.assign(data, { rzpKeyId: null, rzpKeySecret: null });
  else if (d.rzpKeyId || d.rzpKeySecret) {
    if (!/^rzp_(test|live)_[A-Za-z0-9]+$/.test(d.rzpKeyId || '')) throw new HttpError(400, 'Key ID should look like rzp_live_xxxxx or rzp_test_xxxxx');
    const ex = await prisma.business.findUnique({ where: { id: req.businessId } });
    if (!d.rzpKeySecret && !ex.rzpKeySecret) throw new HttpError(400, 'Enter the Key Secret');
    if (d.rzpKeySecret) {
      await checkKeys({ keyId: d.rzpKeyId, keySecret: d.rzpKeySecret }).catch(() => { throw new HttpError(400, 'These Razorpay keys did not work. Check Key ID and Key Secret.'); });
      data.rzpKeySecret = sealSecret(d.rzpKeySecret);
    }
    data.rzpKeyId = d.rzpKeyId;
  }
  const b = await prisma.business.update({ where: { id: req.businessId }, data });
  if (b.allowOnlinePay && !shopKeys(b)) {
    await prisma.business.update({ where: { id: b.id }, data: { allowOnlinePay: false, allowCod: b.allowCod || !b.allowUpiPay || !b.upiId } });
    throw new HttpError(400, 'Add your Razorpay keys first to take online payments');
  }
  await logActivity(req.businessId, req.user.id, 'update', 'shop_payments', b.id);
  res.json({ settings: shopFields(b) });
}));

// Signed Cloudinary upload: the browser sends the photo straight to Cloudinary; the secret never leaves the server.
router.get('/upload-config', h(async (_req, res) => {
  res.json({ enabled: Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) });
}));

router.post('/upload-sign', h(async (req, res) => {
  if (!req.user.isOwner && !req.user.role.permissions.some((p) => p.module === 'sales' && (p.canAdd || p.canEdit))) {
    throw new HttpError(403, "You don't have permission to upload photos");
  }
  const { CLOUDINARY_CLOUD_NAME: cloud, CLOUDINARY_API_KEY: key, CLOUDINARY_API_SECRET: secret } = process.env;
  if (!cloud || !key || !secret) throw new HttpError(400, 'Photo upload is not set up yet. Paste an image link instead.');
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = `businessmithra/${req.businessId}`;
  const toSign = `folder=${folder}&timestamp=${timestamp}`;
  const signature = crypto.createHash('sha1').update(toSign + secret).digest('hex');
  res.json({ url: `https://api.cloudinary.com/v1_1/${cloud}/image/upload`, apiKey: key, timestamp, folder, signature });
}));

// ── Orders & bookings from the online shop ──
const include = { items: true, customer: { select: { id: true, name: true } } };

router.get('/orders', requirePermission('sales', 'view'), h(async (req, res) => {
  const st = String(req.query.status || 'open');
  const where = { businessId: req.businessId };
  if (st === 'open') where.status = { in: ['new', 'confirmed', 'ready'] };
  else if (st !== 'all') where.status = st;
  const [orders, newCount] = await Promise.all([
    prisma.shopOrder.findMany({ where, include, orderBy: { createdAt: 'desc' }, take: 300 }),
    prisma.shopOrder.count({ where: { businessId: req.businessId, status: 'new' } }),
  ]);
  res.json({ orders, newCount });
}));

// Delivery planning: open delivery orders with their map points + the shop's location.
router.get('/delivery-plan', requirePermission('sales', 'view'), h(async (req, res) => {
  const [b, orders] = await Promise.all([
    prisma.business.findUnique({ where: { id: req.businessId }, select: { name: true, shopLat: true, shopLng: true, address: true, city: true } }),
    prisma.shopOrder.findMany({
      where: { businessId: req.businessId, kind: 'order', fulfilment: 'delivery', status: { in: String(req.query.include || '') === 'new' ? ['new', 'confirmed', 'ready'] : ['confirmed', 'ready'] } },
      include: { items: true }, orderBy: { createdAt: 'asc' }, take: 200,
    }),
  ]);
  res.json({
    shop: { name: b.name, lat: b.shopLat, lng: b.shopLng, address: [b.address, b.city].filter(Boolean).join(', ') },
    orders: orders.map((o) => ({
      id: o.id, number: o.number, name: o.name, phone: o.phone, address: o.address, lat: o.lat, lng: o.lng, status: o.status, deliveryNote: o.deliveryNote, deliverySpeed: o.deliverySpeed,
      total: o.total, paymentStatus: o.paymentStatus, payChoice: o.payChoice, createdAt: o.createdAt,
      items: o.items.map((i) => `${i.name} × ${Number(i.qty)}`).join(', '),
    })),
  });
}));

router.get('/orders/count', requirePermission('sales', 'view'), h(async (req, res) => {
  const newCount = await prisma.shopOrder.count({ where: { businessId: req.businessId, status: 'new' } });
  res.json({ newCount });
}));

async function getOrder(req) {
  const o = await prisma.shopOrder.findFirst({ where: { id: req.params.id, businessId: req.businessId }, include });
  if (!o) throw new HttpError(404, 'Order not found');
  return o;
}

router.put('/orders/:id/status', requirePermission('sales', 'edit'), h(async (req, res) => {
  const status = String(req.body.status || '');
  if (!['new', 'confirmed', 'ready', 'completed', 'cancelled'].includes(status)) throw new HttpError(400, 'Invalid status');
  const o = await getOrder(req);
  const u = await prisma.$transaction(async (tx) => {
    // Stock goes out when the shop confirms an order, and comes back if it is cancelled.
    if (o.kind === 'order' && ['confirmed', 'ready', 'completed'].includes(status) && !o.invoiceId) {
      const done = await tx.stockMove.count({ where: { refType: 'order', refId: o.id } });
      if (!done) await applyLines(tx, { businessId: req.businessId, refType: 'order', refId: o.id, lines: o.items.map((i) => ({ ...i })), sign: -1, reason: 'order', userId: req.user.id });
    }
    if (status === 'cancelled') await reverseRef(tx, 'order', o.id);
    return tx.shopOrder.update({ where: { id: o.id }, data: { status, seenAt: o.seenAt || new Date() }, include });
  });
  await logActivity(req.businessId, req.user.id, `order_${status}`, 'shop_order', o.id);
  res.json({ order: u });
}));

// Turns the order into a GST invoice (and records the payment if already paid).
async function makeInvoice(tx, req, o, payment) {
  const items = o.items.map((i) => ({ itemId: i.itemId, variantId: i.variantId, name: i.name, hsn: i.hsn, unit: i.unit, qty: num(i.qty), rate: num(i.rate), taxRate: num(i.taxRate) }));
  if (num(o.deliveryFee) > 0) items.push({ name: 'Delivery charges', qty: 1, rate: num(o.deliveryFee), taxRate: 0 });
  const c = computeDoc({ items, discount: num(o.discount), interState: false });
  const b = await tx.business.update({ where: { id: req.businessId }, data: { nextInvoiceNo: { increment: 1 } } });
  const inv = await tx.invoice.create({
    data: {
      businessId: req.businessId, number: `${b.invoicePrefix}${b.nextInvoiceNo - 1}`, customerId: o.customerId,
      date: dateOnly(istToday()), interState: false,
      subtotal: c.subtotal, discount: c.discount, taxTotal: c.taxTotal, cgst: c.cgst, sgst: c.sgst, igst: c.igst, roundOff: c.roundOff, total: c.total,
      notes: `Online ${o.kind} ${o.number}${o.memberNote ? ` · ${o.memberNote}` : ''}`, shareToken: crypto.randomBytes(16).toString('hex'), createdById: req.user.id,
      items: { create: c.lines },
    },
  });
  const orderMoves = await tx.stockMove.count({ where: { refType: 'order', refId: o.id } });
  if (orderMoves) await tx.stockMove.updateMany({ where: { refType: 'order', refId: o.id }, data: { note: `invoice:${inv.id}` } });
  else await applyLines(tx, { businessId: req.businessId, refType: 'invoice', refId: inv.id, lines: c.lines, sign: -1, reason: 'sale', userId: req.user.id });
  if (payment) {
    const accountId = await defaultAccountId(tx, req.businessId, payment.mode);
    await tx.payment.create({
      data: { businessId: req.businessId, invoiceId: inv.id, customerId: o.customerId, accountId, amount: Math.min(payment.amount, c.total), date: dateOnly(istToday()), mode: payment.mode, reference: o.number, createdById: req.user.id },
    });
    await recalcInvoice(tx, inv.id);
  }
  return inv;
}

async function ensureCustomer(req, o) {
  if (o.customerId) return o;
  const c = await prisma.customer.create({ data: { businessId: req.businessId, name: o.name, phone: o.phone, address: o.address, tags: ['Online'] } });
  return prisma.shopOrder.update({ where: { id: o.id }, data: { customerId: c.id }, include });
}

router.post('/orders/:id/invoice', requirePermission('sales', 'add'), h(async (req, res) => {
  let o = await getOrder(req);
  if (o.invoiceId) return res.json({ invoiceId: o.invoiceId });
  if (o.status === 'cancelled') throw new HttpError(400, 'This order is cancelled');
  o = await ensureCustomer(req, o);
  const inv = await prisma.$transaction(async (tx) => {
    const created = await makeInvoice(tx, req, o, o.paymentStatus === 'paid' ? { amount: num(o.total), mode: o.paymentMode || 'upi' } : null);
    await tx.shopOrder.update({ where: { id: o.id }, data: { invoiceId: created.id, seenAt: o.seenAt || new Date() } });
    return created;
  });
  await logActivity(req.businessId, req.user.id, 'order_invoice', 'shop_order', o.id);
  res.status(201).json({ invoiceId: inv.id });
}));

router.post('/orders/:id/paid', requirePermission('sales', 'edit'), h(async (req, res) => {
  const mode = MODES.includes(req.body.mode) ? req.body.mode : 'upi';
  const o = await getOrder(req);
  if (o.paymentStatus === 'paid') return res.json({ order: o });
  await prisma.$transaction(async (tx) => {
    await tx.shopOrder.update({ where: { id: o.id }, data: { paymentStatus: 'paid', paymentMode: mode, seenAt: o.seenAt || new Date() } });
    if (o.invoiceId) {
      const inv = await tx.invoice.findUnique({ where: { id: o.invoiceId } });
      const due = num(inv.total) - num(inv.amountPaid);
      if (due > 0 && inv.status !== 'cancelled') {
        const accountId = await defaultAccountId(tx, req.businessId, mode);
        await tx.payment.create({
          data: { businessId: req.businessId, invoiceId: inv.id, customerId: inv.customerId, accountId, amount: due, date: dateOnly(istToday()), mode, reference: o.number, createdById: req.user.id },
        });
        await recalcInvoice(tx, inv.id);
      }
    }
  });
  const u = await prisma.shopOrder.findUnique({ where: { id: o.id }, include });
  res.json({ order: u });
}));

export default router;
