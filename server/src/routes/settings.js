import { Router } from 'express';
import { z } from 'zod';
import { prisma, logActivity } from '../lib/prisma.js';
import { MODULES } from '../lib/constants.js';
import { HttpError, requireAuth, requireOwner } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth(), requireOwner);

const opt = (max) => z.string().trim().max(max).optional().or(z.literal('')).transform((v) => v || null);

const businessSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number'),
  email: z.string().trim().toLowerCase().email().optional().or(z.literal('')).transform((v) => v || null),
  gstin: z
    .string().trim().toUpperCase()
    .regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/, 'Enter a valid 15-character GSTIN')
    .optional().or(z.literal('')).transform((v) => v || null),
  address: opt(300),
  city: opt(80),
  state: opt(80),
});

router.get('/business', async (req, res, next) => {
  try {
    const b = await prisma.business.findUnique({ where: { id: req.businessId } });
    res.json({ business: b });
  } catch (e) {
    next(e);
  }
});

router.put('/business', async (req, res, next) => {
  try {
    const d = businessSchema.parse(req.body);
    const b = await prisma.business.update({ where: { id: req.businessId }, data: d });
    await logActivity(req.businessId, req.user.id, 'update', 'business', b.id);
    res.json({ business: b });
  } catch (e) {
    next(e);
  }
});

router.get('/modules', async (req, res, next) => {
  try {
    const rows = await prisma.businessModule.findMany({ where: { businessId: req.businessId } });
    res.json({ modules: MODULES.map((m) => ({ module: m, enabled: m === 'management' || rows.some((r) => r.module === m && r.enabled) })) });
  } catch (e) {
    next(e);
  }
});

const moduleSchema = z.object({ module: z.enum(MODULES), enabled: z.boolean() });

router.put('/modules', async (req, res, next) => {
  try {
    const d = moduleSchema.parse(req.body);
    if (d.module === 'management') throw new HttpError(400, 'Management module is always on');
    await prisma.businessModule.upsert({
      where: { businessId_module: { businessId: req.businessId, module: d.module } },
      update: { enabled: d.enabled },
      create: { businessId: req.businessId, module: d.module, enabled: d.enabled },
    });
    await logActivity(req.businessId, req.user.id, d.enabled ? 'module_on' : 'module_off', 'module', d.module);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

export default router;
