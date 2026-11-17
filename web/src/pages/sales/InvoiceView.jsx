import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { Badge, ErrorBox, Field, Modal, invoiceDisplayStatus, useApi } from '../../components/ui.jsx';
import InvoicePaper from '../../components/InvoicePaper.jsx';
import { fmtDate, inr, inrExact, MODE_LABEL, today, waLink } from '../../lib/format.js';
import { downloadBillPdf, shareBillPdf } from '../../lib/billPdf.js';

function PaymentForm({ invoice, onClose, onSaved }) {
  const { me } = useAuth();
  const accounts = useApi(me.permissions.accounts?.view ? '/finance/accounts' : null);
  const due = Number(invoice.total) - Number(invoice.amountPaid);
  const [f, setF] = useState({ amount: due, date: today(), mode: 'upi', accountId: '', reference: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async (e) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const r = await api(`/invoices/${invoice.id}/payments`, { method: 'POST', body: { ...f, amount: Number(f.amount) } });
      onSaved(r.invoice);
    } catch (x) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={`Record payment · ${invoice.number}`} onClose={onClose}>
      <form onSubmit={save} className="flex flex-col gap-4">
        <ErrorBox>{err}</ErrorBox>
        <p className="text-sm">Balance due: <strong>{inrExact(due)}</strong></p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Amount (₹)" id="p-amt"><input id="p-amt" type="number" min="1" step="0.01" required className="input" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
          <Field label="Date" id="p-date"><input id="p-date" type="date" required className="input" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
          <Field label="Mode" id="p-mode">
            <select id="p-mode" className="input" value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value })}>{Object.entries(MODE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </Field>
          {accounts.data?.accounts?.length > 0 && (
            <Field label="Into account" id="p-acc">
              <select id="p-acc" className="input" value={f.accountId} onChange={(e) => setF({ ...f, accountId: e.target.value })}>
                <option value="">Auto (by mode)</option>
                {accounts.data.accounts.filter((a) => a.active).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </Field>
          )}
          <Field label="Reference (UPI ref / cheque no.)" id="p-ref" className="sm:col-span-2"><input id="p-ref" className="input" value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} /></Field>
        </div>
        <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save payment'}</button>
      </form>
    </Modal>
  );
}

export default function InvoiceView() {
  const { id } = useParams();
  const { me } = useAuth();
  const can = me.permissions.sales;
  const { data, error, setData } = useApi(`/invoices/${id}`);
  const [paying, setPaying] = useState(false);
  const wa = useApi('/invoices/wa-config');
  const [sent, setSent] = useState('');
  const [err, setErr] = useState('');

  if (error) return <ErrorBox>{error}</ErrorBox>;
  if (!data) return <p className="text-muted">Loading…</p>;
  const { invoice: inv, business } = data;
  const status = invoiceDisplayStatus(inv);
  const due = Number(inv.total) - Number(inv.amountPaid);
  const shareUrl = `${window.location.origin}/i/${inv.shareToken}`;
  const msg = `Namaste ${inv.customer.name} garu,\n${business.name} nunchi invoice ${inv.number}\nTotal: ${inr(inv.total)}${due > 0 ? `\nBalance due: ${inr(due)}` : '\nFully paid. Thank you!'}\n\nInvoice chudandi: ${shareUrl}`;

  const act = async (fn) => {
    setErr('');
    try {
      const r = await fn();
      if (r?.invoice) setData({ ...data, invoice: r.invoice });
    } catch (x) {
      setErr(x.message);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex flex-col gap-1">
          <Link to="/sales/invoices" className="text-sm font-semibold text-brand">← Invoices</Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-extrabold">{inv.number}</h1>
            <Badge status={status} />
          </div>
          <p className="text-sm text-muted"><Link to={`/sales/customers/${inv.customer.id}`} className="font-semibold text-brand">{inv.customer.name}</Link> · {fmtDate(inv.date)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {can.add && inv.status !== 'cancelled' && due > 0 && <button type="button" className="btn-primary" onClick={() => setPaying(true)}>Record payment</button>}
          <a className="btn bg-green-100 text-green-800 hover:bg-green-200" href={waLink(inv.customer.phone, msg)} target="_blank" rel="noreferrer">💬 WhatsApp text</a>
          {wa.data?.autoSend && inv.customer.phone && (
            <button type="button" className="btn bg-green-700 text-white hover:bg-green-800" onClick={() => { setErr(''); setSent('sending'); api(`/invoices/${inv.id}/send-whatsapp`, { method: 'POST', body: {} }).then(() => setSent('sent')).catch((x) => { setSent(''); setErr(x.message); }); }}>
              {sent === 'sending' ? 'Sending…' : sent === 'sent' ? '✅ PDF sent' : `📤 Send PDF to ${inv.customer.phone}`}
            </button>
          )}
          <button type="button" className="btn bg-green-600 text-white hover:bg-green-700" onClick={() => shareBillPdf(inv, business, { message: `${business.name} – ${inv.number} – ${inr(inv.total)}` }).catch((x) => setErr(x.message))}>📄 Share PDF</button>
          <button type="button" className="btn-ghost" onClick={() => downloadBillPdf(inv, business).catch((x) => setErr(x.message))}>⬇️ PDF</button>
          <button type="button" className="btn-ghost" onClick={() => window.print()}>Print</button>
          {can.edit && inv.status !== 'cancelled' && <Link className="btn-ghost" to={`/sales/invoices/${inv.id}/edit`}>Edit</Link>}
          {can.delete && inv.status !== 'cancelled' && (
            <button type="button" className="btn-ghost text-red-700" onClick={() => window.confirm('Cancel this invoice? It will not count in sales.') && act(() => api(`/invoices/${inv.id}/cancel`, { method: 'POST' }))}>Cancel invoice</button>
          )}
        </div>
      </div>
      <ErrorBox>{err}</ErrorBox>

      {inv.payments.length > 0 && (
        <section className="card p-4 print:hidden">
          <h2 className="font-bold mb-2">Payments</h2>
          <ul className="divide-y divide-gray-100 text-sm">
            {inv.payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>{fmtDate(p.date)} · {MODE_LABEL[p.mode] || p.mode}{p.account ? ` → ${p.account.name}` : ''}{p.reference ? ` · ${p.reference}` : ''}</span>
                <span className="flex items-center gap-3">
                  <strong>{inrExact(p.amount)}</strong>
                  {can.delete && <button type="button" className="text-xs font-semibold text-red-700 underline" onClick={() => window.confirm('Delete this payment?') && act(() => api(`/invoices/${inv.id}/payments/${p.id}`, { method: 'DELETE' }))}>Delete</button>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <InvoicePaper doc={inv} business={business} kind="invoice" />
      <p className="text-xs text-muted print:hidden">Customer link: <a className="text-brand break-all" href={shareUrl} target="_blank" rel="noreferrer">{shareUrl}</a></p>

      {paying && <PaymentForm invoice={inv} onClose={() => setPaying(false)} onSaved={(i) => { setPaying(false); setData({ ...data, invoice: i }); }} />}
    </div>
  );
}
