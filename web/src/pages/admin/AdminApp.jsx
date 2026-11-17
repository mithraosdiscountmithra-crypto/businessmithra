import { useEffect, useState } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { ErrorBox, Field, Modal, Stat, useApi } from '../../components/ui.jsx';
import { MODULE_INFO } from '../../constants.js';
import { fmtDate, fmtDateTime, inr } from '../../lib/format.js';

const STATE = {
  trial: ['Trial', 'bg-blue-100 text-blue-800'],
  paid: ['Paid', 'bg-green-100 text-green-800'],
  free: ['Free', 'bg-gray-100 text-gray-800'],
  expired: ['Expired', 'bg-red-100 text-red-800'],
  blocked: ['Blocked', 'bg-gray-800 text-white'],
};
const Pill = ({ s }) => <span className={`text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${STATE[s]?.[1] || 'bg-gray-100'}`}>{STATE[s]?.[0] || s}</span>;
const MODE = { cash: 'Cash', upi: 'UPI', bank: 'Bank' };

function AdminLogin({ onDone }) {
  const [f, setF] = useState({ email: '', password: '' });
  const [err, setErr] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    try {
      await api('/admin/login', { method: 'POST', body: f });
      onDone();
    } catch (x) {
      setErr(x.message);
    }
  };
  return (
    <div className="min-h-screen flex items-center justify-center bg-ink p-4">
      <form onSubmit={submit} className="bg-white rounded-2xl p-6 w-full max-w-sm flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl bg-accent text-white flex items-center justify-center font-extrabold">B</span>
          <div><p className="font-extrabold">BusinessMithra</p><p className="text-xs text-muted">Super Admin</p></div>
        </div>
        <ErrorBox>{err}</ErrorBox>
        <Field label="Email" id="a-em"><input id="a-em" type="email" required className="input" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Password" id="a-pw"><input id="a-pw" type="password" required className="input" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
        <button type="submit" className="btn-primary">Login</button>
      </form>
    </div>
  );
}

function Dashboard() {
  const { data, error } = useApi('/admin/stats');
  if (error) return <ErrorBox>{error}</ErrorBox>;
  if (!data) return <p className="text-muted">Loading…</p>;
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-extrabold">Platform overview</h1>
      {data.pending > 0 && (
        <Link to="/admin/requests" className="rounded-2xl bg-amber-50 border-2 border-amber-300 p-4 font-bold flex justify-between">
          <span>⏳ {data.pending} plan request{data.pending > 1 ? 's' : ''} waiting for your approval</span><span>Open →</span>
        </Link>
      )}
      {data.domainRequests?.length > 0 && (
        <section className="rounded-2xl bg-blue-50 border-2 border-blue-200 p-4 flex flex-col gap-1">
          <p className="font-bold">🌐 {data.domainRequests.length} own-domain request(s)</p>
          {data.domainRequests.map((d) => <Link key={d.id} to={`/admin/businesses/${d.id}`} className="text-sm font-semibold text-brand">{d.name} → {d.customDomain}</Link>)}
        </section>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Total businesses" value={data.total} sub={`+${data.signupsWeek} this week · +${data.signupsMonth} this month`} />
        <Stat label="Paid businesses" value={data.paid} tone="text-green-800" />
        <Stat label="MRR (monthly recurring)" value={inr(data.mrr)} sub="Active paid plans, per month" />
        <Stat label="Collected this month" value={inr(data.revenueMonth)} sub={`All time ${inr(data.revenueAll)}`} />
        <Stat label="On free trial" value={data.trial} sub={`${data.trialEndingSoon} ending in 5 days`} />
        <Stat label="Free plan" value={data.free} />
        <Stat label="Expired" value={data.expired} tone={data.expired ? 'text-red-700' : ''} sub="Follow up for renewal" />
        <Stat label="Blocked" value={data.blocked} />
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <section className="card p-5">
          <h2 className="font-bold mb-2">Usage (last 7 days)</h2>
          <p className="text-sm">🧾 {data.invoicesWeek} invoices created</p>
          <p className="text-sm">🛍️ {data.ordersWeek} online orders</p>
        </section>
        <section className="card p-5">
          <h2 className="font-bold mb-2">Business types</h2>
          {data.byType.map((t) => <p key={t.type} className="text-sm flex justify-between capitalize"><span>{t.type}</span><strong>{t.count}</strong></p>)}
        </section>
      </div>
    </div>
  );
}

function Businesses() {
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('');
  const { data, error } = useApi(`/admin/businesses?q=${encodeURIComponent(query)}&filter=${filter}`);
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-extrabold">Businesses</h1>
      <div className="flex flex-wrap gap-2">
        {[['', 'All'], ['trial', 'Trial'], ['paid', 'Paid'], ['free', 'Free'], ['expired', 'Expired'], ['blocked', 'Blocked']].map(([v, l]) => (
          <button key={v} type="button" aria-pressed={filter === v} onClick={() => setFilter(v)} className={`h-9 px-3.5 rounded-lg text-sm font-semibold border ${filter === v ? 'bg-ink text-white border-ink' : 'bg-white border-line'}`}>{l}</button>
        ))}
        <form onSubmit={(e) => { e.preventDefault(); setQuery(q); }} className="flex gap-2 ml-auto">
          <label className="sr-only" htmlFor="ab-q">Search</label>
          <input id="ab-q" type="search" className="input h-9" placeholder="Name, phone, town" value={q} onChange={(e) => setQ(e.target.value)} />
          <button type="submit" className="btn-ghost h-9 px-3">Search</button>
        </form>
      </div>
      <ErrorBox>{error}</ErrorBox>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="text-left text-muted border-b border-line">
              <th className="p-3">Business</th><th className="p-3">Owner</th><th className="p-3">Plan</th><th className="p-3">Ends</th>
              <th className="p-3 text-right">Invoices</th><th className="p-3 text-right">Orders</th><th className="p-3">Last active</th><th className="p-3">Joined</th>
            </tr>
          </thead>
          <tbody>
            {(data?.businesses || []).map((b) => (
              <tr key={b.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="p-3"><Link to={`/admin/businesses/${b.id}`} className="font-bold text-brand">{b.name}</Link><span className="block text-xs text-muted capitalize">{b.type}{b.city ? ` · ${b.city}` : ''}{b.customDomain ? ` · 🌐 ${b.customDomain}` : ''}</span></td>
                <td className="p-3">{b.owner?.name}<span className="block text-xs text-muted">{b.phone}</span></td>
                <td className="p-3"><Pill s={b.state} /> <span className="text-xs text-muted">{b.plan}</span></td>
                <td className="p-3">{b.endsAt ? <>{fmtDate(b.endsAt)}<span className="block text-xs text-muted">{b.daysLeft} days</span></> : '—'}</td>
                <td className="p-3 text-right">{b.counts.invoices}</td>
                <td className="p-3 text-right">{b.counts.orders}</td>
                <td className="p-3 text-gray-600">{b.lastActive ? fmtDateTime(b.lastActive) : '—'}</td>
                <td className="p-3 text-gray-600">{fmtDate(b.createdAt)}</td>
              </tr>
            ))}
            {data?.businesses?.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-muted">No businesses</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DomainBox({ b, reload, act }) {
  const cfg = useApi('/admin/domain-config');
  const [domain, setDomain] = useState((b.customDomain || '').replace(/^www\./, ''));
  const [provider, setProvider] = useState('hostinger');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [check, setCheck] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    if (b.customDomainStatus !== 'requested' || !b.customDomain) return undefined;
    let n = 0;
    const t = setInterval(async () => {
      n += 1;
      try {
        const r = await api(`/admin/businesses/${b.id}/domain/check`, { method: 'POST' });
        setCheck(r.verified ? '✅ Verified – LIVE' : `⏳ ${r.status}`);
        if (r.verified) { clearInterval(t); reload(); }
      } catch { /* keep trying */ }
      if (n >= 40) clearInterval(t);
    }, 30000);
    return () => clearInterval(t);
  }, [b.id, b.customDomain, b.customDomainStatus, reload]);

  const run = async () => {
    setErr('');
    setResult(null);
    setBusy(true);
    try {
      const r = await api(`/admin/businesses/${b.id}/domain/auto`, { method: 'POST', body: { domain, provider } });
      setResult(r);
      reload();
    } catch (x) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  };
  const checkNow = async () => {
    setCheck('Checking…');
    try {
      const r = await api(`/admin/businesses/${b.id}/domain/check`, { method: 'POST' });
      setCheck(r.verified ? '✅ Verified – LIVE' : `⏳ ${r.status}`);
      if (r.verified) reload();
    } catch (x) {
      setCheck(x.message);
    }
  };
  const c = cfg.data;

  return (
    <section className="card p-5 flex flex-col gap-3 text-sm lg:col-span-1">
      <h2 className="font-bold">🌐 Own domain · 🤖 Auto Connect</h2>
      {b.customDomain && (
        <p><strong>{b.customDomain}</strong> · <span className={b.customDomainStatus === 'live' ? 'text-green-800 font-bold' : 'text-amber-800 font-bold'}>{b.customDomainStatus === 'live' ? 'LIVE' : 'connecting…'}</span></p>
      )}
      {b.customDomainStatus === 'live' ? (
        <div className="flex flex-wrap gap-2">
          <a className="btn-ghost h-9 px-3" href={`https://${b.customDomain}`} target="_blank" rel="noreferrer">Open site</a>
          <button type="button" className="btn-ghost h-9 px-3 text-red-700" onClick={() => act({ action: 'domain_remove' }, 'Remove this domain from the shop and server?')}>Remove</button>
        </div>
      ) : (
        <>
          {c && (!c.render || (provider === 'hostinger' && !c.hostinger)) && (
            <p className="text-xs bg-amber-50 rounded-lg p-2">
              One-time setup: Render → Environment lo {!c.render && <code>RENDER_API_KEY</code>}{!c.render && provider === 'hostinger' && !c.hostinger && ' + '}{provider === 'hostinger' && !c.hostinger && <code>HOSTINGER_API_TOKEN</code>} add cheyyandi.
            </p>
          )}
          <label className="label mb-0" htmlFor="ad-dom">Domain (meeru konnadi)</label>
          <input id="ad-dom" className="input" value={domain} onChange={(e) => setDomain(e.target.value.toLowerCase())} placeholder="srisaitextiles.in" />
          <label className="label mb-0" htmlFor="ad-prov">Domain ekkada konnaru?</label>
          <select id="ad-prov" className="input" value={provider} onChange={(e) => setProvider(e.target.value)}>
            <option value="hostinger">Hostinger (DNS automatic)</option>
            <option value="other">Other (GoDaddy, BigRock… – DNS manual)</option>
          </select>
          <button type="button" className="btn-primary" disabled={busy || !domain} onClick={run}>{busy ? '🤖 Connecting…' : '🤖 Connect automatically'}</button>
          {err && <p className="error-box">{err}</p>}
          {result && (
            <ul className="flex flex-col gap-1">
              {result.steps.map((s2, i) => <li key={i} className={s2.ok ? 'text-green-800' : 'text-red-700'}>{s2.ok ? '✓' : '✗'} {s2.label}{s2.info ? ` – ${s2.info}` : ''}</li>)}
            </ul>
          )}
          {(provider === 'other' || result?.steps?.some((x) => !x.ok)) && (
            <div className="text-xs bg-gray-50 rounded-lg p-2">
              <p className="font-bold mb-1">DNS records (domain company lo pettandi):</p>
              <p>A · <code>@</code> → <code>216.24.57.1</code></p>
              <p>CNAME · <code>www</code> → <code>{c?.target || 'service.onrender.com'}</code></p>
              <p>AAAA records unte delete cheyyandi.</p>
            </div>
          )}
          {b.customDomain && (
            <div className="flex items-center gap-2">
              <button type="button" className="btn-ghost h-9 px-3" onClick={checkNow}>Check status</button>
              <span className="text-xs">{check || 'Prati 30 sec ki automatic ga check chestundi'}</span>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function BusinessDetail() {
  const { id } = useParams();
  const { data, error, reload } = useApi(`/admin/businesses/${id}`);
  const [err, setErr] = useState('');
  const [planForm, setPlanForm] = useState(null);
  const [note, setNote] = useState(null);

  if (error) return <ErrorBox>{error}</ErrorBox>;
  if (!data) return <p className="text-muted">Loading…</p>;
  const { business: b, access: a } = data;
  const owner = b.users.find((u) => u.isOwner);
  const act = async (body, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setErr('');
    try {
      await api(`/admin/businesses/${b.id}`, { method: 'POST', body });
      setPlanForm(null);
      reload();
    } catch (x) {
      setErr(x.message);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <Link to="/admin/businesses" className="text-sm font-semibold text-brand">← Businesses</Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">{b.name}</h1>
          <p className="text-sm text-muted capitalize">{b.type} · {[b.city, b.state].filter(Boolean).join(', ')} · joined {fmtDate(b.createdAt)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {owner?.phone && <a className="btn bg-green-100 text-green-800" target="_blank" rel="noreferrer" href={`https://wa.me/91${owner.phone}?text=${encodeURIComponent(`Namaste ${owner.name} garu, BusinessMithra nunchi.`)}`}>WhatsApp owner</a>}
          {b.slug && b.shopEnabled && <a className="btn-ghost" href={`/s/${b.slug}`} target="_blank" rel="noreferrer">Open shop</a>}
          {b.status === 'blocked'
            ? <button type="button" className="btn-primary" onClick={() => act({ action: 'unblock' })}>Unblock</button>
            : <button type="button" className="btn-ghost text-red-700" onClick={() => act({ action: 'block' }, `Block ${b.name}? They cannot log in and their shop will close.`)}>Block</button>}
        </div>
      </div>
      <ErrorBox>{err}</ErrorBox>

      <div className="grid lg:grid-cols-3 gap-4">
        <section className="card p-5 flex flex-col gap-3">
          <h2 className="font-bold">Subscription</h2>
          <p className="text-xl font-extrabold">{a.planName} <Pill s={b.status === 'blocked' ? 'blocked' : !a.active ? 'expired' : a.plan === 'trial' ? 'trial' : a.plan === 'free' ? 'free' : 'paid'} /></p>
          <p className="text-sm">{a.endsAt ? `Till ${fmtDate(a.endsAt)} · ${a.daysLeft} days left` : 'No end date'}{b.planCycle ? ` · ${b.planCycle}` : ''}</p>
          <div className="flex flex-wrap gap-2">
            {[7, 15, 30].map((d) => <button key={d} type="button" className="btn-ghost h-9 px-3" onClick={() => act({ action: 'extend_trial', days: d }, `Give ${d} more trial days?`)}>+{d} days trial</button>)}
            <button type="button" className="btn-primary h-9 px-3" onClick={() => setPlanForm({ planCode: 'basic', cycle: 'monthly', endsAt: '' })}>Set plan</button>
          </div>
        </section>
        <section className="card p-5 flex flex-col gap-2 text-sm">
          <h2 className="font-bold">Owner & usage</h2>
          <p><strong>{owner?.name}</strong> · {owner?.email}</p>
          <p>Business phone: {b.phone} {b.gstin && `· GSTIN ${b.gstin}`}</p>
          <p>Total sales billed: <strong>{inr(data.totalSales)}</strong></p>
          <p>{b._count.customers} customers · {b._count.invoices} invoices · {b._count.orders} online orders · {b._count.items} items · {b._count.leads} leads · {b._count.expenses} expenses</p>
          <p>Staff: {b.users.length} · Modules ON: {b.modules.filter((m) => m.enabled).map((m) => MODULE_INFO[m.module]?.label || m.module).join(', ')}</p>
        </section>
        <DomainBox b={b} reload={reload} act={act} />
        <section className="card p-5 flex flex-col gap-2">
          <h2 className="font-bold">Private note</h2>
          <textarea aria-label="Private note" rows={4} className="input h-auto py-2.5" value={note ?? b.adminNote ?? ''} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Called on 12 Nov, will pay next week" />
          <button type="button" className="btn-ghost h-9 self-start" onClick={() => act({ action: 'note', note })}>Save note</button>
        </section>
      </div>

      <section className="card p-5 flex flex-col gap-2">
        <h2 className="font-bold">Staff</h2>
        <table className="w-full text-sm"><tbody>
          {b.users.map((u) => <tr key={u.id} className="border-t border-gray-100"><td className="py-2 font-semibold">{u.name}</td><td className="py-2">{u.email}</td><td className="py-2">{u.role?.name}</td><td className="py-2">{u.status}</td><td className="py-2 text-gray-600">{u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : 'never'}</td></tr>)}
        </tbody></table>
      </section>

      <section className="card p-5 flex flex-col gap-2">
        <h2 className="font-bold">Plan requests & payments</h2>
        {b.subscriptionRequests.length === 0 ? <p className="text-sm text-muted">None yet</p> : (
          <table className="w-full text-sm"><tbody>
            {b.subscriptionRequests.map((r) => (
              <tr key={r.id} className="border-t border-gray-100">
                <td className="py-2">{fmtDate(r.createdAt)}</td><td className="py-2 font-semibold uppercase">{r.planCode} · {r.cycle}</td>
                <td className="py-2">{inr(r.amount)} · {MODE[r.paymentMode]}{r.reference ? ` · ${r.reference}` : ''}</td>
                <td className="py-2 capitalize">{r.status}{r.validTill ? ` · till ${fmtDate(r.validTill)}` : ''}</td>
              </tr>
            ))}
          </tbody></table>
        )}
      </section>

      {planForm && (
        <Modal title={`Set plan · ${b.name}`} onClose={() => setPlanForm(null)}>
          <div className="flex flex-col gap-4">
            <Field label="Plan" id="sp-plan">
              <select id="sp-plan" className="input" value={planForm.planCode} onChange={(e) => setPlanForm({ ...planForm, planCode: e.target.value })}>
                {data.plans.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
              </select>
            </Field>
            {planForm.planCode !== 'free' && (
              <>
                <Field label="Cycle" id="sp-cyc">
                  <select id="sp-cyc" className="input" value={planForm.cycle} onChange={(e) => setPlanForm({ ...planForm, cycle: e.target.value })}><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select>
                </Field>
                <Field label="Valid till (optional)" id="sp-end" hint="Khaali ga unte ee roju nunchi 1 month / 1 year"><input id="sp-end" type="date" className="input" value={planForm.endsAt} onChange={(e) => setPlanForm({ ...planForm, endsAt: e.target.value })} /></Field>
              </>
            )}
            <p className="text-xs text-muted">Idi payment record cheyyadu. Cash teeskunte, vendor nunchi request pampinchi approve cheyyadam better (revenue report lo vastundi).</p>
            <button type="button" className="btn-primary" onClick={() => act({ action: 'set_plan', planCode: planForm.planCode, cycle: planForm.cycle, endsAt: planForm.endsAt || null })}>Save</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Requests() {
  const [status, setStatus] = useState('pending');
  const { data, error, reload } = useApi(`/admin/requests?status=${status}`);
  const [err, setErr] = useState('');
  const [approving, setApproving] = useState(null);

  const reject = async (r) => {
    const reason = window.prompt('Reject reason (vendor ki kanipistundi):', 'Payment not received');
    if (reason === null) return;
    try {
      await api(`/admin/requests/${r.id}/reject`, { method: 'POST', body: { adminNote: reason } });
      reload();
    } catch (x) {
      setErr(x.message);
    }
  };
  const approve = async () => {
    setErr('');
    try {
      await api(`/admin/requests/${approving.id}/approve`, { method: 'POST', body: { amount: approving.amount, adminNote: approving.adminNote } });
      setApproving(null);
      reload();
    } catch (x) {
      setErr(x.message);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-extrabold">Plan requests</h1>
      <div className="flex gap-2">
        {[['pending', 'Pending'], ['approved', 'Approved'], ['rejected', 'Rejected'], ['all', 'All']].map(([v, l]) => (
          <button key={v} type="button" aria-pressed={status === v} onClick={() => setStatus(v)} className={`h-9 px-3.5 rounded-lg text-sm font-semibold border ${status === v ? 'bg-ink text-white border-ink' : 'bg-white border-line'}`}>{l}</button>
        ))}
      </div>
      <ErrorBox>{error || err}</ErrorBox>
      {data?.requests?.length === 0 && <p className="card p-6 text-center text-muted">Emi levu</p>}
      <div className="grid lg:grid-cols-2 gap-4">
        {(data?.requests || []).map((r) => (
          <article key={r.id} className="card p-4 flex flex-col gap-2">
            <div className="flex justify-between gap-3">
              <div>
                <Link to={`/admin/businesses/${r.business.id}`} className="font-extrabold text-brand">{r.business.name}</Link>
                <p className="text-xs text-muted">{r.business.city} · {r.business.phone} · now: {r.business.plan}</p>
              </div>
              <span className="text-xs font-bold capitalize">{r.status}</span>
            </div>
            <p className="text-lg font-extrabold">{r.planCode.toUpperCase()} · {r.cycle} · {inr(r.amount)}</p>
            <p className="text-sm">Paid by <strong>{MODE[r.paymentMode]}</strong>{r.reference ? ` · Ref ${r.reference}` : ''}</p>
            {r.note && <p className="text-sm">Note: {r.note}</p>}
            <p className="text-xs text-muted">Requested {fmtDateTime(r.createdAt)}{r.decidedAt ? ` · decided ${fmtDateTime(r.decidedAt)}` : ''}{r.validTill ? ` · till ${fmtDate(r.validTill)}` : ''}{r.adminNote ? ` · ${r.adminNote}` : ''}</p>
            {r.status === 'pending' && (
              <div className="flex gap-2 pt-1">
                <button type="button" className="btn-primary h-10" onClick={() => setApproving({ ...r, adminNote: '' })}>Approve</button>
                <button type="button" className="btn-ghost h-10 text-red-700" onClick={() => reject(r)}>Reject</button>
              </div>
            )}
          </article>
        ))}
      </div>
      {approving && (
        <Modal title={`Approve · ${approving.business.name}`} onClose={() => setApproving(null)}>
          <div className="flex flex-col gap-4">
            <p className="text-sm">{approving.planCode.toUpperCase()} · {approving.cycle}. Approve chesina ventane plan start avutundi.</p>
            <Field label="Amount received (₹)" id="ap-amt" hint="Discount ichi takkuva teeskunte ikkada marchandi"><input id="ap-amt" type="number" min="0" className="input" value={approving.amount} onChange={(e) => setApproving({ ...approving, amount: e.target.value })} /></Field>
            <Field label="Note (optional)" id="ap-note"><input id="ap-note" className="input" value={approving.adminNote} onChange={(e) => setApproving({ ...approving, adminNote: e.target.value })} placeholder="e.g. Cash received by Anil" /></Field>
            <button type="button" className="btn-primary" onClick={approve}>✓ Payment received – Approve</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Plans() {
  const { data, error, reload } = useApi('/admin/plans');
  const [edit, setEdit] = useState(null);
  const [err, setErr] = useState('');
  const save = async () => {
    setErr('');
    try {
      await api(`/admin/plans/${edit.code}`, { method: 'PUT', body: { ...edit, priceMonthly: Number(edit.priceMonthly), priceYearly: Number(edit.priceYearly), maxUsers: Number(edit.maxUsers) } });
      setEdit(null);
      reload();
    } catch (x) {
      setErr(x.message);
    }
  };
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-extrabold">Plans & prices</h1>
      <ErrorBox>{error}</ErrorBox>
      <div className="grid md:grid-cols-3 gap-4">
        {(data?.plans || []).map((p) => (
          <article key={p.code} className="card p-5 flex flex-col gap-2">
            <h2 className="text-lg font-extrabold">{p.name} {!p.active && <span className="text-xs text-red-700">(hidden)</span>}</h2>
            <p>{inr(p.priceMonthly)}/month · {inr(p.priceYearly)}/year</p>
            <p className="text-sm">{p.maxUsers === 0 ? 'Unlimited users' : `${p.maxUsers} users`}</p>
            <p className="text-sm text-muted">{p.modules.map((m) => MODULE_INFO[m]?.label || m).join(', ')}</p>
            <button type="button" className="btn-ghost h-9 self-start" onClick={() => setEdit({ ...p, description: p.description || '' })}>Edit</button>
          </article>
        ))}
      </div>
      {edit && (
        <Modal title={`Edit ${edit.name}`} onClose={() => setEdit(null)}>
          <div className="flex flex-col gap-4">
            <ErrorBox>{err}</ErrorBox>
            <Field label="Name" id="pl-n"><input id="pl-n" className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="₹ / month" id="pl-m"><input id="pl-m" type="number" min="0" className="input" value={edit.priceMonthly} onChange={(e) => setEdit({ ...edit, priceMonthly: e.target.value })} /></Field>
              <Field label="₹ / year" id="pl-y"><input id="pl-y" type="number" min="0" className="input" value={edit.priceYearly} onChange={(e) => setEdit({ ...edit, priceYearly: e.target.value })} /></Field>
              <Field label="Users (0 = ∞)" id="pl-u"><input id="pl-u" type="number" min="0" className="input" value={edit.maxUsers} onChange={(e) => setEdit({ ...edit, maxUsers: e.target.value })} /></Field>
            </div>
            <fieldset>
              <legend className="label">Modules</legend>
              <div className="grid grid-cols-2 gap-2">
                {data.modules.map((m) => (
                  <label key={m} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" className="w-5 h-5 accent-brand" disabled={m === 'management'} checked={edit.modules.includes(m)} onChange={(e) => setEdit({ ...edit, modules: e.target.checked ? [...edit.modules, m] : edit.modules.filter((x) => x !== m) })} />
                    {MODULE_INFO[m]?.label || m}
                  </label>
                ))}
              </div>
            </fieldset>
            <Field label="Short description" id="pl-d"><input id="pl-d" className="input" value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
            <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" className="w-5 h-5 accent-brand" checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> Show to vendors</label>
            <button type="button" className="btn-primary" onClick={save}>Save</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

const link = ({ isActive }) => `px-3 py-2 rounded-lg text-sm font-semibold ${isActive ? 'bg-white text-ink' : 'text-gray-300 hover:text-white'}`;

export default function AdminApp() {
  const [state, setState] = useState('loading'); // loading | in | out
  const navigate = useNavigate();
  const check = () => api('/admin/me').then(() => setState('in')).catch(() => setState('out'));
  useEffect(() => {
    check();
  }, []);
  if (state === 'loading') return <div className="min-h-screen flex items-center justify-center text-muted">Loading…</div>;
  if (state === 'out') return <AdminLogin onDone={check} />;
  const logout = async () => {
    await api('/admin/logout', { method: 'POST' });
    setState('out');
    navigate('/admin');
  };
  return (
    <div className="min-h-screen bg-ground">
      <header className="bg-ink text-white">
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center gap-2">
          <span className="font-extrabold mr-4">BusinessMithra · Super Admin</span>
          <nav aria-label="Admin" className="flex flex-wrap gap-1">
            <NavLink to="/admin" end className={link}>Overview</NavLink>
            <NavLink to="/admin/businesses" className={link}>Businesses</NavLink>
            <NavLink to="/admin/requests" className={link}>Requests</NavLink>
            <NavLink to="/admin/plans" className={link}>Plans</NavLink>
          </nav>
          <button type="button" onClick={logout} className="ml-auto text-sm text-gray-300 hover:text-white h-10 px-3">Logout</button>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6">
        <Routes>
          <Route index element={<Dashboard />} />
          <Route path="businesses" element={<Businesses />} />
          <Route path="businesses/:id" element={<BusinessDetail />} />
          <Route path="requests" element={<Requests />} />
          <Route path="plans" element={<Plans />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </main>
    </div>
  );
}
