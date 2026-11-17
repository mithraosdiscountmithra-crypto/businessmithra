import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { Empty, ErrorBox, Field, Modal, OPS_NAV, PageHeader, SubNav, useApi, useForm } from '../../components/ui.jsx';
import Icon from '../../components/Icon.jsx';
import { inr } from '../../lib/format.js';

export function SupplierForm({ supplier, onClose, onSaved }) {
  const [f, , set] = useForm({ name: supplier?.name || '', phone: supplier?.phone || '', gstin: supplier?.gstin || '', address: supplier?.address || '', notes: supplier?.notes || '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setBusy(true);
    setErr('');
    try {
      const r = await api(supplier ? `/suppliers/${supplier.id}` : '/suppliers', { method: supplier ? 'PUT' : 'POST', body: f });
      onSaved(r.supplier);
    } catch (x) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={supplier ? 'Edit supplier' : 'New supplier'} onClose={onClose}>
      <form onSubmit={save} className="flex flex-col gap-4">
        <ErrorBox>{err}</ErrorBox>
        <Field label="Name" id="sp-n"><input id="sp-n" required className="input" value={f.name} onChange={set('name')} /></Field>
        <Field label="Mobile" id="sp-p"><input id="sp-p" inputMode="numeric" maxLength={10} className="input" value={f.phone} onChange={set('phone')} /></Field>
        <Field label="GSTIN (optional)" id="sp-g"><input id="sp-g" maxLength={15} className="input uppercase" value={f.gstin} onChange={set('gstin')} /></Field>
        <Field label="Address" id="sp-a"><input id="sp-a" className="input" value={f.address} onChange={set('address')} /></Field>
        <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      </form>
    </Modal>
  );
}

export default function Suppliers() {
  const { me } = useAuth();
  const can = me.permissions.operations || {};
  const { data, error, loading, reload } = useApi('/suppliers');
  const [editing, setEditing] = useState(null);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Operations" subtitle="Stock, purchases, suppliers">
        {can.add && <button type="button" className="btn-primary" onClick={() => setEditing('new')}><Icon name="plus" size={18} /> Add Supplier</button>}
      </PageHeader>
      <SubNav items={OPS_NAV} />
      <ErrorBox>{error}</ErrorBox>
      {!loading && data?.suppliers?.length === 0 ? (
        <Empty title="Suppliers levu" text="Meeru saamaanu konee wholesale / distributor la details add cheyyandi." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead><tr className="text-left text-muted border-b border-line"><th className="p-3">Supplier</th><th className="p-3 text-right">Total purchases</th><th className="p-3 text-right">Balance to pay</th><th className="p-3" /></tr></thead>
            <tbody>
              {(data?.suppliers || []).map((s) => (
                <tr key={s.id} className="border-t border-gray-100">
                  <td className="p-3"><span className="font-semibold">{s.name}</span><span className="block text-xs text-muted">{[s.phone, s.gstin].filter(Boolean).join(' · ')}</span></td>
                  <td className="p-3 text-right">{inr(s.totalPurchases)}</td>
                  <td className={`p-3 text-right font-bold ${s.due > 0 ? 'text-red-700' : ''}`}>{inr(s.due)}</td>
                  <td className="p-3 text-right whitespace-nowrap">
                    <Link to={`/ops/purchases?supplier=${s.id}`} className="text-xs font-semibold text-gray-700">Bills</Link>
                    {can.edit && <button type="button" className="text-xs font-semibold text-brand ml-3" onClick={() => setEditing(s)}>Edit</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && <SupplierForm supplier={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </div>
  );
}
