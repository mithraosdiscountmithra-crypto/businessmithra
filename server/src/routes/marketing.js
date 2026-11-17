// Marketing: coupons, WhatsApp campaigns to customer groups, birthday wishes.
import { Router } from 'express';
import { z } from 'zod';
import { prisma, logActivity } from '../lib/prisma.js';
import { h } from '../lib/route.js';
import { addDays, dateOnly, istToday } from '../lib/money.js';
import { aisensyReady, sendTemplate } from '../lib/aisensy.js';
import { HttpError, requireAuth, requirePermission } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth());

// ── Coupons ──
const couponSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,20}$/, 'Code: 3-20 letters/numbers, no spaces'),
  type: z.enum(['percent', 'flat']),
  value: z.coerce.number().positive('Enter discount value'),
  minOrder: z.coerce.number().min(0).default(0),
  maxDiscount: z.coerce.number().min(0).optional().nullable().transform((v) => v || null),
  validFrom: z.string().optional().nullable().transform((v) => (v ? dateOnly(v) : null)),
  validTill: z.string().optional().nullable().transform((v) => (v ? dateOnly(v) : null)),
  usageLimit: z.coerce.number().int().min(0).optional().nullable().transform((v) => v || null),
  oncePerCustomer: z.boolean().default(true),
  showInShop: z.boolean().default(true),
  active: z.boolean().default(true),
  description: z.string().trim().max(200).optional().nullable(),
}).refine((d) => d.type !== 'percent' || d.value <= 100, { message: 'Percent cannot be more than 100', path: ['value'] });

router.get('/coupons', requirePermission('marketing', 'view'), h(async (req, res) => {
  res.json({ coupons: await prisma.coupon.findMany({ where: { businessId: req.businessId }, orderBy: { createdAt: 'desc' } }) });
}));

router.post('/coupons', requirePermission('marketing', 'add'), h(async (req, res) => {
  const d = couponSchema.parse(req.body);
  if (await prisma.coupon.findFirst({ where: { businessId: req.businessId, code: d.code } })) throw new HttpError(409, 'This code already exists');
  res.status(201).json({ coupon: await prisma.coupon.create({ data: { ...d, businessId: req.businessId } }) });
}));

router.put('/coupons/:id', requirePermission('marketing', 'edit'), h(async (req, res) => {
  const d = couponSchema.parse(req.body);
  const ex = await prisma.coupon.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!ex) throw new HttpError(404, 'Coupon not found');
  if (d.code !== ex.code && (await prisma.coupon.findFirst({ where: { businessId: req.businessId, code: d.code } }))) throw new HttpError(409, 'This code already exists');
  res.json({ coupon: await prisma.coupon.update({ where: { id: ex.id }, data: d }) });
}));

router.delete('/coupons/:id', requirePermission('marketing', 'delete'), h(async (req, res) => {
  const ex = await prisma.coupon.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!ex) throw new HttpError(404, 'Coupon not found');
  await prisma.coupon.delete({ where: { id: ex.id } });
  res.json({ ok: true });
}));

// ── Customer groups ──
const SEGMENTS = {
  all: 'All customers',
  recent: 'Bought in last 30 days',
  inactive: 'Not bought in 60+ days',
  members: 'Active members',
  birthday_month: 'Birthday this month',
  tag: 'Customers with a tag',
};

async function segmentCustomers(businessId, segment, arg) {
  const base = { businessId, phone: { not: null } };
  const today = dateOnly(istToday());
  if (segment === 'recent') {
    return prisma.customer.findMany({ where: { ...base, invoices: { some: { status: { not: 'cancelled' }, date: { gte: dateOnly(addDays(istToday(), -30)) } } } } });
  }
  if (segment === 'inactive') {
    return prisma.customer.findMany({ where: { ...base, invoices: { some: { status: { not: 'cancelled' } }, none: { status: { not: 'cancelled' }, date: { gte: dateOnly(addDays(istToday(), -60)) } } } } });
  }
  if (segment === 'members') {
    return prisma.customer.findMany({ where: { ...base, memberships: { some: { status: 'active', endsAt: { gte: today } } } } });
  }
  if (segment === 'birthday_month') {
    const m = Number(istToday().slice(5, 7));
    const all = await prisma.customer.findMany({ where: { ...base, birthday: { not: null } } });
    return all.filter((c) => c.birthday.getUTCMonth() + 1 === m);
  }
  if (segment === 'tag') return prisma.customer.findMany({ where: { ...base, tags: { has: String(arg || '') } } });
  return prisma.customer.findMany({ where: base });
}

router.get('/segments', requirePermission('marketing', 'view'), h(async (req, res) => {
  const tags = await prisma.customer.findMany({ where: { businessId: req.businessId }, select: { tags: true } });
  res.json({ segments: SEGMENTS, tags: [...new Set(tags.flatMap((t) => t.tags))].sort(), autoSend: aisensyReady('AISENSY_PROMO_CAMPAIGN'), limit: monthlyLimit() });
}));

router.get('/audience', requirePermission('marketing', 'view'), h(async (req, res) => {
  const list = await segmentCustomers(req.businessId, String(req.query.segment || 'all'), req.query.arg);
  res.json({ count: list.length, customers: list.slice(0, 2000).map((c) => ({ id: c.id, name: c.name, phone: c.phone })) });
}));

// Auto-sent messages cost money on WhatsApp, so each business gets a monthly limit.
const monthlyLimit = () => Number(process.env.WA_CAMPAIGN_MONTHLY_LIMIT || 300);
async function usedThisMonth(businessId) {
  const start = new Date(`${istToday().slice(0, 7)}-01T00:00:00+05:30`);
  const agg = await prisma.campaign.aggregate({ where: { businessId, mode: 'auto', createdAt: { gte: start } }, _sum: { sent: true } });
  return agg._sum.sent || 0;
}

const campaignSchema = z.object({
  title: z.string().trim().min(2, 'Enter a title').max(80),
  message: z.string().trim().min(5, 'Write the message').max(700),
  segment: z.enum(Object.keys(SEGMENTS)),
  segmentArg: z.string().trim().max(40).optional().nullable(),
  mode: z.enum(['auto', 'manual']).default('manual'),
});

router.get('/campaigns', requirePermission('marketing', 'view'), h(async (req, res) => {
  const campaigns = await prisma.campaign.findMany({ where: { businessId: req.businessId }, orderBy: { createdAt: 'desc' }, take: 100 });
  res.json({ campaigns, usedThisMonth: await usedThisMonth(req.businessId), limit: monthlyLimit() });
}));

router.post('/campaigns', requirePermission('marketing', 'add'), h(async (req, res) => {
  const d = campaignSchema.parse(req.body);
  const [b, list] = await Promise.all([
    prisma.business.findUnique({ where: { id: req.businessId } }),
    segmentCustomers(req.businessId, d.segment, d.segmentArg),
  ]);
  if (!list.length) throw new HttpError(400, 'No customers with a mobile number in this group');
  let sent = 0;
  let failed = 0;
  if (d.mode === 'auto') {
    if (!aisensyReady('AISENSY_PROMO_CAMPAIGN')) throw new HttpError(400, 'Auto WhatsApp sending is not set up. Use "Send one by one".');
    const left = monthlyLimit() - (await usedThisMonth(req.businessId));
    if (list.length > left) throw new HttpError(400, `Monthly limit: only ${Math.max(0, left)} more auto messages this month. Choose a smaller group or "Send one by one".`);
    const link = b.slug && b.shopEnabled ? `${(process.env.PUBLIC_URL || '').replace(/\/$/, '')}/s/${b.slug}` : `Call ${b.phone}`;
    for (const c of list) {
      const ok = await sendTemplate({ campaignEnv: 'AISENSY_PROMO_CAMPAIGN', phone: c.phone, userName: c.name, params: [c.name, b.name, d.message.replace(/\s*\n+\s*/g, ' '), link] });
      if (ok) sent += 1;
      else failed += 1;
    }
  }
  const camp = await prisma.campaign.create({ data: { ...d, segmentArg: d.segmentArg || null, businessId: req.businessId, audience: list.length, sent, failed, createdById: req.user.id } });
  await logActivity(req.businessId, req.user.id, 'campaign', 'campaign', camp.id);
  res.status(201).json({ campaign: camp, customers: d.mode === 'manual' ? list.map((c) => ({ id: c.id, name: c.name, phone: c.phone })) : [] });
}));

// ── Birthday wishes ──
router.get('/wishes', requirePermission('marketing', 'view'), h(async (req, res) => {
  const b = await prisma.business.findUnique({ where: { id: req.businessId }, select: { wishesEnabled: true, wishOffer: true } });
  const md = istToday().slice(5);
  const all = await prisma.customer.findMany({ where: { businessId: req.businessId, birthday: { not: null } }, select: { id: true, name: true, phone: true, birthday: true } });
  const upcoming = all.map((c) => {
    const bd = c.birthday.toISOString().slice(5, 10);
    const y = Number(istToday().slice(0, 4));
    let next = new Date(`${y}-${bd}T00:00:00Z`);
    if (bd < md) next = new Date(`${y + 1}-${bd}T00:00:00Z`);
    const days = Math.round((next - new Date(`${istToday()}T00:00:00Z`)) / 86400000);
    return { ...c, days };
  }).filter((c) => c.days <= 30).sort((a, c) => a.days - c.days);
  res.json({ ...b, autoSend: aisensyReady('AISENSY_WISH_CAMPAIGN'), upcoming, withBirthday: all.length });
}));

router.put('/wishes', requirePermission('marketing', 'edit'), h(async (req, res) => {
  const d = z.object({ wishesEnabled: z.boolean(), wishOffer: z.string().trim().max(120).optional().nullable() }).parse(req.body);
  await prisma.business.update({ where: { id: req.businessId }, data: { wishesEnabled: d.wishesEnabled, wishOffer: d.wishOffer || null } });
  res.json({ ok: true });
}));

export default router;

// Runs once a day (after 9 AM IST): WhatsApp birthday wishes for shops that turned it on.
export async function runBirthdayWishes() {
  if (!aisensyReady('AISENSY_WISH_CAMPAIGN')) return;
  const now = new Date(Date.now() + 5.5 * 3600000);
  if (now.getUTCHours() < 9) return;
  const today = istToday();
  const shops = await prisma.business.findMany({ where: { wishesEnabled: true, status: 'active', OR: [{ lastWishDay: null }, { lastWishDay: { not: today } }] }, select: { id: true, name: true, wishOffer: true } });
  for (const b of shops) {
    await prisma.business.update({ where: { id: b.id }, data: { lastWishDay: today } });
    const list = await prisma.customer.findMany({ where: { businessId: b.id, birthday: { not: null }, phone: { not: null } }, select: { name: true, phone: true, birthday: true } });
    for (const c of list.filter((x) => x.birthday.toISOString().slice(5, 10) === today.slice(5))) {
      await sendTemplate({ campaignEnv: 'AISENSY_WISH_CAMPAIGN', phone: c.phone, userName: c.name, params: [c.name, b.name, b.wishOffer || 'Visit us today for a special treat!'] });
    }
  }
}
