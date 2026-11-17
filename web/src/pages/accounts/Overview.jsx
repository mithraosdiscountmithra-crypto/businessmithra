import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { ACCOUNTS_NAV, ErrorBox, Field, Modal, PageHeader, Stat, SubNav, useApi, useForm } from '../../components/ui.jsx';
import Icon from '../../components/Icon.jsx';
import { inr, monthStart, today } from '../../lib/format.js';

function AccountForm({ account, onClose, onSaved }) {
  const [f, , set] = useForm({ name: account?.name || '', type: account?.type || 'bank', openingBalance: account?.openingBalance ?? 0, active: account?.active ?? true });
  const [err, setErr] = useState('');
  const save = async (e) => {
    e.preventDefault();
    setErr('');
    try {
      await api(account ? `/finance/accounts/${account.id}` : '/finance/accounts', { method: account ? 'PUT' : 'POST', body: { ...f, openingBalance: Number(f.openingBalance) || 0 } });
      onSaved();
    } catch (x) {
      setErr(x.message);
    }
  };
  return (
    <Modal title={account ? 'Edit account' : 'New account'} onClose={onClose}>
      <form onSubmit={save} className="flex flex-col gap-4">
        <ErrorBox>{err}</ErrorBox>
        <Field label="Name" id="a-name" hint="e.g. SBI Current, PhonePe, Cash Counter"><input id="a-name" required className="input" value={f.name} onChange={set('name')} /></Field>
        <Field label="Type" id="a-type">
          <select id="a-type" className="input" value={f.type} onChange={set('type')}><option value="cash">Cash</option><option value="bank">Bank</option><option value="upi">UPI wallet</option><option value="other">Other</option></select>
        </Field>
        <Field label="Opening balance (₹)" id="a-ob" hint="BusinessMithra start chesina roju ee account lo unna dabbu"><input id="a-ob" type="number" step="0.01" className="input" value={f.openingBalance} onChange={set('openingBalance')} /></Field>
        {account && <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" className="w-5 h-5 accent-brand" checked={f.active} onChange={set('active')} /> Active</label>}
        <button type="submit" className="btn-primary">Save</button>
      </form>
    </Modal>
  );
}

export default function AccountsOverview() {
  const { me } = useAuth();
  const can = me.permissions.accounts;
  const acc = useApi('/finance/accounts');
  const rep = useApi(`/finance/reports?from=${monthStart()}&to=${today()}`);
  const [editing, setEditing] = useState(null);
  const p = rep.data?.pnl;
  const g = rep.data?.gst;
  const total = (acc.data?.accounts || []).filter((a) => a.active).reduce((s, a) => s + a.balance, 0);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Accounts" subtitle="Dabbu ekkada undi, ekkadiki veltundi – anni okka chota">
        {can.add && <Link className="btn-primary" to="/accounts/expenses?new=1"><Icon name="plus" size={18} /> Add Expense</Link>}
      </PageHeader>
      <SubNav items={ACCOUNTS_NAV} />
      <ErrorBox>{acc.error || rep.error}</ErrorBox>

      <h2 className="font-bold">Ee nela (this month)</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Income (sales before GST)" value={p ? inr(p.income) : '…'} />
        <Stat label="Expenses (before GST)" value={p ? inr(p.expenses) : '…'} />
        <Stat label="Profit" value={p ? inr(p.profit) : '…'} sub={p ? `${p.margin}% margin` : ''} tone={p && p.profit < 0 ? 'text-red-700' : 'text-green-800'} />
        <Stat label="GST payable (approx.)" value={g ? inr(g.netPayable) : '…'} sub={g ? `Output ${inr(g.outputGst)} − Input ${inr(g.inputGst)}` : ''} />
      </div>

      <section className="card p-5 flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold">Accounts & balances · <span className="text-brand">{inr(total)}</span></h2>
          {can.add && <button type="button" className="btn-ghost h-9 px-3" onClick={() => setEditing('new')}><Icon name="plus" size={16} /> Add account</button>}
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {(acc.data?.accounts || []).map((a) => (
            <div key={a.id} className={`rounded-xl border border-line p-4 flex flex-col gap-1 ${a.active ? '' : 'opacity-60'}`}>
              <div className="flex items-center justify-between">
                <span className="font-bold">{a.name}</span>
                <span className="text-xs font-bold uppercase text-muted">{a.type}</span>
              </div>
              <span className={`text-2xl font-extrabold ${a.balance < 0 ? 'text-red-700' : ''}`}>{inr(a.balance)}</span>
              <span className="text-xs text-muted">In {inr(a.moneyIn)} · Out {inr(a.moneyOut)} · Opening {inr(a.openingBalance)}</span>
              <div className="flex gap-3 pt-1">
                <Link to={`/accounts/daybook?account=${a.id}`} className="text-xs font-semibold text-brand">Statement</Link>
                {can.edit && <button type="button" className="text-xs font-semibold text-brand" onClick={() => setEditing(a)}>Edit</button>}
              </div>
            </div>
          ))}
        </div>
      </section>

      {p?.byCategory?.length > 0 && (
        <section className="card p-5 flex flex-col gap-3">
          <h2 className="font-bold">Ee nela expenses – category wise</h2>
          {p.byCategory.map((c) => (
            <div key={c.category} className="flex items-center gap-3 text-sm">
              <span className="w-44 shrink-0 truncate">{c.category}</span>
              <div className="flex-1 h-5 bg-gray-100 rounded overflow-hidden"><div className="h-full bg-orange-300 rounded" style={{ width: `${(c.amount / p.byCategory[0].amount) * 100}%` }} /></div>
              <span className="w-24 text-right font-bold">{inr(c.amount)}</span>
            </div>
          ))}
        </section>
      )}

      {editing && <AccountForm account={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); acc.reload(); }} />}
    </div>
  );
}
