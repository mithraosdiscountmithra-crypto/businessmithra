import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { ErrorBox, HR_NAV, PageHeader, SubNav, useApi } from '../../components/ui.jsx';
import { addDays, fmtDate, today } from '../../lib/format.js';

const OPTS = [['present', 'P', 'bg-green-600'], ['half', '½', 'bg-amber-500'], ['absent', 'A', 'bg-red-600'], ['leave', 'L', 'bg-sky-600']];

export default function Attendance() {
  const { me } = useAuth();
  const can = me.permissions.hr || {};
  const [date, setDate] = useState(today());
  const { data, error } = useApi(`/hr/attendance?date=${date}`);
  const [marks, setMarks] = useState({});
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (data) setMarks(Object.fromEntries(data.rows.map((r) => [r.id, r.status]))); setMsg(''); }, [data]);
  const save = async () => {
    setBusy(true);
    setErr('');
    try {
      await api('/hr/attendance', { method: 'PUT', body: { date, marks: Object.entries(marks).map(([employeeId, status]) => ({ employeeId, status: status || null })) } });
      setMsg('Saved ✓');
    } catch (x) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  };
  const allPresent = () => setMarks(Object.fromEntries((data?.rows || []).map((r) => [r.id, 'present'])));
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="HR & Staff" subtitle="Daily attendance" />
      <SubNav items={HR_NAV} />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-ghost h-10 px-3" aria-label="Previous day" onClick={() => setDate(addDays(date, -1))}>←</button>
        <input aria-label="Date" type="date" className="input h-10 w-auto" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
        <button type="button" className="btn-ghost h-10 px-3" aria-label="Next day" disabled={date >= today()} onClick={() => setDate(addDays(date, 1))}>→</button>
        <span className="text-sm font-semibold">{fmtDate(date)}</span>
      </div>
      <ErrorBox>{error || err}</ErrorBox>
      {data && data.rows.length === 0 && <p className="card p-6 text-center text-muted">Mundu <Link to="/hr/employees" className="text-brand font-semibold">employees add cheyyandi</Link>.</p>}
      {data && data.rows.length > 0 && (
        <>
          {can.edit && <button type="button" className="btn-ghost self-start" onClick={allPresent}>✓ Andaru present</button>}
          <div className="card divide-y divide-gray-100">
            {data.rows.map((r) => (
              <div key={r.id} className="p-3 flex items-center justify-between gap-2">
                <span className="text-sm"><b>{r.name}</b>{r.role && <span className="text-muted"> · {r.role}</span>}</span>
                <div className="flex gap-1.5" role="group" aria-label={`Attendance for ${r.name}`}>
                  {OPTS.map(([k, l, cls]) => (
                    <button key={k} type="button" disabled={!can.edit} aria-pressed={marks[r.id] === k} aria-label={k} title={k}
                      onClick={() => setMarks({ ...marks, [r.id]: marks[r.id] === k ? null : k })}
                      className={`w-10 h-10 rounded-lg font-bold ${marks[r.id] === k ? `${cls} text-white` : 'bg-gray-100 text-gray-700'}`}>{l}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted">P = Present · ½ = Half day · A = Absent · L = Leave (paid). Mark cheyyani rojulu monthly salary lo present ga lekkistam.</p>
          {can.edit && <button type="button" className="btn-primary self-start" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save attendance'}</button>}
          {msg && <p className="text-sm text-green-800 font-semibold">{msg}</p>}
        </>
      )}
    </div>
  );
}
