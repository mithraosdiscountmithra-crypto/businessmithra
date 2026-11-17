// Prints HTML in a hidden frame (thermal receipts, barcode labels) without leaving the page.
export function printHtml(html, css = '') {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${html}</body></html>`);
  doc.close();
  const go = () => {
    frame.contentWindow.focus();
    frame.contentWindow.print();
    setTimeout(() => frame.remove(), 1500);
  };
  const imgs = [...doc.images].filter((i) => !i.complete);
  if (!imgs.length) setTimeout(go, 100);
  else Promise.all(imgs.map((i) => new Promise((r) => { i.onload = r; i.onerror = r; }))).then(go);
}

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const rs = (n) => (Number(n) || 0).toFixed(2);

// Small shop receipt for 58mm / 80mm thermal printers.
export function printReceipt(inv, business, width = localStorage.getItem('bm_receipt_width') || '80') {
  const mm = width === '58' ? 58 : 80;
  const paid = (inv.payments || []).map((p) => `<div class="row"><span>Paid (${esc(p.mode.toUpperCase())})</span><span>${rs(p.amount)}</span></div>`).join('');
  const due = Number(inv.total) - Number(inv.amountPaid);
  const html = `
  <div class="c b big">${esc(business.name)}</div>
  ${business.address ? `<div class="c">${esc([business.address, business.city].filter(Boolean).join(', '))}</div>` : ''}
  <div class="c">Ph: ${esc(business.phone)}</div>
  ${business.gstin ? `<div class="c">GSTIN: ${esc(business.gstin)}</div>` : ''}
  <hr/>
  <div class="row"><span>Bill: ${esc(inv.number)}</span><span>${new Date(inv.createdAt || Date.now()).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}</span></div>
  ${inv.customer && inv.customer.name !== 'Walk-in Customer' ? `<div>To: ${esc(inv.customer.name)}${inv.customer.phone ? ` (${esc(inv.customer.phone)})` : ''}</div>` : ''}
  <hr/>
  <div class="row b"><span class="grow">Item</span><span class="q">Qty</span><span class="a">Amt</span></div>
  ${inv.items.map((i) => `<div class="row"><span class="grow">${esc(i.name)}<br/><small>@ ${rs(i.rate)}${Number(i.taxRate) ? ` +${Number(i.taxRate)}%` : ''}</small></span><span class="q">${Number(i.qty)}</span><span class="a">${rs(i.amount)}</span></div>`).join('')}
  <hr/>
  <div class="row"><span>Subtotal</span><span>${rs(inv.subtotal)}</span></div>
  ${Number(inv.discount) ? `<div class="row"><span>Discount</span><span>-${rs(inv.discount)}</span></div>` : ''}
  ${Number(inv.cgst) ? `<div class="row"><span>CGST</span><span>${rs(inv.cgst)}</span></div><div class="row"><span>SGST</span><span>${rs(inv.sgst)}</span></div>` : ''}
  ${Number(inv.igst) ? `<div class="row"><span>IGST</span><span>${rs(inv.igst)}</span></div>` : ''}
  ${Number(inv.roundOff) ? `<div class="row"><span>Round off</span><span>${rs(inv.roundOff)}</span></div>` : ''}
  <div class="row b big"><span>TOTAL</span><span>₹${rs(inv.total)}</span></div>
  ${paid}
  ${due > 0.009 ? `<div class="row b"><span>Balance due</span><span>${rs(due)}</span></div>` : ''}
  <hr/>
  <div class="c">Thank you! Visit again 🙏</div>
  <div class="c small">Powered by BusinessMithra</div>`;
  const css = `@page{size:${mm}mm auto;margin:0}body{width:${mm - 6}mm;margin:0 auto;padding:3mm 0;font-family:monospace;font-size:${mm === 58 ? 11 : 12}px;color:#000}
  .c{text-align:center}.b{font-weight:bold}.big{font-size:1.25em}.row{display:flex;justify-content:space-between;gap:4px}.grow{flex:1}.q{width:2.5em;text-align:right}.a{width:5em;text-align:right}
  hr{border:0;border-top:1px dashed #000;margin:4px 0}small,.small{font-size:.85em}`;
  printHtml(html, css);
}
