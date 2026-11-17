export const MODULES = ['sales', 'accounts', 'operations', 'hr', 'marketing', 'rnd', 'management'];

export const MODULE_LABELS = {
  sales: 'Sales & Customers',
  accounts: 'Accounts',
  operations: 'Operations',
  hr: 'HR & Staff',
  marketing: 'Marketing',
  rnd: 'R&D',
  management: 'Management',
};

// Modules switched ON automatically for each business type (management is always on).
export const BUSINESS_TYPES = {
  retail: ['sales', 'accounts', 'operations', 'hr', 'marketing'],
  restaurant: ['sales', 'accounts', 'operations', 'hr', 'marketing'],
  salon: ['sales', 'accounts', 'hr', 'marketing'],
  clinic: ['sales', 'accounts', 'hr', 'marketing'],
  education: ['sales', 'accounts', 'hr', 'marketing'],
  services: ['sales', 'accounts', 'operations', 'hr'],
  wholesale: ['sales', 'accounts', 'operations', 'hr'],
  manufacturing: [...MODULES],
  others: ['sales', 'accounts'],
};

export const ACTIONS = ['view', 'add', 'edit', 'delete'];

export const TRIAL_DAYS = 30;

const perm = (view, add, edit, del) => ({ canView: view, canAdd: add, canEdit: edit, canDelete: del });
const all = (p) => Object.fromEntries(MODULES.map((m) => [m, p]));

// Default roles created for every new business.
export const DEFAULT_ROLES = [
  { name: 'Owner', isSystem: true, perms: all(perm(true, true, true, true)) },
  { name: 'Manager', isSystem: false, perms: all(perm(true, true, true, false)) },
  { name: 'Accountant', isSystem: false, perms: { accounts: perm(true, true, true, true), management: perm(true, false, false, false) } },
  { name: 'Sales Staff', isSystem: false, perms: { sales: perm(true, true, true, false) } },
  { name: 'Staff', isSystem: false, perms: { sales: perm(true, false, false, false), operations: perm(true, false, false, false) } },
];

export const COOKIE_NAME = 'bm_token';
