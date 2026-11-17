import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { prisma, logActivity } from '../lib/prisma.js';
import { h } from '../lib/route.js';
import { computeDoc, dateOnly, docSchema, GST_RATES, invoiceStatus, istToday, num, parseRange, r2 } from '../lib/money.js';
import { HttpError, requireAuth, requirePermission } from '../middleware/auth.js';
import { autoSendEnabled, sendBillOnWhatsApp } from '../lib/whatsappBill.js';
import { billFileName } from '../lib/billPdf.js';

const router = Router();
router.use(requireAuth());

const include = {
  customer: true,
  items: { orderBy: { sort: 'asc' } },
  payments: { orderBy: { date: 'asc' }, include: { account: { select: { id: true, name: true } } } },
};

export const MODES = ['cash', 'upi', 'card', 'bank', 'cheque'];

const paymentSchema = z.object({
  amount: z.coerce.number().positive('Amount must be more than 0'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Select a date'),
  mode: z.enum(MODES).default('cash'),
  accountId: z.string().optional().nullable().or(z.literal('')).transform((v) => v || null),
  reference: z.string().trim().max(100).optional().nullable().or(z.literal('')).transform((v) => v || null),
  notes: z.string().trim().max(300).optional().nullable().or(z.literal('')).transform((v) => v || null),
});

async function assertCustomer(req, id) {
  const c = await prisma.customer.findFirst({ where: { id, businessId: req.businessId } });
  if (!c) throw new HttpError(400, 'Customer not found');
}

// Picks the default account for a payment mode (cash → Cash, others → first bank/UPI) and makes defaults if missing.
export async function defaultAccountId(tx, businessId, mode) {
  let accounts = await tx.account.findMany({ where: { businessId, active: true }, orderBy: { createdAt: 'asc' } });
  if (!accounts.length) {
    await tx.account.createMany({
      data: [
        { businessId, name: 'Cash', type: 'cash' },
        { businessId, name: 'Bank / UPI', type: 'bank' },
      ],
      skipDuplicates: true,
    });
    accounts = await tx.account.findMany({ where: { businessId, active: true }, orderBy: { createdAt: 'asc' } });
  }
  const want = mode === 'cash' ? ['cash'] : mode === 'upi' ? ['upi', 'bank'] : ['bank', 'upi'];
  return (accounts.find((a) => want.includes(a.type)) || accounts[0])?.id || null;
}

export async function recalcInvoice(tx, invoiceId) {
  const inv = await tx.invoice.findUnique({ where: { id: invoiceId } });
  if (!inv) return;
  const agg = await tx.payment.aggregate({ where: { invoiceId }, _sum: { amount: true } });
  const paid = r2(num(agg._sum.amount));
  await tx.invoice.update({
    where: { id: invoiceId },
    data: { amountPaid: paid, status: inv.status === 'cancelled' ? 'cancelled' : invoiceStatus(inv.total, paid) },
  });
}

router.get('/', requirePermission('sales', 'view'), h(async (req, res) => {
  const where = { businessId: req.businessId };
  const st = String(req.query.status || '');
  const today = dateOnly(istToday());
  if (st === 'overdue') Object.assign(where, { status: { in: ['unpaid', 'partial'] }, dueDate: { lt: today } });
  else if (st === 'due') where.status = { in: ['unpaid', 'partial'] };
  else if (st) where.status = st;
  if (req.query.from || req.query.to) {
    const r = parseRange(req.query);
    where.date = { gte: r.gte, lt: r.lt };
  }
  if (req.query.customerId) where.customerId = String(req.query.customerId);
  const q = String(req.query.q || '').trim();
  if (q) where.OR = [{ number: { contains: q, mode: 'insensitive' } }, { customer: { name: { contains: q, mode: 'insensitive' } } }];
  const invoices = await prisma.invoice.findMany({
    where,
    include: { customer: { select: { id: true, name: true, phone: true } } },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    take: Math.min(Number(req.query.limit) || 300, 1000),
  });
  res.json({ invoices });
}));

// ⚡ Quick bill: name + amount lines, optional GST % and discount %, sent on WhatsApp.
const quickSchema = z.object({
  phone: z.string().trim().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit WhatsApp number'),
  customerName: z.string().trim().max(80).optional().nullable().or(z.literal('')).transform((v) => v || null),
  lines: z.array(z.object({
    name: z.string().trim().min(1, 'Enter service / item name').max(200),
    qty: z.coerce.number().positive('Quantity must be more than 0').default(1),
    amount: z.coerce.number().positive('Enter amount'),
  })).min(1, 'Add at least one service / item').max(50),
  gstRate: z.coerce.number().refine((v) => GST_RATES.includes(v), 'Choose a valid GST %').default(0),
  discountPct: z.coerce.number().min(0).max(100, 'Discount cannot be more than 100%').default(0),
  paidMode: z.enum([...MODES, '']).optional().nullable(),
});

router.post('/quick', requirePermission('sales', 'add'), h(async (req, res) => {
  const d = quickSchema.parse(req.body);
  let customer = await prisma.customer.findFirst({ where: { businessId: req.businessId, phone: d.phone } });
  if (!customer) {
    customer = await prisma.customer.create({ data: { businessId: req.businessId, name: d.customerName || `Customer ${d.phone.slice(-4)}`, phone: d.phone } });
  } else if (d.customerName && customer.name.startsWith('Customer ')) {
    customer = await prisma.customer.update({ where: { id: customer.id }, data: { name: d.customerName } });
  }
  const items = d.lines.map((l) => ({ name: l.name, qty: l.qty, rate: r2(l.amount), taxRate: d.gstRate }));
  const gross = items.reduce((a, l) => a + l.qty * l.rate, 0);
  const c = computeDoc({ items, discount: r2((gross * d.discountPct) / 100), interState: false });
  const today = istToday();
  const inv = await prisma.$transaction(async (tx) => {
    const b = await tx.business.update({ where: { id: req.businessId }, data: { nextInvoiceNo: { increment: 1 } } });
    const created = await tx.invoice.create({
      data: {
        businessId: req.businessId, number: `${b.invoicePrefix}${b.nextInvoiceNo - 1}`, customerId: customer.id, date: dateOnly(today),
        interState: false, subtotal: c.subtotal, discount: c.discount, taxTotal: c.taxTotal, cgst: c.cgst, sgst: c.sgst, igst: c.igst,
        roundOff: c.roundOff, total: c.total, notes: d.discountPct ? `Discount ${d.discountPct}%` : null,
        shareToken: crypto.randomBytes(16).toString('hex'), createdById: req.user.id, items: { create: c.lines },
      },
    });
    if (d.paidMode) {
      const accountId = await defaultAccountId(tx, req.businessId, d.paidMode);
      await tx.payment.create({ data: { businessId: req.businessId, invoiceId: created.id, customerId: customer.id, accountId, amount: c.total, date: dateOnly(today), mode: d.paidMode, createdById: req.user.id } });
      await recalcInvoice(tx, created.id);
    }
    return created;
  });
  await logActivity(req.businessId, req.user.id, 'quick_bill', 'invoice', inv.id);
  const full = await prisma.invoice.findUnique({ where: { id: inv.id }, include });
  res.status(201).json({ invoice: full });
}));

router.get('/wa-config', requirePermission('sales', 'view'), (_req, res) => res.json({ autoSend: autoSendEnabled() }));

// Sends this invoice's PDF directly to the customer's WhatsApp (AiSensy).
router.post('/:id/send-whatsapp', requirePermission('sales', 'add'), h(async (req, res) => {
  const inv = await prisma.invoice.findFirst({ where: { id: req.params.id, businessId: req.businessId }, include: { customer: true, business: true } });
  if (!inv) throw new HttpError(404, 'Invoice not found');
  const phone = String(req.body?.phone || inv.customer.phone || '').replace(/\D/g, '').slice(-10);
  if (!/^[6-9]\d{9}$/.test(phone)) throw new HttpError(400, 'Customer WhatsApp number is missing');
  const base = `${req.protocol}://${req.get('host')}`;
  const name = inv.customer.name.startsWith('Customer ') ? 'Customer' : inv.customer.name;
  await sendBillOnWhatsApp({
    phone, customerName: name, shopName: inv.business.name, number: inv.number, total: inv.total,
    pdfUrl: `${base}/api/public/invoice/${inv.shareToken}/pdf`, fileName: billFileName(inv, inv.business),
  });
  await logActivity(req.businessId, req.user.id, 'whatsapp_pdf', 'invoice', inv.id);
  res.json({ sent: true, to: phone });
}));

router.get('/:id', requirePermission('sales', 'view'), h(async (req, res) => {
  const inv = await prisma.invoice.findFirst({ where: { id: req.params.id, businessId: req.businessId }, include });
  if (!inv) throw new HttpError(404, 'Invoice not found');
  const business = await prisma.business.findUnique({ where: { id: req.businessId } });
  res.json({ invoice: inv, business });
}));

router.post('/', requirePermission('sales', 'add'), h(async (req, res) => {
  const d = docSchema.parse(req.body);
  await assertCustomer(req, d.customerId);
  const c = computeDoc(d);
  const paidNow = req.body.paidNow ? paymentSchema.parse({ ...req.body.paidNow, date: req.body.paidNow.date || d.date }) : null;
  if (paidNow && paidNow.amount > c.total + 0.009) throw new HttpError(400, 'Payment is more than the invoice total');

  const inv = await prisma.$transaction(async (tx) => {
    const b = await tx.business.update({ where: { id: req.businessId }, data: { nextInvoiceNo: { increment: 1 } } });
    const created = await tx.invoice.create({
      data: {
        businessId: req.businessId,
        number: `${b.invoicePrefix}${b.nextInvoiceNo - 1}`,
        customerId: d.customerId,
        date: dateOnly(d.date),
        dueDate: d.dueDate ? dateOnly(d.dueDate) : null,
        interState: d.interState,
        subtotal: c.subtotal, discount: c.discount, taxTotal: c.taxTotal, cgst: c.cgst, sgst: c.sgst, igst: c.igst,
        roundOff: c.roundOff, total: c.total,
        notes: d.notes || null,
        shareToken: crypto.randomBytes(16).toString('hex'),
        createdById: req.user.id,
        items: { create: c.lines },
      },
    });
    if (paidNow) {
      const accountId = paidNow.accountId || (await defaultAccountId(tx, req.businessId, paidNow.mode));
      await tx.payment.create({
        data: {
          ...paidNow, accountId, date: dateOnly(paidNow.date), businessId: req.businessId,
          invoiceId: created.id, customerId: d.customerId, createdById: req.user.id,
        },
      });
      await recalcInvoice(tx, created.id);
    }
    return created;
  });
  await logActivity(req.businessId, req.user.id, 'create', 'invoice', inv.id);
  const full = await prisma.invoice.findUnique({ where: { id: inv.id }, include });
  res.status(201).json({ invoice: full });
}));

router.put('/:id', requirePermission('sales', 'edit'), h(async (req, res) => {
  const ex = await prisma.invoice.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!ex) throw new HttpError(404, 'Invoice not found');
  if (ex.status === 'cancelled') throw new HttpError(400, 'Cancelled invoices cannot be edited');
  const d = docSchema.parse(req.body);
  await assertCustomer(req, d.customerId);
  const c = computeDoc(d);
  if (num(ex.amountPaid) > c.total + 0.009) throw new HttpError(400, 'New total is less than the amount already paid. Remove a payment first.');
  await prisma.$transaction(async (tx) => {
    await tx.invoiceItem.deleteMany({ where: { invoiceId: ex.id } });
    await tx.invoice.update({
      where: { id: ex.id },
      data: {
        customerId: d.customerId, date: dateOnly(d.date), dueDate: d.dueDate ? dateOnly(d.dueDate) : null,
        interState: d.interState, subtotal: c.subtotal, discount: c.discount, taxTotal: c.taxTotal,
        cgst: c.cgst, sgst: c.sgst, igst: c.igst, roundOff: c.roundOff, total: c.total,
        notes: d.notes || null, items: { create: c.lines },
      },
    });
    if (ex.customerId !== d.customerId) await tx.payment.updateMany({ where: { invoiceId: ex.id }, data: { customerId: d.customerId } });
    await recalcInvoice(tx, ex.id);
  });
  await logActivity(req.businessId, req.user.id, 'update', 'invoice', ex.id);
  const full = await prisma.invoice.findUnique({ where: { id: ex.id }, include });
  res.json({ invoice: full });
}));

router.post('/:id/cancel', requirePermission('sales', 'delete'), h(async (req, res) => {
  const ex = await prisma.invoice.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!ex) throw new HttpError(404, 'Invoice not found');
  if (num(ex.amountPaid) > 0) throw new HttpError(400, 'Remove the payments on this invoice before cancelling it');
  const inv = await prisma.invoice.update({ where: { id: ex.id }, data: { status: 'cancelled' }, include });
  await logActivity(req.businessId, req.user.id, 'cancel', 'invoice', ex.id);
  res.json({ invoice: inv });
}));

router.post('/:id/payments', requirePermission('sales', 'add'), h(async (req, res) => {
  const ex = await prisma.invoice.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!ex) throw new HttpError(404, 'Invoice not found');
  if (ex.status === 'cancelled') throw new HttpError(400, 'This invoice is cancelled');
  const d = paymentSchema.parse(req.body);
  const due = r2(num(ex.total) - num(ex.amountPaid));
  if (d.amount > due + 0.009) throw new HttpError(400, `Amount is more than the balance due (₹${due})`);
  if (d.accountId && !(await prisma.account.findFirst({ where: { id: d.accountId, businessId: req.businessId } }))) throw new HttpError(400, 'Account not found');
  await prisma.$transaction(async (tx) => {
    const accountId = d.accountId || (await defaultAccountId(tx, req.businessId, d.mode));
    await tx.payment.create({
      data: { ...d, accountId, date: dateOnly(d.date), businessId: req.businessId, invoiceId: ex.id, customerId: ex.customerId, createdById: req.user.id },
    });
    await recalcInvoice(tx, ex.id);
  });
  await logActivity(req.businessId, req.user.id, 'payment', 'invoice', ex.id);
  const full = await prisma.invoice.findUnique({ where: { id: ex.id }, include });
  res.status(201).json({ invoice: full });
}));

router.delete('/:id/payments/:pid', requirePermission('sales', 'delete'), h(async (req, res) => {
  const p = await prisma.payment.findFirst({ where: { id: req.params.pid, invoiceId: req.params.id, businessId: req.businessId } });
  if (!p) throw new HttpError(404, 'Payment not found');
  await prisma.$transaction(async (tx) => {
    await tx.payment.delete({ where: { id: p.id } });
    await recalcInvoice(tx, req.params.id);
  });
  await logActivity(req.businessId, req.user.id, 'delete_payment', 'invoice', req.params.id);
  const full = await prisma.invoice.findUnique({ where: { id: req.params.id }, include });
  res.json({ invoice: full });
}));

export default router;
