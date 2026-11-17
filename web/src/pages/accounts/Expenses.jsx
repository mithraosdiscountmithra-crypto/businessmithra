import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { ACCOUNTS_NAV, Empty, ErrorBox, Field, Modal, PageHeader, RangePicker, SubNav, useApi, useForm } from '../../components/ui.jsx';
import Icon from '../../components/Icon.jsx';
import { fmtDate, inr, isoDay, MODE_LABEL, monthStart, today } from '../../lib/format.js';
import { d10, downloadCsv } from '../../lib/csv.js';

function ExpenseForm({ expense, categories, accounts, onClose, onSaved }) {
  const [f, , set] = useForm({
    date: isoDay(expense?.date) || today(), category: expense?.category || '', amount: expense?.amount ?? '',
    taxAmount: expense?.taxAmount ?? '', vendorName: expense?.vendorName || '', vendorGstin: expense?.vendorGstin || '',
    billNo: expense?.billNo || '', accountId: expense?.accountId || '', mode: expense?.mode || 'cash', notes: expense?.notes || '',
  });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async (e) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const body = { ...f, amount: Number(f.amount), taxAmount: Number(f.taxAmount) || 0 };
      await api(expense ? `/finance/expenses/${expense.id}` : '/finance/expenses', { method: expense ? 'PUT' : 'POST', body });
      onSaved();
    } catch (x) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={expense ? 'Edit expense' : 'New expense'} onClose={onClose}>
      <form onSubmit={save} className="flex flex-col gap-4">
        <ErrorBox>{err}</ErrorBox>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Date" id="e-date"><input id="e-date" type="date" required className="input" value={f.date} onChange={set('date')} /></Field>
          <Field label="Category" id="e-cat">
            <input id="e-cat" list="e-cats" required className="input" value={f.category} onChange={set('category')} placeholder="Select or type" />
            <datalist id="e-cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
          </Field>
          <Field label="Total paid (₹, GST tho)" id="e-amt"><input id="e-amt" type="number" min="0.01" step="0.01" required className="input" value={f.amount} onChange={set('amount')} /></Field>
          <Field label="GST in this bill (₹)" id="e-tax" hint="Input tax credit kosam; lekapothe 0"><input id="e-tax" type="number" min="0" step="0.01" className="input" value={f.taxAmount} onChange={set('taxAmount')} /></Field>
          <Field label="Paid via" id="e-mode">
            <select id="e-mode" className="input" value={f.mode} onChange={set('mode')}>{Object.entries(MODE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </Field>
          <Field label="From account" id="e-acc">
            <select id="e-acc" className="input" value={f.accountId} onChange={set('accountId')}>
              <option value="">Auto (by mode)</option>
              {accounts.filter((a) => a.active).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
          <Field label="Paid to (vendor)" id="e-ven"><input id="e-ven" className="input" value={f.vendorName} onChange={set('vendorName')} /></Field>
          <Field label="Bill no." id="e-bill"><input id="e-bill" className="input" value={f.billNo} onChange={set('billNo')} /></Field>
          <Field label="Vendor GSTIN" id="e-vg" className="sm:col-span-2"><input id="e-vg" className="input uppercase" maxLength={15} value={f.vendorGstin} onChange={set('vendorGstin')} /></Field>
          <Field label="Notes" id="e-notes" className="sm:col-span-2"><input id="e-notes" className="input" value={f.notes} onChange={set('notes')} /></Field>
        </div>
        <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save expense'}</button>
      </form>
    </Modal>
  );
}

export default function Expenses() {
  const { me } = useAuth();
  const can = me.permissions.accounts;
  const [params, setParams] = useSearchParams();
  const [range, setRange] = useState({ from: monthStart(), to: today() });
  const [cat, setCat] = useState('');
  const { data, error, loading, reload } = useApi(`/finance/expenses?from=${range.from}&to=${range.to}&category=${encodeURIComponent(cat)}`);
  const accounts = useApi('/finance/accounts');
  const [editing, setEditing] = useState(params.get('new') ? 'new' : null);
  const [err, setErr] = useState('');

  const close = () => {
    setEditing(null);
    if (params.get('new')) setParams({});
  };
  const remove = async (e) => {
    if (!window.confirm('Delete this expense?')) return;
    try {
      await api(`/finance/expenses/${e.id}`, { method: 'DELETE' });
      reload();
    } catch (x) {
      setErr(x.message);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Accounts">
        {data?.expenses?.length > 0 && <button type="button" className="btn-ghost" onClick={() => downloadCsv(`expenses-${range.from}-to-${range.to}`, ['Date', 'Category', 'Paid to', 'Bill no', 'Mode', 'GST', 'Amount', 'Notes'],
          data.expenses.map((e) => [d10(e.date), e.category, e.vendorName, e.billNo, e.mode, Number(e.taxAmount), Number(e.amount), e.notes]))}>⬇️ Excel</button>}
        {can.add && <button type="button" className="btn-primary" onClick={() => setEditing('new')}><Icon name="plus" size={18} /> Add Expense</button>}
      </PageHeader>
      <SubNav items={ACCOUNTS_NAV} />
      <RangePicker value={range} onChange={setRange} />
      <div className="flex flex-wrap items-center gap-3">
        <label className="sr-only" htmlFor="ecat">Category</label>
        <select id="ecat" className="input h-10 w-auto" value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">All categories</option>
          {(data?.categories || []).map((c) => <option key={c}>{c}</option>)}
        </select>
        {data && <p className="text-sm font-semibold">Total: <span className="text-red-700">{inr(data.total)}</span> · {data.expenses.length} entries</p>}
      </div>
      <ErrorBox>{error || err}</ErrorBox>
      {!loading && data?.expenses?.length === 0 ? (
        <Empty title="Ee period lo expenses levu" text="Rent, salaries, current bill, purchases – prati kharchu add cheste correct profit telustundi." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="text-left text-muted border-b border-line">
                <th className="p-3 font-semibold">Date</th><th className="p-3 font-semibold">Category</th><th className="p-3 font-semibold">Paid to</th>
                <th className="p-3 font-semibold">Account</th><th className="p-3 font-semibold text-right">GST</th><th className="p-3 font-semibold text-right">Amount</th><th className="p-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {(data?.expenses || []).map((e) => (
                <tr key={e.id} className="border-t border-gray-100">
                  <td className="p-3 whitespace-nowrap">{fmtDate(e.date)}</td>
                  <td className="p-3 font-semibold">{e.category}{e.notes && <span className="block text-xs text-muted font-normal">{e.notes}</span>}</td>
                  <td className="p-3">{e.vendorName || '—'}{e.billNo && <span className="block text-xs text-muted">Bill {e.billNo}</span>}</td>
                  <td className="p-3">{e.account?.name || '—'} <span className="text-xs text-muted">({MODE_LABEL[e.mode] || e.mode})</span></td>
                  <td className="p-3 text-right">{Number(e.taxAmount) ? inr(e.taxAmount) : '—'}</td>
                  <td className="p-3 text-right font-bold">{inr(e.amount)}</td>
                  <td className="p-3 text-right whitespace-nowrap">
                    {can.edit && <button type="button" className="text-xs font-semibold text-brand" onClick={() => setEditing(e)}>Edit</button>}
                    {can.delete && <button type="button" className="text-xs font-semibold text-red-700 ml-3" onClick={() => remove(e)}>Delete</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <ExpenseForm
          expense={editing === 'new' ? null : editing}
          categories={data?.categories || []}
          accounts={accounts.data?.accounts || []}
          onClose={close}
          onSaved={() => { close(); reload(); accounts.reload(); }}
        />
      )}
    </div>
  );
}
