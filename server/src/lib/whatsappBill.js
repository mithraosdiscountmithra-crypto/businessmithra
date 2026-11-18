// Sends the bill PDF straight to the customer's WhatsApp through an AiSensy API campaign.
// Template (Utility) must have a DOCUMENT header and 4 body variables:
//   {{1}} customer name, {{2}} shop name, {{3}} bill number, {{4}} amount
import { HttpError } from '../middleware/auth.js';
import { prisma, logActivity } from './prisma.js';
import { billFileName } from './billPdf.js';

export const autoSendEnabled = () => Boolean(process.env.AISENSY_API_KEY && process.env.AISENSY_BILL_CAMPAIGN);

const inr = (n) => new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0);

export async function sendBillOnWhatsApp({ phone, customerName, shopName, number, total, pdfUrl, fileName }) {
  if (!autoSendEnabled()) throw new HttpError(400, 'Direct WhatsApp PDF sending is not set up yet');
  const body = {
    apiKey: process.env.AISENSY_API_KEY,
    campaignName: process.env.AISENSY_BILL_CAMPAIGN,
    destination: `91${phone}`,
    userName: (customerName || 'Customer').slice(0, 60),
    templateParams: [customerName || 'Customer', shopName, number, `₹${inr(total)}`],
    media: { url: pdfUrl, filename: fileName },
  };
  let ok = false;
  try {
    const r = await fetch('https://backend.aisensy.com/campaign/t1/api/v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    ok = r.ok;
    if (!ok) console.error('AiSensy bill failed', r.status, (await r.text()).slice(0, 300));
  } catch (e) {
    console.error('AiSensy bill error', e.message);
  }
  if (!ok) throw new HttpError(400, 'Could not send the PDF on WhatsApp right now. Use "Share PDF" instead.');
}

// Called whenever an invoice's payments change. When it becomes fully paid, the PDF goes to the
// customer's WhatsApp by itself (once). Runs after the database save, outside the request.
const publicBase = () => String(process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/$/, '');

export function queuePaidBill(invoiceId) {
  if (!autoSendEnabled() || !publicBase()) return;
  setTimeout(() => sendPaidBill(invoiceId).catch((e) => console.error('paid bill send failed', e.message)), 1500);
}

async function sendPaidBill(invoiceId) {
  const inv = await prisma.invoice.findUnique({ where: { id: invoiceId }, include: { customer: true, business: true } });
  if (!inv || inv.status !== 'paid' || inv.paidBillSentAt || !inv.business.autoSendPaidBill) return;
  const phone = String(inv.customer.phone || '').replace(/\D/g, '').slice(-10);
  if (!/^[6-9]\d{9}$/.test(phone)) return;
  // Claim it first so two quick payments never send twice.
  const claimed = await prisma.invoice.updateMany({ where: { id: inv.id, paidBillSentAt: null }, data: { paidBillSentAt: new Date() } });
  if (!claimed.count) return;
  try {
    await sendBillOnWhatsApp({
      phone, customerName: inv.customer.name.startsWith('Customer ') ? 'Customer' : inv.customer.name, shopName: inv.business.name,
      number: inv.number, total: inv.total, pdfUrl: `${publicBase()}/api/public/invoice/${inv.shareToken}/pdf`, fileName: billFileName(inv, inv.business),
    });
    await logActivity(inv.businessId, null, 'auto_whatsapp_pdf', 'invoice', inv.id);
  } catch (e) {
    await prisma.invoice.update({ where: { id: inv.id }, data: { paidBillSentAt: null } });
    throw e;
  }
}
