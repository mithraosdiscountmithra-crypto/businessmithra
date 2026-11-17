import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { h } from '../lib/route.js';
import { HttpError } from '../middleware/auth.js';

const router = Router();

// Customer-facing invoice link (shared on WhatsApp). Token is random and unguessable.
router.get('/invoice/:token', h(async (req, res) => {
  const token = String(req.params.token || '');
  if (!/^[a-f0-9]{32}$/.test(token)) throw new HttpError(404, 'Invoice not found');
  const inv = await prisma.invoice.findUnique({
    where: { shareToken: token },
    include: {
      customer: { select: { name: true, phone: true, address: true, city: true, state: true, gstin: true } },
      items: { orderBy: { sort: 'asc' } },
      payments: { select: { amount: true, date: true, mode: true }, orderBy: { date: 'asc' } },
      business: {
        select: { name: true, phone: true, email: true, gstin: true, address: true, city: true, state: true, invoiceTerms: true, bankDetails: true, status: true },
      },
    },
  });
  if (!inv || inv.business.status === 'blocked') throw new HttpError(404, 'Invoice not found');
  const { business, businessId, createdById, quotationId, ...invoice } = inv;
  res.json({ invoice, business });
}));

export default router;
