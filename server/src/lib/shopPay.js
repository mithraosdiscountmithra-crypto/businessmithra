// Marks a shop order as paid online (Razorpay) and records the money in its invoice, if one exists.
import { prisma, logActivity } from './prisma.js';
import { dateOnly, istToday, num } from './money.js';
import { defaultAccountId, recalcInvoice } from '../routes/invoices.js';

export async function markOrderPaidOnline(orderId, paymentId) {
  const o = await prisma.shopOrder.findUnique({ where: { id: orderId } });
  if (!o || o.paymentStatus === 'paid') return o;
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.shopOrder.updateMany({ where: { id: o.id, paymentStatus: { not: 'paid' } }, data: { paymentStatus: 'paid', paymentMode: 'online', rzpPaymentId: paymentId } });
    if (!claimed.count || !o.invoiceId) return;
    const inv = await tx.invoice.findUnique({ where: { id: o.invoiceId } });
    const due = num(inv.total) - num(inv.amountPaid);
    if (due > 0 && inv.status !== 'cancelled') {
      const accountId = await defaultAccountId(tx, o.businessId, 'online');
      await tx.payment.create({ data: { businessId: o.businessId, invoiceId: inv.id, customerId: inv.customerId, accountId, amount: due, date: dateOnly(istToday()), mode: 'online', reference: paymentId } });
      await recalcInvoice(tx, inv.id);
    }
  });
  await logActivity(o.businessId, null, 'order_paid_online', 'shop_order', o.id);
  return prisma.shopOrder.findUnique({ where: { id: o.id } });
}
