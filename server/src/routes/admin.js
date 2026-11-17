// BusinessMithra SUPER ADMIN (platform owner). Separate login from env: SUPERADMIN_EMAIL + SUPERADMIN_PASSWORD.
import { Router } from 'express';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { h } from '../lib/route.js';
import { num, r2 } from '../lib/money.js';
import { accessState, addPeriod, clearPlanCache, getPlans } from '../lib/plans.js';
import { MODULES } from '../lib/constants.js';
import { HttpError } from '../middleware/auth.js';
import { clearDomainCache, normalizeDomain } from '../lib/domains.js';
import { addRenderDomain, autoDomainConfig, removeRenderDomain, setHostingerDns, verifyRenderDomain } from '../lib/autoDomain.js';

const router = Router();
const COOKIE = 'bm_admin';

const configured = () => Boolean(process.env.SUPERADMIN_EMAIL && process.env.SUPERADMIN_PASSWORD && process.env.SUPERADMIN_PASSWORD.length >= 10);
const same = (a, b) => {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
};

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many attempts. Try after 15 minutes.' } });

router.post('/login', loginLimiter, h(async (req, res) => {
  if (!configured()) throw new HttpError(400, 'Super admin login is not set up. Add SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD (min 10 characters) on Render.');
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const ok = same(email, process.env.SUPERADMIN_EMAIL.trim().toLowerCase()) & same(password, process.env.SUPERADMIN_PASSWORD);
  if (!ok) throw new HttpError(401, 'Wrong email or password');
  const token = jwt.sign({ sa: true }, process.env.JWT_SECRET, { expiresIn: '12h', audience: 'admin' });
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', maxAge: 12 * 3600000, path: '/' });
  res.json({ ok: true });
}));

router.post('/logout', (_req, res) => {
  res.clearCookie(COOKIE, { path: '/' });
  res.json({ ok: true });
});

// Everything below needs the super admin cookie.
router.use((req, _res, next) => {
  try {
    const t = req.cookies?.[COOKIE];
    if (!t || !configured()) throw new Error();
    const p = jwt.verify(t, process.env.JWT_SECRET, { audience: 'admin' });
    if (!p.sa) throw new Error();
    next();
  } catch {
    next(new HttpError(401, 'Please log in as super admin'));
  }
});

router.get('/me', (_req, res) => res.json({ ok: true, email: process.env.SUPERADMIN_EMAIL }));

const monthlyValue = (plan, cycle) => (cycle === 'yearly' ? num(plan.priceYearly) / 12 : num(plan.priceMonthly));

router.get('/stats', h(async (_req, res) => {
  const plans = await getPlans();
  const now = new Date();
  const weekAgo = new Date(Date.now() - 7 * 86400000);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [businesses, pending, revenueMonth, revenueAll, signupsWeek, signupsMonth, ordersWeek, invoicesWeek] = await Promise.all([
    prisma.business.findMany({ select: { id: true, plan: true, planEndsAt: true, planCycle: true, trialEndsAt: true, status: true, type: true } }),
    prisma.subscriptionRequest.count({ where: { status: 'pending' } }),
    prisma.subscriptionRequest.aggregate({ where: { status: 'approved', decidedAt: { gte: monthStart } }, _sum: { amount: true } }),
    prisma.subscriptionRequest.aggregate({ where: { status: 'approved' }, _sum: { amount: true } }),
    prisma.business.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.business.count({ where: { createdAt: { gte: monthStart } } }),
    prisma.shopOrder.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.invoice.count({ where: { createdAt: { gte: weekAgo } } }),
  ]);
  const domainRequests = await prisma.business.findMany({ where: { customDomainStatus: 'requested' }, select: { id: true, name: true, customDomain: true } });
  let trial = 0; let paid = 0; let free = 0; let expired = 0; let blocked = 0; let mrr = 0; let trialEndingSoon = 0;
  const byType = {};
  for (const b of businesses) {
    byType[b.type] = (byType[b.type] || 0) + 1;
    if (b.status === 'blocked') { blocked += 1; continue; }
    const a = accessState(b, plans);
    if (!a.active) expired += 1;
    else if (a.plan === 'trial') { trial += 1; if (a.daysLeft <= 5) trialEndingSoon += 1; }
    else if (a.plan === 'free') free += 1;
    else {
      paid += 1;
      const p = plans.find((x) => x.code === a.plan);
      if (p) mrr += monthlyValue(p, b.planCycle);
    }
  }
  res.json({
    total: businesses.length, trial, paid, free, expired, blocked, trialEndingSoon,
    mrr: r2(mrr), pending,
    revenueMonth: r2(num(revenueMonth._sum.amount)), revenueAll: r2(num(revenueAll._sum.amount)),
    signupsWeek, signupsMonth, ordersWeek, invoicesWeek, domainRequests,
    byType: Object.entries(byType).map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
  });
}));

router.get('/businesses', h(async (req, res) => {
  const plans = await getPlans();
  const q = String(req.query.q || '').trim();
  const where = {};
  if (q) where.OR = [{ name: { contains: q, mode: 'insensitive' } }, { phone: { contains: q } }, { city: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }];
  const list = await prisma.business.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 500,
    include: {
      users: { where: { isOwner: true }, select: { name: true, email: true, phone: true } },
      _count: { select: { users: true, customers: true, invoices: true, orders: true } },
    },
  });
  const lastLogins = await prisma.user.groupBy({ by: ['businessId'], where: { businessId: { in: list.map((b) => b.id) } }, _max: { lastLoginAt: true } });
  const last = Object.fromEntries(lastLogins.map((x) => [x.businessId, x._max.lastLoginAt]));
  const filter = String(req.query.filter || '');
  const rows = list.map((b) => {
    const a = accessState(b, plans);
    const state = b.status === 'blocked' ? 'blocked' : !a.active ? 'expired' : a.plan === 'trial' ? 'trial' : a.plan === 'free' ? 'free' : 'paid';
    return {
      id: b.id, name: b.name, type: b.type, city: b.city, phone: b.phone, slug: b.slug, shopEnabled: b.shopEnabled,
      customDomain: b.customDomain, customDomainStatus: b.customDomainStatus,
      owner: b.users[0] || null, plan: a.planName, state, daysLeft: a.daysLeft, endsAt: a.endsAt,
      createdAt: b.createdAt, lastActive: last[b.id] || null, counts: b._count,
    };
  }).filter((r) => !filter || r.state === filter);
  res.json({ businesses: rows });
}));

router.get('/businesses/:id', h(async (req, res) => {
  const plans = await getPlans();
  const b = await prisma.business.findUnique({
    where: { id: req.params.id },
    include: {
      users: { select: { id: true, name: true, email: true, phone: true, isOwner: true, status: true, lastLoginAt: true, role: { select: { name: true } } }, orderBy: { createdAt: 'asc' } },
      modules: true,
      subscriptionRequests: { orderBy: { createdAt: 'desc' }, take: 30 },
      _count: { select: { customers: true, invoices: true, orders: true, leads: true, items: true, expenses: true } },
    },
  });
  if (!b) throw new HttpError(404, 'Business not found');
  const sales = await prisma.invoice.aggregate({ where: { businessId: b.id, status: { not: 'cancelled' } }, _sum: { total: true } });
  res.json({ business: b, access: accessState(b, plans), plans, totalSales: r2(num(sales._sum.total)) });
}));

const updateSchema = z.object({
  action: z.enum(['block', 'unblock', 'extend_trial', 'set_plan', 'note', 'domain_live', 'domain_pending', 'domain_remove']),
  days: z.coerce.number().int().min(1).max(365).optional(),
  planCode: z.string().optional(),
  cycle: z.enum(['monthly', 'yearly']).optional(),
  endsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  note: z.string().max(1000).optional().nullable(),
});

router.post('/businesses/:id', h(async (req, res) => {
  const d = updateSchema.parse(req.body);
  const b = await prisma.business.findUnique({ where: { id: req.params.id } });
  if (!b) throw new HttpError(404, 'Business not found');
  let data = {};
  if (d.action === 'block') data = { status: 'blocked' };
  if (d.action === 'unblock') data = { status: 'active' };
  if (d.action === 'note') data = { adminNote: d.note || null };
  if (d.action === 'extend_trial') {
    const base = Math.max(Date.now(), new Date(b.trialEndsAt).getTime());
    data = { plan: 'trial', trialEndsAt: new Date(base + (d.days || 7) * 86400000), planEndsAt: null, planCycle: null };
  }
  if (d.action === 'set_plan') {
    const plan = (await getPlans()).find((p) => p.code === d.planCode);
    if (!plan) throw new HttpError(400, 'Plan not found');
    data = plan.code === 'free'
      ? { plan: 'free', planEndsAt: null, planCycle: null }
      : { plan: plan.code, planCycle: d.cycle || 'monthly', planEndsAt: d.endsAt ? new Date(`${d.endsAt}T23:59:59.000Z`) : addPeriod(new Date(), d.cycle || 'monthly') };
  }
  if (d.action === 'domain_live') data = { customDomainStatus: 'live' };
  if (d.action === 'domain_pending') data = { customDomainStatus: 'requested' };
  if (d.action === 'domain_remove') {
    if (b.customDomain) await removeRenderDomain(b.customDomain).catch(() => {});
    data = { customDomain: null, customDomainStatus: null };
  }
  await prisma.business.update({ where: { id: b.id }, data });
  clearDomainCache();
  res.json({ ok: true });
}));

// ── 🤖 One-click own-domain setup ──
router.get('/domain-config', (_req, res) => res.json(autoDomainConfig()));

router.post('/businesses/:id/domain/auto', h(async (req, res) => {
  const b = await prisma.business.findUnique({ where: { id: req.params.id } });
  if (!b) throw new HttpError(404, 'Business not found');
  const root = normalizeDomain(req.body?.domain || b.customDomain);
  if (!/^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(root)) throw new HttpError(400, 'Enter a valid domain like srisaitextiles.in');
  const host = `www.${root}`;
  const dup = await prisma.business.findFirst({ where: { customDomain: host, NOT: { id: b.id } } });
  if (dup) throw new HttpError(409, `This domain is already used by ${dup.name}`);
  if (!b.shopEnabled) throw new HttpError(400, 'Turn ON this business\'s Online Shop first');

  const steps = [];
  const step = async (label, fn) => {
    try {
      const out = await fn();
      steps.push({ label, ok: true, info: out || null });
      return true;
    } catch (e) {
      steps.push({ label, ok: false, info: e.message });
      return false;
    }
  };

  await prisma.business.update({ where: { id: b.id }, data: { customDomain: host, customDomainStatus: 'requested' } });
  steps.push({ label: `Domain saved: ${host}`, ok: true });
  if (req.body?.provider === 'hostinger') {
    await step('Hostinger DNS records set (A @ + CNAME www)', () => setHostingerDns(root));
  } else {
    steps.push({ label: 'DNS: manual (other provider) – see records below', ok: true });
  }
  const added = await step('Domain added on Render server', () => addRenderDomain(host));
  let verified = false;
  if (added) {
    await step('Verification started', async () => {
      const v = await verifyRenderDomain(host);
      verified = v.verified;
      return v.verified ? 'Verified ✓' : `Status: ${v.status} (DNS takes 5–60 min)`;
    });
  }
  if (verified) await prisma.business.update({ where: { id: b.id }, data: { customDomainStatus: 'live' } });
  clearDomainCache();
  res.json({ steps, verified, host, dns: [{ type: 'A', name: '@', value: '216.24.57.1' }, { type: 'CNAME', name: 'www', value: autoDomainConfig().target }] });
}));

router.post('/businesses/:id/domain/check', h(async (req, res) => {
  const b = await prisma.business.findUnique({ where: { id: req.params.id } });
  if (!b?.customDomain) throw new HttpError(400, 'No domain on this business');
  const v = await verifyRenderDomain(b.customDomain).catch((e) => ({ verified: false, status: e.message }));
  if (v.verified && b.customDomainStatus !== 'live') {
    await prisma.business.update({ where: { id: b.id }, data: { customDomainStatus: 'live' } });
    clearDomainCache();
  }
  res.json(v);
}));

// ── Plan requests (vendor paid cash / UPI / bank) ──
router.get('/requests', h(async (req, res) => {
  const status = String(req.query.status || 'pending');
  const requests = await prisma.subscriptionRequest.findMany({
    where: status === 'all' ? {} : { status },
    include: { business: { select: { id: true, name: true, city: true, phone: true, plan: true } } },
    orderBy: { createdAt: status === 'pending' ? 'asc' : 'desc' },
    take: 300,
  });
  res.json({ requests });
}));

router.post('/requests/:id/approve', h(async (req, res) => {
  const r = await prisma.subscriptionRequest.findUnique({ where: { id: req.params.id }, include: { business: true } });
  if (!r) throw new HttpError(404, 'Request not found');
  if (r.status !== 'pending') throw new HttpError(400, 'This request is already decided');
  const amount = req.body?.amount !== undefined && req.body.amount !== '' ? Math.max(0, Number(req.body.amount)) : num(r.amount);
  const b = r.business;
  // Renewing the same paid plan early adds time on top; otherwise it starts today.
  const stillActive = b.plan === r.planCode && b.planEndsAt && new Date(b.planEndsAt) > new Date();
  const from = stillActive ? new Date(b.planEndsAt) : new Date();
  const till = r.planCode === 'free' ? null : addPeriod(from, r.cycle);
  await prisma.$transaction([
    prisma.subscriptionRequest.update({
      where: { id: r.id },
      data: { status: 'approved', amount, decidedAt: new Date(), validFrom: from, validTill: till, adminNote: req.body?.adminNote ? String(req.body.adminNote).slice(0, 500) : null },
    }),
    prisma.business.update({
      where: { id: b.id },
      data: r.planCode === 'free' ? { plan: 'free', planEndsAt: null, planCycle: null } : { plan: r.planCode, planCycle: r.cycle, planEndsAt: till },
    }),
  ]);
  // Switch on the modules this plan allows (owner can still turn them off).
  const plan = (await getPlans()).find((p) => p.code === r.planCode);
  if (plan) {
    for (const m of plan.modules) {
      await prisma.businessModule.upsert({
        where: { businessId_module: { businessId: b.id, module: m } },
        update: {},
        create: { businessId: b.id, module: m, enabled: true },
      });
    }
  }
  res.json({ ok: true, validTill: till });
}));

router.post('/requests/:id/reject', h(async (req, res) => {
  const r = await prisma.subscriptionRequest.findUnique({ where: { id: req.params.id } });
  if (!r) throw new HttpError(404, 'Request not found');
  if (r.status !== 'pending') throw new HttpError(400, 'This request is already decided');
  await prisma.subscriptionRequest.update({ where: { id: r.id }, data: { status: 'rejected', decidedAt: new Date(), adminNote: String(req.body?.adminNote || '').slice(0, 500) || null } });
  res.json({ ok: true });
}));

// ── Plans (prices & limits) ──
router.get('/plans', h(async (_req, res) => res.json({ plans: await getPlans({ fresh: true }), modules: MODULES })));

const planSchema = z.object({
  name: z.string().trim().min(1).max(40),
  priceMonthly: z.coerce.number().min(0),
  priceYearly: z.coerce.number().min(0),
  maxUsers: z.coerce.number().int().min(0).max(10000),
  modules: z.array(z.enum(MODULES)).min(1),
  description: z.string().trim().max(200).optional().nullable(),
  active: z.boolean(),
});

router.put('/plans/:code', h(async (req, res) => {
  const d = planSchema.parse(req.body);
  if (!d.modules.includes('management')) d.modules.push('management');
  const p = await prisma.plan.update({ where: { code: req.params.code }, data: d }).catch(() => null);
  if (!p) throw new HttpError(404, 'Plan not found');
  clearPlanCache();
  res.json({ plan: p });
}));

export default router;
