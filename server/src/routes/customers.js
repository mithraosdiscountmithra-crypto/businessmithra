import { Router } from 'express';
import { z } from 'zod';
import { prisma, logActivity } from '../lib/prisma.js';
import { h } from '../lib/route.js';
import { parseRange } from '../lib/money.js';
import { r2, num } from '../lib/money.js';
import { HttpError, requireAuth, requirePermission } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth());

const s = (max) => z.string().trim().max(max).optional().nullable().or(z.literal('')).transform((v) => v || null);

export const customerSchema = z.object({
  name: z.string().trim().min(1, 'Enter customer name').max(120),
  phone: z.string().trim().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number').optional().nullable().or(z.literal('')).transform((v) => v || null),
  email: z.string().trim().toLowerCase().email('Enter a valid email').optional().nullable().or(z.literal('')).transform((v) => v || null),
  address: s(300),
  city: s(80),
  state: s(80),
  gstin: z.string().trim().toUpperCase().regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/, 'Enter a valid 15-character GSTIN').optional().nullable().or(z.literal('')).transform((v) => v || null),
  tags: z.array(z.string().trim().min(1).max(30)).max(10).default([]),
  notes: s(1000),
  birthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable().or(z.literal('')).transform((v) => (v ? new Date(`${v}T00:00:00.000Z`) : null)),
});

router.get('/', requirePermission('sales', 'view'), h(async (req, res) => {
  const q = String(req.query.q || '').trim();
  const tag = String(req.query.tag || '').trim();
  const where = { businessId: req.businessId };
  if (q) where.OR = [{ name: { contains: q, mode: 'insensitive' } }, { phone: { contains: q } }, { email: { contains: q, mode: 'insensitive' } }];
  if (tag) where.tags = { has: tag };
  const customers = await prisma.customer.findMany({ where, orderBy: { name: 'asc' }, take: Math.min(Number(req.query.limit) || 200, 500) });
  const ids = customers.map((c) => c.id);
  const sums = ids.length
    ? await prisma.invoice.groupBy({
        by: ['customerId'],
        where: { businessId: req.businessId, customerId: { in: ids }, status: { not: 'cancelled' } },
        _sum: { total: true, amountPaid: true },
        _max: { date: true },
      })
    : [];
  const map = Object.fromEntries(sums.map((x) => [x.customerId, x]));
  res.json({
    customers: customers.map((c) => {
      const x = map[c.id];
      const total = num(x?._sum.total);
      return { ...c, totalPurchases: total, balanceDue: r2(total - num(x?._sum.amountPaid)), lastPurchase: x?._max.date || null };
    }),
  });
}));

router.get('/:id', requirePermission('sales', 'view'), h(async (req, res) => {
  const c = await prisma.customer.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!c) throw new HttpError(404, 'Customer not found');
  const [invoices, payments, followUps, leads] = await Promise.all([
    prisma.invoice.findMany({ where: { businessId: req.businessId, customerId: c.id }, orderBy: { date: 'desc' }, take: 50, select: { id: true, number: true, date: true, total: true, amountPaid: true, status: true, dueDate: true } }),
    prisma.payment.findMany({ where: { businessId: req.businessId, customerId: c.id }, orderBy: { date: 'desc' }, take: 50, include: { invoice: { select: { number: true } } } }),
    prisma.followUp.findMany({ where: { businessId: req.businessId, customerId: c.id }, orderBy: { dueAt: 'desc' }, take: 30 }),
    prisma.lead.findMany({ where: { businessId: req.businessId, customerId: c.id }, orderBy: { createdAt: 'desc' }, take: 20 }),
  ]);
  const live = invoices.filter((i) => i.status !== 'cancelled');
  const totalPurchases = r2(live.reduce((a, i) => a + num(i.total), 0));
  const balanceDue = r2(live.reduce((a, i) => a + num(i.total) - num(i.amountPaid), 0));
  res.json({
    customer: c,
    stats: { totalPurchases, balanceDue, invoiceCount: live.length, lastPurchase: live[0]?.date || null },
    invoices, payments, followUps, leads,
  });
}));

// Account statement: bills, payments and returns with running balance.
router.get('/:id/statement', requirePermission('sales', 'view'), h(async (req, res) => {
  const c = await prisma.customer.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!c) throw new HttpError(404, 'Customer not found');
  const r = parseRange(req.query);
  const base = { businessId: req.businessId, customerId: c.id };
  const [invs, pays, cns, business] = await Promise.all([
    prisma.invoice.findMany({ where: { ...base, status: { not: 'cancelled' } }, select: { id: true, number: true, date: true, total: true } }),
    prisma.payment.findMany({ where: base, select: { id: true, date: true, amount: true, mode: true, invoice: { select: { number: true } } } }),
    prisma.creditNote.findMany({ where: base, select: { id: true, number: true, date: true, total: true, settle: true } }),
    prisma.business.findUnique({ where: { id: req.businessId }, select: { name: true, phone: true, address: true, city: true, gstin: true } }),
  ]);
  // Refunded returns cancel themselves out (credit + money back), so only adjust/credit returns reduce the balance.
  const all = [
    ...invs.map((i) => ({ date: i.date, type: 'Bill', ref: i.number, debit: num(i.total), credit: 0 })),
    ...pays.map((p) => ({ date: p.date, type: `Payment (${p.mode})`, ref: p.invoice?.number || '', debit: 0, credit: num(p.amount) })),
    ...cns.filter((n) => n.settle !== 'refund').map((n) => ({ date: n.date, type: 'Return', ref: n.number, debit: 0, credit: num(n.total) })),
  ].sort((a, b) => a.date - b.date || b.debit - a.debit);
  let opening = 0;
  const rows = [];
  let bal = 0;
  for (const x of all) {
    if (x.date < r.gte) { opening = r2(opening + x.debit - x.credit); bal = opening; continue; }
    if (x.date >= r.lt) continue;
    bal = r2(bal + x.debit - x.credit);
    rows.push({ ...x, balance: bal });
  }
  res.json({ customer: c, business, range: { from: r.from, to: r.to }, opening, closing: rows.length ? bal : opening, rows,
    totals: { debit: r2(rows.reduce((a, x) => a + x.debit, 0)), credit: r2(rows.reduce((a, x) => a + x.credit, 0)) } });
}));

router.post('/', requirePermission('sales', 'add'), h(async (req, res) => {
  const d = customerSchema.parse(req.body);
  if (d.phone) {
    const dup = await prisma.customer.findFirst({ where: { businessId: req.businessId, phone: d.phone } });
    if (dup) throw new HttpError(409, `This mobile number already belongs to ${dup.name}`);
  }
  const c = await prisma.customer.create({ data: { ...d, businessId: req.businessId } });
  await logActivity(req.businessId, req.user.id, 'create', 'customer', c.id);
  res.status(201).json({ customer: c });
}));

router.put('/:id', requirePermission('sales', 'edit'), h(async (req, res) => {
  const d = customerSchema.parse(req.body);
  const c = await prisma.customer.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!c) throw new HttpError(404, 'Customer not found');
  if (d.phone) {
    const dup = await prisma.customer.findFirst({ where: { businessId: req.businessId, phone: d.phone, NOT: { id: c.id } } });
    if (dup) throw new HttpError(409, `This mobile number already belongs to ${dup.name}`);
  }
  const u = await prisma.customer.update({ where: { id: c.id }, data: d });
  await logActivity(req.businessId, req.user.id, 'update', 'customer', c.id);
  res.json({ customer: u });
}));

router.delete('/:id', requirePermission('sales', 'delete'), h(async (req, res) => {
  const c = await prisma.customer.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!c) throw new HttpError(404, 'Customer not found');
  const [inv, qt] = await Promise.all([
    prisma.invoice.count({ where: { customerId: c.id } }),
    prisma.quotation.count({ where: { customerId: c.id } }),
  ]);
  if (inv || qt) throw new HttpError(400, 'This customer has invoices or quotations, so it cannot be deleted');
  await prisma.customer.delete({ where: { id: c.id } });
  await logActivity(req.businessId, req.user.id, 'delete', 'customer', c.id);
  res.json({ ok: true });
}));

export default router;
