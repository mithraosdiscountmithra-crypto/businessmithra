import { z } from 'zod';

export const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
export const num = (v) => (v === null || v === undefined || v === '' ? 0 : Number(v));

// All business dates (invoice date, expense date…) are stored as UTC midnight of the calendar day.
export const dateOnly = (s) => new Date(`${String(s).slice(0, 10)}T00:00:00.000Z`);
export const istToday = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
export const addDays = (s, n) => {
  const d = dateOnly(s);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const monthStart = (s = istToday()) => `${s.slice(0, 7)}-01`;

// ?from=YYYY-MM-DD&to=YYYY-MM-DD (inclusive). Default: this month till today.
export function parseRange(query) {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  const from = re.test(query.from || '') ? query.from : monthStart();
  const to = re.test(query.to || '') ? query.to : istToday();
  return { from, to, gte: dateOnly(from), lt: dateOnly(addDays(to, 1)) };
}

export const GST_RATES = [0, 0.1, 0.25, 3, 5, 12, 18, 28];

export const lineSchema = z.object({
  itemId: z.string().optional().nullable(),
  variantId: z.string().optional().nullable(),
  name: z.string().trim().min(1, 'Item name is required').max(200),
  hsn: z.string().trim().max(20).optional().nullable(),
  unit: z.string().trim().max(20).optional().nullable(),
  qty: z.coerce.number().positive('Quantity must be more than 0'),
  rate: z.coerce.number().min(0, 'Rate cannot be negative'),
  taxRate: z.coerce.number().refine((v) => GST_RATES.includes(v), 'Choose a valid GST %'),
});

export const docSchema = z.object({
  customerId: z.string().min(1, 'Select a customer'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Select a date'),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable().or(z.literal('')),
  validTill: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable().or(z.literal('')),
  interState: z.boolean().default(false),
  discount: z.coerce.number().min(0).default(0),
  notes: z.string().max(1000).optional().nullable(),
  items: z.array(lineSchema).min(1, 'Add at least one item').max(200),
});

// Calculates line taxes and totals. Discount is spread across lines before GST.
export function computeDoc({ items, discount = 0, interState = false }) {
  const gross = items.map((l) => r2(num(l.qty) * num(l.rate)));
  const subtotal = r2(gross.reduce((a, b) => a + b, 0));
  const disc = Math.min(r2(discount), subtotal);
  const factor = subtotal > 0 ? (subtotal - disc) / subtotal : 1;
  const lines = items.map((l, i) => {
    const taxable = gross[i] * factor;
    return {
      itemId: l.itemId || null,
      variantId: l.variantId || null,
      name: l.name,
      hsn: l.hsn || null,
      unit: l.unit || null,
      qty: num(l.qty),
      rate: r2(l.rate),
      taxRate: num(l.taxRate),
      amount: gross[i],
      taxAmount: r2((taxable * num(l.taxRate)) / 100),
      sort: i,
    };
  });
  const taxTotal = r2(lines.reduce((a, l) => a + l.taxAmount, 0));
  const igst = interState ? taxTotal : 0;
  const cgst = interState ? 0 : r2(taxTotal / 2);
  const sgst = interState ? 0 : r2(taxTotal - cgst);
  const raw = r2(subtotal - disc + taxTotal);
  const total = Math.round(raw);
  return { lines, subtotal, discount: disc, taxTotal, cgst, sgst, igst, roundOff: r2(total - raw), total };
}

export function invoiceStatus(total, paid) {
  if (num(paid) <= 0) return 'unpaid';
  if (num(paid) + 0.009 >= num(total)) return 'paid';
  return 'partial';
}
