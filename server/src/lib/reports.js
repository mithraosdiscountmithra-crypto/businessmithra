import { prisma } from './prisma.js';
import { num, r2 } from './money.js';

// Supplier payments and customer refunds are money movements, not new costs (the bill / credit note already counts).
export const REAL_EXP = { OR: [{ refType: null }, { refType: { notIn: ['supplier_payment', 'refund'] } }] };

// Purchases (bills − returns) and sales returns (credit notes) in a date range.
export async function extraTotals(b, r) {
  const d = { gte: r.gte, lt: r.lt };
  const [pb, pr, cn, monthly] = await Promise.all([
    prisma.purchaseBill.aggregate({ where: { businessId: b, kind: 'bill', date: d }, _sum: { total: true, taxTotal: true, roundOff: true } }),
    prisma.purchaseBill.aggregate({ where: { businessId: b, kind: 'return', date: d }, _sum: { total: true, taxTotal: true, roundOff: true } }),
    prisma.creditNote.aggregate({ where: { businessId: b, date: d }, _sum: { subtotal: true, taxTotal: true } }),
    prisma.$queryRaw`SELECT month, SUM(purchases)::float AS purchases, SUM(returns)::float AS returns FROM (
        SELECT to_char("date", 'YYYY-MM') AS month,
          CASE WHEN "kind" = 'bill' THEN "total" - "taxTotal" - "roundOff" ELSE -("total" - "taxTotal" - "roundOff") END AS purchases, 0 AS returns
        FROM "PurchaseBill" WHERE "businessId" = ${b} AND "date" >= ${r.gte} AND "date" < ${r.lt}
        UNION ALL
        SELECT to_char("date", 'YYYY-MM'), 0, "subtotal" FROM "CreditNote" WHERE "businessId" = ${b} AND "date" >= ${r.gte} AND "date" < ${r.lt}
      ) t GROUP BY month`,
  ]);
  const taxable = (a) => num(a._sum.total) - num(a._sum.taxTotal) - num(a._sum.roundOff);
  return {
    purchasesTaxable: r2(taxable(pb) - taxable(pr)),
    purchasesTax: r2(num(pb._sum.taxTotal) - num(pr._sum.taxTotal)),
    returnsTaxable: r2(num(cn._sum.subtotal)),
    returnsTax: r2(num(cn._sum.taxTotal)),
    monthly,
  };
}

