import { Link, Navigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { MODULE_INFO } from '../constants.js';
import Icon from '../components/Icon.jsx';

export default function ModuleSoon() {
  const { module } = useParams();
  const { me } = useAuth();
  const info = MODULE_INFO[module];
  if (!info || !me.modules.includes(module) || !me.permissions[module]?.view) return <Navigate to="/" replace />;

  return (
    <div className="card p-8 flex flex-col items-center text-center gap-4 max-w-xl mx-auto mt-6">
      <span className="w-16 h-16 rounded-2xl bg-brand-light text-brand flex items-center justify-center">
        <Icon name={info.icon} size={30} />
      </span>
      <h1 className="text-2xl font-extrabold">{info.label}</h1>
      <p className="text-muted">{info.desc}</p>
      <span className="text-sm font-bold px-3 py-1.5 rounded-full bg-orange-100 text-orange-800">{info.phase} lo vastundi</span>
      <Link to="/" className="btn-ghost mt-2">Back to Dashboard</Link>
    </div>
  );
}
