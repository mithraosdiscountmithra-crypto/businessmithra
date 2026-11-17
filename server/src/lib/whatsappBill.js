// Sends the bill PDF straight to the customer's WhatsApp through an AiSensy API campaign.
// Template (Utility) must have a DOCUMENT header and 4 body variables:
//   {{1}} customer name, {{2}} shop name, {{3}} bill number, {{4}} amount
import { HttpError } from '../middleware/auth.js';

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
