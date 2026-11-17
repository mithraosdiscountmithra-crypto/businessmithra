// Builds a GST bill / invoice as a PDF file in the browser (no server needed).
import { amountInWords } from './format.js';

const money = (n) => `Rs. ${new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0)}`;
const day = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '');
const MODE = { cash: 'Cash', upi: 'UPI', card: 'Card', bank: 'Bank transfer', cheque: 'Cheque' };

export async function makeBillPdf(doc, business, { kind = 'invoice' } = {}) {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${kind === 'invoice' ? 'Invoice' : 'Quotation'} ${doc.number}`);
  pdf.setAuthor(business.name);
  pdf.setProducer('BusinessMithra');
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  // Standard PDF fonts only know basic Latin letters: keep text safe.
  const safe = (t) => {
    let out = '';
    for (const ch of String(t ?? '').replace(/₹/g, 'Rs.')) {
      try {
        font.encodeText(ch);
        out += ch;
      } catch {
        out += '?';
      }
    }
    return out;
  };

  const W = 595.28; const H = 841.89; const M = 40;
  const ink = rgb(0.07, 0.09, 0.15); const muted = rgb(0.36, 0.39, 0.45); const line = rgb(0.85, 0.86, 0.89);
  const brand = rgb(0.22, 0.19, 0.64); const shade = rgb(0.95, 0.95, 0.97);
  let page = pdf.addPage([W, H]);
  let y = H - M;

  const text = (t, x, yy, { size = 10, f = font, color = ink, align = 'left' } = {}) => {
    const s = safe(t);
    const w = f.widthOfTextAtSize(s, size);
    const xx = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
    page.drawText(s, { x: xx, y: yy, size, font: f, color });
  };
  const wrap = (t, width, size, f = font) => {
    const words = safe(t).split(/\s+/);
    const lines = [];
    let cur = '';
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (f.widthOfTextAtSize(next, size) <= width) cur = next;
      else {
        if (cur) lines.push(cur);
        cur = w;
      }
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : [''];
  };
  const hr = (yy, color = line, th = 0.8) => page.drawLine({ start: { x: M, y: yy }, end: { x: W - M, y: yy }, thickness: th, color });

  // ── Header ──
  page.drawRectangle({ x: 0, y: H - 6, width: W, height: 6, color: brand });
  text(business.name, M, y - 8, { size: 18, f: bold });
  const title = kind === 'invoice' ? (business.gstin ? 'TAX INVOICE' : 'INVOICE') : 'QUOTATION';
  text(title, W - M, y - 8, { size: 14, f: bold, color: brand, align: 'right' });
  y -= 26;
  const left = [
    [business.address, business.city, business.state].filter(Boolean).join(', '),
    [business.phone && `Phone: ${business.phone}`, business.email].filter(Boolean).join('  |  '),
    business.gstin && `GSTIN: ${business.gstin}`,
  ].filter(Boolean);
  const right = [
    `No: ${doc.number}`,
    `Date: ${day(doc.date)}`,
    kind === 'invoice' && doc.dueDate ? `Due: ${day(doc.dueDate)}` : null,
    kind !== 'invoice' && doc.validTill ? `Valid till: ${day(doc.validTill)}` : null,
  ].filter(Boolean);
  let ly = y; let ry = y;
  for (const l of left) for (const w of wrap(l, 320, 9.5)) { text(w, M, ly, { size: 9.5, color: muted }); ly -= 13; }
  for (const r of right) { text(r, W - M, ry, { size: 10, f: r.startsWith('No') ? bold : font, align: 'right' }); ry -= 14; }
  y = Math.min(ly, ry) - 6;
  hr(y, ink, 1.2);
  y -= 18;

  // ── Bill to ──
  const c = doc.customer || {};
  text('BILL TO', M, y, { size: 8, f: bold, color: muted });
  y -= 14;
  const showName = c.name && !String(c.name).startsWith('Customer ');
  text(showName ? c.name : `Mobile ${c.phone || ''}`, M, y, { size: 11.5, f: bold });
  y -= 14;
  for (const l of [[c.address, c.city, c.state].filter(Boolean).join(', '), showName && c.phone ? `Mobile: ${c.phone}` : null, c.gstin ? `GSTIN: ${c.gstin}` : null].filter(Boolean)) {
    for (const w of wrap(l, 400, 9.5)) { text(w, M, y, { size: 9.5, color: muted }); y -= 13; }
  }
  y -= 8;

  // ── Items table ──
  const cols = { n: M + 6, item: M + 26, hsn: 318, qty: 392, rate: 462, gst: 500, amt: W - M - 6 };
  const head = () => {
    page.drawRectangle({ x: M, y: y - 6, width: W - 2 * M, height: 20, color: shade });
    text('#', cols.n, y, { size: 9, f: bold });
    text('Item / Service', cols.item, y, { size: 9, f: bold });
    text('HSN/SAC', cols.hsn, y, { size: 9, f: bold });
    text('Qty', cols.qty, y, { size: 9, f: bold, align: 'right' });
    text('Rate', cols.rate, y, { size: 9, f: bold, align: 'right' });
    text('GST', cols.gst, y, { size: 9, f: bold, align: 'right' });
    text('Amount', cols.amt, y, { size: 9, f: bold, align: 'right' });
    y -= 22;
  };
  head();
  doc.items.forEach((l, i) => {
    const nameLines = wrap(l.name, cols.hsn - cols.item - 10, 10);
    const need = nameLines.length * 13 + 6;
    if (y - need < 170) {
      page = pdf.addPage([W, H]);
      y = H - M;
      head();
    }
    text(String(i + 1), cols.n, y, { size: 10, color: muted });
    nameLines.forEach((nl, k) => text(nl, cols.item, y - k * 13, { size: 10 }));
    text(l.hsn || '', cols.hsn, y, { size: 9.5, color: muted });
    text(`${Number(l.qty)}${l.unit && l.unit !== 'pcs' ? ` ${l.unit}` : ''}`, cols.qty, y, { size: 10, align: 'right' });
    text(money(l.rate).replace('Rs. ', ''), cols.rate, y, { size: 10, align: 'right' });
    text(`${Number(l.taxRate)}%`, cols.gst, y, { size: 9.5, color: muted, align: 'right' });
    text(money(l.amount).replace('Rs. ', ''), cols.amt, y, { size: 10, align: 'right' });
    y -= need;
    hr(y + 8);
  });
  y -= 8;

  // ── Totals ──
  const tx = W - M - 200;
  const row = (label, value, { b = false, size = 10, color = ink } = {}) => {
    text(label, tx, y, { size, f: b ? bold : font, color });
    text(value, W - M - 6, y, { size, f: b ? bold : font, color, align: 'right' });
    y -= size + 6;
  };
  const totalsTop = y;
  row('Subtotal', money(doc.subtotal));
  if (Number(doc.discount) > 0) row('Discount', `- ${money(doc.discount)}`, { color: rgb(0.08, 0.4, 0.2) });
  if (Number(doc.taxTotal) > 0) {
    if (doc.interState) row('IGST', money(doc.igst ?? doc.taxTotal));
    else {
      row('CGST', money(doc.cgst ?? Number(doc.taxTotal) / 2));
      row('SGST', money(doc.sgst ?? Number(doc.taxTotal) / 2));
    }
  }
  if (Number(doc.roundOff || 0) !== 0) row('Round off', money(doc.roundOff), { color: muted });
  page.drawLine({ start: { x: tx, y: y + 10 }, end: { x: W - M, y: y + 10 }, thickness: 1.2, color: ink });
  y -= 4;
  row('TOTAL', money(doc.total), { b: true, size: 13 });
  if (kind === 'invoice') {
    const paid = Number(doc.amountPaid || 0);
    const due = Math.max(0, Number(doc.total) - paid);
    if (paid > 0) row(`Paid${doc.payments?.[0] ? ` (${MODE[doc.payments[0].mode] || doc.payments[0].mode})` : ''}`, money(paid), { color: rgb(0.08, 0.4, 0.2) });
    row(due > 0 ? 'Balance due' : 'Status', due > 0 ? money(due) : 'PAID', { b: true, color: due > 0 ? rgb(0.6, 0.1, 0.1) : rgb(0.08, 0.4, 0.2) });
  }

  // Left side under the table: words, notes, bank details.
  let wy = totalsTop;
  const words = wrap(`Amount in words: ${amountInWords(doc.total)}`, tx - M - 20, 9.5);
  words.forEach((w, k) => text(w, M, wy - k * 13, { size: 9.5, f: k === 0 ? font : font }));
  wy -= words.length * 13 + 8;
  for (const [label, value] of [['Notes', doc.notes], kind === 'invoice' ? ['Bank / UPI', business.bankDetails] : [null, null], ['Terms', business.invoiceTerms]]) {
    if (!label || !value) continue;
    text(label, M, wy, { size: 8.5, f: bold, color: muted });
    wy -= 12;
    for (const part of String(value).split('\n')) for (const w of wrap(part, tx - M - 20, 9)) { text(w, M, wy, { size: 9, color: muted }); wy -= 12; }
    wy -= 6;
  }
  y = Math.min(y, wy) - 30;

  // ── Footer ──
  if (y < 90) {
    page = pdf.addPage([W, H]);
    y = H - M - 40;
  }
  text(kind === 'invoice' ? 'Thank you for your business!' : 'Thank you for the opportunity.', M, y, { size: 10, color: muted });
  text(`For ${business.name}`, W - M, y, { size: 10, f: bold, align: 'right' });
  text('Authorised Signatory', W - M, y - 34, { size: 8.5, color: muted, align: 'right' });
  pdf.getPages().forEach((p, i, all) => {
    p.drawText(safe(`Made with BusinessMithra  ·  Page ${i + 1} of ${all.length}`), { x: M, y: 24, size: 7.5, font, color: muted });
  });

  const bytes = await pdf.save();
  return new Blob([bytes], { type: 'application/pdf' });
}

export const billFileName = (doc, business) =>
  `${String(business.name).replace(/[^A-Za-z0-9]+/g, '_').slice(0, 30)}_${String(doc.number).replace(/[^A-Za-z0-9-]+/g, '')}.pdf`;

// Opens the phone's share menu with the PDF (choose WhatsApp → customer). Falls back to download.
export async function shareBillPdf(doc, business, { kind = 'invoice', message = '' } = {}) {
  const blob = await makeBillPdf(doc, business, { kind });
  const name = billFileName(doc, business);
  const file = new File([blob], name, { type: 'application/pdf' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name, text: message });
      return 'shared';
    } catch (e) {
      if (e?.name === 'AbortError') return 'cancelled';
    }
  }
  downloadBlob(blob, name);
  return 'downloaded';
}

export async function downloadBillPdf(doc, business, { kind = 'invoice' } = {}) {
  downloadBlob(await makeBillPdf(doc, business, { kind }), billFileName(doc, business));
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
