import { Router } from 'express';
import { z } from 'zod';
import { prisma, logActivity } from '../lib/prisma.js';
import { h } from '../lib/route.js';
import { GST_RATES } from '../lib/money.js';
import { HttpError, requireAuth, requirePermission } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth());

const s = (max) => z.string().trim().max(max).optional().nullable().or(z.literal('')).transform((v) => v || null);

const schema = z.object({
  name: z.string().trim().min(1, 'Enter item name').max(200),
  type: z.enum(['product', 'service']).default('product'),
  sku: s(40),
  hsn: s(20),
  unit: z.string().trim().min(1).max(20).default('pcs'),
  price: z.coerce.number().min(0, 'Price cannot be negative'),
  taxRate: z.coerce.number().refine((v) => GST_RATES.includes(v), 'Choose a valid GST %'),
  active: z.boolean().default(true),
  mrp: z.coerce.number().min(0).optional().nullable().or(z.literal('')).transform((v) => (v === '' || v === null || v === undefined || v === 0 ? null : v)),
  description: s(1000),
  category: s(60),
  images: z.array(z.string().trim().url().refine((v) => v.startsWith('https://'), 'Image link must start with https://')).max(6).default([]),
  showInShop: z.boolean().default(true),
  inStock: z.boolean().default(true),
  variants: z.array(z.object({
    id: z.string().trim().min(1).max(24),
    name: z.string().trim().min(1, 'Enter each size/variant name').max(40),
    price: z.coerce.number().min(0, 'Price cannot be negative'),
    mrp: z.coerce.number().min(0).optional().nullable().transform((v) => (v ? v : null)),
    inStock: z.boolean().default(true),
  })).max(20).default([]),
}).transform((d) => {
  // With variants, the item's own price = cheapest variant (used in lists).
  if (d.variants.length) d.price = Math.min(...d.variants.map((v) => v.price));
  return d;
});

router.get('/', requirePermission('sales', 'view'), h(async (req, res) => {
  const where = { businessId: req.businessId };
  if (req.query.all !== '1') where.active = true;
  const q = String(req.query.q || '').trim();
  if (q) where.OR = [{ name: { contains: q, mode: 'insensitive' } }, { sku: { contains: q, mode: 'insensitive' } }];
  const items = await prisma.item.findMany({ where, orderBy: { name: 'asc' }, take: 1000 });
  res.json({ items });
}));

router.post('/', requirePermission('sales', 'add'), h(async (req, res) => {
  const d = schema.parse(req.body);
  const item = await prisma.item.create({ data: { ...d, businessId: req.businessId } });
  await logActivity(req.businessId, req.user.id, 'create', 'item', item.id);
  res.status(201).json({ item });
}));

router.put('/:id', requirePermission('sales', 'edit'), h(async (req, res) => {
  const d = schema.parse(req.body);
  const ex = await prisma.item.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!ex) throw new HttpError(404, 'Item not found');
  const item = await prisma.item.update({ where: { id: ex.id }, data: d });
  res.json({ item });
}));

// Items stay on old invoices, so "delete" just hides them.
router.delete('/:id', requirePermission('sales', 'delete'), h(async (req, res) => {
  const ex = await prisma.item.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!ex) throw new HttpError(404, 'Item not found');
  await prisma.item.update({ where: { id: ex.id }, data: { active: false } });
  res.json({ ok: true });
}));

export default router;
