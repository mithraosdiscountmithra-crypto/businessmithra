import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { prisma } from './prisma.js';
import { HttpError } from '../middleware/auth.js';

const OTP_TTL_MIN = 10;
const MAX_PER_HOUR = 5;
const MAX_ATTEMPTS = 5;

export const otpEnabled = () => Boolean(process.env.AISENSY_API_KEY && process.env.AISENSY_OTP_CAMPAIGN);

const hash = (phone, code) => crypto.createHmac('sha256', process.env.JWT_SECRET).update(`${phone}:${code}`).digest('hex');

// Sends a 6-digit code on WhatsApp through an AiSensy API campaign (Authentication template).
export async function sendOtp(phone, name) {
  if (!otpEnabled()) throw new HttpError(400, 'OTP login is not set up yet');
  const hourAgo = new Date(Date.now() - 3600000);
  const recent = await prisma.otpCode.findMany({ where: { phone, createdAt: { gte: hourAgo } }, orderBy: { createdAt: 'desc' } });
  if (recent.length >= MAX_PER_HOUR) throw new HttpError(429, 'Too many OTPs for this number. Please try after 1 hour.');
  if (recent[0] && Date.now() - recent[0].createdAt.getTime() < 60000) throw new HttpError(429, 'Please wait 1 minute before asking for a new OTP');

  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  const body = {
    apiKey: process.env.AISENSY_API_KEY,
    campaignName: process.env.AISENSY_OTP_CAMPAIGN,
    destination: `91${phone}`,
    userName: (name || 'Customer').slice(0, 60),
    templateParams: [code],
    // Authentication templates carry the code again in the "Copy code" button.
    buttons: [{ type: 'button', sub_type: 'url', index: 0, parameters: [{ type: 'text', text: code }] }],
  };
  let ok = false;
  try {
    const r = await fetch('https://backend.aisensy.com/campaign/t1/api/v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    ok = r.ok;
    if (!ok) console.error('AiSensy OTP failed', r.status, (await r.text()).slice(0, 300));
  } catch (e) {
    console.error('AiSensy OTP error', e.message);
  }
  if (!ok) throw new HttpError(400, 'Could not send OTP on WhatsApp right now. Please try again in a minute.');
  await prisma.otpCode.create({ data: { phone, codeHash: hash(phone, code), expiresAt: new Date(Date.now() + OTP_TTL_MIN * 60000) } });
}

export async function verifyOtp(phone, code) {
  const otp = await prisma.otpCode.findFirst({ where: { phone, expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' } });
  if (!otp) throw new HttpError(400, 'OTP expired. Please ask for a new one.');
  if (otp.attempts >= MAX_ATTEMPTS) throw new HttpError(429, 'Too many wrong tries. Please ask for a new OTP.');
  const good = crypto.timingSafeEqual(Buffer.from(otp.codeHash), Buffer.from(hash(phone, String(code).trim())));
  if (!good) {
    await prisma.otpCode.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
    throw new HttpError(400, 'Wrong OTP. Please check and try again.');
  }
  await prisma.otpCode.deleteMany({ where: { phone } });
  return jwt.sign({ phone, scope: 'shop' }, process.env.JWT_SECRET, { expiresIn: '180d', audience: 'shop' });
}

// Returns the verified phone from "Authorization: Bearer <token>", or null.
export function shopPhone(req) {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
  const raw = m ? m[1] : req.cookies?.bm_shop;
  if (!raw) return null;
  try {
    const p = jwt.verify(raw, process.env.JWT_SECRET, { audience: 'shop' });
    return p.scope === 'shop' ? p.phone : null;
  } catch {
    return null;
  }
}
