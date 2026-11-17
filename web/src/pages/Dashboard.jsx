import { Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { MODULE_INFO, MODULE_ORDER } from '../constants.js';
import Icon from '../components/Icon.jsx';
import { Badge, Bars, invoiceDisplayStatus, useApi } from '../components/ui.jsx';
import { fmtDate, fmtDateTime, inr, short, waLink } from '../lib/format.js';

const TINTS = {
  sales: 'bg-blue-100 text-blue-800',
  marketing: 'bg-pink-100 text-pink-800',
  accounts: 'bg-green-100 text-green-800',
  operations: 'bg-amber-100 text-amber-800',
  hr: 'bg-teal-100 text-teal-800',
  rnd: 'bg-violet-100 text-violet-800',
  management: 'bg-orange-100 text-orange-800',
};

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

const pct = (now, before) => (before > 0 ? Math.round(((now - before) / before) * 100) : null);

function Kpi({ label, value, sub, good = true, icon, tint }) {
  return (
    <div className="card p-5 flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-muted">{label}</span>
        <span className={`w-9 h-9 rounded-xl flex items-center justify-center ${tint}`}><Icon name={icon} size={18} /></span>
      </div>
      <span className="text-2xl font-extrabold tracking-tight">{value}</span>
      {sub && <span className={`text-xs font-semibold ${good ? 'text-green-800' : 'text-orange-800'}`}>{sub}</span>}
    </div>
  );
}

export default function Dashboard() {
  const { me } = useAuth();
  const { data } = useApi('/dashboard');
  const visible = MODULE_ORDER.filter((m) => me.modules.includes(m) && me.permissions[m]?.view);
  const todayLabel = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
  const s = data?.sales;
  const a = data?.accounts;
  const dayPct = s ? pct(s.todaySales, s.yesterdaySales) : null;
  const monthPct = s ? pct(s.monthSales, s.lastMonthToDate) : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl lg:text-3xl font-extrabold">{greeting()}, {me.user.name.split(' ')[0]}</h1>
          <p className="text-muted text-sm">{todayLabel} · {me.business.name}</p>
        </div>
        {me.permissions.sales?.add && me.modules.includes('sales') && (
          <div className="flex gap-2">
            <Link to="/sales/invoices/new" className="btn-primary"><Icon name="plus" size={18} /> New Invoice</Link>
            {me.permissions.accounts?.add && me.modules.includes('accounts') && <Link to="/accounts/expenses?new=1" className="btn-ghost">Add Expense</Link>}
          </div>
        )}
      </div>

      {s && (
        <section aria-label="Key numbers" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Kpi label="Today's Sales" value={inr(s.todaySales)} icon="sales" tint="bg-blue-100 text-blue-800"
            sub={dayPct === null ? 'vs yesterday: —' : `${dayPct >= 0 ? '▲' : '▼'} ${Math.abs(dayPct)}% vs yesterday`} good={dayPct === null || dayPct >= 0} />
          <Kpi label="This Month" value={inr(s.monthSales)} icon="reports" tint="bg-violet-100 text-violet-800"
            sub={monthPct === null ? 'vs last month: —' : `${monthPct >= 0 ? '▲' : '▼'} ${Math.abs(monthPct)}% vs last month`} good={monthPct === null || monthPct >= 0} />
          <Kpi label="Pending Payments" value={inr(s.pendingAmount)} icon="accounts" tint="bg-orange-100 text-orange-800" sub={`${s.pendingCount} invoices due`} good={s.pendingCount === 0} />
          <Kpi label="New Leads" value={s.newLeads} icon="staff" tint="bg-green-100 text-green-800" sub={`This week · ${s.hotLeads} hot`} />
        </section>
      )}

      {a && (
        <section aria-label="This month profit" className="grid grid-cols-3 gap-4">
          <div className="card p-4"><p className="text-xs font-semibold text-muted">Income (month)</p><p className="text-lg font-extrabold">{inr(a.monthIncome)}</p></div>
          <div className="card p-4"><p className="text-xs font-semibold text-muted">Expenses (month)</p><p className="text-lg font-extrabold">{inr(a.monthExpenses)}</p></div>
          <div className="card p-4"><p className="text-xs font-semibold text-muted">Profit (month)</p><p className={`text-lg font-extrabold ${a.monthProfit < 0 ? 'text-red-700' : 'text-green-800'}`}>{inr(a.monthProfit)}</p></div>
        </section>
      )}

      {s && (
        <div className="grid lg:grid-cols-5 gap-4">
          <section className="card p-5 flex flex-col gap-3 lg:col-span-3">
            <div className="flex justify-between items-center">
              <h2 className="font-bold">Sales – last 7 days</h2>
              <span className="text-sm text-muted">Total <strong className="text-ink">{inr(s.last7.reduce((x, d) => x + d.total, 0))}</strong></span>
            </div>
            <Bars data={s.last7.map((d) => ({ label: new Date(`${d.date}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'UTC' }), total: d.total }))} format={short} />
          </section>
          <section className="card p-5 flex flex-col gap-2 lg:col-span-2">
            <div className="flex justify-between items-center">
              <h2 className="font-bold">Today's follow-ups</h2>
              <Link to="/sales/followups" className="text-sm font-semibold text-brand">View all</Link>
            </div>
            {s.followUps.length === 0 && <p className="text-sm text-muted py-4">Ee roju pending follow-ups levu.</p>}
            {s.followUps.map((f) => {
              const who = f.customer || f.lead;
              return (
                <div key={f.id} className="flex items-center gap-3 py-2 border-t border-gray-100">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate">{who?.name || f.title}</p>
                    <p className="text-xs text-muted truncate">{who ? `${f.title} · ` : ''}{fmtDateTime(f.dueAt)}</p>
                  </div>
                  {who?.phone && <a href={waLink(who.phone, `Namaste ${who.name} garu,`)} target="_blank" rel="noreferrer" aria-label={`WhatsApp ${who.name}`} className="w-10 h-10 rounded-xl bg-green-100 text-green-800 text-xs font-bold flex items-center justify-center">WA</a>}
                </div>
              );
            })}
          </section>
        </div>
      )}

      {s && s.recent.length > 0 && (
        <section className="card p-5 flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <h2 className="font-bold">Recent invoices</h2>
            <Link to="/sales/invoices" className="text-sm font-semibold text-brand">All invoices</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <tbody>
                {s.recent.map((i) => (
                  <tr key={i.id} className="border-t border-gray-100">
                    <td className="py-2.5"><Link to={`/sales/invoices/${i.id}`} className="font-bold text-brand">{i.number}</Link></td>
                    <td className="py-2.5">{i.customer}</td>
                    <td className="py-2.5 text-gray-600">{fmtDate(i.date)}</td>
                    <td className="py-2.5 text-right font-bold">{inr(i.total)}</td>
                    <td className="py-2.5 text-right"><Badge status={invoiceDisplayStatus(i)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section aria-label="Your modules" className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">Mee modules</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visible.map((m) => (
            <Link key={m} to={MODULE_INFO[m].path || `/m/${m}`} className="card p-5 flex gap-4 items-start hover:border-brand transition">
              <span className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${TINTS[m]}`}>
                <Icon name={MODULE_INFO[m].icon} size={22} />
              </span>
              <span className="flex flex-col gap-1">
                <span className="font-bold">{MODULE_INFO[m].label}</span>
                <span className="text-sm text-muted">{MODULE_INFO[m].desc}</span>
                <span className={`text-xs font-bold ${MODULE_INFO[m].phase === 'Live' ? 'text-green-800' : 'text-accent-text'}`}>{MODULE_INFO[m].phase === 'Live' ? '● Live' : MODULE_INFO[m].phase}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
