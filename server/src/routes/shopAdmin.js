// Vendor side of the online shop: settings, photo upload signing, incoming orders.
import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { prisma, logActivity } from '../lib/prisma.js';
import { h } from '../lib/route.js';
import { computeDoc, dateOnly, istToday, num } from '../lib/money.js';
import { HttpError, requireAuth, requireOwner, requirePermission } from '../middleware/auth.js';
import { defaultAccountId, MODES, recalcInvoice } from './invoices.js';

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
  shopCover: b.shopCover || '', shopColor: b.shopColor, shopTimings: b.shopTimings || '', upiId: b.upiId || '',
  allowPickup: b.allowPickup, allowDelivery: b.allowDelivery, deliveryFee: num(b.deliveryFee), minOrder: num(b.minOrder), allowBooking: b.allowBooking,
  allowTable: b.allowTable, shopLat: b.shopLat, shopLng: b.shopLng, shopMapUrl: b.shopMapUrl || '',
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
  upiId: z.string().trim().max(60).refine((v) => v === '' || /^[\w.\-]{2,}@[a-zA-Z]{2,}$/.test(v), 'Enter a valid UPI ID like shop@okaxis').transform((v) => v || null),
  allowPickup: z.boolean(),
  allowDelivery: z.boolean(),
  deliveryFee: z.coerce.number().min(0).max(100000),
  minOrder: z.coerce.number().min(0).max(10000000),
  allowBooking: z.boolean(),
  allowTable: z.boolean().default(false),
  shopLat: z.preprocess((v) => (v === null || v === '' || v === undefined ? null : Number(v)), z.number().min(-90).max(90).nullable()),
  shopLng: z.preprocess((v) => (v === null || v === '' || v === undefined ? null : Number(v)), z.number().min(-180).max(180).nullable()),
  shopMapUrl: z.string().trim().max(500).refine((v) => v === '' || /^https:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps|(www\.)?google\.[a-z.]+\/maps|maps\.google\.[a-z.]+)/.test(v), 'Paste a Google Maps link (https://maps.app.goo.gl/…)').transform((v) => v || null).optional(),
});

router.get('/settings', requireOwner, h(async (req, res) => {
  const b = await prisma.business.findUnique({ where: { id: req.businessId } });
  b.slug = await ensureSlug(b);
  res.json({ settings: shopFields(b) });
}));

router.put('/settings', requireOwner, h(async (req, res) => {
  const d = settingsSchema.parse(req.body);
  if (!d.allowPickup && !d.allowDelivery && !d.allowBooking && !d.allowTable) throw new HttpError(400, 'Turn on at least one: takeaway, delivery, table booking or appointment');
  const dup = await prisma.business.findFirst({ where: { slug: d.slug, NOT: { id: req.businessId } } });
  if (dup) throw new HttpError(409, 'This shop link is already taken. Try another.');
  const b = await prisma.business.update({ where: { id: req.businessId }, data: d });
  await logActivity(req.businessId, req.user.id, 'update', 'shop', b.id);
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
  const u = await prisma.shopOrder.update({ where: { id: o.id }, data: { status, seenAt: o.seenAt || new Date() }, include });
  await logActivity(req.businessId, req.user.id, `order_${status}`, 'shop_order', o.id);
  res.json({ order: u });
}));

// Turns the order into a GST invoice (and records the payment if already paid).
async function makeInvoice(tx, req, o, payment) {
  const items = o.items.map((i) => ({ itemId: i.itemId, name: i.name, hsn: i.hsn, unit: i.unit, qty: num(i.qty), rate: num(i.rate), taxRate: num(i.taxRate) }));
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
