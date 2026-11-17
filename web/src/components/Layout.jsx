import { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { MODULE_INFO, MODULE_ORDER } from '../constants.js';
import Icon from './Icon.jsx';

const linkClass = ({ isActive }) =>
  `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition ${
    isActive ? 'bg-navy-700 text-white font-bold' : 'text-navy-200 font-medium hover:bg-white/5 hover:text-white'
  }`;

function Sidebar({ onNavigate }) {
  const { me, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const visible = MODULE_ORDER.filter((m) => me.modules.includes(m) && me.permissions[m]?.view);
  const sub = me.subscription;

  const doLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <nav aria-label="Main menu" className="h-full flex flex-col gap-1 p-4 bg-navy text-navy-200">
      <div className="flex items-center gap-2.5 px-2 pt-1 pb-5">
        <span className="w-10 h-10 rounded-xl bg-accent text-white flex items-center justify-center font-extrabold text-lg">B</span>
        <div className="flex flex-col">
          <span className="font-extrabold text-lg text-white leading-tight">BusinessMithra</span>
          <span className="text-xs text-navy-200">Mee business ki friend</span>
        </div>
      </div>
      <NavLink to="/" end className={linkClass} onClick={onNavigate}>
        <Icon name="dashboard" /> Dashboard
      </NavLink>
      {me.modules.includes('sales') && me.permissions.sales?.add && (
        <NavLink to="/bill" className={linkClass} onClick={onNavigate}>
          <Icon name="accounts" /> ⚡ Send Bill
        </NavLink>
      )}
      {me.modules.includes('sales') && me.permissions.sales?.add && (
        <NavLink to="/pos" className={linkClass} onClick={onNavigate}>
          <Icon name="sales" /> 🧾 POS Counter
        </NavLink>
      )}
      {visible.map((m) => (
        <NavLink
          key={m}
          to={MODULE_INFO[m].path || `/m/${m}`}
          className={() => linkClass({ isActive: pathname.startsWith(MODULE_INFO[m].base || `/m/${m}`) })}
          onClick={onNavigate}
        >
          <Icon name={MODULE_INFO[m].icon} /> {MODULE_INFO[m].label}
        </NavLink>
      ))}
      {me.user.isOwner && (
        <>
          <div className="mt-3 mb-1 px-3 text-xs font-bold uppercase tracking-wider text-navy-200/80">Admin</div>
          <NavLink to="/shop" className={linkClass} onClick={onNavigate}>
            <Icon name="shop" /> Online Shop
          </NavLink>
          <NavLink to="/memberships" className={linkClass} onClick={onNavigate}>
            <Icon name="staff" /> ⭐ Memberships
          </NavLink>
          <NavLink to="/staff" className={linkClass} onClick={onNavigate}>
            <Icon name="staff" /> Staff & Roles
          </NavLink>
          <NavLink to="/settings" className={linkClass} onClick={onNavigate}>
            <Icon name="settings" /> Settings
          </NavLink>
        </>
      )}
      <div className="mt-auto pt-4 flex flex-col gap-3">
        {sub && (
          <div className="rounded-2xl bg-navy-700 p-4 flex flex-col gap-1">
            <span className="text-sm font-bold text-white">{sub.planName}</span>
            <span className="text-xs text-navy-200">{!sub.active ? 'Expired' : sub.daysLeft === null ? 'Active' : `${sub.daysLeft} days left`}</span>
            {me.user.isOwner && (
              <NavLink to="/billing" onClick={onNavigate} className="mt-2 text-center bg-white text-navy font-bold text-sm rounded-lg py-2">
                {sub.plan === 'trial' || !sub.active || (sub.daysLeft !== null && sub.daysLeft <= 7) ? 'Upgrade / Renew' : 'Plan & Billing'}
              </NavLink>
            )}
          </div>
        )}
        <button type="button" onClick={doLogout} className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-navy-200 hover:bg-white/5 hover:text-white">
          <Icon name="logout" /> Logout
        </button>
      </div>
    </nav>
  );
}

export default function Layout({ children }) {
  const { me } = useAuth();
  const [open, setOpen] = useState(false);
  const sub = me.subscription;
  const warn = sub && sub.active && sub.daysLeft !== null && sub.daysLeft <= 5;

  return (
    <div className="min-h-screen lg:flex">
      <aside className="hidden lg:block print:!hidden w-64 shrink-0 sticky top-0 h-screen">
        <Sidebar />
      </aside>

      {open && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div className="w-72 max-w-[85%] h-full shadow-xl">
            <Sidebar onNavigate={() => setOpen(false)} />
          </div>
          <button type="button" aria-label="Close menu" className="flex-1 bg-black/40" onClick={() => setOpen(false)} />
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="lg:hidden print:hidden sticky top-0 z-30 bg-navy text-white flex items-center gap-3 px-4 h-14">
          <button type="button" aria-label="Open menu" onClick={() => setOpen(true)} className="w-11 h-11 -ml-2 flex items-center justify-center rounded-xl">
            <Icon name="menu" size={22} />
          </button>
          <span className="font-extrabold">BusinessMithra</span>
        </header>
        <header className="hidden lg:flex print:!hidden items-center justify-end gap-3 px-8 pt-6">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-full bg-orange-100 text-orange-800 font-extrabold flex items-center justify-center">
              {me.user.name.slice(0, 2).toUpperCase()}
            </span>
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-bold">{me.user.name}</span>
              <span className="text-xs text-muted">{me.business.name} · {me.user.role}</span>
            </div>
          </div>
        </header>
        <main className="flex-1 px-4 py-6 lg:px-8 lg:py-6 max-w-6xl w-full print:p-0 print:max-w-none">
          {warn && me.user.isOwner && (
            <NavLink to="/billing" className="block rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-sm font-semibold px-4 py-3 mb-5 print:hidden">
              ⏳ Mee {sub.planName} inka {sub.daysLeft} rojullo ayipotundi. Ippude renew cheyyandi →
            </NavLink>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
