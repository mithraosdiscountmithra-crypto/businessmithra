import { Router } from 'express';
import { z } from 'zod';
import { prisma, logActivity } from '../lib/prisma.js';
import { h } from '../lib/route.js';
import { num, r2 } from '../lib/money.js';
import { HttpError, requireAuth, requirePermission } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth());

const s = (max) => z.string().trim().max(max).optional().nullable().or(z.literal('')).transform((v) => v || null);
const schema = z.object({
  name: z.string().trim().min(1, 'Enter supplier name').max(120),
  phone: z.string().trim().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number').optional().nullable().or(z.literal('')).transform((v) => v || null),
  gstin: z.string().trim().toUpperCase().regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/, 'Enter a valid 15-character GSTIN').optional().nullable().or(z.literal('')).transform((v) => v || null),
  address: s(300),
  notes: s(500),
});

router.get('/', requirePermission('operations', 'view'), h(async (req, res) => {
  const suppliers = await prisma.supplier.findMany({ where: { businessId: req.businessId }, orderBy: { name: 'asc' } });
  const sums = await prisma.purchaseBill.groupBy({ by: ['supplierId', 'kind'], where: { businessId: req.businessId }, _sum: { total: true, amountPaid: true } });
  res.json({
    suppliers: suppliers.map((x) => {
      const bills = sums.find((g) => g.supplierId === x.id && g.kind === 'bill');
      return { ...x, totalPurchases: num(bills?._sum.total), due: r2(num(bills?._sum.total) - num(bills?._sum.amountPaid)) };
    }),
  });
}));

router.post('/', requirePermission('operations', 'add'), h(async (req, res) => {
  const d = schema.parse(req.body);
  const sup = await prisma.supplier.create({ data: { ...d, businessId: req.businessId } });
  await logActivity(req.businessId, req.user.id, 'create', 'supplier', sup.id);
  res.status(201).json({ supplier: sup });
}));

router.put('/:id', requirePermission('operations', 'edit'), h(async (req, res) => {
  const d = schema.parse(req.body);
  const ex = await prisma.supplier.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!ex) throw new HttpError(404, 'Supplier not found');
  res.json({ supplier: await prisma.supplier.update({ where: { id: ex.id }, data: d }) });
}));

export default router;
