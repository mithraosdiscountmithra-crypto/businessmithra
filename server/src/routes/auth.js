import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma, logActivity } from '../lib/prisma.js';
import { BUSINESS_TYPES, DEFAULT_ROLES, MODULES, TRIAL_DAYS } from '../lib/constants.js';
import { HttpError, requireAuth, signToken, setAuthCookie, clearAuthCookie } from '../middleware/auth.js';
import { mePayload } from '../lib/serialize.js';
import { accessState, getPlans } from '../lib/plans.js';

const router = Router();

const signupSchema = z.object({
  businessName: z.string().trim().min(2, 'Business name is too short').max(120),
  businessType: z.enum(Object.keys(BUSINESS_TYPES)),
  phone: z.string().trim().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number'),
  city: z.string().trim().max(80).optional().or(z.literal('')),
  state: z.string().trim().max(80).optional().or(z.literal('')),
  ownerName: z.string().trim().min(2, 'Enter your name').max(80),
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(100),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  password: z.string().min(1, 'Enter your password'),
});

async function loadUser(id) {
  const user = await prisma.user.findUnique({
    where: { id },
    include: { business: { include: { modules: true } }, role: { include: { permissions: true } } },
  });
  if (user) user.business.access = accessState(user.business, await getPlans());
  return user;
}

router.post('/signup', async (req, res, next) => {
  try {
    const d = signupSchema.parse(req.body);
    const exists = await prisma.user.findUnique({ where: { email: d.email } });
    if (exists) throw new HttpError(409, 'An account with this email already exists. Please log in.');

    const passwordHash = await bcrypt.hash(d.password, 10);
    const enabled = new Set([...BUSINESS_TYPES[d.businessType], 'management']);

    const userId = await prisma.$transaction(async (tx) => {
      const business = await tx.business.create({
        data: {
          name: d.businessName,
          type: d.businessType,
          phone: d.phone,
          email: d.email,
          city: d.city || null,
          state: d.state || null,
          trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 86400000),
          modules: { create: MODULES.map((m) => ({ module: m, enabled: enabled.has(m) })) },
        },
      });
      let ownerRoleId = null;
      for (const r of DEFAULT_ROLES) {
        const role = await tx.role.create({
          data: {
            businessId: business.id,
            name: r.name,
            isSystem: r.isSystem,
            permissions: { create: Object.entries(r.perms).map(([module, p]) => ({ module, ...p })) },
          },
        });
        if (r.name === 'Owner') ownerRoleId = role.id;
      }
      const user = await tx.user.create({
        data: {
          businessId: business.id,
          name: d.ownerName,
          email: d.email,
          phone: d.phone,
          passwordHash,
          roleId: ownerRoleId,
          isOwner: true,
          lastLoginAt: new Date(),
        },
      });
      return user.id;
    });

    const user = await loadUser(userId);
    await logActivity(user.businessId, user.id, 'signup', 'business', user.businessId);
    setAuthCookie(res, signToken(user.id));
    res.status(201).json(mePayload(user));
  } catch (e) {
    next(e);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const d = loginSchema.parse(req.body);
    const found = await prisma.user.findUnique({ where: { email: d.email } });
    const ok = found && (await bcrypt.compare(d.password, found.passwordHash));
    if (!ok) throw new HttpError(401, 'Wrong email or password');
    if (found.status !== 'active') throw new HttpError(403, 'Your account is inactive. Please contact your business owner.');
    await prisma.user.update({ where: { id: found.id }, data: { lastLoginAt: new Date() } });
    const user = await loadUser(found.id);
    if (user.business.status === 'blocked') throw new HttpError(403, 'This business account is blocked. Please contact support.');
    await logActivity(user.businessId, user.id, 'login', 'user', user.id);
    setAuthCookie(res, signToken(user.id));
    res.json(mePayload(user));
  } catch (e) {
    next(e);
  }
});

router.post('/logout', (_req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

router.get('/me', requireAuth({ allowExpired: true }), (req, res) => {
  res.json(mePayload(req.user));
});

export default router;
