import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { Empty, ErrorBox, Field, Modal, PageHeader, SALES_NAV, SubNav, useApi } from '../../components/ui.jsx';
import { fmtDate, inr, inrExact, MODE_LABEL } from '../../lib/format.js';

const SETTLE = { refund: 'Money returned', adjust: 'Adjusted in bill', none: 'Kept as credit' };

// Opened from an invoice: choose items + qty coming back.
export function ReturnForm({ invoice, onClose, onSaved }) {
  const [qty, setQty] = useState({});
  const [settle, setSettle] = useState(Number(invoice.total) - Number(invoice.amountPaid) > 0 ? 'adjust' : 'refund');
  const [mode, setMode] = useState('cash');
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const lines = Object.entries(qty).filter(([, q]) => Number(q) > 0).map(([invoiceItemId, q]) => ({ invoiceItemId, qty: Number(q) }));
      await api('/credit-notes', { method: 'POST', body: { invoiceId: invoice.id, lines, settle, refundMode: mode, notes } });
      onSaved();
    } catch (x) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={`Return · ${invoice.number}`} onClose={onClose} wide>
      <form onSubmit={save} className="flex flex-col gap-4">
        <ErrorBox>{err}</ErrorBox>
        <p className="text-sm text-muted">Customer tirigi icchina items ki quantity ivvandi. Stock tirigi add avtundi, sales report lo taggutundi.</p>
        <div className="flex flex-col gap-2">
          {invoice.items.map((it) => (
            <label key={it.id} className="flex items-center gap-3 text-sm border border-line rounded-xl p-3">
              <span className="flex-1"><b>{it.name}</b><span className="block text-xs text-muted">Billed {Number(it.qty)} × {inrExact(it.rate)}</span></span>
              <input type="number" min="0" max={Number(it.qty)} step="any" aria-label={`Return qty for ${it.name}`} className="input h-10 w-24" value={qty[it.id] ?? ''} onChange={(e) => setQty({ ...qty, [it.id]: e.target.value })} placeholder="0" />
            </label>
          ))}
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-semibold mb-1">Money ela?</legend>
          {Object.entries({ refund: 'Customer ki money tirigi ichham', adjust: 'Ee bill balance lo taggincham', none: 'Emi ivvaledu (store credit)' }).map(([k, l]) => (
            <label key={k} className="flex items-center gap-2 text-sm"><input type="radio" name="settle" className="w-5 h-5 accent-brand" checked={settle === k} onChange={() => setSettle(k)} /> {l}</label>
          ))}
        </fieldset>
        {settle === 'refund' && (
          <Field label="Refund mode" id="rf-m"><select id="rf-m" className="input" value={mode} onChange={(e) => setMode(e.target.value)}>{Object.entries(MODE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        )}
        <Field label="Reason (optional)" id="rf-n"><input id="rf-n" className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Size correct ga ledu" /></Field>
        <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save return'}</button>
      </form>
    </Modal>
  );
}

export default function Returns() {
  const { me } = useAuth();
  const can = me.permissions.sales;
  const { data, error, loading, reload } = useApi('/credit-notes');
  const [err, setErr] = useState('');
  const remove = async (n) => {
    if (!window.confirm(`Delete ${n.number}? Stock and refund will be undone.`)) return;
    try {
      await api(`/credit-notes/${n.id}`, { method: 'DELETE' });
      reload();
    } catch (x) {
      setErr(x.message);
    }
  };
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Sales & Customers" subtitle="Returns (credit notes)" />
      <SubNav items={SALES_NAV} />
      <ErrorBox>{error || err}</ErrorBox>
      {!loading && data?.creditNotes?.length === 0 ? (
        <Empty title="Returns levu" text='Customer saamaanu tirigi isthe, aa invoice open chesi "↩️ Return" button nokkandi.' />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead><tr className="text-left text-muted border-b border-line"><th className="p-3">No.</th><th className="p-3">Customer</th><th className="p-3">Items</th><th className="p-3">Settled</th><th className="p-3 text-right">Amount</th><th className="p-3" /></tr></thead>
            <tbody>
              {(data?.creditNotes || []).map((n) => (
                <tr key={n.id} className="border-t border-gray-100">
                  <td className="p-3 whitespace-nowrap"><b>{n.number}</b><span className="block text-xs text-muted">{fmtDate(n.date)}{n.invoiceNumber && <> · <Link className="text-brand" to={`/sales/invoices/${n.invoiceId}`}>{n.invoiceNumber}</Link></>}</span></td>
                  <td className="p-3">{n.customer.name}</td>
                  <td className="p-3 text-xs">{n.items.map((i) => `${i.name} × ${Number(i.qty)}`).join(', ')}</td>
                  <td className="p-3">{SETTLE[n.settle]}{n.refundMode && ` (${MODE_LABEL[n.refundMode] || n.refundMode})`}</td>
                  <td className="p-3 text-right font-bold">{inr(n.total)}</td>
                  <td className="p-3 text-right">{can.delete && <button type="button" className="text-xs font-semibold text-red-700" onClick={() => remove(n)}>Delete</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
