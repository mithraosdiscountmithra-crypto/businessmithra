import { useState } from 'react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { Empty, ErrorBox, Field, HR_NAV, Modal, PageHeader, SubNav, useApi, useForm } from '../../components/ui.jsx';
import Icon from '../../components/Icon.jsx';
import { fmtDate, inr, isoDay } from '../../lib/format.js';

function EmpForm({ emp, onClose, onSaved }) {
  const [f, , set] = useForm({ name: emp?.name || '', phone: emp?.phone || '', role: emp?.role || '', payType: emp?.payType || 'monthly', salary: emp ? Number(emp.salary) : '', joinedOn: isoDay(emp?.joinedOn), active: emp?.active ?? true, notes: emp?.notes || '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await api(emp ? `/hr/employees/${emp.id}` : '/hr/employees', { method: emp ? 'PUT' : 'POST', body: f });
      onSaved();
    } catch (x) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={emp ? 'Edit employee' : 'New employee'} onClose={onClose}>
      <form onSubmit={save} className="flex flex-col gap-4">
        <ErrorBox>{err}</ErrorBox>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Name" id="em-n" className="col-span-2"><input id="em-n" required className="input" value={f.name} onChange={set('name')} /></Field>
          <Field label="Mobile" id="em-p"><input id="em-p" inputMode="numeric" maxLength={10} className="input" value={f.phone} onChange={set('phone')} /></Field>
          <Field label="Role" id="em-r"><input id="em-r" className="input" value={f.role} onChange={set('role')} placeholder="e.g. Cashier, Cook" /></Field>
          <Field label="Salary type" id="em-t"><select id="em-t" className="input" value={f.payType} onChange={set('payType')}><option value="monthly">Monthly</option><option value="daily">Daily wage</option></select></Field>
          <Field label={f.payType === 'monthly' ? 'Salary per month ₹' : 'Wage per day ₹'} id="em-s"><input id="em-s" type="number" min="0" required className="input" value={f.salary} onChange={set('salary')} /></Field>
          <Field label="Joined on" id="em-j"><input id="em-j" type="date" className="input" value={f.joinedOn} onChange={set('joinedOn')} /></Field>
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" className="w-5 h-5 accent-brand" checked={f.active} onChange={set('active')} /> Working now</label>
        <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      </form>
    </Modal>
  );
}

export default function Employees() {
  const { me } = useAuth();
  const can = me.permissions.hr || {};
  const { data, error, loading, reload } = useApi('/hr/employees');
  const [editing, setEditing] = useState(null);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="HR & Staff" subtitle="Employees (login avasaram ledu)">
        {can.add && <button type="button" className="btn-primary" onClick={() => setEditing('new')}><Icon name="plus" size={18} /> Add Employee</button>}
      </PageHeader>
      <SubNav items={HR_NAV} />
      <ErrorBox>{error}</ErrorBox>
      {!loading && data?.employees?.length === 0 ? <Empty title="Employees levu" text="Mee shop lo pani chese vaallani add cheyyandi – attendance, jeetham, advance track avtayi." /> : (
        <div className="card divide-y divide-gray-100">
          {(data?.employees || []).map((e) => (
            <div key={e.id} className={`p-4 flex justify-between items-center gap-2 text-sm ${e.active ? '' : 'opacity-60'}`}>
              <span><b>{e.name}</b>{e.role && ` · ${e.role}`}<span className="block text-xs text-muted">{[e.phone, e.joinedOn ? `Since ${fmtDate(e.joinedOn)}` : '', e.active ? '' : 'Left'].filter(Boolean).join(' · ')}</span></span>
              <span className="text-right"><b>{inr(e.salary)}</b><span className="block text-xs text-muted">{e.payType === 'daily' ? 'per day' : 'per month'}</span></span>
              {can.edit && <button type="button" className="text-xs font-semibold text-brand" onClick={() => setEditing(e)}>Edit</button>}
            </div>
          ))}
        </div>
      )}
      {editing && <EmpForm emp={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </div>
  );
}
