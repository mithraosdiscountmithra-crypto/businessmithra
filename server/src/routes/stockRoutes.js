// Operations: stock list, low stock, manual adjustments, history.
import { Router } from 'express';
import { z } from 'zod';
import { prisma, logActivity } from '../lib/prisma.js';
import { h } from '../lib/route.js';
import { num, r2 } from '../lib/money.js';
import { moveStock } from '../lib/stock.js';
import { HttpError, requireAuth, requirePermission } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth());

router.get('/', requirePermission('operations', 'view'), h(async (req, res) => {
  const items = await prisma.item.findMany({ where: { businessId: req.businessId, active: true, trackStock: true }, orderBy: { name: 'asc' } });
  const rows = items.flatMap((it) => {
    const variants = Array.isArray(it.variants) ? it.variants : [];
    const low = num(it.lowStockAt);
    if (variants.length && !it.sharedStock) {
      return variants.map((v) => ({ itemId: it.id, variantId: v.id, name: `${it.name} (${v.name})`, unit: it.unit, stock: num(v.stock), costPrice: num(it.costPrice), price: num(v.price), low, category: it.category }));
    }
    return [{ itemId: it.id, variantId: null, name: variants.length ? `${it.name} (${variants.map((v) => v.name).join(', ')})` : it.name, unit: it.unit, stock: num(it.stock), costPrice: num(it.costPrice), price: num(it.price), low, category: it.category }];
  }).map((r) => ({ ...r, value: r2(r.stock * r.costPrice), isLow: r.stock <= r.low }));
  res.json({
    rows,
    totals: { items: rows.length, value: r2(rows.reduce((a, r) => a + Math.max(0, r.value), 0)), low: rows.filter((r) => r.isLow).length },
  });
}));

const adjSchema = z.object({
  itemId: z.string().min(1),
  variantId: z.string().optional().nullable(),
  qty: z.coerce.number().refine((v) => v !== 0, 'Enter quantity (+ to add, − to remove)'),
  note: z.string().trim().max(200).optional().nullable(),
});

router.post('/adjust', requirePermission('operations', 'edit'), h(async (req, res) => {
  const d = adjSchema.parse(req.body);
  const it = await prisma.item.findFirst({ where: { id: d.itemId, businessId: req.businessId } });
  if (!it) throw new HttpError(404, 'Item not found');
  if (!it.trackStock) throw new HttpError(400, 'Turn on stock tracking for this item first');
  await prisma.$transaction((tx) => moveStock(tx, { businessId: req.businessId, itemId: it.id, variantId: d.variantId || null, qty: d.qty, reason: 'adjust', note: d.note || null, userId: req.user.id }));
  await logActivity(req.businessId, req.user.id, 'stock_adjust', 'item', it.id);
  res.json({ ok: true });
}));

router.get('/moves/:itemId', requirePermission('operations', 'view'), h(async (req, res) => {
  const moves = await prisma.stockMove.findMany({ where: { businessId: req.businessId, itemId: req.params.itemId }, orderBy: { createdAt: 'desc' }, take: 200 });
  res.json({ moves });
}));

export default router;
