import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { ErrorBox, Field, PageHeader, useApi } from '../../components/ui.jsx';
import Icon from '../../components/Icon.jsx';
import { addDays, GST_RATES, inrExact, isoDay, MODE_LABEL, today } from '../../lib/format.js';
import { CustomerForm } from './Customers.jsx';

const blankLine = () => ({ key: Math.random().toString(36).slice(2), itemId: '', name: '', hsn: '', unit: 'pcs', qty: 1, rate: '', taxRate: 5 });

// Same maths as the server (server is the final authority).
function calc(lines, discount, interState) {
  const gross = lines.map((l) => Math.round((Number(l.qty) || 0) * (Number(l.rate) || 0) * 100) / 100);
  const subtotal = gross.reduce((a, b) => a + b, 0);
  const disc = Math.min(Number(discount) || 0, subtotal);
  const factor = subtotal > 0 ? (subtotal - disc) / subtotal : 1;
  const tax = lines.reduce((a, l, i) => a + Math.round(gross[i] * factor * (Number(l.taxRate) || 0)) / 100, 0);
  const raw = subtotal - disc + tax;
  const total = Math.round(raw);
  return { gross, subtotal, disc, tax, cgst: interState ? 0 : tax / 2, sgst: interState ? 0 : tax / 2, igst: interState ? tax : 0, roundOff: total - raw, total };
}

// kind: 'invoice' | 'quotation'
export default function DocEditor({ kind }) {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { me } = useAuth();
  const isInvoice = kind === 'invoice';
  const base = isInvoice ? '/invoices' : '/quotations';
  const customers = useApi('/customers?limit=500');
  const items = useApi('/items');
  const accounts = useApi(isInvoice && me.permissions.accounts?.view ? '/finance/accounts' : null);
  const [loaded, setLoaded] = useState(!id);
  const [f, setF] = useState({
    customerId: params.get('customer') || '',
    date: today(),
    dueDate: isInvoice ? addDays(today(), 15) : '',
    validTill: isInvoice ? '' : addDays(today(), 15),
    interState: false,
    discount: '',
    notes: '',
  });
  const [lines, setLines] = useState([blankLine()]);
  const [paidNow, setPaidNow] = useState({ on: false, amount: '', mode: 'cash', accountId: '' });
  const [addingCustomer, setAddingCustomer] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const r = await api(`${base}/${id}`);
        const d = r.invoice || r.quotation;
        setF({
          customerId: d.customerId, date: isoDay(d.date), dueDate: isoDay(d.dueDate), validTill: isoDay(d.validTill),
          interState: d.interState, discount: Number(d.discount) || '', notes: d.notes || '',
        });
        setLines(d.items.map((l) => ({ key: l.id, itemId: l.itemId || '', name: l.name, hsn: l.hsn || '', unit: l.unit || 'pcs', qty: Number(l.qty), rate: Number(l.rate), taxRate: Number(l.taxRate) })));
        setLoaded(true);
      } catch (x) {
        setErr(x.message);
      }
    })();
  }, [id, base]);

  const t = useMemo(() => calc(lines, f.discount, f.interState), [lines, f.discount, f.interState]);
  const customer = (customers.data?.customers || []).find((c) => c.id === f.customerId);

  const setLine = (key, patch) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const options = useMemo(() => (items.data?.items || []).flatMap((it) => (it.variants?.length
    ? it.variants.map((v) => ({ value: `${it.id}|${v.id}`, label: `${it.name} – ${v.name}`, it, name: `${it.name} (${v.name})`, rate: Number(v.price) }))
    : [{ value: it.id, label: it.name, it, name: it.name, rate: Number(it.price) }])), [items.data]);
  const pickItem = (key, value) => {
    const o = options.find((x) => x.value === value);
    if (!o) return setLine(key, { itemId: '', pick: '' });
    setLine(key, { itemId: o.it.id, pick: value, name: o.name, hsn: o.it.hsn || '', unit: o.it.unit, rate: o.rate, taxRate: Number(o.it.taxRate) });
  };

  const save = async (e) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const body = {
        ...f,
        discount: Number(f.discount) || 0,
        items: lines.filter((l) => l.name.trim()).map(({ key, pick, ...l }) => ({ ...l, itemId: l.itemId || null, qty: Number(l.qty), rate: Number(l.rate) || 0, taxRate: Number(l.taxRate) })),
      };
      if (isInvoice && !id && paidNow.on) {
        body.paidNow = { amount: Number(paidNow.amount) || t.total, mode: paidNow.mode, accountId: paidNow.accountId || null, date: f.date };
      }
      const r = await api(id ? `${base}/${id}` : base, { method: id ? 'PUT' : 'POST', body });
      const doc = r.invoice || r.quotation;
      navigate(`/sales/${isInvoice ? 'invoices' : 'quotations'}/${doc.id}`);
    } catch (x) {
      setErr(x.message);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setBusy(false);
    }
  };

  if (!loaded) return <p className="text-muted">{err || 'Loading…'}</p>;
  const title = `${id ? 'Edit' : 'New'} ${isInvoice ? 'GST Invoice' : 'Quotation'}`;

  return (
    <>
    <form onSubmit={save} className="flex flex-col gap-5">
      <Link to={`/sales/${isInvoice ? 'invoices' : 'quotations'}`} className="text-sm font-semibold text-brand">← {isInvoice ? 'Invoices' : 'Quotations'}</Link>
      <PageHeader title={title} />
      <ErrorBox>{err}</ErrorBox>

      <section className="card p-5 grid grid-cols-1 md:grid-cols-4 gap-4">
        <Field label="Customer" id="d-cust" className="md:col-span-2">
          <div className="flex gap-2">
            <select id="d-cust" required className="input" value={f.customerId} onChange={(e) => setF({ ...f, customerId: e.target.value })}>
              <option value="">Select customer</option>
              {(customers.data?.customers || []).map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ''}</option>)}
            </select>
            {me.permissions.sales.add && <button type="button" className="btn-ghost px-3 shrink-0" onClick={() => setAddingCustomer(true)}><Icon name="plus" size={18} /> New</button>}
          </div>
          {customer && (customer.gstin || customer.state) && <p className="text-xs text-muted mt-1">{customer.gstin ? `GSTIN ${customer.gstin}` : ''} {customer.state ? `· ${customer.state}` : ''}</p>}
        </Field>
        <Field label={isInvoice ? 'Invoice date' : 'Quotation date'} id="d-date"><input id="d-date" type="date" required className="input" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        {isInvoice ? (
          <Field label="Due date" id="d-due"><input id="d-due" type="date" className="input" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></Field>
        ) : (
          <Field label="Valid till" id="d-valid"><input id="d-valid" type="date" className="input" value={f.validTill} onChange={(e) => setF({ ...f, validTill: e.target.value })} /></Field>
        )}
        <label className="md:col-span-4 flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" className="w-5 h-5 accent-brand" checked={f.interState} onChange={(e) => setF({ ...f, interState: e.target.checked })} />
          Customer vere state lo unnaru (IGST). Lekapothe CGST + SGST.
        </label>
      </section>

      <section className="card p-5 flex flex-col gap-3">
        <h2 className="font-bold">Items</h2>
        <div className="flex flex-col gap-3">
          {lines.map((l, i) => (
            <div key={l.key} className="grid grid-cols-2 md:grid-cols-12 gap-2.5 items-end border border-gray-100 rounded-xl p-3">
              <Field label={`Item ${i + 1}`} id={`li-${l.key}`} className="col-span-2 md:col-span-4">
                <select className="input mb-2" aria-label="Pick from items list" value={l.pick ?? l.itemId} onChange={(e) => pickItem(l.key, e.target.value)}>
                  <option value="">Type below or pick from list</option>
                  {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <input id={`li-${l.key}`} className="input" placeholder="Item / service name" value={l.name} onChange={(e) => setLine(l.key, { name: e.target.value })} />
              </Field>
              <Field label="HSN" id={`lh-${l.key}`} className="md:col-span-1"><input id={`lh-${l.key}`} className="input px-2" value={l.hsn} onChange={(e) => setLine(l.key, { hsn: e.target.value })} /></Field>
              <Field label="Qty" id={`lq-${l.key}`} className="md:col-span-1"><input id={`lq-${l.key}`} type="number" min="0.001" step="any" className="input px-2" value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value })} /></Field>
              <Field label="Rate ₹" id={`lr-${l.key}`} className="md:col-span-2"><input id={`lr-${l.key}`} type="number" min="0" step="0.01" className="input" value={l.rate} onChange={(e) => setLine(l.key, { rate: e.target.value })} /></Field>
              <Field label="GST" id={`lt-${l.key}`} className="md:col-span-1">
                <select id={`lt-${l.key}`} className="input px-2" value={l.taxRate} onChange={(e) => setLine(l.key, { taxRate: e.target.value })}>{GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}</select>
              </Field>
              <div className="md:col-span-2 text-right">
                <span className="text-xs text-muted block">Amount</span>
                <span className="font-bold">{inrExact(t.gross[i])}</span>
              </div>
              <div className="md:col-span-1 text-right">
                <button type="button" aria-label={`Remove item ${i + 1}`} disabled={lines.length === 1} onClick={() => setLines(lines.filter((x) => x.key !== l.key))} className="w-11 h-11 rounded-xl text-red-700 hover:bg-red-50 disabled:opacity-30 inline-flex items-center justify-center">
                  <Icon name="close" />
                </button>
              </div>
            </div>
          ))}
        </div>
        <button type="button" className="btn-ghost self-start" onClick={() => setLines([...lines, blankLine()])}><Icon name="plus" size={18} /> Add item</button>
      </section>

      <div className="grid lg:grid-cols-2 gap-4">
        <section className="card p-5 flex flex-col gap-4">
          <Field label="Notes (invoice lo kanipistundi)" id="d-notes"><textarea id="d-notes" rows={3} className="input h-auto py-2.5" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
          {isInvoice && !id && (
            <div className="flex flex-col gap-3 rounded-xl bg-green-50 p-4">
              <label className="flex items-center gap-2 font-semibold text-sm">
                <input type="checkbox" className="w-5 h-5 accent-brand" checked={paidNow.on} onChange={(e) => setPaidNow({ ...paidNow, on: e.target.checked, amount: e.target.checked ? t.total : '' })} />
                Payment ippude vachindi
              </label>
              {paidNow.on && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Field label="Amount" id="pn-amt"><input id="pn-amt" type="number" min="1" step="0.01" className="input" value={paidNow.amount} onChange={(e) => setPaidNow({ ...paidNow, amount: e.target.value })} /></Field>
                  <Field label="Mode" id="pn-mode">
                    <select id="pn-mode" className="input" value={paidNow.mode} onChange={(e) => setPaidNow({ ...paidNow, mode: e.target.value })}>{Object.entries(MODE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                  </Field>
                  {accounts.data?.accounts?.length > 0 && (
                    <Field label="Into account" id="pn-acc">
                      <select id="pn-acc" className="input" value={paidNow.accountId} onChange={(e) => setPaidNow({ ...paidNow, accountId: e.target.value })}>
                        <option value="">Auto</option>
                        {accounts.data.accounts.filter((a) => a.active).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                    </Field>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
        <section className="card p-5 flex flex-col gap-2 text-sm">
          <div className="flex justify-between"><span>Subtotal</span><span className="font-semibold">{inrExact(t.subtotal)}</span></div>
          <div className="flex justify-between items-center gap-3">
            <label htmlFor="d-disc">Discount (₹)</label>
            <input id="d-disc" type="number" min="0" step="0.01" className="input h-9 w-32 text-right" value={f.discount} onChange={(e) => setF({ ...f, discount: e.target.value })} />
          </div>
          {f.interState ? (
            <div className="flex justify-between"><span>IGST</span><span>{inrExact(t.igst)}</span></div>
          ) : (
            <>
              <div className="flex justify-between"><span>CGST</span><span>{inrExact(t.cgst)}</span></div>
              <div className="flex justify-between"><span>SGST</span><span>{inrExact(t.sgst)}</span></div>
            </>
          )}
          <div className="flex justify-between text-muted"><span>Round off</span><span>{inrExact(t.roundOff)}</span></div>
          <div className="flex justify-between text-xl font-extrabold border-t border-line pt-3 mt-1"><span>Total</span><span>{inrExact(t.total)}</span></div>
          <button type="submit" className="btn-primary mt-3 h-12 text-base" disabled={busy}>{busy ? 'Saving…' : `Save ${isInvoice ? 'Invoice' : 'Quotation'}`}</button>
        </section>
      </div>
    </form>

      {addingCustomer && (
        <CustomerForm
          onClose={() => setAddingCustomer(false)}
          onSaved={async (c) => { setAddingCustomer(false); await customers.reload(); setF((x) => ({ ...x, customerId: c.id })); }}
        />
      )}
    </>
  );
}
