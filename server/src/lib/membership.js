import crypto from 'node:crypto';
import { prisma } from './prisma.js';
import { computeDoc, dateOnly, istToday, num } from './money.js';
import { defaultAccountId, recalcInvoice } from '../routes/invoices.js';

// Best active membership of this mobile at this business (highest discount; free delivery if any plan gives it).
export async function activeBenefits(businessId, phone) {
  if (!phone) return null;
  const list = await prisma.membership.findMany({
    where: { businessId, phone, status: 'active', endsAt: { gt: new Date() } },
    include: { plan: true },
    orderBy: { endsAt: 'desc' },
  });
  if (!list.length) return null;
  const best = [...list].sort((a, b) => num(b.plan.discountPct) - num(a.plan.discountPct))[0];
  return {
    membershipId: best.id,
    planName: best.plan.name,
    discountPct: num(best.plan.discountPct),
    freeDelivery: list.some((m) => m.plan.freeDelivery),
    endsAt: best.endsAt,
  };
}

// Activates a membership: makes a paid invoice for the sale (shows in Sales & Accounts) and sets the validity.
export async function activateMembership({ membership, plan, userId, paidMode, reference, price }) {
  const amount = price !== undefined && price !== null && price !== '' ? Math.max(0, Number(price)) : num(plan.price);
  // Renewing the same plan early adds time on top.
  const current = await prisma.membership.findFirst({
    where: { businessId: membership.businessId, phone: membership.phone, planId: plan.id, status: 'active', endsAt: { gt: new Date() }, NOT: { id: membership.id } },
    orderBy: { endsAt: 'desc' },
  });
  const startsAt = current ? new Date(current.endsAt) : new Date();
  const endsAt = new Date(startsAt.getTime() + plan.durationDays * 86400000);

  return prisma.$transaction(async (tx) => {
    let invoiceId = null;
    if (amount > 0) {
      const c = computeDoc({ items: [{ name: `${plan.name} membership (${plan.durationDays} days)`, qty: 1, rate: amount, taxRate: 0 }] });
      const b = await tx.business.update({ where: { id: membership.businessId }, data: { nextInvoiceNo: { increment: 1 } } });
      const inv = await tx.invoice.create({
        data: {
          businessId: membership.businessId, number: `${b.invoicePrefix}${b.nextInvoiceNo - 1}`, customerId: membership.customerId,
          date: dateOnly(istToday()), subtotal: c.subtotal, taxTotal: 0, roundOff: c.roundOff, total: c.total,
          notes: 'Membership', shareToken: crypto.randomBytes(16).toString('hex'), createdById: userId, items: { create: c.lines },
        },
      });
      if (paidMode) {
        const accountId = await defaultAccountId(tx, membership.businessId, paidMode);
        await tx.payment.create({
          data: { businessId: membership.businessId, invoiceId: inv.id, customerId: membership.customerId, accountId, amount: c.total, date: dateOnly(istToday()), mode: paidMode, reference: reference || null, createdById: userId },
        });
        await recalcInvoice(tx, inv.id);
      }
      invoiceId = inv.id;
    }
    return tx.membership.update({
      where: { id: membership.id },
      data: { status: 'active', startsAt, endsAt, pricePaid: amount, paymentMode: paidMode || null, reference: reference || null, invoiceId, decidedAt: new Date() },
      include: { plan: true, customer: { select: { id: true, name: true, phone: true } } },
    });
  });
}
