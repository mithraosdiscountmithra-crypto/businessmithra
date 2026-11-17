import { prisma } from './prisma.js';
import { num, r2 } from './money.js';
import { HttpError } from '../middleware/auth.js';

// Checks a coupon for this order. `payable` = amount the customer pays for items (with GST).
// Returns the discount in customer rupees (with GST) – callers convert it to a pre-GST discount.
export async function checkCoupon(businessId, rawCode, phone, payable) {
  const code = String(rawCode || '').trim().toUpperCase();
  if (!code) return null;
  const c = await prisma.coupon.findFirst({ where: { businessId, code, active: true } });
  if (!c) throw new HttpError(400, 'Coupon code is not valid');
  const now = new Date();
  if (c.validFrom && now < c.validFrom) throw new HttpError(400, 'This coupon is not active yet');
  if (c.validTill && now > new Date(c.validTill.getTime() + 86400000)) throw new HttpError(400, 'This coupon has expired');
  if (c.usageLimit && c.usedCount >= c.usageLimit) throw new HttpError(400, 'This coupon is fully used');
  if (num(c.minOrder) > 0 && payable < num(c.minOrder)) throw new HttpError(400, `Coupon needs a minimum order of ₹${num(c.minOrder)}`);
  if (c.oncePerCustomer && phone) {
    const used = await prisma.shopOrder.count({ where: { businessId, phone, couponCode: code, status: { not: 'cancelled' } } });
    if (used) throw new HttpError(400, 'You have already used this coupon');
  }
  let off = c.type === 'flat' ? num(c.value) : (payable * num(c.value)) / 100;
  if (c.maxDiscount && num(c.maxDiscount) > 0) off = Math.min(off, num(c.maxDiscount));
  off = r2(Math.min(off, payable));
  const label = c.type === 'flat' ? `₹${num(c.value)} off` : `${num(c.value)}% off`;
  return { coupon: c, code, off, label };
}
