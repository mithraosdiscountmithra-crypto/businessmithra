export const MODULE_INFO = {
  sales: { label: 'Sales & Customers', icon: 'sales', phase: 'Live', path: '/sales/leads', base: '/sales', desc: 'Leads, customers, follow-ups, quotations, GST invoices' },
  marketing: { label: 'Marketing', icon: 'marketing', phase: 'Phase 5', desc: 'WhatsApp campaigns, offers, coupons, auto wishes' },
  accounts: { label: 'Accounts', icon: 'accounts', phase: 'Live', path: '/accounts', base: '/accounts', desc: 'Expenses, day book, GST, Profit & Loss' },
  operations: { label: 'Operations', icon: 'operations', phase: 'Phase 3', desc: 'Stock, suppliers, purchase orders, tasks' },
  hr: { label: 'HR & Staff', icon: 'hr', phase: 'Phase 4', desc: 'Employees, attendance, leaves, payroll' },
  rnd: { label: 'R&D', icon: 'rnd', phase: 'Phase 6', desc: 'Ideas, new product projects, customer feedback' },
  management: { label: 'Reports', icon: 'reports', phase: 'Phase 6', desc: 'Owner reports, targets, approvals' },
};

export const MODULE_ORDER = ['sales', 'marketing', 'accounts', 'operations', 'hr', 'rnd', 'management'];

export const BUSINESS_TYPES = [
  { id: 'retail', label: 'Retail Shop', icon: 'shop', hint: 'Clothing, kirana, mobile, electronics' },
  { id: 'restaurant', label: 'Restaurant / Café', icon: 'food', hint: 'Hotels, bakeries, tiffin centres' },
  { id: 'salon', label: 'Salon / Beauty', icon: 'salon', hint: 'Salons, spas, parlours' },
  { id: 'clinic', label: 'Clinic / Hospital', icon: 'clinic', hint: 'Clinics, labs, pharmacies' },
  { id: 'services', label: 'Services', icon: 'services', hint: 'Repair, agency, travel, events' },
  { id: 'wholesale', label: 'Wholesale', icon: 'wholesale', hint: 'Distributors, dealers' },
  { id: 'manufacturing', label: 'Manufacturing', icon: 'factory', hint: 'Small factories, workshops' },
  { id: 'education', label: 'Education', icon: 'education', hint: 'Coaching, schools, training' },
  { id: 'others', label: 'Others', icon: 'others', hint: 'Any other business' },
];

export const TYPE_MODULES = {
  retail: ['sales', 'accounts', 'operations', 'hr', 'marketing'],
  restaurant: ['sales', 'accounts', 'operations', 'hr', 'marketing'],
  salon: ['sales', 'accounts', 'hr', 'marketing'],
  clinic: ['sales', 'accounts', 'hr', 'marketing'],
  education: ['sales', 'accounts', 'hr', 'marketing'],
  services: ['sales', 'accounts', 'operations', 'hr'],
  wholesale: ['sales', 'accounts', 'operations', 'hr'],
  manufacturing: ['sales', 'accounts', 'operations', 'hr', 'marketing', 'rnd'],
  others: ['sales', 'accounts'],
};
