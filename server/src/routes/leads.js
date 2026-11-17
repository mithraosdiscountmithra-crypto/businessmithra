import { Router } from 'express';
import { z } from 'zod';
import { prisma, logActivity } from '../lib/prisma.js';
import { h } from '../lib/route.js';
import { HttpError, requireAuth, requirePermission } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth());

export const STAGES = ['new', 'contacted', 'quotation', 'won', 'lost'];
const s = (max) => z.string().trim().max(max).optional().nullable().or(z.literal('')).transform((v) => v || null);

const leadSchema = z.object({
  name: z.string().trim().min(1, 'Enter lead name').max(120),
  phone: z.string().trim().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number').optional().nullable().or(z.literal('')).transform((v) => v || null),
  need: s(300),
  value: z.coerce.number().min(0).default(0),
  stage: z.enum(STAGES).default('new'),
  priority: z.enum(['hot', 'warm', 'cold']).default('warm'),
  source: s(40),
  customerId: s(40),
  assignedToId: s(40),
  notes: s(1000),
  lostReason: s(300),
});

const include = { customer: { select: { id: true, name: true } } };

router.get('/', requirePermission('sales', 'view'), h(async (req, res) => {
  const since = new Date(Date.now() - 90 * 86400000);
  const leads = await prisma.lead.findMany({
    where: {
      businessId: req.businessId,
      OR: [{ stage: { in: ['new', 'contacted', 'quotation'] } }, { closedAt: { gte: since } }],
    },
    include,
    orderBy: { updatedAt: 'desc' },
    take: 500,
  });
  const staff = await prisma.user.findMany({ where: { businessId: req.businessId, status: 'active' }, select: { id: true, name: true } });
  res.json({ leads, staff });
}));

async function maybeCreateCustomer(req, d, existing) {
  if (d.stage !== 'won' || d.customerId || existing?.customerId) return d.customerId ?? existing?.customerId ?? null;
  if (d.phone) {
    const found = await prisma.customer.findFirst({ where: { businessId: req.businessId, phone: d.phone } });
    if (found) return found.id;
  }
  const c = await prisma.customer.create({ data: { businessId: req.businessId, name: d.name, phone: d.phone } });
  return c.id;
}

async function checkRefs(req, d) {
  if (d.customerId) {
    const c = await prisma.customer.findFirst({ where: { id: d.customerId, businessId: req.businessId } });
    if (!c) throw new HttpError(400, 'Customer not found');
  }
  if (d.assignedToId) {
    const u = await prisma.user.findFirst({ where: { id: d.assignedToId, businessId: req.businessId } });
    if (!u) throw new HttpError(400, 'Staff member not found');
  }
}

router.post('/', requirePermission('sales', 'add'), h(async (req, res) => {
  const d = leadSchema.parse(req.body);
  await checkRefs(req, d);
  d.customerId = await maybeCreateCustomer(req, d);
  const lead = await prisma.lead.create({
    data: { ...d, businessId: req.businessId, closedAt: ['won', 'lost'].includes(d.stage) ? new Date() : null },
    include,
  });
  await logActivity(req.businessId, req.user.id, 'create', 'lead', lead.id);
  res.status(201).json({ lead });
}));

router.put('/:id', requirePermission('sales', 'edit'), h(async (req, res) => {
  const existing = await prisma.lead.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!existing) throw new HttpError(404, 'Lead not found');
  const d = leadSchema.parse({ ...existing, value: Number(existing.value), ...req.body });
  await checkRefs(req, d);
  d.customerId = await maybeCreateCustomer(req, d, existing);
  const closing = ['won', 'lost'].includes(d.stage);
  const lead = await prisma.lead.update({
    where: { id: existing.id },
    data: { ...d, closedAt: closing ? existing.closedAt || new Date() : null },
    include,
  });
  await logActivity(req.businessId, req.user.id, existing.stage !== d.stage ? `stage_${d.stage}` : 'update', 'lead', lead.id);
  res.json({ lead });
}));

router.delete('/:id', requirePermission('sales', 'delete'), h(async (req, res) => {
  const existing = await prisma.lead.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!existing) throw new HttpError(404, 'Lead not found');
  await prisma.lead.delete({ where: { id: existing.id } });
  await logActivity(req.businessId, req.user.id, 'delete', 'lead', existing.id);
  res.json({ ok: true });
}));

export default router;
