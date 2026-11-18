// Turns an approved / paid plan request into an active plan.
import { prisma } from './prisma.js';
import { addPeriod, getPlans } from './plans.js';

export async function activateRequest(r, { amount, adminNote = null, paymentMode, reference } = {}) {
  const b = r.business || (await prisma.business.findUnique({ where: { id: r.businessId } }));
  // Renewing the same paid plan early adds time on top; otherwise it starts today.
  const stillActive = b.plan === r.planCode && b.planEndsAt && new Date(b.planEndsAt) > new Date();
  const from = stillActive ? new Date(b.planEndsAt) : new Date();
  const till = r.planCode === 'free' ? null : addPeriod(from, r.cycle);
  await prisma.$transaction([
    prisma.subscriptionRequest.update({
      where: { id: r.id },
      data: {
        status: 'approved', amount: amount ?? r.amount, decidedAt: new Date(), validFrom: from, validTill: till,
        adminNote: adminNote ? String(adminNote).slice(0, 500) : null,
        ...(paymentMode ? { paymentMode } : {}), ...(reference ? { reference } : {}),
      },
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
  return till;
}
