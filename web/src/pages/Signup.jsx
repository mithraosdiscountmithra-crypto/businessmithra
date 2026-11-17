import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { BUSINESS_TYPES, MODULE_INFO, TYPE_MODULES } from '../constants.js';
import Icon from '../components/Icon.jsx';
import { AuthShell } from './Login.jsx';

const STEPS = ['Business details', 'Business type', 'Your account'];

export default function Signup() {
  const { setMe } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({
    businessName: '', phone: '', city: '', state: 'Telangana',
    businessType: '', ownerName: '', email: '', password: '',
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const next = (e) => {
    e.preventDefault();
    setError('');
    if (step === 0) {
      if (f.businessName.trim().length < 2) return setError('Enter your business name');
      if (!/^[6-9]\d{9}$/.test(f.phone.trim())) return setError('Enter a valid 10-digit mobile number');
    }
    if (step === 1 && !f.businessType) return setError('Select your business type');
    setStep(step + 1);
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      setMe(await api('/auth/signup', { method: 'POST', body: f }));
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Create your business account" subtitle="30 days free · Anni features try cheyyandi">
      <ol className="flex gap-2" aria-label="Signup steps">
        {STEPS.map((s, i) => (
          <li key={s} className="flex-1 flex flex-col gap-1.5">
            <span className={`h-1.5 rounded-full ${i <= step ? 'bg-brand' : 'bg-gray-200'}`} />
            <span className={`text-xs font-semibold ${i === step ? 'text-ink' : 'text-muted'}`}>{s}</span>
          </li>
        ))}
      </ol>

      {error && <div className="error-box" role="alert">{error}</div>}

      {step === 0 && (
        <form onSubmit={next} className="flex flex-col gap-4">
          <div>
            <label className="label" htmlFor="bn">Business name</label>
            <input id="bn" className="input" value={f.businessName} onChange={set('businessName')} placeholder="e.g. Sri Sai Textiles" />
          </div>
          <div>
            <label className="label" htmlFor="ph">Business mobile number</label>
            <input id="ph" className="input" inputMode="numeric" maxLength={10} value={f.phone} onChange={set('phone')} placeholder="10-digit number" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="city">Town / City</label>
              <input id="city" className="input" value={f.city} onChange={set('city')} />
            </div>
            <div>
              <label className="label" htmlFor="state">State</label>
              <input id="state" className="input" value={f.state} onChange={set('state')} />
            </div>
          </div>
          <button type="submit" className="btn-primary w-full">Next</button>
        </form>
      )}

      {step === 1 && (
        <form onSubmit={next} className="flex flex-col gap-4">
          <fieldset>
            <legend className="label">Mee business type enti?</legend>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {BUSINESS_TYPES.map((t) => {
                const sel = f.businessType === t.id;
                return (
                  <button
                    type="button"
                    key={t.id}
                    aria-pressed={sel}
                    onClick={() => setF({ ...f, businessType: t.id })}
                    className={`text-left rounded-2xl border-2 p-3 flex flex-col gap-2 transition min-h-[44px] ${
                      sel ? 'border-brand bg-brand-light' : 'border-line bg-white hover:border-gray-300'
                    }`}
                  >
                    <span className={`w-10 h-10 rounded-xl flex items-center justify-center ${sel ? 'bg-brand text-white' : 'bg-gray-100 text-ink'}`}>
                      <Icon name={t.icon} />
                    </span>
                    <span className="text-sm font-bold">{t.label}</span>
                    <span className="text-xs text-muted leading-snug">{t.hint}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>
          {f.businessType && (
            <div className="rounded-2xl bg-white border border-line p-4">
              <p className="text-sm font-bold mb-2">Mee kosam ON chese modules:</p>
              <div className="flex flex-wrap gap-2">
                {[...TYPE_MODULES[f.businessType], 'management'].map((m) => (
                  <span key={m} className="text-xs font-bold px-2.5 py-1 rounded-full bg-green-100 text-green-800">{MODULE_INFO[m].label}</span>
                ))}
              </div>
              <p className="text-xs text-muted mt-2">Settings lo eppudaina marchavachu.</p>
            </div>
          )}
          <div className="flex gap-3">
            <button type="button" className="btn-ghost flex-1" onClick={() => setStep(0)}>Back</button>
            <button type="submit" className="btn-primary flex-1">Next</button>
          </div>
        </form>
      )}

      {step === 2 && (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div>
            <label className="label" htmlFor="on">Your name (owner)</label>
            <input id="on" className="input" required value={f.ownerName} onChange={set('ownerName')} />
          </div>
          <div>
            <label className="label" htmlFor="em">Email (login kosam)</label>
            <input id="em" type="email" autoComplete="email" required className="input" value={f.email} onChange={set('email')} />
          </div>
          <div>
            <label className="label" htmlFor="pw">Password</label>
            <input id="pw" type="password" autoComplete="new-password" required minLength={8} className="input" value={f.password} onChange={set('password')} />
            <p className="text-xs text-muted mt-1">Kanisam 8 characters</p>
          </div>
          <div className="flex gap-3">
            <button type="button" className="btn-ghost flex-1" onClick={() => setStep(1)}>Back</button>
            <button type="submit" className="btn-primary flex-1" disabled={busy}>{busy ? 'Creating…' : 'Start free trial'}</button>
          </div>
        </form>
      )}

      <p className="text-sm text-muted text-center">
        Already have an account? <Link to="/login" className="font-bold text-brand">Login</Link>
      </p>
    </AuthShell>
  );
}
