import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { ErrorBox, Field, MK_NAV, PageHeader, SubNav, useApi } from '../../components/ui.jsx';
import { fmtDate, waLink } from '../../lib/format.js';

export default function Wishes() {
  const { me } = useAuth();
  const can = me.permissions.marketing || {};
  const { data, error, reload } = useApi('/marketing/wishes');
  const [f, setF] = useState({ wishesEnabled: false, wishOffer: '' });
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => { if (data) setF({ wishesEnabled: data.wishesEnabled, wishOffer: data.wishOffer || '' }); }, [data]);
  const save = async (e) => {
    e.preventDefault();
    setErr('');
    try {
      await api('/marketing/wishes', { method: 'PUT', body: f });
      setMsg('Saved ✓');
      reload();
    } catch (x) {
      setErr(x.message);
    }
  };
  const shop = me.business?.name || '';
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Marketing" subtitle="Customer birthdays" />
      <SubNav items={MK_NAV} />
      <ErrorBox>{error || err}</ErrorBox>
      {data && (
        <>
          <form onSubmit={save} className="card p-4 flex flex-col gap-3">
            <label className={`flex items-center gap-2 font-bold ${data.autoSend ? '' : 'opacity-60'}`}><input type="checkbox" className="w-5 h-5 accent-brand" disabled={!data.autoSend || !can.edit} checked={f.wishesEnabled} onChange={(e) => setF({ ...f, wishesEnabled: e.target.checked })} /> Automatic ga birthday roju udayam WhatsApp wish pampu</label>
            {!data.autoSend && <p className="text-xs text-muted">Automatic wishes inka set up avvaledu – kindha list nunchi okka click tho pampochu.</p>}
            <Field label="Wish lo offer (optional)" id="w-o"><input id="w-o" className="input" value={f.wishOffer} maxLength={120} onChange={(e) => setF({ ...f, wishOffer: e.target.value })} placeholder="e.g. Ee week 15% off meeku special ga 🎁" /></Field>
            {can.edit && <button type="submit" className="btn-primary self-start">Save</button>}
            {msg && <p className="text-sm text-green-800 font-semibold">{msg}</p>}
          </form>
          <section className="card p-4">
            <h2 className="font-bold mb-1">Next 30 days birthdays</h2>
            <p className="text-xs text-muted mb-3">{data.withBirthday} customers ki birthday add chesaru. Customers lo edit chesi birthday add cheyyandi.</p>
            {data.upcoming.length === 0 ? <p className="text-sm text-muted">Ee 30 rojullo birthdays levu.</p> : (
              <ul className="divide-y divide-gray-100">
                {data.upcoming.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <span><b>{c.name}</b> <span className="text-muted">{fmtDate(c.birthday).replace(/\s?\d{4}$/, '')}</span> {c.days === 0 ? <span className="ml-1 text-xs font-bold px-2 py-0.5 rounded-full bg-pink-100 text-pink-800">🎂 Today</span> : <span className="text-xs text-muted">in {c.days} days</span>}</span>
                    {c.phone && <a className="btn h-9 px-3 bg-green-600 text-white" target="_blank" rel="noreferrer" href={waLink(c.phone, `Happy Birthday ${c.name} garu! 🎂🎉\n${shop} nunchi meeku hrudayapurvaka subhakankshalu.${f.wishOffer ? `\n🎁 ${f.wishOffer}` : ''}`)}>🎂 Wish</a>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
