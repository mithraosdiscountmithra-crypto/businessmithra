// Vendor: customer membership plans (e.g. ₹499/year = 10% off, ₹99/month = free delivery) and members.
import { Router } from 'express';
import { z } from 'zod';
import { prisma, logActivity } from '../lib/prisma.js';
import { h } from '../lib/route.js';
import { HttpError, requireAuth, requireOwner, requirePermission } from '../middleware/auth.js';
import { MODES } from './invoices.js';
import { activateMembership, activeBenefits } from '../lib/membership.js';

const router = Router();
router.use(requireAuth());

const planSchema = z.object({
  name: z.string().trim().min(1, 'Enter plan name').max(60),
  price: z.coerce.number().min(0, 'Price cannot be negative'),
  durationDays: z.coerce.number().int().min(1, 'Validity must be at least 1 day').max(3650),
  discountPct: z.coerce.number().min(0).max(100, 'Discount cannot be more than 100%'),
  freeDelivery: z.boolean().default(false),
  description: z.string().trim().max(300).optional().nullable().or(z.literal('')).transform((v) => v || null),
  active: z.boolean().default(true),
}).refine((d) => d.discountPct > 0 || d.freeDelivery, { message: 'Give at least one benefit: discount % or free delivery', path: ['discountPct'] });

router.get('/settings', requirePermission('sales', 'view'), h(async (req, res) => {
  const b = await prisma.business.findUnique({ where: { id: req.businessId }, select: { membershipsEnabled: true } });
  res.json(b);
}));

router.put('/settings', requireOwner, h(async (req, res) => {
  const enabled = Boolean(req.body?.membershipsEnabled);
  await prisma.business.update({ where: { id: req.businessId }, data: { membershipsEnabled: enabled } });
  res.json({ membershipsEnabled: enabled });
}));

router.get('/plans', requirePermission('sales', 'view'), h(async (req, res) => {
  const plans = await prisma.membershipPlan.findMany({
    where: { businessId: req.businessId },
    include: { _count: { select: { memberships: { where: { status: 'active', endsAt: { gt: new Date() } } } } } },
    orderBy: { createdAt: 'asc' },
  });
  res.json({ plans: plans.map(({ _count, ...p }) => ({ ...p, activeMembers: _count.memberships })) });
}));

router.post('/plans', requirePermission('sales', 'add'), h(async (req, res) => {
  const d = planSchema.parse(req.body);
  const plan = await prisma.membershipPlan.create({ data: { ...d, businessId: req.businessId } });
  await logActivity(req.businessId, req.user.id, 'create', 'membership_plan', plan.id);
  res.status(201).json({ plan });
}));

router.put('/plans/:id', requirePermission('sales', 'edit'), h(async (req, res) => {
  const d = planSchema.parse(req.body);
  const ex = await prisma.membershipPlan.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!ex) throw new HttpError(404, 'Plan not found');
  const plan = await prisma.membershipPlan.update({ where: { id: ex.id }, data: d });
  res.json({ plan });
}));

const include = { plan: true, customer: { select: { id: true, name: true, phone: true } } };

router.get('/', requirePermission('sales', 'view'), h(async (req, res) => {
  const st = String(req.query.status || 'active');
  const now = new Date();
  const where = { businessId: req.businessId };
  if (st === 'active') Object.assign(where, { status: 'active', endsAt: { gt: now } });
  else if (st === 'expired') Object.assign(where, { status: 'active', endsAt: { lte: now } });
  else if (st === 'pending') where.status = 'pending';
  const [members, pending, expiringSoon] = await Promise.all([
    prisma.membership.findMany({ where, include, orderBy: st === 'pending' ? { createdAt: 'asc' } : { endsAt: 'asc' }, take: 500 }),
    prisma.membership.count({ where: { businessId: req.businessId, status: 'pending' } }),
    prisma.membership.count({ where: { businessId: req.businessId, status: 'active', endsAt: { gt: now, lte: new Date(Date.now() + 7 * 86400000) } } }),
  ]);
  res.json({ members, pending, expiringSoon });
}));

// Benefits for a mobile number (used by Send Bill and invoices).
router.get('/check', requirePermission('sales', 'view'), h(async (req, res) => {
  const phone = String(req.query.phone || '').replace(/\D/g, '').slice(-10);
  let p = phone;
  if (!p && req.query.customerId) {
    const c = await prisma.customer.findFirst({ where: { id: String(req.query.customerId), businessId: req.businessId } });
    p = c?.phone || '';
  }
  res.json({ benefits: p ? await activeBenefits(req.businessId, p) : null });
}));

const sellSchema = z.object({
  planId: z.string().min(1, 'Choose a plan'),
  customerId: z.string().optional().nullable(),
  phone: z.string().trim().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number').optional().nullable().or(z.literal('')),
  name: z.string().trim().max(80).optional().nullable(),
  paidMode: z.enum(MODES),
  reference: z.string().trim().max(100).optional().nullable(),
  price: z.union([z.coerce.number().min(0), z.literal('')]).optional().nullable(),
});

// Sold at the counter: active immediately.
router.post('/', requirePermission('sales', 'add'), h(async (req, res) => {
  const d = sellSchema.parse(req.body);
  const plan = await prisma.membershipPlan.findFirst({ where: { id: d.planId, businessId: req.businessId } });
  if (!plan) throw new HttpError(400, 'Plan not found');
  let customer = d.customerId ? await prisma.customer.findFirst({ where: { id: d.customerId, businessId: req.businessId } }) : null;
  if (!customer) {
    if (!d.phone) throw new HttpError(400, 'Enter the customer mobile number');
    customer = await prisma.customer.findFirst({ where: { businessId: req.businessId, phone: d.phone } })
      || await prisma.customer.create({ data: { businessId: req.businessId, name: d.name || `Customer ${d.phone.slice(-4)}`, phone: d.phone } });
  }
  if (!customer.phone) throw new HttpError(400, 'This customer has no mobile number. Add it first.');
  const m = await prisma.membership.create({ data: { businessId: req.businessId, planId: plan.id, customerId: customer.id, phone: customer.phone, source: 'store' } });
  const done = await activateMembership({ membership: m, plan, userId: req.user.id, paidMode: d.paidMode, reference: d.reference, price: d.price });
  await logActivity(req.businessId, req.user.id, 'membership_sold', 'membership', m.id);
  res.status(201).json({ membership: done });
}));

// Bought from the online shop: approve after the payment is received.
router.post('/:id/approve', requirePermission('sales', 'edit'), h(async (req, res) => {
  const m = await prisma.membership.findFirst({ where: { id: req.params.id, businessId: req.businessId }, include: { plan: true } });
  if (!m) throw new HttpError(404, 'Membership not found');
  if (m.status !== 'pending') throw new HttpError(400, 'Already decided');
  const paidMode = MODES.includes(req.body?.paidMode) ? req.body.paidMode : 'upi';
  const done = await activateMembership({ membership: m, plan: m.plan, userId: req.user.id, paidMode, reference: req.body?.reference, price: req.body?.price });
  await logActivity(req.businessId, req.user.id, 'membership_approved', 'membership', m.id);
  res.json({ membership: done });
}));

router.post('/:id/reject', requirePermission('sales', 'edit'), h(async (req, res) => {
  const m = await prisma.membership.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!m) throw new HttpError(404, 'Membership not found');
  const status = m.status === 'pending' ? 'rejected' : 'cancelled';
  const u = await prisma.membership.update({ where: { id: m.id }, data: { status, decidedAt: new Date() }, include });
  res.json({ membership: u });
}));

export default router;
