import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { h } from '../lib/route.js';
import { addDays, dateOnly, istToday, monthStart, num, r2 } from '../lib/money.js';
import { hasPermission, requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth());

const sumTotal = async (where) => r2(num((await prisma.invoice.aggregate({ where, _sum: { total: true } }))._sum.total));

router.get('/', h(async (req, res) => {
  const b = req.businessId;
  const today = istToday();
  const out = { sales: null, accounts: null };

  if (hasPermission(req.user, 'sales', 'view')) {
    const live = { businessId: b, status: { not: 'cancelled' } };
    const yesterday = addDays(today, -1);
    const thisMonth = monthStart(today);
    const lastMonth = monthStart(addDays(thisMonth, -1));
    const sameDayLastMonth = addDays(lastMonth, Number(today.slice(8, 10)));
    const weekAgo = new Date(Date.now() - 7 * 86400000);
    const istStart = (d) => new Date(dateOnly(d).getTime() - 330 * 60000);

    const [todaySales, yesterdaySales, monthSales, lastMonthToDate, dues, dueCount, newLeads, hotLeads, series, followUps, recent] = await Promise.all([
      sumTotal({ ...live, date: dateOnly(today) }),
      sumTotal({ ...live, date: dateOnly(yesterday) }),
      sumTotal({ ...live, date: { gte: dateOnly(thisMonth), lt: dateOnly(addDays(today, 1)) } }),
      sumTotal({ ...live, date: { gte: dateOnly(lastMonth), lt: dateOnly(sameDayLastMonth) } }),
      prisma.invoice.aggregate({ where: { businessId: b, status: { in: ['unpaid', 'partial'] } }, _sum: { total: true, amountPaid: true } }),
      prisma.invoice.count({ where: { businessId: b, status: { in: ['unpaid', 'partial'] } } }),
      prisma.lead.count({ where: { businessId: b, createdAt: { gte: weekAgo } } }),
      prisma.lead.count({ where: { businessId: b, priority: 'hot', stage: { in: ['new', 'contacted', 'quotation'] } } }),
      prisma.invoice.groupBy({
        by: ['date'],
        where: { ...live, date: { gte: dateOnly(addDays(today, -6)), lt: dateOnly(addDays(today, 1)) } },
        _sum: { total: true },
      }),
      prisma.followUp.findMany({
        where: { businessId: b, done: false, dueAt: { lt: istStart(addDays(today, 1)) } },
        include: { customer: { select: { id: true, name: true, phone: true } }, lead: { select: { id: true, name: true, phone: true } } },
        orderBy: { dueAt: 'asc' },
        take: 8,
      }),
      prisma.invoice.findMany({
        where: { businessId: b },
        include: { customer: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 6,
      }),
    ]);
    const byDay = Object.fromEntries(series.map((s) => [s.date.toISOString().slice(0, 10), num(s._sum.total)]));
    out.sales = {
      todaySales, yesterdaySales, monthSales, lastMonthToDate,
      pendingAmount: r2(num(dues._sum.total) - num(dues._sum.amountPaid)), pendingCount: dueCount,
      newLeads, hotLeads,
      last7: Array.from({ length: 7 }, (_, i) => {
        const d = addDays(today, i - 6);
        return { date: d, total: byDay[d] || 0 };
      }),
      followUps,
      recent: recent.map((i) => ({ id: i.id, number: i.number, customer: i.customer.name, date: i.date, total: i.total, status: i.status, dueDate: i.dueDate })),
    };
  }

  if (hasPermission(req.user, 'accounts', 'view')) {
    const range = { gte: dateOnly(monthStart(today)), lt: dateOnly(addDays(today, 1)) };
    const [exp, inc] = await Promise.all([
      prisma.expense.aggregate({ where: { businessId: b, date: range }, _sum: { amount: true, taxAmount: true } }),
      prisma.invoice.aggregate({ where: { businessId: b, status: { not: 'cancelled' }, date: range }, _sum: { subtotal: true, discount: true } }),
    ]);
    const income = r2(num(inc._sum.subtotal) - num(inc._sum.discount));
    const expenses = r2(num(exp._sum.amount) - num(exp._sum.taxAmount));
    out.accounts = { monthIncome: income, monthExpenses: expenses, monthProfit: r2(income - expenses) };
  }

  res.json(out);
}));

export default router;
