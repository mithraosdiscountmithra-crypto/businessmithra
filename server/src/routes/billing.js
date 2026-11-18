// Vendor side: see plans, request a plan after paying BusinessMithra (cash / UPI / bank). Super admin approves.
import { Router } from 'express';
import { z } from 'zod';
import { prisma, logActivity } from '../lib/prisma.js';
import { h } from '../lib/route.js';
import { num } from '../lib/money.js';
import { getPlans } from '../lib/plans.js';
import { HttpError, requireAuth, requireOwner } from '../middleware/auth.js';
import { capturedPayment, createOrder, platformKeys, validSignature } from '../lib/razorpay.js';
import { activateRequest } from '../lib/subscription.js';

const router = Router();
router.use(requireAuth({ allowExpired: true }), requireOwner);

const payTo = () => ({
  upi: process.env.PLATFORM_UPI || null,
  phone: process.env.PLATFORM_PHONE || null,
  name: process.env.PLATFORM_NAME || 'BusinessMithra',
});

// If the vendor paid but closed the page before we heard back, finish it now.
async function settleOnline(businessId) {
  const keys = platformKeys();
  if (!keys) return;
  const waiting = await prisma.subscriptionRequest.findMany({ where: { businessId, status: 'awaiting_payment', rzpOrderId: { not: null }, createdAt: { gte: new Date(Date.now() - 3 * 86400000) } } });
  for (const r of waiting) {
    const p = await capturedPayment(keys, r.rzpOrderId).catch(() => null);
    if (p && p.amount === Math.round(num(r.amount) * 100)) await activateRequest(r, { paymentMode: 'online', reference: p.id });
  }
}

router.get('/', h(async (req, res) => {
  await settleOnline(req.businessId).catch((e) => console.error('settle online', e.message));
  const [plans, requests] = await Promise.all([
    getPlans(),
    prisma.subscriptionRequest.findMany({ where: { businessId: req.businessId, status: { not: 'awaiting_payment' } }, orderBy: { createdAt: 'desc' }, take: 20 }),
  ]);
  res.json({
    plans: plans.filter((p) => p.active),
    current: req.user.business.access,
    requests,
    payTo: payTo(),
    online: Boolean(platformKeys()),
  });
}));

const reqSchema = z.object({
  planCode: z.string().min(1),
  cycle: z.enum(['monthly', 'yearly']).default('monthly'),
  paymentMode: z.enum(['cash', 'upi', 'bank']).default('cash'),
  reference: z.string().trim().max(100).optional().nullable().or(z.literal('')).transform((v) => v || null),
  note: z.string().trim().max(500).optional().nullable().or(z.literal('')).transform((v) => v || null),
});

router.post('/request', h(async (req, res) => {
  const d = reqSchema.parse(req.body);
  const plan = (await getPlans()).find((p) => p.code === d.planCode && p.active);
  if (!plan) throw new HttpError(400, 'Plan not found');
  const pending = await prisma.subscriptionRequest.findFirst({ where: { businessId: req.businessId, status: 'pending' } });
  if (pending) throw new HttpError(409, 'You already have a request waiting for approval. Cancel it first to send a new one.');
  const amount = d.cycle === 'yearly' ? num(plan.priceYearly) : num(plan.priceMonthly);
  const r = await prisma.subscriptionRequest.create({
    data: { businessId: req.businessId, planCode: plan.code, cycle: d.cycle, amount, paymentMode: d.paymentMode, reference: d.reference, note: d.note, requestedBy: req.user.id },
  });
  await logActivity(req.businessId, req.user.id, 'plan_request', 'subscription', r.id);
  res.status(201).json({ request: r });
}));

router.delete('/request/:id', h(async (req, res) => {
  const r = await prisma.subscriptionRequest.findFirst({ where: { id: req.params.id, businessId: req.businessId, status: 'pending' } });
  if (!r) throw new HttpError(404, 'Request not found');
  await prisma.subscriptionRequest.delete({ where: { id: r.id } });
  res.json({ ok: true });
}));

// ── Pay online with Razorpay ──
router.post('/online/order', h(async (req, res) => {
  const d = z.object({ planCode: z.string().min(1), cycle: z.enum(['monthly', 'yearly']).default('monthly') }).parse(req.body);
  const keys = platformKeys();
  if (!keys) throw new HttpError(400, 'Online payment is not set up yet. Please use cash / UPI.');
  const plan = (await getPlans()).find((p) => p.code === d.planCode && p.active);
  if (!plan) throw new HttpError(400, 'Plan not found');
  const amount = d.cycle === 'yearly' ? num(plan.priceYearly) : num(plan.priceMonthly);
  if (!(amount > 0)) throw new HttpError(400, 'This plan has no price');
  // Old unfinished online attempts are dropped.
  await prisma.subscriptionRequest.deleteMany({ where: { businessId: req.businessId, status: 'awaiting_payment', createdAt: { lt: new Date(Date.now() - 3600000) } } });
  const r = await prisma.subscriptionRequest.create({
    data: { businessId: req.businessId, planCode: plan.code, cycle: d.cycle, amount, paymentMode: 'online', status: 'awaiting_payment', requestedBy: req.user.id },
  });
  const order = await createOrder(keys, { amount, receipt: `plan_${r.id}`, notes: { kind: 'plan', requestId: r.id, businessId: req.businessId } });
  await prisma.subscriptionRequest.update({ where: { id: r.id }, data: { rzpOrderId: order.id } });
  const b = req.user.business;
  res.json({
    keyId: keys.keyId, orderId: order.id, amount: order.amount, name: 'BusinessMithra',
    description: `${plan.name} – ${d.cycle === 'yearly' ? '1 year' : '1 month'}`,
    prefill: { name: req.user.name, email: req.user.email || '', contact: b.phone || req.user.phone || '' },
    test: keys.keyId.startsWith('rzp_test_'),
  });
}));

router.post('/online/verify', h(async (req, res) => {
  const d = z.object({ razorpay_order_id: z.string(), razorpay_payment_id: z.string(), razorpay_signature: z.string() }).parse(req.body);
  const keys = platformKeys();
  if (!keys) throw new HttpError(400, 'Online payment is not set up');
  const r = await prisma.subscriptionRequest.findFirst({ where: { businessId: req.businessId, rzpOrderId: d.razorpay_order_id } });
  if (!r) throw new HttpError(404, 'Payment not found');
  if (r.status === 'approved') return res.json({ ok: true, validTill: r.validTill });
  if (!validSignature(keys.keySecret, d.razorpay_order_id, d.razorpay_payment_id, d.razorpay_signature)) throw new HttpError(400, 'Payment could not be verified');
  const till = await activateRequest(r, { paymentMode: 'online', reference: d.razorpay_payment_id });
  await logActivity(req.businessId, req.user.id, 'plan_paid_online', 'subscription', r.id);
  res.json({ ok: true, validTill: till });
}));

export default router;
