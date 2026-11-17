import { useState } from 'react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { Empty, ErrorBox, Field, MK_NAV, Modal, PageHeader, SubNav, useApi, useForm } from '../../components/ui.jsx';
import Icon from '../../components/Icon.jsx';
import { fmtDate, inr, isoDay } from '../../lib/format.js';

function CouponForm({ coupon, onClose, onSaved }) {
  const [f, , set] = useForm({
    code: coupon?.code || '', type: coupon?.type || 'percent', value: coupon ? Number(coupon.value) : '', minOrder: Number(coupon?.minOrder) || '',
    maxDiscount: coupon?.maxDiscount ? Number(coupon.maxDiscount) : '', validFrom: isoDay(coupon?.validFrom), validTill: isoDay(coupon?.validTill),
    usageLimit: coupon?.usageLimit || '', oncePerCustomer: coupon?.oncePerCustomer ?? true, showInShop: coupon?.showInShop ?? true, active: coupon?.active ?? true, description: coupon?.description || '',
  });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await api(coupon ? `/marketing/coupons/${coupon.id}` : '/marketing/coupons', { method: coupon ? 'PUT' : 'POST', body: f });
      onSaved();
    } catch (x) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={coupon ? 'Edit coupon' : 'New coupon'} onClose={onClose}>
      <form onSubmit={save} className="flex flex-col gap-4">
        <ErrorBox>{err}</ErrorBox>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Code" id="cp-c" className="col-span-2"><input id="cp-c" required className="input uppercase" value={f.code} onChange={set('code')} placeholder="e.g. DIWALI20" /></Field>
          <Field label="Type" id="cp-t"><select id="cp-t" className="input" value={f.type} onChange={set('type')}><option value="percent">% off</option><option value="flat">₹ flat off</option></select></Field>
          <Field label={f.type === 'percent' ? 'Discount %' : 'Discount ₹'} id="cp-v"><input id="cp-v" type="number" min="1" step="any" required className="input" value={f.value} onChange={set('value')} /></Field>
          <Field label="Minimum order ₹" id="cp-m"><input id="cp-m" type="number" min="0" className="input" value={f.minOrder} onChange={set('minOrder')} /></Field>
          {f.type === 'percent' && <Field label="Max discount ₹" id="cp-x" hint="Optional"><input id="cp-x" type="number" min="0" className="input" value={f.maxDiscount} onChange={set('maxDiscount')} /></Field>}
          <Field label="Valid from" id="cp-f"><input id="cp-f" type="date" className="input" value={f.validFrom} onChange={set('validFrom')} /></Field>
          <Field label="Valid till" id="cp-u"><input id="cp-u" type="date" className="input" value={f.validTill} onChange={set('validTill')} /></Field>
          <Field label="Total uses allowed" id="cp-l" hint="Khaali = unlimited"><input id="cp-l" type="number" min="0" className="input" value={f.usageLimit} onChange={set('usageLimit')} /></Field>
          <Field label="Short note" id="cp-d"><input id="cp-d" className="input" value={f.description} onChange={set('description')} placeholder="e.g. First order only" /></Field>
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" className="w-5 h-5 accent-brand" checked={f.oncePerCustomer} onChange={set('oncePerCustomer')} /> Okka customer okkasari matrame</label>
        <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" className="w-5 h-5 accent-brand" checked={f.showInShop} onChange={set('showInShop')} /> Online shop lo offer ga chupinchu</label>
        <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" className="w-5 h-5 accent-brand" checked={f.active} onChange={set('active')} /> Active</label>
        <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save coupon'}</button>
      </form>
    </Modal>
  );
}

export default function Coupons() {
  const { me } = useAuth();
  const can = me.permissions.marketing || {};
  const { data, error, loading, reload } = useApi('/marketing/coupons');
  const [editing, setEditing] = useState(null);
  const remove = async (c) => {
    if (!window.confirm(`Delete coupon ${c.code}?`)) return;
    await api(`/marketing/coupons/${c.id}`, { method: 'DELETE' }).catch(() => {});
    reload();
  };
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Marketing" subtitle="Offers & coupons for your online shop">
        {can.add && <button type="button" className="btn-primary" onClick={() => setEditing('new')}><Icon name="plus" size={18} /> New Coupon</button>}
      </PageHeader>
      <SubNav items={MK_NAV} />
      <ErrorBox>{error}</ErrorBox>
      {!loading && data?.coupons?.length === 0 ? (
        <Empty title="Coupons levu" text="e.g. FIRST10 – first order ki 10% off. Shop page lo offer ga kanipistundi, customer checkout lo apply chestaru." />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {(data?.coupons || []).map((c) => (
            <div key={c.id} className={`card p-4 flex flex-col gap-1 border-2 border-dashed ${c.active ? 'border-brand' : 'border-line opacity-60'}`}>
              <div className="flex justify-between items-start"><span className="text-lg font-extrabold">{c.code}</span><span className="font-bold text-brand">{c.type === 'flat' ? `${inr(c.value)} OFF` : `${Number(c.value)}% OFF`}</span></div>
              <p className="text-xs text-muted">{[Number(c.minOrder) ? `Min ${inr(c.minOrder)}` : '', c.maxDiscount ? `Max ${inr(c.maxDiscount)}` : '', c.validTill ? `Till ${fmtDate(c.validTill)}` : '', c.oncePerCustomer ? 'Once per customer' : ''].filter(Boolean).join(' · ')}</p>
              <p className="text-sm">Used <b>{c.usedCount}</b>{c.usageLimit ? ` / ${c.usageLimit}` : ''} times{c.active ? '' : ' · Off'}</p>
              <div className="flex gap-3 mt-1">
                {can.edit && <button type="button" className="text-xs font-semibold text-brand" onClick={() => setEditing(c)}>Edit</button>}
                {can.delete && <button type="button" className="text-xs font-semibold text-red-700" onClick={() => remove(c)}>Delete</button>}
              </div>
            </div>
          ))}
        </div>
      )}
      {editing && <CouponForm coupon={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </div>
  );
}
