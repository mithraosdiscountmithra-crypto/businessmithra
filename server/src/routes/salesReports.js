import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { h } from '../lib/route.js';
import { perUnit } from '../lib/stock.js';
import { dateOnly, istToday, num, parseRange, r2 } from '../lib/money.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth(), requirePermission('sales', 'view'));

router.get('/', h(async (req, res) => {
  const b = req.businessId;
  const r = parseRange(req.query);
  const live = { businessId: b, status: { not: 'cancelled' }, date: { gte: r.gte, lt: r.lt } };

  const [totals, collected, byDate, byCustomer, byStaff, openInvoices, leadStages, leadSources] = await Promise.all([
    prisma.invoice.aggregate({ where: live, _sum: { total: true, taxTotal: true, subtotal: true, discount: true }, _count: true }),
    prisma.payment.aggregate({ where: { businessId: b, date: { gte: r.gte, lt: r.lt } }, _sum: { amount: true } }),
    prisma.invoice.groupBy({ by: ['date'], where: live, _sum: { total: true }, orderBy: { date: 'asc' } }),
    prisma.invoice.groupBy({ by: ['customerId'], where: live, _sum: { total: true }, _count: true, orderBy: { _sum: { total: 'desc' } }, take: 10 }),
    prisma.invoice.groupBy({ by: ['createdById'], where: live, _sum: { total: true }, _count: true }),
    prisma.invoice.findMany({
      where: { businessId: b, status: { in: ['unpaid', 'partial'] } },
      select: { id: true, number: true, date: true, dueDate: true, total: true, amountPaid: true, customer: { select: { id: true, name: true, phone: true } } },
      orderBy: { date: 'asc' },
    }),
    prisma.lead.groupBy({ by: ['stage'], where: { businessId: b, createdAt: { gte: r.gte, lt: r.lt } }, _count: true, _sum: { value: true } }),
    prisma.lead.groupBy({ by: ['source', 'stage'], where: { businessId: b, createdAt: { gte: r.gte, lt: r.lt } }, _count: true }),
  ]);

  const returns = await prisma.creditNote.aggregate({ where: { businessId: b, date: { gte: r.gte, lt: r.lt } }, _sum: { total: true }, _count: true });
  const custIds = byCustomer.map((x) => x.customerId);
  const staffIds = byStaff.map((x) => x.createdById).filter(Boolean);
  const [custs, users] = await Promise.all([
    prisma.customer.findMany({ where: { id: { in: custIds } }, select: { id: true, name: true } }),
    prisma.user.findMany({ where: { id: { in: staffIds } }, select: { id: true, name: true } }),
  ]);
  const cName = Object.fromEntries(custs.map((c) => [c.id, c.name]));
  const uName = Object.fromEntries(users.map((u) => [u.id, u.name]));

  // Dues aging by days since invoice date (or due date when set).
  const today = dateOnly(istToday()).getTime();
  const buckets = [
    { label: '0–30 days', min: 0, max: 30, amount: 0, count: 0 },
    { label: '31–60 days', min: 31, max: 60, amount: 0, count: 0 },
    { label: '61–90 days', min: 61, max: 90, amount: 0, count: 0 },
    { label: '90+ days', min: 91, max: Infinity, amount: 0, count: 0 },
  ];
  const dues = openInvoices.map((i) => {
    const ref = (i.dueDate || i.date).getTime();
    const days = Math.max(0, Math.floor((today - ref) / 86400000));
    const due = r2(num(i.total) - num(i.amountPaid));
    const bk = buckets.find((x) => days >= x.min && days <= x.max);
    bk.amount = r2(bk.amount + due);
    bk.count += 1;
    return { id: i.id, number: i.number, date: i.date, customer: i.customer, due, days };
  }).sort((a, b) => b.due - a.due);

  const stages = ['new', 'contacted', 'quotation', 'won', 'lost'].map((s) => {
    const x = leadStages.find((l) => l.stage === s);
    return { stage: s, count: x?._count || 0, value: num(x?._sum.value) };
  });
  const totalLeads = stages.reduce((a, s) => a + s.count, 0);
  const won = stages.find((s) => s.stage === 'won').count;
  const sourceMap = {};
  for (const row of leadSources) {
    const key = row.source || 'Unknown';
    sourceMap[key] ||= { source: key, leads: 0, won: 0 };
    sourceMap[key].leads += row._count;
    if (row.stage === 'won') sourceMap[key].won += row._count;
  }

  res.json({
    range: { from: r.from, to: r.to },
    summary: {
      sales: r2(num(totals._sum.total)),
      returns: r2(num(returns._sum.total)),
      returnCount: returns._count,
      netSales: r2(num(totals._sum.total) - num(returns._sum.total)),
      invoices: totals._count,
      taxableValue: r2(num(totals._sum.subtotal) - num(totals._sum.discount)),
      gst: r2(num(totals._sum.taxTotal)),
      collected: r2(num(collected._sum.amount)),
      avgBill: totals._count ? r2(num(totals._sum.total) / totals._count) : 0,
      totalDue: r2(dues.reduce((a, d) => a + d.due, 0)),
    },
    daily: byDate.map((d) => ({ date: d.date.toISOString().slice(0, 10), total: num(d._sum.total) })),
    topCustomers: byCustomer.map((x) => ({ id: x.customerId, name: cName[x.customerId] || '—', total: num(x._sum.total), invoices: x._count })),
    staff: byStaff.map((x) => ({ name: uName[x.createdById] || 'Unknown', total: num(x._sum.total), invoices: x._count })).sort((a, b) => b.total - a.total),
    aging: buckets.map(({ label, amount, count }) => ({ label, amount, count })),
    dues: dues.slice(0, 50),
    leads: { stages, total: totalLeads, won, conversion: totalLeads ? Math.round((won / totalLeads) * 100) : 0, sources: Object.values(sourceMap).sort((a, b) => b.leads - a.leads) },
  });
}));

// Item-wise sales and profit (cost = item's cost price).
router.get('/items', h(async (req, res) => {
  const b = req.businessId;
  const r = parseRange(req.query);
  const live = { businessId: b, status: { not: 'cancelled' }, date: { gte: r.gte, lt: r.lt } };
  const [lines, returns, items] = await Promise.all([
    prisma.invoiceItem.findMany({ where: { invoice: live }, select: { itemId: true, variantId: true, name: true, qty: true, amount: true, invoice: { select: { subtotal: true, discount: true } } } }),
    prisma.creditNoteItem.findMany({ where: { creditNote: { businessId: b, date: { gte: r.gte, lt: r.lt } } }, select: { itemId: true, variantId: true, name: true, qty: true, amount: true } }),
    prisma.item.findMany({ where: { businessId: b }, select: { id: true, name: true, category: true, costPrice: true, sharedStock: true, variants: true } }),
  ]);
  const byId = Object.fromEntries(items.map((i) => [i.id, i]));
  const unitCost = (l) => {
    const it = byId[l.itemId];
    if (!it) return 0;
    return num(it.costPrice) * (it.sharedStock && l.variantId ? perUnit(it, l.variantId) : 1);
  };
  const rows = {};
  const row = (l) => {
    const key = l.itemId ? `${l.itemId}|${l.variantId || ''}` : `name:${l.name.toLowerCase()}`;
    return (rows[key] ||= { key, name: l.name, category: byId[l.itemId]?.category || '', qty: 0, sales: 0, cost: 0, hasCost: Boolean(num(byId[l.itemId]?.costPrice)) });
  };
  for (const l of lines) {
    const sub = num(l.invoice.subtotal);
    const f = sub > 0 ? (sub - num(l.invoice.discount)) / sub : 1;
    const x = row(l);
    x.qty += num(l.qty);
    x.sales += num(l.amount) * f;
    x.cost += num(l.qty) * unitCost(l);
  }
  for (const l of returns) {
    const x = row(l);
    x.qty -= num(l.qty);
    x.sales -= num(l.amount);
    x.cost -= num(l.qty) * unitCost(l);
  }
  const out = Object.values(rows).map((x) => ({ ...x, qty: Math.round(x.qty * 1000) / 1000, sales: r2(x.sales), cost: r2(x.cost), profit: x.hasCost ? r2(x.sales - x.cost) : null }))
    .sort((a, b2) => b2.sales - a.sales);
  const cats = {};
  for (const x of out) {
    const c = (cats[x.category || 'Other'] ||= { category: x.category || 'Other', sales: 0, profit: 0 });
    c.sales = r2(c.sales + x.sales);
    c.profit = r2(c.profit + (x.profit || 0));
  }
  res.json({
    range: { from: r.from, to: r.to },
    items: out,
    categories: Object.values(cats).sort((a, b2) => b2.sales - a.sales),
    totals: { sales: r2(out.reduce((a, x) => a + x.sales, 0)), profit: r2(out.reduce((a, x) => a + (x.profit || 0), 0)), missingCost: out.filter((x) => x.profit === null).length },
  });
}));

export default router;
