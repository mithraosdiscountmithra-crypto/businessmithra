import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { MODULE_INFO, MODULE_ORDER } from '../constants.js';
import Icon from '../components/Icon.jsx';

const ACTIONS = [
  ['canView', 'View'],
  ['canAdd', 'Add'],
  ['canEdit', 'Edit'],
  ['canDelete', 'Delete'],
];

const emptyPerms = () => MODULE_ORDER.map((m) => ({ module: m, canView: false, canAdd: false, canEdit: false, canDelete: false }));

function StaffForm({ roles, onDone }) {
  const [f, setF] = useState({ name: '', email: '', phone: '', password: '', roleId: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      await api('/staff', { method: 'POST', body: f });
      onDone();
    } catch (x) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="card p-5 flex flex-col gap-4">
      <h3 className="font-bold">Add staff member</h3>
      {err && <div className="error-box" role="alert">{err}</div>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div><label className="label" htmlFor="s-name">Name</label><input id="s-name" required className="input" value={f.name} onChange={set('name')} /></div>
        <div><label className="label" htmlFor="s-phone">Mobile</label><input id="s-phone" inputMode="numeric" maxLength={10} className="input" value={f.phone} onChange={set('phone')} /></div>
        <div><label className="label" htmlFor="s-email">Email (login)</label><input id="s-email" type="email" required className="input" value={f.email} onChange={set('email')} /></div>
        <div><label className="label" htmlFor="s-pw">Password</label><input id="s-pw" type="password" required minLength={8} autoComplete="new-password" className="input" value={f.password} onChange={set('password')} /></div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="s-role">Role</label>
          <select id="s-role" required className="input" value={f.roleId} onChange={set('roleId')}>
            <option value="">Select role</option>
            {roles.filter((r) => !r.isSystem).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
      </div>
      <div className="flex gap-3">
        <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Adding…' : 'Add staff'}</button>
        <button type="button" className="btn-ghost" onClick={() => onDone(false)}>Cancel</button>
      </div>
    </form>
  );
}

function RoleEditor({ role, onDone }) {
  const [name, setName] = useState(role?.name || '');
  const [perms, setPerms] = useState(role?.permissions || emptyPerms());
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const flip = (module, key) =>
    setPerms(perms.map((p) => {
      if (p.module !== module) return p;
      const next = { ...p, [key]: !p[key] };
      if (key !== 'canView' && next[key]) next.canView = true;
      if (key === 'canView' && !next.canView) Object.assign(next, { canAdd: false, canEdit: false, canDelete: false });
      return next;
    }));

  const save = async (e) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      await api(role ? `/roles/${role.id}` : '/roles', { method: role ? 'PUT' : 'POST', body: { name, permissions: perms } });
      onDone();
    } catch (x) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} className="card p-5 flex flex-col gap-4">
      <h3 className="font-bold">{role ? `Edit role: ${role.name}` : 'New role'}</h3>
      {err && <div className="error-box" role="alert">{err}</div>}
      <div className="max-w-sm">
        <label className="label" htmlFor="r-name">Role name</label>
        <input id="r-name" required className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="text-left text-muted">
              <th className="py-2 pr-3 font-semibold">Module</th>
              {ACTIONS.map(([, l]) => <th key={l} className="py-2 px-3 font-semibold text-center">{l}</th>)}
            </tr>
          </thead>
          <tbody>
            {perms.map((p) => (
              <tr key={p.module} className="border-t border-line">
                <td className="py-2.5 pr-3 font-semibold">{MODULE_INFO[p.module].label}</td>
                {ACTIONS.map(([k, l]) => (
                  <td key={k} className="py-2.5 px-3 text-center">
                    <input
                      type="checkbox"
                      className="w-5 h-5 accent-brand"
                      aria-label={`${MODULE_INFO[p.module].label} ${l}`}
                      checked={p[k]}
                      onChange={() => flip(p.module, k)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-3">
        <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save role'}</button>
        <button type="button" className="btn-ghost" onClick={() => onDone(false)}>Cancel</button>
      </div>
    </form>
  );
}

export default function Staff() {
  const [staff, setStaff] = useState([]);
  const [roles, setRoles] = useState([]);
  const [err, setErr] = useState('');
  const [adding, setAdding] = useState(false);
  const [editingRole, setEditingRole] = useState(null); // null | 'new' | role

  const load = async () => {
    try {
      const [s, r] = await Promise.all([api('/staff'), api('/roles')]);
      setStaff(s.staff);
      setRoles(r.roles);
    } catch (e) {
      setErr(e.message);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const update = async (u, body) => {
    setErr('');
    try {
      await api(`/staff/${u.id}`, { method: 'PUT', body });
      load();
    } catch (e) {
      setErr(e.message);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold">Staff & Roles</h1>
        {!adding && (
          <button type="button" className="btn-primary" onClick={() => setAdding(true)}>
            <Icon name="plus" size={18} /> Add staff
          </button>
        )}
      </div>
      {err && <div className="error-box" role="alert">{err}</div>}

      {adding && <StaffForm roles={roles} onDone={() => { setAdding(false); load(); }} />}

      <section className="card p-5 flex flex-col gap-3">
        <h2 className="text-lg font-bold">Staff ({staff.length})</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-muted">
                <th className="py-2 pr-3 font-semibold">Name</th>
                <th className="py-2 pr-3 font-semibold">Email / Mobile</th>
                <th className="py-2 pr-3 font-semibold">Role</th>
                <th className="py-2 pr-3 font-semibold">Status</th>
                <th className="py-2 font-semibold"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {staff.map((u) => (
                <tr key={u.id} className="border-t border-line">
                  <td className="py-3 pr-3 font-semibold">{u.name}{u.isOwner && <span className="ml-2 text-xs font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-800">Owner</span>}</td>
                  <td className="py-3 pr-3 text-muted">{u.email}{u.phone ? ` · ${u.phone}` : ''}</td>
                  <td className="py-3 pr-3">
                    {u.isOwner ? 'Owner' : (
                      <select aria-label={`Role for ${u.name}`} className="input h-9 py-0 w-auto" value={u.role?.id || ''} onChange={(e) => update(u, { roleId: e.target.value })}>
                        {roles.filter((r) => !r.isSystem).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                    )}
                  </td>
                  <td className="py-3 pr-3">
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${u.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'}`}>
                      {u.status === 'active' ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="py-3 text-right">
                    {!u.isOwner && (
                      <button type="button" className="btn-ghost h-9 px-3" onClick={() => update(u, { status: u.status === 'active' ? 'inactive' : 'active' })}>
                        {u.status === 'active' ? 'Deactivate' : 'Activate'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {editingRole ? (
        <RoleEditor role={editingRole === 'new' ? null : editingRole} onDone={() => { setEditingRole(null); load(); }} />
      ) : (
        <section className="card p-5 flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">Roles & permissions</h2>
              <p className="text-sm text-muted">Prati role ki ye module lo em cheyyochu ani set cheyyandi.</p>
            </div>
            <button type="button" className="btn-ghost" onClick={() => setEditingRole('new')}><Icon name="plus" size={18} /> New role</button>
          </div>
          <ul className="divide-y divide-line">
            {roles.map((r) => {
              const can = r.permissions.filter((p) => p.canView).map((p) => MODULE_INFO[p.module].label);
              return (
                <li key={r.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">{r.name} <span className="text-muted font-normal text-sm">· {r.userCount} staff</span></p>
                    <p className="text-sm text-muted">{r.isSystem ? 'Full access to everything' : can.length ? can.join(', ') : 'No access yet'}</p>
                  </div>
                  {!r.isSystem && <button type="button" className="btn-ghost h-9 px-3" onClick={() => setEditingRole(r)}>Edit</button>}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
