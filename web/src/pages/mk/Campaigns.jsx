import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { ErrorBox, Field, MK_NAV, Modal, PageHeader, SubNav, useApi } from '../../components/ui.jsx';
import Icon from '../../components/Icon.jsx';
import { fmtDateTime, waLink } from '../../lib/format.js';

const TEMPLATES = [
  ['Festival offer', 'Ee festival ki special offer! Anni items meeda 10% discount. Ee week lo matrame. Visit cheyyandi 🎉'],
  ['New stock', 'Kotha stock vachindi! Latest collection chudataniki shop ki randi leda online lo order cheyyandi.'],
  ['We miss you', 'Chaala rojulu ayyindi meeru raledu 🙂 Meeku special ga 15% off. Ee nela lo use cheyyandi.'],
];

function NewCampaign({ seg, onClose, onDone }) {
  const [f, setF] = useState({ title: '', message: '', segment: 'all', segmentArg: '', mode: 'manual' });
  const [count, setCount] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  useEffect(() => {
    setCount(null);
    api(`/marketing/audience?segment=${f.segment}&arg=${encodeURIComponent(f.segmentArg)}`).then((r) => setCount(r.count)).catch(() => {});
  }, [f.segment, f.segmentArg]);
  const save = async (e) => {
    e.preventDefault();
    if (f.mode === 'auto' && !window.confirm(`${count} customers ki WhatsApp message velthundi. OK?`)) return;
    setBusy(true);
    setErr('');
    try {
      onDone(await api('/marketing/campaigns', { method: 'POST', body: f }), f);
    } catch (x) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="New WhatsApp campaign" onClose={onClose} wide>
      <form onSubmit={save} className="flex flex-col gap-4">
        <ErrorBox>{err}</ErrorBox>
        <Field label="Title" id="cm-t"><input id="cm-t" required className="input" value={f.title} onChange={set('title')} placeholder="e.g. Sankranti offer" /></Field>
        <div className="flex flex-wrap gap-2">
          {TEMPLATES.map(([t, m]) => <button key={t} type="button" className="h-9 px-3 rounded-lg border border-line text-sm font-semibold" onClick={() => setF({ ...f, title: f.title || t, message: m })}>{t}</button>)}
        </div>
        <Field label="Message" id="cm-m" hint="Customer peru, shop peru, shop link automatic ga kalustayi"><textarea id="cm-m" required rows={4} maxLength={700} className="input h-auto py-2.5" value={f.message} onChange={set('message')} /></Field>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Send to" id="cm-s">
            <select id="cm-s" className="input" value={f.segment} onChange={set('segment')}>{Object.entries(seg.segments).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </Field>
          {f.segment === 'tag' && (
            <Field label="Tag" id="cm-a"><select id="cm-a" className="input" value={f.segmentArg} onChange={set('segmentArg')}><option value="">Select</option>{seg.tags.map((t) => <option key={t}>{t}</option>)}</select></Field>
          )}
        </div>
        <p className="text-sm font-semibold">{count === null ? 'Counting…' : `${count} customers (mobile number unnavaru)`}</p>
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-semibold mb-1">Ela pampali?</legend>
          <label className="flex items-start gap-2 text-sm"><input type="radio" name="mode" className="w-5 h-5 mt-0.5 accent-brand" checked={f.mode === 'manual'} onChange={() => setF({ ...f, mode: 'manual' })} /><span><b>One by one (free)</b> – prati customer ki WhatsApp open avtundi, Send nokkandi</span></label>
          <label className={`flex items-start gap-2 text-sm ${seg.autoSend ? '' : 'opacity-50'}`}><input type="radio" name="mode" disabled={!seg.autoSend} className="w-5 h-5 mt-0.5 accent-brand" checked={f.mode === 'auto'} onChange={() => setF({ ...f, mode: 'auto' })} /><span><b>Automatic</b> – andariki okkasari ve pothayi (nela ki {seg.limit} varaku){seg.autoSend ? '' : ' · inka set up avvaledu'}</span></label>
        </fieldset>
        <button type="submit" className="btn-primary" disabled={busy || !count}>{busy ? 'Sending…' : f.mode === 'auto' ? 'Send now' : 'Next → customer list'}</button>
      </form>
    </Modal>
  );
}

function ManualSend({ result, message, shopName, onClose }) {
  const [done, setDone] = useState({});
  return (
    <Modal title={`Send one by one · ${result.customers.length}`} onClose={onClose} wide>
      <p className="text-sm text-muted mb-3">Prati button nokkithe WhatsApp lo message ready ga open avtundi. Send nokki tirigi ikkadiki randi.</p>
      <ul className="flex flex-col divide-y divide-gray-100 max-h-[60vh] overflow-y-auto">
        {result.customers.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-2 py-2 text-sm">
            <span>{c.name} <span className="text-muted">{c.phone}</span></span>
            <a href={waLink(c.phone, `Namaste ${c.name} garu 🙏\n${message}\n\n– ${shopName}`)} target="_blank" rel="noreferrer" onClick={() => setDone({ ...done, [c.id]: true })} className={`btn h-9 px-3 ${done[c.id] ? 'bg-gray-100 text-gray-600' : 'bg-green-600 text-white'}`}>{done[c.id] ? '✓ Opened' : 'WhatsApp'}</a>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

export default function Campaigns() {
  const { me } = useAuth();
  const can = me.permissions.marketing || {};
  const seg = useApi('/marketing/segments');
  const { data, error, reload } = useApi('/marketing/campaigns');
  const [creating, setCreating] = useState(false);
  const [manual, setManual] = useState(null);
  const [msg, setMsg] = useState('');
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Marketing" subtitle="WhatsApp campaigns to your customers">
        {can.add && seg.data && <button type="button" className="btn-primary" onClick={() => setCreating(true)}><Icon name="plus" size={18} /> New Campaign</button>}
      </PageHeader>
      <SubNav items={MK_NAV} />
      <ErrorBox>{error || seg.error}</ErrorBox>
      {msg && <p className="text-sm bg-green-50 border border-green-200 rounded-xl p-3 font-semibold">{msg}</p>}
      {data && <p className="text-sm text-muted">Automatic messages ee nela: {data.usedThisMonth} / {data.limit}</p>}
      <div className="card divide-y divide-gray-100">
        {(data?.campaigns || []).length === 0 && <p className="p-6 text-center text-muted">Inka campaigns levu. Festival offer, kotha stock, "we miss you" – customers ki WhatsApp lo pampandi.</p>}
        {(data?.campaigns || []).map((c) => (
          <div key={c.id} className="p-4 flex flex-wrap justify-between gap-2 text-sm">
            <span><b>{c.title}</b><span className="block text-xs text-muted">{fmtDateTime(c.createdAt)} · {seg.data?.segments[c.segment] || c.segment}{c.segmentArg ? ` (${c.segmentArg})` : ''}</span><span className="block text-gray-700 mt-1 line-clamp-2">{c.message}</span></span>
            <span className="text-right">{c.mode === 'auto' ? <><b className="text-green-800">{c.sent} sent</b>{c.failed ? <span className="block text-red-700">{c.failed} failed</span> : null}</> : <b>{c.audience} customers (manual)</b>}</span>
          </div>
        ))}
      </div>
      {creating && seg.data && (
        <NewCampaign seg={seg.data} onClose={() => setCreating(false)} onDone={(r, f) => {
          setCreating(false);
          reload();
          if (f.mode === 'manual') setManual({ result: r, message: f.message });
          else setMsg(`✅ ${r.campaign.sent} messages sent${r.campaign.failed ? `, ${r.campaign.failed} failed` : ''}`);
        }} />
      )}
      {manual && <ManualSend result={manual.result} message={manual.message} shopName={me.business?.name || ''} onClose={() => setManual(null)} />}
    </div>
  );
}
