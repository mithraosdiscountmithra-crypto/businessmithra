const inrFmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 });

export const inr = (n) => `₹${inrFmt.format(Number(n) || 0)}`;
export const inrExact = (n) => `₹${inr2.format(Number(n) || 0)}`;
export const short = (n) => {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1e7) return `₹${(v / 1e7).toFixed(1).replace(/\.0$/, '')}Cr`;
  if (Math.abs(v) >= 1e5) return `₹${(v / 1e5).toFixed(1).replace(/\.0$/, '')}L`;
  if (Math.abs(v) >= 1e3) return `₹${(v / 1e3).toFixed(1).replace(/\.0$/, '')}k`;
  return inr(v);
};

// Business dates are stored as UTC midnight, so always format them in UTC.
export const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—';
export const fmtDay = (d) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : '—';
export const fmtDateTime = (d) =>
  d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—';
export const isoDay = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');

export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const addDays = (s, n) => {
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const monthStart = (s = today()) => `${s.slice(0, 7)}-01`;

export const RANGES = [
  { id: 'today', label: 'Today', get: () => [today(), today()] },
  { id: 'week', label: 'Last 7 days', get: () => [addDays(today(), -6), today()] },
  { id: 'month', label: 'This month', get: () => [monthStart(), today()] },
  { id: 'lastmonth', label: 'Last month', get: () => { const e = addDays(monthStart(), -1); return [monthStart(e), e]; } },
  { id: 'fy', label: 'This FY', get: () => { const t = today(); const y = Number(t.slice(0, 4)); const m = Number(t.slice(5, 7)); const fy = m >= 4 ? y : y - 1; return [`${fy}-04-01`, t]; } },
];

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const two = (n) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`);
const three = (n) => `${n >= 100 ? `${ONES[Math.floor(n / 100)]} Hundred${n % 100 ? ' ' : ''}` : ''}${n % 100 ? two(n % 100) : ''}`;

// Indian system: Crore, Lakh, Thousand.
export function amountInWords(amount) {
  let n = Math.round(Number(amount) || 0);
  if (n === 0) return 'Zero Rupees Only';
  const parts = [];
  const crore = Math.floor(n / 1e7); n %= 1e7;
  const lakh = Math.floor(n / 1e5); n %= 1e5;
  const thousand = Math.floor(n / 1e3); n %= 1e3;
  if (crore) parts.push(`${crore >= 100 ? three(crore) : two(crore)} Crore`);
  if (lakh) parts.push(`${two(lakh)} Lakh`);
  if (thousand) parts.push(`${two(thousand)} Thousand`);
  if (n) parts.push(three(n));
  return `${parts.join(' ')} Rupees Only`;
}

export const STAGE_LABEL = { new: 'New Lead', contacted: 'Contacted', quotation: 'Quotation Sent', won: 'Won', lost: 'Lost' };
export const MODE_LABEL = { cash: 'Cash', upi: 'UPI', card: 'Card', bank: 'Bank transfer', cheque: 'Cheque', online: 'Online (Razorpay)' };
export const GST_RATES = [0, 0.1, 0.25, 3, 5, 12, 18, 28];
export const SOURCES = ['Walk-in', 'Phone call', 'WhatsApp', 'Instagram', 'Facebook', 'Website', 'Referral', 'Other'];

export const waLink = (phone, text) => `https://wa.me/${phone ? `91${String(phone).replace(/\D/g, '').slice(-10)}` : ''}?text=${encodeURIComponent(text)}`;
