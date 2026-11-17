// Vendor side: see plans, request a plan after paying BusinessMithra (cash / UPI / bank). Super admin approves.
import { Router } from 'express';
import { z } from 'zod';
import { prisma, logActivity } from '../lib/prisma.js';
import { h } from '../lib/route.js';
import { num } from '../lib/money.js';
import { getPlans } from '../lib/plans.js';
import { HttpError, requireAuth, requireOwner } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth({ allowExpired: true }), requireOwner);

const payTo = () => ({
  upi: process.env.PLATFORM_UPI || null,
  phone: process.env.PLATFORM_PHONE || null,
  name: process.env.PLATFORM_NAME || 'BusinessMithra',
});

router.get('/', h(async (req, res) => {
  const [plans, requests] = await Promise.all([
    getPlans(),
    prisma.subscriptionRequest.findMany({ where: { businessId: req.businessId }, orderBy: { createdAt: 'desc' }, take: 20 }),
  ]);
  res.json({
    plans: plans.filter((p) => p.active),
    current: req.user.business.access,
    requests,
    payTo: payTo(),
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

export default router;
