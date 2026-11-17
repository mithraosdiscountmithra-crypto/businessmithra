import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';

export function AuthShell({ title, subtitle, children }) {
  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      <div className="lg:w-[42%] bg-navy text-white p-8 lg:p-12 flex flex-col justify-between gap-8">
        <div className="flex items-center gap-3">
          <span className="w-11 h-11 rounded-xl bg-accent flex items-center justify-center font-extrabold text-xl">B</span>
          <span className="font-extrabold text-xl">BusinessMithra</span>
        </div>
        <div className="hidden lg:flex flex-col gap-4">
          <h2 className="text-4xl font-extrabold leading-tight">Mee motham business,<br />okka chota.</h2>
          <p className="text-navy-200 text-lg">Sales, Accounts, Stock, Staff, Marketing — anni reports tho.</p>
        </div>
        <p className="hidden lg:block text-sm text-navy-200">7 days free trial · No card needed</p>
      </div>
      <div className="flex-1 flex items-start lg:items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-extrabold">{title}</h1>
            {subtitle && <p className="text-muted">{subtitle}</p>}
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

export default function Login() {
  const { setMe } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      setMe(await api('/auth/login', { method: 'POST', body: form }));
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Welcome back" subtitle="Login to your business account">
      <form onSubmit={submit} className="flex flex-col gap-4">
        {error && <div className="error-box" role="alert">{error}</div>}
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="email" required className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input id="password" type="password" autoComplete="current-password" required className="input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </div>
        <button type="submit" className="btn-primary w-full" disabled={busy}>{busy ? 'Logging in…' : 'Login'}</button>
      </form>
      <p className="text-sm text-muted text-center">
        New to BusinessMithra? <Link to="/signup" className="font-bold text-brand">Create free account</Link>
      </p>
    </AuthShell>
  );
}
