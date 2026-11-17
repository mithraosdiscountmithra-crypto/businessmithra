import { Router } from 'express';
import { z } from 'zod';
import { prisma, logActivity } from '../lib/prisma.js';
import { h } from '../lib/route.js';
import { REAL_EXP, extraTotals } from '../lib/reports.js';
import { addDays, dateOnly, num, parseRange, r2 } from '../lib/money.js';
import { HttpError, requireAuth, requirePermission } from '../middleware/auth.js';
import { defaultAccountId, MODES } from './invoices.js';

const router = Router();
router.use(requireAuth());

export const EXPENSE_CATEGORIES = [
  'Rent', 'Salaries & Wages', 'Electricity', 'Internet & Phone', 'Purchase of Goods', 'Raw Material',
  'Transport & Fuel', 'Marketing & Ads', 'Repairs & Maintenance', 'Office Supplies', 'Bank Charges',
  'Professional Fees', 'Taxes & Licences', 'Food & Refreshments', 'Other',
];

const s = (max) => z.string().trim().max(max).optional().nullable().or(z.literal('')).transform((v) => v || null);

const accountSchema = z.object({
  name: z.string().trim().min(1, 'Enter account name').max(60),
  type: z.enum(['cash', 'bank', 'upi', 'other']),
  openingBalance: z.coerce.number().default(0),
  active: z.boolean().default(true),
});

const expenseSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Select a date'),
  category: z.string().trim().min(1, 'Select a category').max(60),
  amount: z.coerce.number().positive('Amount must be more than 0'),
  taxAmount: z.coerce.number().min(0).default(0),
  vendorName: s(120),
  vendorGstin: z.string().trim().toUpperCase().regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/, 'Enter a valid 15-character GSTIN').optional().nullable().or(z.literal('')).transform((v) => v || null),
  billNo: s(60),
  accountId: s(40),
  mode: z.enum(MODES).default('cash'),
  notes: s(500),
}).refine((d) => d.taxAmount <= d.amount, { message: 'GST cannot be more than the total amount', path: ['taxAmount'] });

// ── Accounts (Cash, Bank, UPI…) with live balances ──
async function balances(businessId, upto) {
  const dateFilter = upto ? { lt: upto } : undefined;
  const [accounts, ins, outs] = await Promise.all([
    prisma.account.findMany({ where: { businessId }, orderBy: { createdAt: 'asc' } }),
    prisma.payment.groupBy({ by: ['accountId'], where: { businessId, ...(dateFilter && { date: dateFilter }) }, _sum: { amount: true } }),
    prisma.expense.groupBy({ by: ['accountId'], where: { businessId, ...(dateFilter && { date: dateFilter }) }, _sum: { amount: true } }),
  ]);
  const inMap = Object.fromEntries(ins.map((x) => [x.accountId, num(x._sum.amount)]));
  const outMap = Object.fromEntries(outs.map((x) => [x.accountId, num(x._sum.amount)]));
  return accounts.map((a) => ({
    ...a,
    moneyIn: r2(inMap[a.id] || 0),
    moneyOut: r2(outMap[a.id] || 0),
    balance: r2(num(a.openingBalance) + (inMap[a.id] || 0) - (outMap[a.id] || 0)),
  }));
}

router.get('/accounts', requirePermission('accounts', 'view'), h(async (req, res) => {
  await prisma.$transaction((tx) => defaultAccountId(tx, req.businessId, 'cash'));
  res.json({ accounts: await balances(req.businessId) });
}));

router.post('/accounts', requirePermission('accounts', 'add'), h(async (req, res) => {
  const d = accountSchema.parse(req.body);
  const dup = await prisma.account.findFirst({ where: { businessId: req.businessId, name: d.name } });
  if (dup) throw new HttpError(409, 'An account with this name already exists');
  const a = await prisma.account.create({ data: { ...d, businessId: req.businessId } });
  await logActivity(req.businessId, req.user.id, 'create', 'account', a.id);
  res.status(201).json({ account: a });
}));

router.put('/accounts/:id', requirePermission('accounts', 'edit'), h(async (req, res) => {
  const d = accountSchema.parse(req.body);
  const ex = await prisma.account.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!ex) throw new HttpError(404, 'Account not found');
  const dup = await prisma.account.findFirst({ where: { businessId: req.businessId, name: d.name, NOT: { id: ex.id } } });
  if (dup) throw new HttpError(409, 'An account with this name already exists');
  const a = await prisma.account.update({ where: { id: ex.id }, data: d });
  res.json({ account: a });
}));

// ── Expenses ──
router.get('/expenses', requirePermission('accounts', 'view'), h(async (req, res) => {
  const r = parseRange(req.query);
  const where = { businessId: req.businessId, date: { gte: r.gte, lt: r.lt } };
  if (req.query.category) where.category = String(req.query.category);
  const q = String(req.query.q || '').trim();
  if (q) where.OR = [{ vendorName: { contains: q, mode: 'insensitive' } }, { notes: { contains: q, mode: 'insensitive' } }, { billNo: { contains: q, mode: 'insensitive' } }];
  const [expenses, used] = await Promise.all([
    prisma.expense.findMany({ where, include: { account: { select: { id: true, name: true } } }, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], take: 1000 }),
    prisma.expense.findMany({ where: { businessId: req.businessId }, distinct: ['category'], select: { category: true } }),
  ]);
  const categories = [...new Set([...EXPENSE_CATEGORIES, ...used.map((u) => u.category)])];
  res.json({ range: { from: r.from, to: r.to }, expenses, categories, total: r2(expenses.reduce((a, e) => a + num(e.amount), 0)) });
}));

async function checkAccount(req, id) {
  if (id && !(await prisma.account.findFirst({ where: { id, businessId: req.businessId } }))) throw new HttpError(400, 'Account not found');
}

router.post('/expenses', requirePermission('accounts', 'add'), h(async (req, res) => {
  const d = expenseSchema.parse(req.body);
  await checkAccount(req, d.accountId);
  const e = await prisma.$transaction(async (tx) => {
    const accountId = d.accountId || (await defaultAccountId(tx, req.businessId, d.mode));
    return tx.expense.create({ data: { ...d, accountId, date: dateOnly(d.date), businessId: req.businessId, createdById: req.user.id } });
  });
  await logActivity(req.businessId, req.user.id, 'create', 'expense', e.id);
  res.status(201).json({ expense: e });
}));

router.put('/expenses/:id', requirePermission('accounts', 'edit'), h(async (req, res) => {
  const ex = await prisma.expense.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!ex) throw new HttpError(404, 'Expense not found');
  if (ex.refType) throw new HttpError(400, 'Ee entry auto ga vachindi (purchase / return / salary). Akkade marchandi.');
  const d = expenseSchema.parse(req.body);
  await checkAccount(req, d.accountId);
  const e = await prisma.expense.update({ where: { id: ex.id }, data: { ...d, accountId: d.accountId || ex.accountId, date: dateOnly(d.date) } });
  await logActivity(req.businessId, req.user.id, 'update', 'expense', e.id);
  res.json({ expense: e });
}));

router.delete('/expenses/:id', requirePermission('accounts', 'delete'), h(async (req, res) => {
  const ex = await prisma.expense.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!ex) throw new HttpError(404, 'Expense not found');
  if (ex.refType) throw new HttpError(400, 'Ee entry auto ga vachindi (purchase / return / salary). Akkade marchandi.');
  await prisma.expense.delete({ where: { id: ex.id } });
  await logActivity(req.businessId, req.user.id, 'delete', 'expense', ex.id);
  res.json({ ok: true });
}));

// ── Day book: every rupee in and out, with running balance ──
router.get('/daybook', requirePermission('accounts', 'view'), h(async (req, res) => {
  const r = parseRange(req.query);
  const accountId = req.query.accountId ? String(req.query.accountId) : null;
  const acc = accountId ? { accountId } : {};
  const [payments, expenses, before] = await Promise.all([
    prisma.payment.findMany({
      where: { businessId: req.businessId, date: { gte: r.gte, lt: r.lt }, ...acc },
      include: { customer: { select: { name: true } }, invoice: { select: { id: true, number: true } }, account: { select: { name: true } } },
    }),
    prisma.expense.findMany({
      where: { businessId: req.businessId, date: { gte: r.gte, lt: r.lt }, ...acc },
      include: { account: { select: { name: true } } },
    }),
    balances(req.businessId, r.gte),
  ]);
  const opening = r2(before.filter((a) => !accountId || a.id === accountId).reduce((s2, a) => s2 + a.balance, 0));
  const rows = [
    ...payments.map((p) => ({
      id: p.id, kind: 'in', date: p.date, createdAt: p.createdAt, amount: num(p.amount), mode: p.mode, account: p.account?.name || '—',
      title: p.refType === 'supplier_refund' ? (p.notes || 'Refund from supplier') : `Payment from ${p.customer?.name || 'customer'}`, ref: p.invoice?.number || p.reference || '', invoiceId: p.invoice?.id || null,
    })),
    ...expenses.map((e) => ({
      id: e.id, kind: 'out', date: e.date, createdAt: e.createdAt, amount: num(e.amount), mode: e.mode, account: e.account?.name || '—',
      title: `${e.category}${e.vendorName ? ` · ${e.vendorName}` : ''}`, ref: e.billNo || '', invoiceId: null,
    })),
  ].sort((a, b) => a.date - b.date || a.createdAt - b.createdAt);
  let bal = opening;
  for (const row of rows) {
    bal = r2(bal + (row.kind === 'in' ? row.amount : -row.amount));
    row.balance = bal;
  }
  const totalIn = r2(rows.filter((x) => x.kind === 'in').reduce((a, x) => a + x.amount, 0));
  const totalOut = r2(rows.filter((x) => x.kind === 'out').reduce((a, x) => a + x.amount, 0));
  res.json({ range: { from: r.from, to: r.to }, opening, closing: bal, totalIn, totalOut, rows: rows.reverse() });
}));

// ── Reports: P&L, GST, cash flow, expense breakup ──
router.get('/reports', requirePermission('accounts', 'view'), h(async (req, res) => {
  const r = parseRange(req.query);
  const b = req.businessId;
  const live = { businessId: b, status: { not: 'cancelled' }, date: { gte: r.gte, lt: r.lt } };
  const [inv, invItems, exp, expByCat, payIn, payByMode, expByMode, monthlyInv, monthlyExp] = await Promise.all([
    prisma.invoice.aggregate({ where: live, _sum: { subtotal: true, discount: true, taxTotal: true, cgst: true, sgst: true, igst: true, total: true }, _count: true }),
    prisma.invoiceItem.findMany({
      where: { invoice: live },
      select: { amount: true, taxRate: true, taxAmount: true, invoice: { select: { subtotal: true, discount: true, interState: true } } },
    }),
    prisma.expense.aggregate({ where: { businessId: b, date: { gte: r.gte, lt: r.lt }, ...REAL_EXP }, _sum: { amount: true, taxAmount: true }, _count: true }),
    prisma.expense.groupBy({ by: ['category'], where: { businessId: b, date: { gte: r.gte, lt: r.lt }, ...REAL_EXP }, _sum: { amount: true, taxAmount: true }, orderBy: { _sum: { amount: 'desc' } } }),
    prisma.payment.aggregate({ where: { businessId: b, date: { gte: r.gte, lt: r.lt } }, _sum: { amount: true } }),
    prisma.payment.groupBy({ by: ['mode'], where: { businessId: b, date: { gte: r.gte, lt: r.lt } }, _sum: { amount: true } }),
    prisma.expense.groupBy({ by: ['mode'], where: { businessId: b, date: { gte: r.gte, lt: r.lt } }, _sum: { amount: true } }),
    prisma.$queryRaw`SELECT to_char("date", 'YYYY-MM') AS month, SUM("subtotal" - "discount")::float AS income
      FROM "Invoice" WHERE "businessId" = ${b} AND "status" <> 'cancelled' AND "date" >= ${r.gte} AND "date" < ${r.lt}
      GROUP BY 1 ORDER BY 1`,
    prisma.$queryRaw`SELECT to_char("date", 'YYYY-MM') AS month, SUM("amount" - "taxAmount")::float AS expense
      FROM "Expense" WHERE "businessId" = ${b} AND "date" >= ${r.gte} AND "date" < ${r.lt}
        AND ("refType" IS NULL OR "refType" NOT IN ('supplier_payment', 'refund'))
      GROUP BY 1 ORDER BY 1`,
  ]);
  const ex = await extraTotals(b, r);

  const grossIncome = r2(num(inv._sum.subtotal) - num(inv._sum.discount));
  const income = r2(grossIncome - ex.returnsTaxable);
  const otherExpenses = r2(num(exp._sum.amount) - num(exp._sum.taxAmount));
  const expenses = r2(otherExpenses + ex.purchasesTaxable);

  // GST output by rate (taxable value after discount share).
  const rates = {};
  for (const it of invItems) {
    const sub = num(it.invoice.subtotal);
    const factor = sub > 0 ? (sub - num(it.invoice.discount)) / sub : 1;
    const key = String(num(it.taxRate));
    rates[key] ||= { rate: num(it.taxRate), taxable: 0, cgst: 0, sgst: 0, igst: 0 };
    const tax = num(it.taxAmount);
    rates[key].taxable += num(it.amount) * factor;
    if (it.invoice.interState) rates[key].igst += tax;
    else {
      rates[key].cgst += tax / 2;
      rates[key].sgst += tax / 2;
    }
  }
  const outputByRate = Object.values(rates)
    .map((x) => ({ rate: x.rate, taxable: r2(x.taxable), cgst: r2(x.cgst), sgst: r2(x.sgst), igst: r2(x.igst), total: r2(x.cgst + x.sgst + x.igst) }))
    .sort((a, b2) => a.rate - b2.rate);
  const outputGst = r2(num(inv._sum.taxTotal) - ex.returnsTax);
  const inputGst = r2(num(exp._sum.taxAmount) + ex.purchasesTax);

  const months = {};
  for (const m of monthlyInv) months[m.month] = { month: m.month, income: r2(m.income || 0), expense: 0 };
  for (const m of monthlyExp) {
    months[m.month] ||= { month: m.month, income: 0, expense: 0 };
    months[m.month].expense = r2(m.expense || 0);
  }
  for (const m of ex.monthly) {
    months[m.month] ||= { month: m.month, income: 0, expense: 0 };
    months[m.month].income = r2(months[m.month].income - (m.returns || 0));
    months[m.month].expense = r2(months[m.month].expense + (m.purchases || 0));
  }

  res.json({
    range: { from: r.from, to: r.to },
    pnl: {
      income, expenses, profit: r2(income - expenses),
      grossSales: grossIncome, salesReturns: ex.returnsTaxable, purchases: ex.purchasesTaxable, otherExpenses,
      margin: income > 0 ? Math.round(((income - expenses) / income) * 100) : 0,
      invoices: inv._count, expenseEntries: exp._count,
      byCategory: [
        ...(ex.purchasesTaxable ? [{ category: 'Purchases (stock)', amount: ex.purchasesTaxable }] : []),
        ...expByCat.map((c) => ({ category: c.category, amount: r2(num(c._sum.amount) - num(c._sum.taxAmount)) })),
      ],
      monthly: Object.values(months).sort((a, b2) => a.month.localeCompare(b2.month)).map((m) => ({ ...m, profit: r2(m.income - m.expense) })),
    },
    gst: {
      outputGst, inputGst, netPayable: r2(outputGst - inputGst),
      cgst: r2(num(inv._sum.cgst)), sgst: r2(num(inv._sum.sgst)), igst: r2(num(inv._sum.igst)),
      outputByRate, returnsGst: ex.returnsTax, purchaseGst: ex.purchasesTax,
    },
    cashflow: {
      moneyIn: r2(num(payIn._sum.amount)),
      moneyOut: r2(num(exp._sum.amount)),
      net: r2(num(payIn._sum.amount) - num(exp._sum.amount)),
      inByMode: payByMode.map((x) => ({ mode: x.mode, amount: r2(num(x._sum.amount)) })),
      outByMode: expByMode.map((x) => ({ mode: x.mode, amount: r2(num(x._sum.amount)) })),
    },
    accounts: await balances(b, dateOnly(addDays(r.to, 1))),
  });
}));

export default router;
