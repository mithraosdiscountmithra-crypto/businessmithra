// Sales returns → credit notes. Stock comes back; money refunded, adjusted in the invoice, or kept as credit.
import { Router } from 'express';
import { z } from 'zod';
import { prisma, logActivity } from '../lib/prisma.js';
import { h } from '../lib/route.js';
import { computeDoc, dateOnly, istToday, num, r2 } from '../lib/money.js';
import { applyLines, reverseRef } from '../lib/stock.js';
import { HttpError, requireAuth, requirePermission } from '../middleware/auth.js';
import { defaultAccountId, MODES, recalcInvoice } from './invoices.js';

const router = Router();
router.use(requireAuth());

const include = { customer: { select: { id: true, name: true, phone: true } }, items: true };

router.get('/', requirePermission('sales', 'view'), h(async (req, res) => {
  const where = { businessId: req.businessId };
  if (req.query.invoiceId) where.invoiceId = String(req.query.invoiceId);
  const notes = await prisma.creditNote.findMany({ where, include, orderBy: { createdAt: 'desc' }, take: 300 });
  const invIds = [...new Set(notes.map((n) => n.invoiceId).filter(Boolean))];
  const invs = await prisma.invoice.findMany({ where: { id: { in: invIds } }, select: { id: true, number: true } });
  const num2 = Object.fromEntries(invs.map((i) => [i.id, i.number]));
  res.json({ creditNotes: notes.map((n) => ({ ...n, invoiceNumber: num2[n.invoiceId] || null })) });
}));

const schema = z.object({
  invoiceId: z.string().min(1),
  lines: z.array(z.object({ invoiceItemId: z.string().min(1), qty: z.coerce.number().positive() })).min(1, 'Choose at least one item to return'),
  settle: z.enum(['refund', 'adjust', 'none']).default('refund'),
  refundMode: z.enum(MODES).optional().nullable(),
  notes: z.string().trim().max(300).optional().nullable(),
});

router.post('/', requirePermission('sales', 'add'), h(async (req, res) => {
  const d = schema.parse(req.body);
  const inv = await prisma.invoice.findFirst({ where: { id: d.invoiceId, businessId: req.businessId }, include: { items: true } });
  if (!inv) throw new HttpError(404, 'Invoice not found');
  if (inv.status === 'cancelled') throw new HttpError(400, 'This invoice is cancelled');
  // Already returned quantities per invoice line (matched by name + rate).
  const prev = await prisma.creditNoteItem.findMany({ where: { creditNote: { invoiceId: inv.id } } });
  const lines = d.lines.map((l) => {
    const it = inv.items.find((x) => x.id === l.invoiceItemId);
    if (!it) throw new HttpError(400, 'Item not found in this invoice');
    const done = prev.filter((p) => p.name === it.name && num(p.rate) === num(it.rate)).reduce((a, p) => a + num(p.qty), 0);
    if (l.qty > num(it.qty) - done + 0.0001) throw new HttpError(400, `${it.name}: only ${num(it.qty) - done} can be returned`);
    return { itemId: it.itemId, variantId: it.variantId, name: it.name, hsn: it.hsn, unit: it.unit, qty: l.qty, rate: num(it.rate), taxRate: num(it.taxRate) };
  });
  // Same discount share as the original bill.
  const factor = num(inv.subtotal) > 0 ? num(inv.discount) / num(inv.subtotal) : 0;
  const gross = lines.reduce((a, l) => a + l.qty * l.rate, 0);
  const c = computeDoc({ items: lines, discount: r2(gross * factor), interState: inv.interState });
  if (d.settle === 'adjust' && c.total > r2(num(inv.total) - num(inv.amountPaid)) + 0.009) {
    throw new HttpError(400, 'Return value is more than the invoice balance. Choose "Refund" instead.');
  }

  const note = await prisma.$transaction(async (tx) => {
    const b = await tx.business.update({ where: { id: req.businessId }, data: { nextCreditNo: { increment: 1 } } });
    const cn = await tx.creditNote.create({
      data: {
        businessId: req.businessId, number: `CN-${b.nextCreditNo - 1}`, invoiceId: inv.id, customerId: inv.customerId, date: dateOnly(istToday()),
        subtotal: r2(c.subtotal - c.discount), taxTotal: c.taxTotal, cgst: c.cgst, sgst: c.sgst, igst: c.igst, roundOff: c.roundOff, total: c.total,
        settle: d.settle, refundMode: d.settle === 'refund' ? d.refundMode || 'cash' : null, notes: d.notes || null, createdById: req.user.id,
        items: { create: c.lines.map(({ sort, unit, ...l }) => l) },
      },
    });
    await applyLines(tx, { businessId: req.businessId, refType: 'credit_note', refId: cn.id, lines: c.lines, sign: 1, reason: 'return', userId: req.user.id });
    if (d.settle === 'refund' && c.total > 0) {
      const mode = d.refundMode || 'cash';
      await tx.expense.create({
        data: {
          businessId: req.businessId, date: dateOnly(istToday()), category: 'Customer Refund', amount: c.total, taxAmount: 0,
          accountId: await defaultAccountId(tx, req.businessId, mode), mode, notes: `${cn.number} for ${inv.number}`, refType: 'refund', refId: cn.id, createdById: req.user.id,
        },
      });
    }
    if (d.settle === 'adjust') await recalcInvoice(tx, inv.id);
    return cn;
  });
  await logActivity(req.businessId, req.user.id, 'credit_note', 'invoice', inv.id);
  res.status(201).json({ creditNote: await prisma.creditNote.findUnique({ where: { id: note.id }, include }) });
}));

router.delete('/:id', requirePermission('sales', 'delete'), h(async (req, res) => {
  const cn = await prisma.creditNote.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!cn) throw new HttpError(404, 'Credit note not found');
  await prisma.$transaction(async (tx) => {
    await reverseRef(tx, 'credit_note', cn.id);
    await tx.expense.deleteMany({ where: { refType: 'refund', refId: cn.id } });
    await tx.creditNote.delete({ where: { id: cn.id } });
    if (cn.invoiceId) await recalcInvoice(tx, cn.invoiceId);
  });
  res.json({ ok: true });
}));

export default router;
