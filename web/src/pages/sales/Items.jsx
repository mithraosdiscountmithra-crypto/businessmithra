import { useState } from 'react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { Empty, ErrorBox, Field, Modal, PageHeader, SALES_NAV, SubNav, useApi, useForm } from '../../components/ui.jsx';
import Icon from '../../components/Icon.jsx';
import ImageUpload from '../../components/ImageUpload.jsx';
import { GST_RATES, inr } from '../../lib/format.js';

function ItemForm({ item, onClose, onSaved }) {
  const [f, setF, set] = useForm({
    name: item?.name || '', type: item?.type || 'product', sku: item?.sku || '', hsn: item?.hsn || '',
    unit: item?.unit || 'pcs', price: item?.price ?? '', taxRate: item?.taxRate ?? 5,
    mrp: item?.mrp ?? '', description: item?.description || '', category: item?.category || '',
    images: item?.images || [], showInShop: item?.showInShop ?? true, inStock: item?.inStock ?? true,
    variants: (item?.variants || []).map((v) => ({ ...v, mrp: v.mrp ?? '' })),
  });
  const vid = () => Math.random().toString(36).slice(2, 10);
  const setVariants = (variants) => setF((x) => ({ ...x, variants }));
  const setV = (id, patch) => setVariants(f.variants.map((v) => (v.id === id ? { ...v, ...patch } : v)));
  const preset = (names) => setVariants([...f.variants, ...names.map((name) => ({ id: vid(), name, price: '', mrp: '', inStock: true }))]);
  const setImages = (images) => setF((x) => ({ ...x, images }));
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async (e) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      await api(item ? `/items/${item.id}` : '/items', { method: item ? 'PUT' : 'POST', body: {
        ...f, price: Number(f.price || 0), taxRate: Number(f.taxRate), mrp: f.mrp === '' ? null : Number(f.mrp), active: true,
        variants: f.variants.filter((v) => v.name.trim()).map((v) => ({ ...v, price: Number(v.price || 0), mrp: v.mrp === '' ? null : Number(v.mrp) })),
      } });
      onSaved();
    } catch (x) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={item ? 'Edit item' : 'New item / service'} onClose={onClose}>
      <form onSubmit={save} className="flex flex-col gap-4">
        <ErrorBox>{err}</ErrorBox>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Name" id="i-name" className="sm:col-span-2"><input id="i-name" required className="input" value={f.name} onChange={set('name')} /></Field>
          <Field label="Type" id="i-type">
            <select id="i-type" className="input" value={f.type} onChange={set('type')}><option value="product">Product</option><option value="service">Service</option></select>
          </Field>
          <Field label="Unit" id="i-unit">
            <select id="i-unit" className="input" value={f.unit} onChange={set('unit')}>
              {['pcs', 'nos', 'kg', 'g', 'ltr', 'mtr', 'box', 'set', 'pair', 'hrs', 'job'].map((u) => <option key={u}>{u}</option>)}
            </select>
          </Field>
          <Field label="Price (₹, before GST)" id="i-price"><input id="i-price" type="number" min="0" step="0.01" required={f.variants.length === 0} disabled={f.variants.length > 0} className="input disabled:bg-gray-100" value={f.variants.length ? '' : f.price} placeholder={f.variants.length ? 'Sizes lo set cheyyandi' : ''} onChange={set('price')} /></Field>
          <Field label="GST %" id="i-tax">
            <select id="i-tax" className="input" value={f.taxRate} onChange={set('taxRate')}>{GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}</select>
          </Field>
          <Field label={f.type === 'service' ? 'SAC code' : 'HSN code'} id="i-hsn"><input id="i-hsn" className="input" value={f.hsn} onChange={set('hsn')} /></Field>
          <Field label="SKU / Code" id="i-sku"><input id="i-sku" className="input" value={f.sku} onChange={set('sku')} /></Field>
        </div>
        <div className="flex flex-col gap-3 pt-2 border-t border-line">
          <div>
            <h3 className="font-bold">Sizes / quantities (optional)</h3>
            <p className="text-xs text-muted">Veru veru price unte add cheyyandi: 250g / 500g / 1kg, Half / Full, S / M / L. Prices GST lekunda.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {[['250 g', '500 g', '1 kg'], ['Half', 'Full'], ['500 ml', '1 L'], ['S', 'M', 'L', 'XL'], ['Small', 'Medium', 'Large']].map((p) => (
              <button key={p.join()} type="button" className="h-9 px-3 rounded-lg border border-line text-sm font-semibold hover:border-brand" onClick={() => preset(p)}>+ {p.join(' / ')}</button>
            ))}
            <button type="button" className="h-9 px-3 rounded-lg border border-line text-sm font-semibold hover:border-brand" onClick={() => preset([''])}>+ Custom</button>
          </div>
          {f.variants.length > 0 && (
            <div className="flex flex-col gap-2">
              {f.variants.map((v, i) => (
                <div key={v.id} className="grid grid-cols-12 gap-2 items-end">
                  <Field label={i === 0 ? 'Size' : ''} id={`v-n-${v.id}`} className="col-span-4"><input id={`v-n-${v.id}`} aria-label="Size name" className="input" value={v.name} onChange={(e) => setV(v.id, { name: e.target.value })} placeholder="e.g. 1 kg" /></Field>
                  <Field label={i === 0 ? 'Price ₹' : ''} id={`v-p-${v.id}`} className="col-span-3"><input id={`v-p-${v.id}`} aria-label="Price" type="number" min="0" step="0.01" required className="input px-2" value={v.price} onChange={(e) => setV(v.id, { price: e.target.value })} /></Field>
                  <Field label={i === 0 ? 'MRP ₹' : ''} id={`v-m-${v.id}`} className="col-span-2"><input id={`v-m-${v.id}`} aria-label="MRP" type="number" min="0" step="0.01" className="input px-2" value={v.mrp} onChange={(e) => setV(v.id, { mrp: e.target.value })} /></Field>
                  <label className="col-span-2 flex items-center gap-1.5 text-xs font-semibold h-11"><input type="checkbox" className="w-5 h-5 accent-brand" checked={v.inStock} onChange={(e) => setV(v.id, { inStock: e.target.checked })} /> Stock</label>
                  <button type="button" aria-label={`Remove ${v.name || 'size'}`} className="col-span-1 h-11 rounded-xl text-red-700 hover:bg-red-50 font-bold text-lg" onClick={() => setVariants(f.variants.filter((x) => x.id !== v.id))}>×</button>
                </div>
              ))}
              <p className="text-xs text-muted">Sizes unte paina "Price" kakunda, ikkada prati size ki price vaadataru.</p>
            </div>
          )}
        </div>
        <h3 className="font-bold pt-2 border-t border-line">Online shop</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2"><ImageUpload images={f.images} onChange={setImages} max={4} /></div>
          <Field label="Category (shop lo filter)" id="i-cat"><input id="i-cat" className="input" value={f.category} onChange={set('category')} placeholder="e.g. Silk Sarees" /></Field>
          <Field label="MRP ₹ (strike price, optional)" id="i-mrp" hint="GST tho kalipi. Shop lo 'X% OFF' chupistundi"><input id="i-mrp" type="number" min="0" step="0.01" className="input" value={f.mrp} onChange={set('mrp')} /></Field>
          <Field label="Description" id="i-desc" className="sm:col-span-2"><textarea id="i-desc" rows={2} className="input h-auto py-2.5" value={f.description} onChange={set('description')} /></Field>
          <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" className="w-5 h-5 accent-brand" checked={f.showInShop} onChange={set('showInShop')} /> Online shop lo chupinchu</label>
          <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" className="w-5 h-5 accent-brand" checked={f.inStock} onChange={set('inStock')} /> In stock</label>
        </div>
        <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      </form>
    </Modal>
  );
}

export default function Items() {
  const { me } = useAuth();
  const can = me.permissions.sales;
  const { data, error, loading, reload } = useApi('/items');
  const [editing, setEditing] = useState(null);
  const [err, setErr] = useState('');

  const remove = async (it) => {
    if (!window.confirm(`Remove ${it.name}? Old invoices will not change.`)) return;
    try {
      await api(`/items/${it.id}`, { method: 'DELETE' });
      reload();
    } catch (x) {
      setErr(x.message);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Sales & Customers">
        {can.add && <button type="button" className="btn-primary" onClick={() => setEditing('new')}><Icon name="plus" size={18} /> Add Item</button>}
      </PageHeader>
      <SubNav items={SALES_NAV} />
      <ErrorBox>{error || err}</ErrorBox>
      {!loading && data?.items?.length === 0 ? (
        <Empty title="Items / services list empty" text="Mee products, services price and GST tho add cheyyandi. Invoice lo okka click tho select cheyyochu." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-muted border-b border-line">
                <th className="p-3 font-semibold">Name</th><th className="p-3 font-semibold">Type</th><th className="p-3 font-semibold">HSN/SAC</th>
                <th className="p-3 font-semibold text-right">Price</th><th className="p-3 font-semibold text-right">GST</th><th className="p-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {(data?.items || []).map((it) => (
                <tr key={it.id} className="border-t border-gray-100">
                  <td className="p-3">
                    <div className="flex items-center gap-3">
                      {it.images?.[0] ? <img src={it.images[0]} alt="" className="w-11 h-11 rounded-lg object-cover border border-line" /> : <span className="w-11 h-11 rounded-lg bg-gray-100 shrink-0" aria-hidden="true" />}
                      <div><span className="font-semibold">{it.name}</span>
                        <span className="block text-xs text-muted">{[it.category, it.sku, it.showInShop ? 'In shop' : 'Not in shop', it.inStock ? '' : 'Out of stock'].filter(Boolean).join(' · ')}</span></div>
                    </div>
                  </td>
                  <td className="p-3 capitalize">{it.type}</td>
                  <td className="p-3">{it.hsn || '—'}</td>
                  <td className="p-3 text-right font-semibold">{it.variants?.length ? <>from {inr(it.price)}<span className="block text-xs text-muted font-normal">{it.variants.map((v) => v.name).join(' · ')}</span></> : <>{inr(it.price)} / {it.unit}</>}</td>
                  <td className="p-3 text-right">{Number(it.taxRate)}%</td>
                  <td className="p-3 text-right whitespace-nowrap">
                    {can.edit && <button type="button" className="btn-ghost h-9 px-3" onClick={() => setEditing(it)}>Edit</button>}
                    {can.delete && <button type="button" className="btn-ghost h-9 px-3 ml-2 text-red-700" onClick={() => remove(it)}>Remove</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && <ItemForm item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </div>
  );
}
