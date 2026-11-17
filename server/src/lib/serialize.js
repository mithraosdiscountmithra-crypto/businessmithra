import { MODULES } from './constants.js';
import { hasPermission, isModuleEnabled, trialDaysLeft } from '../middleware/auth.js';

// What the web app needs to know about the logged-in user.
export function mePayload(user) {
  const b = user.business;
  const permissions = {};
  for (const m of MODULES) {
    permissions[m] = {
      view: hasPermission(user, m, 'view'),
      add: hasPermission(user, m, 'add'),
      edit: hasPermission(user, m, 'edit'),
      delete: hasPermission(user, m, 'delete'),
    };
  }
  return {
    user: { id: user.id, name: user.name, email: user.email, phone: user.phone, isOwner: user.isOwner, role: user.role.name },
    business: {
      id: b.id, name: b.name, type: b.type, phone: b.phone, email: b.email, gstin: b.gstin,
      address: b.address, city: b.city, state: b.state, plan: b.plan, status: b.status,
      invoicePrefix: b.invoicePrefix, quotePrefix: b.quotePrefix, invoiceTerms: b.invoiceTerms, bankDetails: b.bankDetails,
      trialDaysLeft: trialDaysLeft(b),
    },
    modules: MODULES.filter((m) => isModuleEnabled(user, m)),
    permissions,
  };
}
