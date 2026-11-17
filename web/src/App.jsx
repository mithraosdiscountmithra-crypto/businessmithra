import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Signup from './pages/Signup.jsx';
import Dashboard from './pages/Dashboard.jsx';
import ModuleSoon from './pages/ModuleSoon.jsx';
import Settings from './pages/Settings.jsx';
import Staff from './pages/Staff.jsx';

function Splash() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="flex items-center gap-3 text-muted font-semibold">
        <span className="w-10 h-10 rounded-xl bg-accent text-white flex items-center justify-center font-extrabold">B</span>
        Loading BusinessMithra…
      </div>
    </div>
  );
}

function Private({ children, ownerOnly = false }) {
  const { me, loading } = useAuth();
  if (loading) return <Splash />;
  if (!me) return <Navigate to="/login" replace />;
  if (ownerOnly && !me.user.isOwner) return <Navigate to="/" replace />;
  return <Layout>{children}</Layout>;
}

function PublicOnly({ children }) {
  const { me, loading } = useAuth();
  if (loading) return <Splash />;
  if (me) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
      <Route path="/signup" element={<PublicOnly><Signup /></PublicOnly>} />
      <Route path="/" element={<Private><Dashboard /></Private>} />
      <Route path="/m/:module" element={<Private><ModuleSoon /></Private>} />
      <Route path="/settings" element={<Private ownerOnly><Settings /></Private>} />
      <Route path="/staff" element={<Private ownerOnly><Staff /></Private>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
