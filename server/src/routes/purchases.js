// Purchase bills (goods in) and purchase returns (goods back to supplier), with supplier payments.
import { Router } from 'express';
import { z } from 'zod';
import { prisma, logActivity } from '../lib/prisma.js';
import { h } from '../lib/route.js';
import { computeDoc, dateOnly, invoiceStatus, lineSchema, num, parseRange, r2 } from '../lib/money.js';
import { applyLines, perUnit, reverseRef } from '../lib/stock.js';
import { HttpError, requireAuth, requirePermission } from '../middleware/auth.js';
import { defaultAccountId, MODES } from './invoices.js';

const router = Router();
router.use(requireAuth());

const billSchema = z.object({
  kind: z.enum(['bill', 'return']).default('bill'),
  supplierId: z.string().min(1, 'Select a supplier'),
  billNo: z.string().trim().max(40).optional().nullable().or(z.literal('')).transform((v) => v || null),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Select a date'),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable().or(z.literal('')),
  interState: z.boolean().default(false),
  discount: z.coerce.number().min(0).default(0),
  notes: z.string().max(500).optional().nullable(),
  items: z.array(lineSchema).min(1, 'Add at least one item').max(200),
  paidNow: z.object({ amount: z.coerce.number().positive(), mode: z.enum(MODES), accountId: z.string().optional().nullable() }).optional().nullable(),
});

const include = { supplier: true, items: { orderBy: { sort: 'asc' } } };

async function recalcBill(tx, billId) {
  const bill = await tx.purchaseBill.findUnique({ where: { id: billId } });
  const [out, back] = await Promise.all([
    tx.expense.aggregate({ where: { refType: 'supplier_payment', refId: billId }, _sum: { amount: true } }),
    tx.payment.aggregate({ where: { refType: 'supplier_refund', refId: billId }, _sum: { amount: true } }),
  ]);
  const paid = r2(num(out._sum.amount) + num(back._sum.amount));
  await tx.purchaseBill.update({ where: { id: billId }, data: { amountPaid: paid, status: invoiceStatus(bill.total, paid) } });
}

// Paying a bill = money out (shows in Day Book as an expense line, not counted again in P&L).
// Refund on a return = money in.
async function addMoney(tx, req, bill, supplier, { amount, mode, accountId, date, reference }) {
  const acc = accountId || (await defaultAccountId(tx, req.businessId, mode));
  if (bill.kind === 'bill') {
    await tx.expense.create({
      data: {
        businessId: req.businessId, date: dateOnly(date), category: 'Supplier Payment', amount, taxAmount: 0, vendorName: supplier.name,
        billNo: bill.billNo, accountId: acc, mode, notes: reference || null, refType: 'supplier_payment', refId: bill.id, createdById: req.user.id,
      },
    });
  } else {
    await tx.payment.create({
      data: { businessId: req.businessId, accountId: acc, amount, date: dateOnly(date), mode, reference: reference || null, notes: `Refund from ${supplier.name}`, refType: 'supplier_refund', refId: bill.id, createdById: req.user.id },
    });
  }
  await recalcBill(tx, bill.id);
}

router.get('/', requirePermission('operations', 'view'), h(async (req, res) => {
  const where = { businessId: req.businessId, kind: req.query.kind === 'return' ? 'return' : 'bill' };
  if (req.query.from || req.query.to) {
    const r = parseRange(req.query);
    where.date = { gte: r.gte, lt: r.lt };
  }
  if (req.query.supplierId) where.supplierId = String(req.query.supplierId);
  if (req.query.status === 'due') where.status = { in: ['unpaid', 'partial'] };
  const bills = await prisma.purchaseBill.findMany({ where, include: { supplier: { select: { id: true, name: true } } }, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], take: 500 });
  res.json({ bills });
}));

router.get('/:id', requirePermission('operations', 'view'), h(async (req, res) => {
  const bill = await prisma.purchaseBill.findFirst({ where: { id: req.params.id, businessId: req.businessId }, include });
  if (!bill) throw new HttpError(404, 'Bill not found');
  const [paid, refunds] = await Promise.all([
    prisma.expense.findMany({ where: { refType: 'supplier_payment', refId: bill.id }, orderBy: { date: 'asc' } }),
    prisma.payment.findMany({ where: { refType: 'supplier_refund', refId: bill.id }, orderBy: { date: 'asc' } }),
  ]);
  res.json({ bill, payments: [...paid, ...refunds].map((p) => ({ id: p.id, date: p.date, amount: p.amount, mode: p.mode, reference: p.notes || p.reference })) });
}));

router.post('/', requirePermission('operations', 'add'), h(async (req, res) => {
  const d = billSchema.parse(req.body);
  const supplier = await prisma.supplier.findFirst({ where: { id: d.supplierId, businessId: req.businessId } });
  if (!supplier) throw new HttpError(400, 'Supplier not found');
  const c = computeDoc(d);
  if (d.paidNow && d.paidNow.amount > c.total + 0.009) throw new HttpError(400, 'Payment is more than the bill total');
  const bill = await prisma.$transaction(async (tx) => {
    const created = await tx.purchaseBill.create({
      data: {
        businessId: req.businessId, kind: d.kind, supplierId: supplier.id, billNo: d.billNo, date: dateOnly(d.date), dueDate: d.dueDate ? dateOnly(d.dueDate) : null,
        interState: d.interState, subtotal: c.subtotal, discount: c.discount, taxTotal: c.taxTotal, cgst: c.cgst, sgst: c.sgst, igst: c.igst,
        roundOff: c.roundOff, total: c.total, notes: d.notes || null, createdById: req.user.id, items: { create: c.lines },
      },
    });
    // Bill: stock in + remember the latest cost price. Return: stock out.
    await applyLines(tx, { businessId: req.businessId, refType: 'purchase', refId: created.id, lines: c.lines, sign: d.kind === 'bill' ? 1 : -1, reason: d.kind === 'bill' ? 'purchase' : 'purchase_return', userId: req.user.id });
    if (d.kind === 'bill') {
      for (const l of c.lines) {
        if (!l.itemId) continue;
        const it = await tx.item.findFirst({ where: { id: l.itemId, businessId: req.businessId } });
        if (!it) continue;
        // Shared stock: cost is kept per unit (e.g. per kg), so a "500 g" line at ₹20 = ₹40 per kg.
        const cost = it.sharedStock && l.variantId ? l.rate / perUnit(it, l.variantId) : l.rate;
        await tx.item.update({ where: { id: it.id }, data: { costPrice: Math.round(cost * 100) / 100 } });
      }
    }
    if (d.paidNow) await addMoney(tx, req, created, supplier, { ...d.paidNow, date: d.date });
    return created;
  });
  await logActivity(req.businessId, req.user.id, d.kind === 'bill' ? 'purchase' : 'purchase_return', 'purchase', bill.id);
  res.status(201).json({ bill: await prisma.purchaseBill.findUnique({ where: { id: bill.id }, include }) });
}));

const paySchema = z.object({
  amount: z.coerce.number().positive('Amount must be more than 0'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  mode: z.enum(MODES).default('cash'),
  accountId: z.string().optional().nullable().or(z.literal('')).transform((v) => v || null),
  reference: z.string().trim().max(100).optional().nullable(),
});

router.post('/:id/payments', requirePermission('operations', 'add'), h(async (req, res) => {
  const d = paySchema.parse(req.body);
  const bill = await prisma.purchaseBill.findFirst({ where: { id: req.params.id, businessId: req.businessId }, include: { supplier: true } });
  if (!bill) throw new HttpError(404, 'Bill not found');
  const due = r2(num(bill.total) - num(bill.amountPaid));
  if (d.amount > due + 0.009) throw new HttpError(400, `Amount is more than the balance (₹${due})`);
  await prisma.$transaction((tx) => addMoney(tx, req, bill, bill.supplier, d));
  res.status(201).json({ ok: true });
}));

// Delete a wrong bill: stock and payments are undone.
router.delete('/:id', requirePermission('operations', 'delete'), h(async (req, res) => {
  const bill = await prisma.purchaseBill.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!bill) throw new HttpError(404, 'Bill not found');
  await prisma.$transaction(async (tx) => {
    await reverseRef(tx, 'purchase', bill.id);
    await tx.expense.deleteMany({ where: { refType: 'supplier_payment', refId: bill.id } });
    await tx.payment.deleteMany({ where: { refType: 'supplier_refund', refId: bill.id } });
    await tx.purchaseBill.delete({ where: { id: bill.id } });
  });
  await logActivity(req.businessId, req.user.id, 'delete', 'purchase', bill.id);
  res.json({ ok: true });
}));

export default router;
