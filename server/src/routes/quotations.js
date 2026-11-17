import { Router } from 'express';
import crypto from 'node:crypto';
import { prisma, logActivity } from '../lib/prisma.js';
import { h } from '../lib/route.js';
import { computeDoc, dateOnly, docSchema, num } from '../lib/money.js';
import { HttpError, requireAuth, requirePermission } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth());

const include = { customer: true, items: { orderBy: { sort: 'asc' } } };

async function assertCustomer(req, id) {
  const c = await prisma.customer.findFirst({ where: { id, businessId: req.businessId } });
  if (!c) throw new HttpError(400, 'Customer not found');
}

router.get('/', requirePermission('sales', 'view'), h(async (req, res) => {
  const where = { businessId: req.businessId };
  if (req.query.status) where.status = String(req.query.status);
  const q = String(req.query.q || '').trim();
  if (q) where.OR = [{ number: { contains: q, mode: 'insensitive' } }, { customer: { name: { contains: q, mode: 'insensitive' } } }];
  const quotations = await prisma.quotation.findMany({
    where, include: { customer: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' }, take: 300,
  });
  res.json({ quotations });
}));

router.get('/:id', requirePermission('sales', 'view'), h(async (req, res) => {
  const q = await prisma.quotation.findFirst({ where: { id: req.params.id, businessId: req.businessId }, include });
  if (!q) throw new HttpError(404, 'Quotation not found');
  res.json({ quotation: q });
}));

router.post('/', requirePermission('sales', 'add'), h(async (req, res) => {
  const d = docSchema.parse(req.body);
  await assertCustomer(req, d.customerId);
  const c = computeDoc(d);
  const q = await prisma.$transaction(async (tx) => {
    const b = await tx.business.update({ where: { id: req.businessId }, data: { nextQuoteNo: { increment: 1 } } });
    return tx.quotation.create({
      data: {
        businessId: req.businessId,
        number: `${b.quotePrefix}${b.nextQuoteNo - 1}`,
        customerId: d.customerId,
        date: dateOnly(d.date),
        validTill: d.validTill ? dateOnly(d.validTill) : null,
        interState: d.interState,
        subtotal: c.subtotal, discount: c.discount, taxTotal: c.taxTotal, total: c.total,
        notes: d.notes || null,
        createdById: req.user.id,
        items: { create: c.lines },
      },
      include,
    });
  });
  await logActivity(req.businessId, req.user.id, 'create', 'quotation', q.id);
  res.status(201).json({ quotation: q });
}));

router.put('/:id', requirePermission('sales', 'edit'), h(async (req, res) => {
  const ex = await prisma.quotation.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!ex) throw new HttpError(404, 'Quotation not found');
  if (ex.status === 'converted') throw new HttpError(400, 'This quotation is already converted to an invoice');
  const d = docSchema.parse(req.body);
  await assertCustomer(req, d.customerId);
  const c = computeDoc(d);
  const q = await prisma.$transaction(async (tx) => {
    await tx.quotationItem.deleteMany({ where: { quotationId: ex.id } });
    return tx.quotation.update({
      where: { id: ex.id },
      data: {
        customerId: d.customerId, date: dateOnly(d.date), validTill: d.validTill ? dateOnly(d.validTill) : null,
        interState: d.interState, subtotal: c.subtotal, discount: c.discount, taxTotal: c.taxTotal, total: c.total,
        notes: d.notes || null, items: { create: c.lines },
      },
      include,
    });
  });
  await logActivity(req.businessId, req.user.id, 'update', 'quotation', q.id);
  res.json({ quotation: q });
}));

router.put('/:id/status', requirePermission('sales', 'edit'), h(async (req, res) => {
  const status = String(req.body.status || '');
  if (!['draft', 'sent', 'accepted', 'rejected'].includes(status)) throw new HttpError(400, 'Invalid status');
  const ex = await prisma.quotation.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!ex) throw new HttpError(404, 'Quotation not found');
  if (ex.status === 'converted') throw new HttpError(400, 'Already converted to an invoice');
  const q = await prisma.quotation.update({ where: { id: ex.id }, data: { status }, include });
  res.json({ quotation: q });
}));

// Quotation → Invoice (same items and prices, today's date).
router.post('/:id/convert', requirePermission('sales', 'add'), h(async (req, res) => {
  const ex = await prisma.quotation.findFirst({ where: { id: req.params.id, businessId: req.businessId }, include });
  if (!ex) throw new HttpError(404, 'Quotation not found');
  if (ex.status === 'converted' && ex.invoiceId) return res.json({ invoiceId: ex.invoiceId });
  const today = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
  const c = computeDoc({
    items: ex.items.map((l) => ({ ...l, qty: num(l.qty), rate: num(l.rate), taxRate: num(l.taxRate) })),
    discount: num(ex.discount),
    interState: ex.interState,
  });
  const inv = await prisma.$transaction(async (tx) => {
    const b = await tx.business.update({ where: { id: req.businessId }, data: { nextInvoiceNo: { increment: 1 } } });
    const created = await tx.invoice.create({
      data: {
        businessId: req.businessId,
        number: `${b.invoicePrefix}${b.nextInvoiceNo - 1}`,
        customerId: ex.customerId,
        date: dateOnly(today),
        interState: ex.interState,
        subtotal: c.subtotal, discount: c.discount, taxTotal: c.taxTotal, cgst: c.cgst, sgst: c.sgst, igst: c.igst,
        roundOff: c.roundOff, total: c.total,
        notes: ex.notes,
        shareToken: crypto.randomBytes(16).toString('hex'),
        quotationId: ex.id,
        createdById: req.user.id,
        items: { create: c.lines },
      },
    });
    await tx.quotation.update({ where: { id: ex.id }, data: { status: 'converted', invoiceId: created.id } });
    return created;
  });
  await logActivity(req.businessId, req.user.id, 'convert', 'quotation', ex.id);
  res.status(201).json({ invoiceId: inv.id });
}));

router.delete('/:id', requirePermission('sales', 'delete'), h(async (req, res) => {
  const ex = await prisma.quotation.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!ex) throw new HttpError(404, 'Quotation not found');
  await prisma.quotation.delete({ where: { id: ex.id } });
  await logActivity(req.businessId, req.user.id, 'delete', 'quotation', ex.id);
  res.json({ ok: true });
}));

export default router;
