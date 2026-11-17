import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { h } from '../lib/route.js';
import { istToday, dateOnly, addDays } from '../lib/money.js';
import { HttpError, requireAuth, requirePermission } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth());

const s = z.string().trim().max(40).optional().nullable().or(z.literal('')).transform((v) => v || null);

const schema = z.object({
  title: z.string().trim().min(1, 'What should be done?').max(200),
  dueAt: z.string().min(1, 'Select date and time').transform((v, ctx) => {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) ctx.addIssue({ code: 'custom', message: 'Invalid date' });
    return d;
  }),
  customerId: s,
  leadId: s,
  assignedToId: s,
});

const include = { customer: { select: { id: true, name: true, phone: true } }, lead: { select: { id: true, name: true, phone: true } } };

// India day boundaries expressed in UTC.
const istDayStart = (day) => new Date(dateOnly(day).getTime() - 330 * 60000);

router.get('/', requirePermission('sales', 'view'), h(async (req, res) => {
  const view = String(req.query.view || 'open');
  const todayStart = istDayStart(istToday());
  const tomorrowStart = istDayStart(addDays(istToday(), 1));
  const where = { businessId: req.businessId };
  if (view === 'today') Object.assign(where, { done: false, dueAt: { lt: tomorrowStart } });
  else if (view === 'overdue') Object.assign(where, { done: false, dueAt: { lt: todayStart } });
  else if (view === 'upcoming') Object.assign(where, { done: false, dueAt: { gte: tomorrowStart } });
  else if (view === 'done') Object.assign(where, { done: true });
  else Object.assign(where, { done: false });
  if (req.query.mine === '1') where.assignedToId = req.user.id;
  const followUps = await prisma.followUp.findMany({
    where, include, orderBy: { dueAt: view === 'done' ? 'desc' : 'asc' }, take: 300,
  });
  res.json({ followUps, todayStart, tomorrowStart });
}));

router.post('/', requirePermission('sales', 'add'), h(async (req, res) => {
  const d = schema.parse(req.body);
  if (d.customerId && !(await prisma.customer.findFirst({ where: { id: d.customerId, businessId: req.businessId } }))) throw new HttpError(400, 'Customer not found');
  if (d.leadId && !(await prisma.lead.findFirst({ where: { id: d.leadId, businessId: req.businessId } }))) throw new HttpError(400, 'Lead not found');
  const f = await prisma.followUp.create({
    data: { ...d, assignedToId: d.assignedToId || req.user.id, createdById: req.user.id, businessId: req.businessId },
    include,
  });
  res.status(201).json({ followUp: f });
}));

router.put('/:id', requirePermission('sales', 'edit'), h(async (req, res) => {
  const f = await prisma.followUp.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!f) throw new HttpError(404, 'Follow-up not found');
  const data = {};
  if (typeof req.body.done === 'boolean') {
    data.done = req.body.done;
    data.doneAt = req.body.done ? new Date() : null;
  }
  if (req.body.title || req.body.dueAt) {
    const d = schema.partial({ customerId: true, leadId: true, assignedToId: true }).parse({ title: f.title, dueAt: f.dueAt.toISOString(), ...req.body });
    data.title = d.title;
    data.dueAt = d.dueAt;
  }
  const u = await prisma.followUp.update({ where: { id: f.id }, data, include });
  res.json({ followUp: u });
}));

router.delete('/:id', requirePermission('sales', 'delete'), h(async (req, res) => {
  const f = await prisma.followUp.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!f) throw new HttpError(404, 'Follow-up not found');
  await prisma.followUp.delete({ where: { id: f.id } });
  res.json({ ok: true });
}));

export default router;
