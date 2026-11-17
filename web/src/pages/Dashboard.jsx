import { Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { MODULE_INFO, MODULE_ORDER } from '../constants.js';
import Icon from '../components/Icon.jsx';

const TINTS = {
  sales: 'bg-blue-100 text-blue-800',
  marketing: 'bg-pink-100 text-pink-800',
  accounts: 'bg-green-100 text-green-800',
  operations: 'bg-amber-100 text-amber-800',
  hr: 'bg-teal-100 text-teal-800',
  rnd: 'bg-violet-100 text-violet-800',
  management: 'bg-orange-100 text-orange-800',
};

const KPIS = [
  { label: "Today's Sales", icon: 'sales' },
  { label: 'This Month', icon: 'reports' },
  { label: 'Pending Payments', icon: 'accounts' },
  { label: 'New Leads', icon: 'staff' },
];

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function Dashboard() {
  const { me } = useAuth();
  const visible = MODULE_ORDER.filter((m) => me.modules.includes(m) && me.permissions[m]?.view);
  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl lg:text-3xl font-extrabold">{greeting()}, {me.user.name.split(' ')[0]}</h1>
        <p className="text-muted text-sm">{today} · {me.business.name}</p>
      </div>

      <section aria-label="Key numbers" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {KPIS.map((k) => (
          <div key={k.label} className="card p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-muted">{k.label}</span>
              <span className="w-9 h-9 rounded-xl bg-brand-light text-brand flex items-center justify-center"><Icon name={k.icon} size={18} /></span>
            </div>
            <span className="text-2xl font-extrabold text-gray-300">—</span>
            <span className="text-xs font-semibold text-muted">Sales module tarvata live avutundi</span>
          </div>
        ))}
      </section>

      <section aria-label="Your modules" className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">Mee modules</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visible.map((m) => (
            <Link key={m} to={`/m/${m}`} className="card p-5 flex gap-4 items-start hover:border-brand transition">
              <span className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${TINTS[m]}`}>
                <Icon name={MODULE_INFO[m].icon} size={22} />
              </span>
              <span className="flex flex-col gap-1">
                <span className="font-bold">{MODULE_INFO[m].label}</span>
                <span className="text-sm text-muted">{MODULE_INFO[m].desc}</span>
                <span className="text-xs font-bold text-accent-text">{MODULE_INFO[m].phase}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      {me.user.isOwner && (
        <section className="card p-5 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
          <div>
            <h2 className="font-bold">Start cheyyadaniki</h2>
            <p className="text-sm text-muted">Business details (GSTIN, address) fill cheyyandi, mee staff ni add cheyyandi.</p>
          </div>
          <div className="flex gap-3">
            <Link to="/settings" className="btn-ghost">Business details</Link>
            <Link to="/staff" className="btn-primary"><Icon name="plus" size={18} /> Add staff</Link>
          </div>
        </section>
      )}
    </div>
  );
}
