import { useMemo, useState } from 'react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { Badge, ErrorBox, Field, Modal, PageHeader, SALES_NAV, SubNav, useApi, useForm } from '../../components/ui.jsx';
import Icon from '../../components/Icon.jsx';
import { inr, SOURCES, STAGE_LABEL, waLink } from '../../lib/format.js';

const STAGES = ['new', 'contacted', 'quotation', 'won', 'lost'];
const DOT = { new: 'bg-indigo-500', contacted: 'bg-sky-500', quotation: 'bg-amber-500', won: 'bg-green-600', lost: 'bg-gray-400' };

function LeadForm({ lead, staff, onClose, onSaved }) {
  const [f, , set] = useForm({
    name: lead?.name || '', phone: lead?.phone || '', need: lead?.need || '', value: lead?.value ?? '',
    stage: lead?.stage || 'new', priority: lead?.priority || 'warm', source: lead?.source || '',
    assignedToId: lead?.assignedToId || '', notes: lead?.notes || '', lostReason: lead?.lostReason || '',
  });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const body = { ...f, value: f.value === '' ? 0 : Number(f.value) };
      await api(lead ? `/leads/${lead.id}` : '/leads', { method: lead ? 'PUT' : 'POST', body });
      onSaved();
    } catch (x) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={lead ? 'Edit lead' : 'New lead'} onClose={onClose}>
      <form onSubmit={save} className="flex flex-col gap-4">
        <ErrorBox>{err}</ErrorBox>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Name" id="l-name"><input id="l-name" required className="input" value={f.name} onChange={set('name')} /></Field>
          <Field label="Mobile" id="l-phone"><input id="l-phone" inputMode="numeric" maxLength={10} className="input" value={f.phone} onChange={set('phone')} /></Field>
          <Field label="What do they need?" id="l-need" className="sm:col-span-2"><input id="l-need" className="input" value={f.need} onChange={set('need')} placeholder="e.g. 12 pattu sarees for wedding" /></Field>
          <Field label="Expected value (₹)" id="l-val"><input id="l-val" type="number" min="0" step="0.01" className="input" value={f.value} onChange={set('value')} /></Field>
          <Field label="Source" id="l-src">
            <select id="l-src" className="input" value={f.source} onChange={set('source')}>
              <option value="">Select</option>
              {SOURCES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Stage" id="l-stage">
            <select id="l-stage" className="input" value={f.stage} onChange={set('stage')}>
              {STAGES.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
            </select>
          </Field>
          <Field label="Priority" id="l-pri">
            <select id="l-pri" className="input" value={f.priority} onChange={set('priority')}>
              <option value="hot">Hot</option><option value="warm">Warm</option><option value="cold">Cold</option>
            </select>
          </Field>
          <Field label="Assigned to" id="l-asg" className="sm:col-span-2">
            <select id="l-asg" className="input" value={f.assignedToId} onChange={set('assignedToId')}>
              <option value="">Nobody</option>
              {staff.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </Field>
          {f.stage === 'lost' && (
            <Field label="Why lost?" id="l-lost" className="sm:col-span-2"><input id="l-lost" className="input" value={f.lostReason} onChange={set('lostReason')} /></Field>
          )}
          <Field label="Notes" id="l-notes" className="sm:col-span-2"><textarea id="l-notes" rows={2} className="input h-auto py-2.5" value={f.notes} onChange={set('notes')} /></Field>
        </div>
        {f.stage === 'won' && !lead?.customerId && <p className="text-xs text-muted">Won ayithe ee lead automatic ga Customers list lo add avutundi.</p>}
        <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save lead'}</button>
      </form>
    </Modal>
  );
}

export default function Leads() {
  const { me } = useAuth();
  const can = me.permissions.sales;
  const { data, error, reload, setData } = useApi('/leads');
  const [editing, setEditing] = useState(null); // null | 'new' | lead
  const [err, setErr] = useState('');

  const cols = useMemo(() => {
    const leads = data?.leads || [];
    return STAGES.map((s) => {
      const list = leads.filter((l) => l.stage === s);
      return { stage: s, list, total: list.reduce((a, l) => a + Number(l.value || 0), 0) };
    });
  }, [data]);

  const open = cols.filter((c) => ['new', 'contacted', 'quotation'].includes(c.stage));
  const pipelineValue = open.reduce((a, c) => a + c.total, 0);

  const move = async (lead, stage) => {
    setErr('');
    const prev = data;
    setData({ ...data, leads: data.leads.map((l) => (l.id === lead.id ? { ...l, stage } : l)) });
    try {
      await api(`/leads/${lead.id}`, { method: 'PUT', body: { stage } });
      reload();
    } catch (x) {
      setData(prev);
      setErr(x.message);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Sales & Customers" subtitle="Lead nunchi payment varaku – prati customer journey okka chota">
        {can.add && <button type="button" className="btn-primary" onClick={() => setEditing('new')}><Icon name="plus" size={18} /> Add Lead</button>}
      </PageHeader>
      <SubNav items={SALES_NAV} />
      <ErrorBox>{error || err}</ErrorBox>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="card p-4"><p className="text-xs font-semibold text-muted">Open leads</p><p className="text-xl font-extrabold">{open.reduce((a, c) => a + c.list.length, 0)}</p></div>
        <div className="card p-4"><p className="text-xs font-semibold text-muted">Pipeline value</p><p className="text-xl font-extrabold">{inr(pipelineValue)}</p></div>
        <div className="card p-4"><p className="text-xs font-semibold text-muted">Won (90 days)</p><p className="text-xl font-extrabold">{cols[3].list.length} · {inr(cols[3].total)}</p></div>
        <div className="card p-4"><p className="text-xs font-semibold text-muted">Hot leads</p><p className="text-xl font-extrabold">{(data?.leads || []).filter((l) => l.priority === 'hot' && !['won', 'lost'].includes(l.stage)).length}</p></div>
      </div>

      <div className="overflow-x-auto -mx-4 px-4 lg:mx-0 lg:px-0 pb-2">
        <div className="grid grid-cols-5 gap-3 min-w-[1100px]">
          {cols.map((c) => (
            <section key={c.stage} aria-label={STAGE_LABEL[c.stage]} className="bg-[#EEF0F6] rounded-2xl p-3 flex flex-col gap-2.5 min-h-[200px]">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${DOT[c.stage]}`} />
                  <h2 className="text-sm font-bold">{STAGE_LABEL[c.stage]}</h2>
                  <span className="text-xs font-bold bg-white rounded-full px-2 py-0.5">{c.list.length}</span>
                </div>
                <span className="text-xs font-semibold text-gray-600">{inr(c.total)}</span>
              </div>
              {c.list.map((l) => (
                <article key={l.id} className="bg-white border border-line rounded-xl p-3 flex flex-col gap-2">
                  <div className="flex justify-between gap-2">
                    <button type="button" className="text-left font-bold text-sm hover:underline" onClick={() => can.edit && setEditing(l)}>{l.name}</button>
                    <span className="text-sm font-extrabold whitespace-nowrap">{Number(l.value) ? inr(l.value) : ''}</span>
                  </div>
                  {l.need && <p className="text-xs text-gray-600">{l.need}</p>}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge status={l.priority} />
                    {l.source && <span className="text-xs text-muted">via {l.source}</span>}
                  </div>
                  <div className="flex items-center gap-1.5 pt-1 border-t border-gray-100">
                    {l.phone && (
                      <a href={waLink(l.phone, `Namaste ${l.name} garu,`)} target="_blank" rel="noreferrer" aria-label={`WhatsApp ${l.name}`} className="w-9 h-9 rounded-lg bg-green-100 text-green-800 flex items-center justify-center text-xs font-bold">WA</a>
                    )}
                    {l.phone && <a href={`tel:${l.phone}`} aria-label={`Call ${l.name}`} className="w-9 h-9 rounded-lg bg-gray-100 text-ink flex items-center justify-center text-xs font-bold">Call</a>}
                    {can.edit && (
                      <>
                        <label className="sr-only" htmlFor={`mv-${l.id}`}>Move {l.name}</label>
                        <select id={`mv-${l.id}`} className="ml-auto h-9 text-xs rounded-lg border border-line px-2 bg-white" value={l.stage} onChange={(e) => move(l, e.target.value)}>
                          {STAGES.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
                        </select>
                      </>
                    )}
                  </div>
                </article>
              ))}
            </section>
          ))}
        </div>
      </div>

      {editing && (
        <LeadForm
          lead={editing === 'new' ? null : editing}
          staff={data?.staff || []}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload(); }}
        />
      )}
    </div>
  );
}
