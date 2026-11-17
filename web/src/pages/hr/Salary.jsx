import { useState } from 'react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { ErrorBox, Field, HR_NAV, Modal, PageHeader, SubNav, useApi } from '../../components/ui.jsx';
import { fmtDate, inr, MODE_LABEL, today } from '../../lib/format.js';
import { downloadCsv } from '../../lib/csv.js';

function PayModal({ row, month, kind, onClose, onSaved }) {
  const [f, setF] = useState({ amount: kind === 'salary' ? Math.max(0, row.balance) : '', mode: 'cash', date: today(), note: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const history = useApi(`/hr/payments/${row.id}`);
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await api('/hr/pay', { method: 'POST', body: { ...f, amount: Number(f.amount), employeeId: row.id, month, kind } });
      onSaved();
    } catch (x) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  };
  const del = async (p) => {
    if (!window.confirm('Delete this entry?')) return;
    await api(`/hr/pay/${p.id}`, { method: 'DELETE' }).catch((x) => setErr(x.message));
    history.reload();
    onSaved(true);
  };
  return (
    <Modal title={`${kind === 'salary' ? 'Pay salary' : 'Give advance'} · ${row.name}`} onClose={onClose}>
      <form onSubmit={save} className="flex flex-col gap-4">
        <ErrorBox>{err}</ErrorBox>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Amount ₹" id="py-a"><input id="py-a" type="number" min="1" step="0.01" required className="input" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
          <Field label="Mode" id="py-m"><select id="py-m" className="input" value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value })}>{Object.entries(MODE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          <Field label="Date" id="py-d"><input id="py-d" type="date" className="input" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
          <Field label="Note" id="py-n"><input id="py-n" className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
        </div>
        <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        <p className="text-xs text-muted">Idi Accounts lo expense ga, Day Book lo kooda vastundi.</p>
      </form>
      {history.data?.payments?.length > 0 && (
        <ul className="mt-4 border-t border-line pt-3 text-sm flex flex-col gap-1">
          {history.data.payments.slice(0, 12).map((p) => (
            <li key={p.id} className="flex justify-between gap-2"><span>{fmtDate(p.date)} · {p.notes}</span><span className="whitespace-nowrap"><b>{inr(p.amount)}</b> <button type="button" className="text-xs text-red-700 ml-2" onClick={() => del(p)}>Delete</button></span></li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

export default function Salary() {
  const { me } = useAuth();
  const can = me.permissions.hr || {};
  const [month, setMonth] = useState(today().slice(0, 7));
  const { data, error, reload } = useApi(`/hr/payroll?month=${month}`);
  const [pay, setPay] = useState(null);
  const rows = data?.rows || [];
  const sum = (k) => rows.reduce((a, r) => a + r[k], 0);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="HR & Staff" subtitle="Monthly salary & advances">
        {rows.length > 0 && <button type="button" className="btn-ghost" onClick={() => downloadCsv(`salary-${month}`, ['Name', 'Type', 'Salary', 'Present', 'Half', 'Leave', 'Absent', 'Earned', 'Advance', 'Paid', 'Balance'], rows.map((r) => [r.name, r.payType, r.salary, r.present, r.half, r.leave, r.absent, r.earned, r.advances, r.paid, r.balance]))}>⬇️ Excel</button>}
      </PageHeader>
      <SubNav items={HR_NAV} />
      <input aria-label="Month" type="month" className="input h-10 w-auto self-start" value={month} onChange={(e) => setMonth(e.target.value)} />
      <ErrorBox>{error}</ErrorBox>
      {data && (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead><tr className="text-left text-muted border-b border-line"><th className="p-3">Employee</th><th className="p-3 text-center">P / ½ / L / A</th><th className="p-3 text-right">Earned</th><th className="p-3 text-right">Advance</th><th className="p-3 text-right">Paid</th><th className="p-3 text-right">Balance</th><th className="p-3" /></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-gray-100">
                  <td className="p-3"><b>{r.name}</b><span className="block text-xs text-muted">{inr(r.salary)} {r.payType === 'daily' ? '/ day' : '/ month'}</span></td>
                  <td className="p-3 text-center">{r.present} / {r.half} / {r.leave} / <span className={r.absent ? 'text-red-700 font-bold' : ''}>{r.absent}</span>{!r.marked && r.payType === 'monthly' && <span className="block text-xs text-muted">no marks</span>}</td>
                  <td className="p-3 text-right font-semibold">{inr(r.earned)}</td>
                  <td className="p-3 text-right">{r.advances ? inr(r.advances) : '—'}</td>
                  <td className="p-3 text-right">{r.paid ? inr(r.paid) : '—'}</td>
                  <td className={`p-3 text-right font-bold ${r.balance > 0 ? 'text-red-700' : 'text-green-800'}`}>{inr(r.balance)}</td>
                  <td className="p-3 text-right whitespace-nowrap">
                    {can.add && <button type="button" className="text-xs font-semibold text-gray-700" onClick={() => setPay({ row: r, kind: 'advance' })}>Advance</button>}
                    {can.add && <button type="button" className="text-xs font-semibold text-brand ml-3" onClick={() => setPay({ row: r, kind: 'salary' })}>Pay</button>}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-muted">Employees levu.</td></tr>}
            </tbody>
            {rows.length > 0 && <tfoot><tr className="border-t-2 border-ink font-bold"><td className="p-3">Total</td><td /><td className="p-3 text-right">{inr(sum('earned'))}</td><td className="p-3 text-right">{inr(sum('advances'))}</td><td className="p-3 text-right">{inr(sum('paid'))}</td><td className="p-3 text-right">{inr(sum('balance'))}</td><td /></tr></tfoot>}
          </table>
        </div>
      )}
      {pay && <PayModal row={pay.row} kind={pay.kind} month={month} onClose={() => setPay(null)} onSaved={(keep) => { if (!keep) setPay(null); reload(); }} />}
    </div>
  );
}
