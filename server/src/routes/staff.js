import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma, logActivity } from '../lib/prisma.js';
import { HttpError, requireAuth, requireOwner } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth(), requireOwner);

const publicUser = (u) => ({
  id: u.id, name: u.name, email: u.email, phone: u.phone, isOwner: u.isOwner,
  status: u.status, lastLoginAt: u.lastLoginAt, createdAt: u.createdAt,
  role: u.role ? { id: u.role.id, name: u.role.name } : null,
});

const phone = z.string().trim().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number').optional().or(z.literal('')).transform((v) => v || null);

const addSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  phone,
  password: z.string().min(8, 'Password must be at least 8 characters').max(100),
  roleId: z.string().min(1, 'Select a role'),
});

const editSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  phone,
  roleId: z.string().min(1).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  password: z.string().min(8, 'Password must be at least 8 characters').max(100).optional().or(z.literal('')),
});

async function assertRole(businessId, roleId) {
  const role = await prisma.role.findFirst({ where: { id: roleId, businessId } });
  if (!role) throw new HttpError(400, 'Role not found');
  if (role.isSystem) throw new HttpError(400, 'Owner role cannot be given to staff');
  return role;
}

router.get('/', async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      where: { businessId: req.businessId },
      include: { role: true },
      orderBy: [{ isOwner: 'desc' }, { createdAt: 'asc' }],
    });
    res.json({ staff: users.map(publicUser) });
  } catch (e) {
    next(e);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const d = addSchema.parse(req.body);
    await assertRole(req.businessId, d.roleId);
    const exists = await prisma.user.findUnique({ where: { email: d.email } });
    if (exists) throw new HttpError(409, 'This email is already used by another account');
    const u = await prisma.user.create({
      data: {
        businessId: req.businessId, name: d.name, email: d.email, phone: d.phone,
        passwordHash: await bcrypt.hash(d.password, 10), roleId: d.roleId,
      },
      include: { role: true },
    });
    await logActivity(req.businessId, req.user.id, 'create', 'staff', u.id);
    res.status(201).json({ staff: publicUser(u) });
  } catch (e) {
    next(e);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const d = editSchema.parse(req.body);
    const target = await prisma.user.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
    if (!target) throw new HttpError(404, 'Staff member not found');
    if (target.isOwner && (d.roleId || d.status)) throw new HttpError(400, "Owner's role and status cannot be changed");
    if (d.roleId) await assertRole(req.businessId, d.roleId);
    const data = {};
    if (d.name) data.name = d.name;
    if (d.phone !== undefined) data.phone = d.phone;
    if (d.roleId) data.roleId = d.roleId;
    if (d.status) data.status = d.status;
    if (d.password) data.passwordHash = await bcrypt.hash(d.password, 10);
    const u = await prisma.user.update({ where: { id: target.id }, data, include: { role: true } });
    await logActivity(req.businessId, req.user.id, 'update', 'staff', u.id);
    res.json({ staff: publicUser(u) });
  } catch (e) {
    next(e);
  }
});

export default router;
