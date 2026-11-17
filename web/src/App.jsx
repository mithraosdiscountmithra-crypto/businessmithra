import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Signup from './pages/Signup.jsx';
import Dashboard from './pages/Dashboard.jsx';
import ModuleSoon from './pages/ModuleSoon.jsx';
import Settings from './pages/Settings.jsx';
import Staff from './pages/Staff.jsx';
import PublicInvoice from './pages/PublicInvoice.jsx';
import Leads from './pages/sales/Leads.jsx';
import Customers from './pages/sales/Customers.jsx';
import CustomerDetail from './pages/sales/CustomerDetail.jsx';
import FollowUps from './pages/sales/FollowUps.jsx';
import Items from './pages/sales/Items.jsx';
import DocList from './pages/sales/DocList.jsx';
import DocEditor from './pages/sales/DocEditor.jsx';
import InvoiceView from './pages/sales/InvoiceView.jsx';
import QuotationView from './pages/sales/QuotationView.jsx';
import SalesReports from './pages/sales/SalesReports.jsx';
import AccountsOverview from './pages/accounts/Overview.jsx';
import Expenses from './pages/accounts/Expenses.jsx';
import DayBook from './pages/accounts/DayBook.jsx';
import AccountsReports from './pages/accounts/AccountsReports.jsx';
import Storefront from './pages/shop/Storefront.jsx';
import OrderStatus from './pages/shop/OrderStatus.jsx';
import Orders from './pages/sales/Orders.jsx';
import ShopSettings from './pages/ShopSettings.jsx';
import Billing from './pages/Billing.jsx';
import QuickBill from './pages/sales/QuickBill.jsx';
import Memberships from './pages/sales/Memberships.jsx';
import { hostShop } from './lib/hostShop.js';
import AdminApp from './pages/admin/AdminApp.jsx';

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

function Expired() {
  const { me, logout } = useAuth();
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="card p-8 max-w-md text-center flex flex-col gap-3">
        <h1 className="text-xl font-extrabold">{me.business.name} plan expire ayyindi</h1>
        <p className="text-muted">Mee owner plan renew chesina ventane malli vaadochu. Data anta safe ga undi.</p>
        <button type="button" className="btn-ghost" onClick={logout}>Logout</button>
      </div>
    </div>
  );
}

function Private({ children, ownerOnly = false, module }) {
  const { me, loading } = useAuth();
  const { pathname } = useLocation();
  if (loading) return <Splash />;
  if (!me) return <Navigate to="/login" replace />;
  if (me.subscription && !me.subscription.active && pathname !== '/billing') {
    return me.user.isOwner ? <Navigate to="/billing" replace /> : <Expired />;
  }
  if (ownerOnly && !me.user.isOwner) return <Navigate to="/" replace />;
  if (module && !(me.modules.includes(module) && me.permissions[module]?.view)) return <Navigate to="/" replace />;
  return <Layout>{children}</Layout>;
}

function PublicOnly({ children }) {
  const { me, loading } = useAuth();
  if (loading) return <Splash />;
  if (me) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  // Vendor's own domain: only the shop and its order / bill pages.
  if (hostShop()) {
    return (
      <Routes>
        <Route path="/" element={<Storefront />} />
        <Route path="/o/:token" element={<OrderStatus />} />
        <Route path="/i/:token" element={<PublicInvoice />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }
  return (
    <Routes>
      <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
      <Route path="/signup" element={<PublicOnly><Signup /></PublicOnly>} />
      <Route path="/i/:token" element={<PublicInvoice />} />
      <Route path="/admin/*" element={<AdminApp />} />
      <Route path="/billing" element={<Private ownerOnly><Billing /></Private>} />
      <Route path="/s/:slug" element={<Storefront />} />
      <Route path="/o/:token" element={<OrderStatus />} />
      <Route path="/shop" element={<Private ownerOnly><ShopSettings /></Private>} />
      <Route path="/sales/orders" element={<Private module="sales"><Orders /></Private>} />
      <Route path="/bill" element={<Private module="sales"><QuickBill /></Private>} />
      <Route path="/memberships" element={<Private module="sales"><Memberships /></Private>} />
      <Route path="/" element={<Private><Dashboard /></Private>} />
      <Route path="/sales" element={<Navigate to="/sales/leads" replace />} />
      <Route path="/sales/leads" element={<Private module="sales"><Leads /></Private>} />
      <Route path="/sales/customers" element={<Private module="sales"><Customers /></Private>} />
      <Route path="/sales/customers/:id" element={<Private module="sales"><CustomerDetail /></Private>} />
      <Route path="/sales/followups" element={<Private module="sales"><FollowUps /></Private>} />
      <Route path="/sales/items" element={<Private module="sales"><Items /></Private>} />
      <Route path="/sales/quotations" element={<Private module="sales"><DocList key="q" kind="quotation" /></Private>} />
      <Route path="/sales/quotations/new" element={<Private module="sales"><DocEditor key="qn" kind="quotation" /></Private>} />
      <Route path="/sales/quotations/:id" element={<Private module="sales"><QuotationView /></Private>} />
      <Route path="/sales/quotations/:id/edit" element={<Private module="sales"><DocEditor key="qe" kind="quotation" /></Private>} />
      <Route path="/sales/invoices" element={<Private module="sales"><DocList key="i" kind="invoice" /></Private>} />
      <Route path="/sales/invoices/new" element={<Private module="sales"><DocEditor key="in" kind="invoice" /></Private>} />
      <Route path="/sales/invoices/:id" element={<Private module="sales"><InvoiceView /></Private>} />
      <Route path="/sales/invoices/:id/edit" element={<Private module="sales"><DocEditor key="ie" kind="invoice" /></Private>} />
      <Route path="/sales/reports" element={<Private module="sales"><SalesReports /></Private>} />
      <Route path="/accounts" element={<Private module="accounts"><AccountsOverview /></Private>} />
      <Route path="/accounts/expenses" element={<Private module="accounts"><Expenses /></Private>} />
      <Route path="/accounts/daybook" element={<Private module="accounts"><DayBook /></Private>} />
      <Route path="/accounts/reports" element={<Private module="accounts"><AccountsReports /></Private>} />
      <Route path="/m/:module" element={<Private><ModuleSoon /></Private>} />
      <Route path="/settings" element={<Private ownerOnly><Settings /></Private>} />
      <Route path="/staff" element={<Private ownerOnly><Staff /></Private>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
