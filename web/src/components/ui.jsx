import { useCallback, useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { api } from '../api.js';
import { RANGES } from '../lib/format.js';
import Icon from './Icon.jsx';

// Loads data from the API; reload() refetches.
export function useApi(path, deps = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    setError('');
    try {
      setData(await api(path));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);
  useEffect(() => {
    reload();
  }, [reload]);
  return { data, error, loading, reload, setData };
}

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl lg:text-[28px] font-extrabold">{title}</h1>
        {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2.5">{children}</div>}
    </div>
  );
}

export function SubNav({ items }) {
  return (
    <nav aria-label="Section" className="flex gap-1 overflow-x-auto border-b border-line -mx-4 px-4 lg:mx-0 lg:px-0 print:hidden">
      {items.map((it) => (
        <NavLink
          key={it.to}
          to={it.to}
          end={it.end}
          className={({ isActive }) =>
            `whitespace-nowrap px-3.5 py-3 -mb-px text-sm border-b-[3px] ${isActive ? 'border-brand text-brand font-bold' : 'border-transparent text-gray-600 font-medium hover:text-ink'}`
          }
        >
          {it.label}
        </NavLink>
      ))}
    </nav>
  );
}

export const SALES_NAV = [
  { to: '/sales/orders', label: 'Online Orders' },
  { to: '/sales/leads', label: 'Leads Pipeline' },
  { to: '/sales/customers', label: 'Customers' },
  { to: '/sales/followups', label: 'Follow-ups' },
  { to: '/sales/quotations', label: 'Quotations' },
  { to: '/sales/invoices', label: 'Invoices' },
  { to: '/sales/returns', label: 'Returns' },
  { to: '/sales/items', label: 'Items & Services' },
  { to: '/sales/reports', label: 'Reports' },
];

export const ACCOUNTS_NAV = [
  { to: '/accounts', label: 'Overview', end: true },
  { to: '/accounts/expenses', label: 'Expenses' },
  { to: '/accounts/daybook', label: 'Day Book' },
  { to: '/accounts/reports', label: 'P&L · GST · Cash flow' },
];

export const OPS_NAV = [
  { to: '/ops/stock', label: 'Stock' },
  { to: '/ops/purchases', label: 'Purchases' },
  { to: '/ops/purchase-returns', label: 'Purchase Returns' },
  { to: '/ops/suppliers', label: 'Suppliers' },
];

export function Modal({ title, onClose, children, wide = false }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className={`bg-white w-full ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'} max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl shadow-xl`}>
        <div className="sticky top-0 bg-white flex items-center justify-between px-5 py-4 border-b border-line z-10">
          <h2 className="text-lg font-bold">{title}</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="w-11 h-11 -mr-2 rounded-xl flex items-center justify-center hover:bg-gray-100">
            <Icon name="close" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, id, children, hint, className = '' }) {
  return (
    <div className={className}>
      <label className="label" htmlFor={id}>{label}</label>
      {children}
      {hint && <p className="text-xs text-muted mt-1">{hint}</p>}
    </div>
  );
}

export function Empty({ title, text, children }) {
  return (
    <div className="card p-8 flex flex-col items-center text-center gap-2">
      <p className="font-bold">{title}</p>
      {text && <p className="text-sm text-muted max-w-sm">{text}</p>}
      {children && <div className="mt-2">{children}</div>}
    </div>
  );
}

const BADGES = {
  paid: ['Paid', 'bg-green-100 text-green-800'],
  partial: ['Partly paid', 'bg-amber-100 text-amber-900'],
  unpaid: ['Unpaid', 'bg-orange-100 text-orange-900'],
  overdue: ['Overdue', 'bg-red-100 text-red-800'],
  cancelled: ['Cancelled', 'bg-gray-100 text-gray-700'],
  draft: ['Draft', 'bg-gray-100 text-gray-700'],
  sent: ['Sent', 'bg-blue-100 text-blue-800'],
  accepted: ['Accepted', 'bg-green-100 text-green-800'],
  rejected: ['Rejected', 'bg-red-100 text-red-800'],
  converted: ['Invoiced', 'bg-violet-100 text-violet-800'],
  hot: ['Hot', 'bg-red-100 text-red-800'],
  warm: ['Warm', 'bg-orange-100 text-orange-900'],
  cold: ['Cold', 'bg-blue-100 text-blue-800'],
};

export function Badge({ status }) {
  const [label, cls] = BADGES[status] || [status, 'bg-gray-100 text-gray-700'];
  return <span className={`inline-block text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${cls}`}>{label}</span>;
}

export function invoiceDisplayStatus(inv) {
  if (['unpaid', 'partial'].includes(inv.status) && inv.dueDate && new Date(inv.dueDate) < new Date(new Date().toISOString().slice(0, 10))) return 'overdue';
  return inv.status;
}

export function RangePicker({ value, onChange }) {
  const [preset, setPreset] = useState('month');
  return (
    <div className="flex flex-wrap items-end gap-2 print:hidden">
      <div className="flex flex-wrap gap-1.5">
        {RANGES.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => { setPreset(r.id); const [from, to] = r.get(); onChange({ from, to }); }}
            className={`h-9 px-3 rounded-lg text-sm font-semibold border ${preset === r.id ? 'bg-brand text-white border-brand' : 'bg-white border-line text-gray-700 hover:border-gray-300'}`}
          >
            {r.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1.5">
        <label className="sr-only" htmlFor="rf">From</label>
        <input id="rf" type="date" className="input h-9 w-[150px]" value={value.from} onChange={(e) => { setPreset(''); onChange({ ...value, from: e.target.value }); }} />
        <span className="text-muted text-sm">to</span>
        <label className="sr-only" htmlFor="rt">To</label>
        <input id="rt" type="date" className="input h-9 w-[150px]" value={value.to} onChange={(e) => { setPreset(''); onChange({ ...value, to: e.target.value }); }} />
      </div>
    </div>
  );
}

export function Stat({ label, value, sub, tone = '' }) {
  return (
    <div className="card p-4 flex flex-col gap-1">
      <span className="text-xs font-semibold text-muted">{label}</span>
      <span className={`text-xl font-extrabold ${tone}`}>{value}</span>
      {sub && <span className="text-xs text-muted">{sub}</span>}
    </div>
  );
}

export function Bars({ data, valueKey = 'total', labelKey = 'label', format = (v) => v, height = 160, highlightLast = true }) {
  const max = Math.max(1, ...data.map((d) => Number(d[valueKey]) || 0));
  return (
    <div className="flex items-end gap-2 overflow-x-auto" style={{ height: height + 40 }}>
      {data.map((d, i) => {
        const v = Number(d[valueKey]) || 0;
        return (
          <div key={i} className="flex-1 min-w-[28px] flex flex-col items-center justify-end gap-1.5 h-full">
            <span className="text-[11px] font-semibold text-gray-600 whitespace-nowrap">{v ? format(v) : ''}</span>
            <div
              className={`w-full max-w-[44px] rounded-t-md ${highlightLast && i === data.length - 1 ? 'bg-brand' : 'bg-indigo-200'}`}
              style={{ height: Math.max(v ? 4 : 2, (v / max) * height) }}
              title={`${d[labelKey]}: ${format(v)}`}
            />
            <span className="text-[11px] text-muted whitespace-nowrap">{d[labelKey]}</span>
          </div>
        );
      })}
    </div>
  );
}

export function ErrorBox({ children }) {
  if (!children) return null;
  return <div className="error-box" role="alert">{children}</div>;
}

export function useForm(initial) {
  const [f, setF] = useState(initial);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }));
  return [f, setF, set];
}
