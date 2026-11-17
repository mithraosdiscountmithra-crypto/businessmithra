import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { Badge, Empty, ErrorBox, Field, Modal, OPS_NAV, PageHeader, RangePicker, SubNav, useApi } from '../../components/ui.jsx';
import Icon from '../../components/Icon.jsx';
import { fmtDate, GST_RATES, inr, inrExact, MODE_LABEL, monthStart, today } from '../../lib/format.js';
import { SupplierForm } from './Suppliers.jsx';

const blank = () => ({ key: Math.random().toString(36).slice(2), pick: '', itemId: '', variantId: '', name: '', hsn: '', unit: 'pcs', qty: 1, rate: '', taxRate: 5 });

function calc(lines, discount, interState) {
  const gross = lines.map((l) => (Number(l.qty) || 0) * (Number(l.rate) || 0));
  const sub = gross.reduce((a, b) => a + b, 0);
  const disc = Math.min(Number(discount) || 0, sub);
  const f = sub > 0 ? (sub - disc) / sub : 1;
  const tax = lines.reduce((a, l, i) => a + gross[i] * f * ((Number(l.taxRate) || 0) / 100), 0);
  const raw = sub - disc + tax;
  return { sub, disc, tax, total: Math.round(raw), interState };
}

function BillEditor({ kind, onClose, onSaved }) {
  const suppliers = useApi('/suppliers');
  const items = useApi('/items');
  const [f, setF] = useState({ supplierId: '', billNo: '', date: today(), dueDate: '', interState: false, discount: '', notes: '' });
  const [lines, setLines] = useState([blank()]);
  const [pay, setPay] = useState({ on: false, amount: '', mode: 'cash' });
  const [newSup, setNewSup] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const setLine = (key, p) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...p } : l)));
  const options = useMemo(() => (items.data?.items || []).flatMap((it) => (it.variants?.length
    ? it.variants.map((v) => ({ value: `${it.id}|${v.id}`, it, variantId: v.id, name: `${it.name} (${v.name})` }))
    : [{ value: it.id, it, variantId: '', name: it.name }])), [items.data]);
  const pick = (key, value) => {
    const o = options.find((x) => x.value === value);
    if (!o) return setLine(key, { pick: '', itemId: '', variantId: '' });
    setLine(key, { pick: value, itemId: o.it.id, variantId: o.variantId, name: o.name, hsn: o.it.hsn || '', unit: o.it.unit, taxRate: Number(o.it.taxRate), rate: Number(o.it.costPrice) || '' });
  };
  const t = calc(lines, f.discount, f.interState);
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await api('/purchases', { method: 'POST', body: {
        ...f, kind, discount: Number(f.discount) || 0,
        items: lines.filter((l) => l.name.trim()).map(({ key, pick: _p, ...l }) => ({ ...l, itemId: l.itemId || null, variantId: l.variantId || null, qty: Number(l.qty), rate: Number(l.rate) || 0, taxRate: Number(l.taxRate) })),
        paidNow: pay.on ? { amount: Number(pay.amount || t.total), mode: pay.mode } : null,
      } });
      onSaved();
    } catch (x) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  };
  const isBill = kind === 'bill';
  return (
    <Modal title={isBill ? 'New purchase bill' : 'Return goods to supplier'} onClose={onClose} wide>
      <form onSubmit={save} className="flex flex-col gap-4">
        <ErrorBox>{err}</ErrorBox>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Supplier" id="pb-s">
            <div className="flex gap-2">
              <select id="pb-s" required className="input" value={f.supplierId} onChange={set('supplierId')}>
                <option value="">Select supplier</option>
                {(suppliers.data?.suppliers || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <button type="button" className="btn-ghost h-11 px-3 shrink-0" onClick={() => setNewSup(true)}>+ New</button>
            </div>
          </Field>
          <Field label={isBill ? 'Supplier bill no.' : 'Reference no.'} id="pb-no"><input id="pb-no" className="input" value={f.billNo} onChange={set('billNo')} /></Field>
          <Field label="Date" id="pb-d"><input id="pb-d" type="date" required className="input" value={f.date} onChange={set('date')} /></Field>
          {isBill && <Field label="Pay by (optional)" id="pb-due"><input id="pb-due" type="date" className="input" value={f.dueDate} onChange={set('dueDate')} /></Field>}
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" className="w-5 h-5 accent-brand" checked={f.interState} onChange={set('interState')} /> Supplier vere state (IGST)</label>
        <div className="flex flex-col gap-3">
          {lines.map((l) => (
            <div key={l.key} className="grid grid-cols-12 gap-2 items-end border border-line rounded-xl p-3">
              <Field label="Item" id={`pl-${l.key}`} className="col-span-12 md:col-span-5">
                <select id={`pl-${l.key}`} className="input mb-2" value={l.pick} onChange={(e) => pick(l.key, e.target.value)}>
                  <option value="">Pick item (stock update avtundi)</option>
                  {options.map((o) => <option key={o.value} value={o.value}>{o.name}</option>)}
                </select>
                <input aria-label="Item name" className="input" placeholder="Or type name" value={l.name} onChange={(e) => setLine(l.key, { name: e.target.value })} />
              </Field>
              <Field label="Qty" id={`pq-${l.key}`} className="col-span-4 md:col-span-2"><input id={`pq-${l.key}`} type="number" min="0.001" step="any" className="input px-2" value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value })} /></Field>
              <Field label="Rate ₹ (GST lekunda)" id={`pr-${l.key}`} className="col-span-4 md:col-span-2"><input id={`pr-${l.key}`} type="number" min="0" step="0.01" className="input px-2" value={l.rate} onChange={(e) => setLine(l.key, { rate: e.target.value })} /></Field>
              <Field label="GST" id={`pt-${l.key}`} className="col-span-3 md:col-span-2">
                <select id={`pt-${l.key}`} className="input px-2" value={l.taxRate} onChange={(e) => setLine(l.key, { taxRate: e.target.value })}>{GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}</select>
              </Field>
              <button type="button" aria-label="Remove line" className="col-span-1 h-11 text-red-700 font-bold text-lg" onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : ls))}>×</button>
            </div>
          ))}
          <button type="button" className="btn-ghost self-start" onClick={() => setLines((ls) => [...ls, blank()])}><Icon name="plus" size={16} /> Add line</button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
          <Field label="Discount ₹" id="pb-disc"><input id="pb-disc" type="number" min="0" step="0.01" className="input" value={f.discount} onChange={set('discount')} /></Field>
          <div className="text-sm flex flex-col gap-1 bg-gray-50 rounded-xl p-3">
            <div className="flex justify-between"><span>Subtotal</span><span>{inrExact(t.sub - t.disc)}</span></div>
            <div className="flex justify-between"><span>GST</span><span>{inrExact(t.tax)}</span></div>
            <div className="flex justify-between font-bold text-base"><span>Total</span><span>{inr(t.total)}</span></div>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" className="w-5 h-5 accent-brand" checked={pay.on} onChange={(e) => setPay({ ...pay, on: e.target.checked })} /> {isBill ? 'Ippude payment chesam' : 'Supplier money tirigi ichharu'}</label>
        {pay.on && (
          <div className="grid grid-cols-2 gap-4">
            <Field label="Amount ₹" id="pb-pa"><input id="pb-pa" type="number" min="0.01" step="0.01" className="input" placeholder={String(t.total)} value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} /></Field>
            <Field label="Mode" id="pb-pm"><select id="pb-pm" className="input" value={pay.mode} onChange={(e) => setPay({ ...pay, mode: e.target.value })}>{Object.entries(MODE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          </div>
        )}
        <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Saving…' : isBill ? 'Save bill (stock add avtundi)' : 'Save return (stock taggutundi)'}</button>
      </form>
      {newSup && <SupplierForm onClose={() => setNewSup(false)} onSaved={(s) => { setNewSup(false); suppliers.reload(); setF((x) => ({ ...x, supplierId: s.id })); }} />}
    </Modal>
  );
}

function BillView({ id, onClose, onChanged }) {
  const { me } = useAuth();
  const can = me.permissions.operations || {};
  const { data, error, reload } = useApi(`/purchases/${id}`);
  const [pay, setPay] = useState({ amount: '', mode: 'cash', date: today() });
  const [err, setErr] = useState('');
  const b = data?.bill;
  const due = b ? Number(b.total) - Number(b.amountPaid) : 0;
  const addPay = async (e) => {
    e.preventDefault();
    setErr('');
    try {
      await api(`/purchases/${id}/payments`, { method: 'POST', body: { ...pay, amount: Number(pay.amount) } });
      setPay({ ...pay, amount: '' });
      reload();
      onChanged();
    } catch (x) {
      setErr(x.message);
    }
  };
  const remove = async () => {
    if (!window.confirm('Delete this bill? Stock and payments will be undone.')) return;
    try {
      await api(`/purchases/${id}`, { method: 'DELETE' });
      onChanged();
      onClose();
    } catch (x) {
      setErr(x.message);
    }
  };
  return (
    <Modal title={b ? `${b.kind === 'bill' ? 'Purchase' : 'Return'} · ${b.supplier.name}` : 'Bill'} onClose={onClose} wide>
      <ErrorBox>{error || err}</ErrorBox>
      {!b ? <p className="text-muted">Loading…</p> : (
        <div className="flex flex-col gap-4 text-sm">
          <p>{fmtDate(b.date)}{b.billNo && ` · No. ${b.billNo}`} · <Badge status={b.status} /></p>
          <table className="w-full">
            <thead><tr className="text-left text-muted border-b border-line"><th className="p-2">Item</th><th className="p-2 text-right">Qty</th><th className="p-2 text-right">Rate</th><th className="p-2 text-right">GST</th><th className="p-2 text-right">Amount</th></tr></thead>
            <tbody>{b.items.map((i) => <tr key={i.id} className="border-t border-gray-100"><td className="p-2">{i.name}</td><td className="p-2 text-right">{Number(i.qty)}</td><td className="p-2 text-right">{inrExact(i.rate)}</td><td className="p-2 text-right">{Number(i.taxRate)}%</td><td className="p-2 text-right">{inrExact(i.amount)}</td></tr>)}</tbody>
          </table>
          <div className="self-end w-60 flex flex-col gap-1">
            <div className="flex justify-between"><span>GST</span><span>{inrExact(b.taxTotal)}</span></div>
            <div className="flex justify-between font-bold"><span>Total</span><span>{inr(b.total)}</span></div>
            <div className="flex justify-between"><span>{b.kind === 'bill' ? 'Paid' : 'Refund received'}</span><span>{inr(b.amountPaid)}</span></div>
            <div className="flex justify-between font-bold text-red-700"><span>Balance</span><span>{inr(due)}</span></div>
          </div>
          {data.payments.length > 0 && <ul className="text-xs text-muted">{data.payments.map((p) => <li key={p.id}>{fmtDate(p.date)} · {inr(p.amount)} · {MODE_LABEL[p.mode] || p.mode}</li>)}</ul>}
          {can.add && due > 0.009 && (
            <form onSubmit={addPay} className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end border-t border-line pt-3">
              <Field label="Amount ₹" id="bp-a"><input id="bp-a" type="number" min="0.01" step="0.01" required className="input" placeholder={String(due)} value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} /></Field>
              <Field label="Mode" id="bp-m"><select id="bp-m" className="input" value={pay.mode} onChange={(e) => setPay({ ...pay, mode: e.target.value })}>{Object.entries(MODE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
              <Field label="Date" id="bp-d"><input id="bp-d" type="date" className="input" value={pay.date} onChange={(e) => setPay({ ...pay, date: e.target.value })} /></Field>
              <button type="submit" className="btn-primary">{b.kind === 'bill' ? 'Record payment' : 'Record refund'}</button>
            </form>
          )}
          {can.delete && <button type="button" className="text-red-700 text-sm font-semibold self-start" onClick={remove}>Delete bill</button>}
        </div>
      )}
    </Modal>
  );
}

export default function Purchases({ kind = 'bill' }) {
  const { me } = useAuth();
  const can = me.permissions.operations || {};
  const [params] = useSearchParams();
  const supplier = params.get('supplier') || '';
  const [range, setRange] = useState({ from: supplier ? '2000-01-01' : monthStart(), to: today() });
  const [dueOnly, setDueOnly] = useState(false);
  const { data, error, loading, reload } = useApi(`/purchases?kind=${kind}&from=${range.from}&to=${range.to}&supplierId=${supplier}${dueOnly ? '&status=due' : ''}`);
  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState(null);
  const bills = data?.bills || [];
  const total = bills.reduce((a, b) => a + Number(b.total), 0);
  const due = bills.reduce((a, b) => a + Number(b.total) - Number(b.amountPaid), 0);
  const isBill = kind === 'bill';
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Operations" subtitle="Stock, purchases, suppliers">
        {can.add && <button type="button" className="btn-primary" onClick={() => setCreating(true)}><Icon name="plus" size={18} /> {isBill ? 'New Purchase' : 'New Return'}</button>}
      </PageHeader>
      <SubNav items={OPS_NAV} />
      <RangePicker value={range} onChange={setRange} />
      <div className="flex flex-wrap gap-4 items-center text-sm">
        {isBill && <label className="flex items-center gap-2 font-semibold"><input type="checkbox" className="w-5 h-5 accent-brand" checked={dueOnly} onChange={(e) => setDueOnly(e.target.checked)} /> Pay cheyyalsinavi matrame</label>}
        {data && <p className="font-semibold">Total: {inr(total)} · Balance: <span className="text-red-700">{inr(due)}</span></p>}
      </div>
      <ErrorBox>{error}</ErrorBox>
      {!loading && bills.length === 0 ? (
        <Empty title={isBill ? 'Purchase bills levu' : 'Returns levu'} text={isBill ? 'Supplier nunchi saamaanu vachinappudu bill add cheyyandi – stock auto ga perugutundi, supplier ki entha ivvali track avtundi.' : 'Damaged / wrong saamaanu supplier ki tirigi pampithe ikkada add cheyyandi.'} />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead><tr className="text-left text-muted border-b border-line"><th className="p-3">Date</th><th className="p-3">Supplier</th><th className="p-3">Status</th><th className="p-3 text-right">Total</th><th className="p-3 text-right">Balance</th></tr></thead>
            <tbody>
              {bills.map((b) => (
                <tr key={b.id} className="border-t border-gray-100 cursor-pointer hover:bg-gray-50" onClick={() => setViewing(b.id)}>
                  <td className="p-3 whitespace-nowrap">{fmtDate(b.date)}</td>
                  <td className="p-3"><button type="button" className="font-semibold text-left">{b.supplier.name}</button>{b.billNo && <span className="block text-xs text-muted">No. {b.billNo}</span>}</td>
                  <td className="p-3"><Badge status={b.status} /></td>
                  <td className="p-3 text-right font-bold">{inr(b.total)}</td>
                  <td className="p-3 text-right">{inr(Number(b.total) - Number(b.amountPaid))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {creating && <BillEditor kind={kind} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); reload(); }} />}
      {viewing && <BillView id={viewing} onClose={() => setViewing(null)} onChanged={reload} />}
    </div>
  );
}
