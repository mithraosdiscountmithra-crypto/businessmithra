import { useMemo, useState } from 'react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { Empty, ErrorBox, Field, Modal, OPS_NAV, PageHeader, Stat, SubNav, useApi } from '../../components/ui.jsx';
import { fmtDateTime, inr } from '../../lib/format.js';
import { downloadCsv } from '../../lib/csv.js';

const REASON = { opening: 'Opening stock', purchase: 'Purchase', sale: 'Sale (bill)', order: 'Online order', return: 'Customer return', purchase_return: 'Return to supplier', adjust: 'Adjustment' };

function Adjust({ row, onClose, onSaved }) {
  const [dir, setDir] = useState('add');
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await api('/stock/adjust', { method: 'POST', body: { itemId: row.itemId, variantId: row.variantId, qty: (dir === 'add' ? 1 : -1) * Number(qty), note } });
      onSaved();
    } catch (x) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={`Adjust stock · ${row.name}`} onClose={onClose}>
      <form onSubmit={save} className="flex flex-col gap-4">
        <ErrorBox>{err}</ErrorBox>
        <p className="text-sm">Ippudu: <b>{row.stock} {row.unit}</b></p>
        <div className="grid grid-cols-2 gap-2">
          {[['add', '+ Add (vachindi)'], ['remove', '− Remove (damage / lost)']].map(([k, l]) => (
            <button key={k} type="button" onClick={() => setDir(k)} className={`h-11 rounded-xl border font-semibold text-sm ${dir === k ? 'bg-brand text-white border-brand' : 'border-line'}`}>{l}</button>
          ))}
        </div>
        <Field label="Quantity" id="adj-q"><input id="adj-q" type="number" min="0.001" step="any" required className="input" value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
        <Field label="Reason (optional)" id="adj-n"><input id="adj-n" className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Damaged, count correction" /></Field>
        <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      </form>
    </Modal>
  );
}

function History({ row, onClose }) {
  const { data, error } = useApi(`/stock/moves/${row.itemId}`);
  const moves = (data?.moves || []).filter((m) => !row.variantId || m.variantId === row.variantId);
  return (
    <Modal title={`Stock history · ${row.name}`} onClose={onClose} wide>
      <ErrorBox>{error}</ErrorBox>
      {!data ? <p className="text-muted">Loading…</p> : moves.length === 0 ? <p className="text-muted">Inka entries levu.</p> : (
        <table className="w-full text-sm">
          <thead><tr className="text-left text-muted border-b border-line"><th className="p-2">When</th><th className="p-2">Type</th><th className="p-2 text-right">Qty</th></tr></thead>
          <tbody>
            {moves.map((m) => (
              <tr key={m.id} className="border-t border-gray-100">
                <td className="p-2 whitespace-nowrap">{fmtDateTime(m.createdAt)}</td>
                <td className="p-2">{REASON[m.reason] || m.reason}{m.note && !m.note.startsWith('invoice:') && <span className="block text-xs text-muted">{m.note}</span>}</td>
                <td className={`p-2 text-right font-bold ${Number(m.qty) < 0 ? 'text-red-700' : 'text-green-800'}`}>{Number(m.qty) > 0 ? '+' : ''}{Number(m.qty)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  );
}

export default function Stock() {
  const { me } = useAuth();
  const can = me.permissions.operations || {};
  const { data, error, loading, reload } = useApi('/stock');
  const [q, setQ] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const [adj, setAdj] = useState(null);
  const [hist, setHist] = useState(null);
  const rows = useMemo(() => (data?.rows || []).filter((r) => (!lowOnly || r.isLow) && r.name.toLowerCase().includes(q.toLowerCase())), [data, q, lowOnly]);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Operations" subtitle="Stock, purchases, suppliers">
        {rows.length > 0 && <button type="button" className="btn-ghost" onClick={() => downloadCsv('stock', ['Item', 'Category', 'Stock', 'Unit', 'Cost', 'Value', 'Low'], rows.map((r) => [r.name, r.category, r.stock, r.unit, r.costPrice, r.value, r.isLow ? 'YES' : '']))}>⬇️ Excel</button>}
      </PageHeader>
      <SubNav items={OPS_NAV} />
      <ErrorBox>{error}</ErrorBox>
      {data && (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <Stat label="Items tracked" value={data.totals.items} />
          <Stat label="Stock value (cost)" value={inr(data.totals.value)} />
          <Stat label="Low stock" value={data.totals.low} tone={data.totals.low ? 'text-red-700' : ''} />
        </div>
      )}
      <div className="flex flex-wrap gap-3 items-center">
        <label className="sr-only" htmlFor="sq">Search</label>
        <input id="sq" className="input h-10 max-w-xs" placeholder="Search item" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" className="w-5 h-5 accent-brand" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} /> Low stock only</label>
      </div>
      {!loading && data?.rows?.length === 0 ? (
        <Empty title="Stock track chese items levu" text='Sales → Items & Services lo item edit chesi "Stock track cheyyi" on cheyyandi. Opening stock ivvandi.' />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-muted border-b border-line">
                <th className="p-3 font-semibold">Item</th><th className="p-3 font-semibold text-right">In stock</th><th className="p-3 font-semibold text-right">Cost</th>
                <th className="p-3 font-semibold text-right">Value</th><th className="p-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.itemId}-${r.variantId}`} className="border-t border-gray-100">
                  <td className="p-3 font-semibold">{r.name}{r.isLow && <span className="ml-2 text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-800">{r.stock <= 0 ? 'Out of stock' : 'Low'}</span>}</td>
                  <td className={`p-3 text-right font-bold ${r.isLow ? 'text-red-700' : ''}`}>{r.stock} {r.unit}</td>
                  <td className="p-3 text-right">{r.costPrice ? inr(r.costPrice) : '—'}</td>
                  <td className="p-3 text-right">{r.value ? inr(r.value) : '—'}</td>
                  <td className="p-3 text-right whitespace-nowrap">
                    <button type="button" className="text-xs font-semibold text-gray-700" onClick={() => setHist(r)}>History</button>
                    {can.edit && <button type="button" className="text-xs font-semibold text-brand ml-3" onClick={() => setAdj(r)}>Adjust</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {adj && <Adjust row={adj} onClose={() => setAdj(null)} onSaved={() => { setAdj(null); reload(); }} />}
      {hist && <History row={hist} onClose={() => setHist(null)} />}
    </div>
  );
}
