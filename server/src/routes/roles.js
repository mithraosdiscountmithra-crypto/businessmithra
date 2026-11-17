import { Router } from 'express';
import { z } from 'zod';
import { prisma, logActivity } from '../lib/prisma.js';
import { MODULES } from '../lib/constants.js';
import { HttpError, requireAuth, requireOwner } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth(), requireOwner);

const permSchema = z.object({
  module: z.enum(MODULES),
  canView: z.boolean(),
  canAdd: z.boolean(),
  canEdit: z.boolean(),
  canDelete: z.boolean(),
});

const roleSchema = z.object({
  name: z.string().trim().min(2, 'Role name is too short').max(40),
  permissions: z.array(permSchema).max(MODULES.length),
});

const shape = (r) => ({
  id: r.id,
  name: r.name,
  isSystem: r.isSystem,
  userCount: r._count?.users ?? 0,
  permissions: MODULES.map((m) => {
    const p = r.permissions.find((x) => x.module === m);
    return { module: m, canView: !!p?.canView, canAdd: !!p?.canAdd, canEdit: !!p?.canEdit, canDelete: !!p?.canDelete };
  }),
});

// Adding/editing/deleting implies viewing.
const normalize = (perms) =>
  perms.map((p) => ({ ...p, canView: p.canView || p.canAdd || p.canEdit || p.canDelete }));

router.get('/', async (req, res, next) => {
  try {
    const roles = await prisma.role.findMany({
      where: { businessId: req.businessId },
      include: { permissions: true, _count: { select: { users: true } } },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ roles: roles.map(shape) });
  } catch (e) {
    next(e);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const d = roleSchema.parse(req.body);
    const dup = await prisma.role.findFirst({ where: { businessId: req.businessId, name: d.name } });
    if (dup) throw new HttpError(409, 'A role with this name already exists');
    const r = await prisma.role.create({
      data: { businessId: req.businessId, name: d.name, permissions: { create: normalize(d.permissions) } },
      include: { permissions: true, _count: { select: { users: true } } },
    });
    await logActivity(req.businessId, req.user.id, 'create', 'role', r.id);
    res.status(201).json({ role: shape(r) });
  } catch (e) {
    next(e);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const d = roleSchema.parse(req.body);
    const role = await prisma.role.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
    if (!role) throw new HttpError(404, 'Role not found');
    if (role.isSystem) throw new HttpError(400, 'Owner role cannot be changed');
    const dup = await prisma.role.findFirst({ where: { businessId: req.businessId, name: d.name, NOT: { id: role.id } } });
    if (dup) throw new HttpError(409, 'A role with this name already exists');
    const r = await prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
      return tx.role.update({
        where: { id: role.id },
        data: { name: d.name, permissions: { create: normalize(d.permissions) } },
        include: { permissions: true, _count: { select: { users: true } } },
      });
    });
    await logActivity(req.businessId, req.user.id, 'update', 'role', r.id);
    res.json({ role: shape(r) });
  } catch (e) {
    next(e);
  }
});

export default router;
