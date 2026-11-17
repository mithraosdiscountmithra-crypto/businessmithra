import { amountInWords, fmtDate, inrExact, MODE_LABEL } from '../lib/format.js';

// Printable GST invoice / quotation. Used inside the app and on the public share link.
export default function InvoicePaper({ doc, business, kind = 'invoice' }) {
  const isInvoice = kind === 'invoice';
  const c = doc.customer || {};
  const sub = Number(doc.subtotal) || 0;
  const factor = sub > 0 ? (sub - Number(doc.discount || 0)) / sub : 1;
  const byRate = {};
  for (const l of doc.items) {
    const k = Number(l.taxRate);
    byRate[k] ||= { rate: k, taxable: 0, tax: 0 };
    byRate[k].taxable += Number(l.amount) * factor;
    byRate[k].tax += Number(l.taxAmount);
  }
  const due = Math.max(0, Number(doc.total) - Number(doc.amountPaid || 0));

  return (
    <article className="bg-white border border-line rounded-2xl p-6 sm:p-8 text-[13px] text-ink print:border-0 print:rounded-none print:p-0">
      <header className="flex flex-wrap justify-between gap-4 pb-5 border-b-2 border-ink">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-xl font-extrabold">{business.name}</h2>
          {business.address && <p>{business.address}</p>}
          {(business.city || business.state) && <p>{[business.city, business.state].filter(Boolean).join(', ')}</p>}
          <p>{[business.phone, business.email].filter(Boolean).join(' · ')}</p>
          {business.gstin && <p className="font-bold">GSTIN: {business.gstin}</p>}
        </div>
        <div className="text-right flex flex-col gap-0.5">
          <p className="text-lg font-extrabold tracking-wide">{isInvoice ? (business.gstin ? 'TAX INVOICE' : 'INVOICE') : 'QUOTATION'}</p>
          <p><span className="text-muted">No:</span> <strong>{doc.number}</strong></p>
          <p><span className="text-muted">Date:</span> {fmtDate(doc.date)}</p>
          {isInvoice && doc.dueDate && <p><span className="text-muted">Due:</span> {fmtDate(doc.dueDate)}</p>}
          {!isInvoice && doc.validTill && <p><span className="text-muted">Valid till:</span> {fmtDate(doc.validTill)}</p>}
        </div>
      </header>

      <section className="py-4 flex flex-col gap-0.5">
        <p className="text-xs font-bold text-muted uppercase tracking-wider">Bill to</p>
        <p className="font-bold text-base">{c.name}</p>
        {c.address && <p>{c.address}</p>}
        {(c.city || c.state) && <p>{[c.city, c.state].filter(Boolean).join(', ')}</p>}
        {c.phone && <p>Mobile: {c.phone}</p>}
        {c.gstin && <p className="font-semibold">GSTIN: {c.gstin}</p>}
      </section>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse">
          <thead>
            <tr className="bg-gray-100 text-left">
              <th className="p-2 font-bold w-8">#</th>
              <th className="p-2 font-bold">Item</th>
              <th className="p-2 font-bold">HSN/SAC</th>
              <th className="p-2 font-bold text-right">Qty</th>
              <th className="p-2 font-bold text-right">Rate</th>
              <th className="p-2 font-bold text-right">GST</th>
              <th className="p-2 font-bold text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {doc.items.map((l, i) => (
              <tr key={l.id || i} className="border-b border-gray-200">
                <td className="p-2">{i + 1}</td>
                <td className="p-2 font-semibold">{l.name}</td>
                <td className="p-2">{l.hsn || ''}</td>
                <td className="p-2 text-right">{Number(l.qty)} {l.unit || ''}</td>
                <td className="p-2 text-right">{inrExact(l.rate)}</td>
                <td className="p-2 text-right">{Number(l.taxRate)}%</td>
                <td className="p-2 text-right">{inrExact(l.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap justify-between gap-6 pt-4">
        <div className="flex-1 min-w-[240px] flex flex-col gap-3">
          {Object.keys(byRate).length > 0 && Number(doc.taxTotal) > 0 && (
            <table className="text-xs border-collapse w-full max-w-sm">
              <thead><tr className="bg-gray-50 text-left"><th className="p-1.5">GST %</th><th className="p-1.5 text-right">Taxable</th><th className="p-1.5 text-right">{doc.interState ? 'IGST' : 'CGST + SGST'}</th></tr></thead>
              <tbody>
                {Object.values(byRate).filter((r) => r.rate > 0).map((r) => (
                  <tr key={r.rate} className="border-b border-gray-100">
                    <td className="p-1.5">{r.rate}%</td>
                    <td className="p-1.5 text-right">{inrExact(r.taxable)}</td>
                    <td className="p-1.5 text-right">{doc.interState ? inrExact(r.tax) : `${inrExact(r.tax / 2)} + ${inrExact(r.tax / 2)}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p><span className="text-muted">Amount in words:</span> <strong>{amountInWords(doc.total)}</strong></p>
          {doc.notes && <p className="whitespace-pre-line"><span className="text-muted">Notes:</span> {doc.notes}</p>}
          {isInvoice && business.bankDetails && <p className="whitespace-pre-line"><span className="text-muted">Bank / UPI:</span> {business.bankDetails}</p>}
          {business.invoiceTerms && <p className="whitespace-pre-line text-xs text-muted">{business.invoiceTerms}</p>}
        </div>
        <div className="w-full sm:w-72 flex flex-col gap-1.5">
          <div className="flex justify-between"><span>Subtotal</span><span>{inrExact(doc.subtotal)}</span></div>
          {Number(doc.discount) > 0 && <div className="flex justify-between"><span>Discount</span><span>− {inrExact(doc.discount)}</span></div>}
          {doc.interState ? (
            <div className="flex justify-between"><span>IGST</span><span>{inrExact(doc.igst ?? doc.taxTotal)}</span></div>
          ) : (
            <>
              <div className="flex justify-between"><span>CGST</span><span>{inrExact(doc.cgst ?? Number(doc.taxTotal) / 2)}</span></div>
              <div className="flex justify-between"><span>SGST</span><span>{inrExact(doc.sgst ?? Number(doc.taxTotal) / 2)}</span></div>
            </>
          )}
          {Number(doc.roundOff || 0) !== 0 && <div className="flex justify-between"><span>Round off</span><span>{inrExact(doc.roundOff)}</span></div>}
          <div className="flex justify-between text-base font-extrabold border-t-2 border-ink pt-2 mt-1"><span>Total</span><span>{inrExact(doc.total)}</span></div>
          {isInvoice && Number(doc.amountPaid) > 0 && (
            <>
              <div className="flex justify-between text-green-800"><span>Paid</span><span>{inrExact(doc.amountPaid)}</span></div>
              <div className="flex justify-between font-bold"><span>Balance due</span><span>{inrExact(due)}</span></div>
            </>
          )}
          {isInvoice && doc.payments?.length > 0 && (
            <ul className="text-xs text-muted pt-1">
              {doc.payments.map((p, i) => <li key={p.id || i}>{fmtDate(p.date)} · {MODE_LABEL[p.mode] || p.mode} · {inrExact(p.amount)}</li>)}
            </ul>
          )}
        </div>
      </div>

      <footer className="flex justify-between items-end pt-10 text-xs text-muted">
        <span>{isInvoice ? 'Thank you for your business!' : 'Thank you for the opportunity.'}</span>
        <span className="text-right">For <strong className="text-ink">{business.name}</strong><br /><br />Authorised Signatory</span>
      </footer>
    </article>
  );
}
