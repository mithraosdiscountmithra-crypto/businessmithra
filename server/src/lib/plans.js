import { prisma } from './prisma.js';
import { MODULES } from './constants.js';

export const DEFAULT_PLANS = [
  { code: 'free', name: 'Free', priceMonthly: 0, priceYearly: 0, maxUsers: 1, modules: ['sales', 'accounts', 'management'], description: '1 user · Sales + Accounts · Online shop', sort: 1 },
  { code: 'basic', name: 'Basic', priceMonthly: 499, priceYearly: 4990, maxUsers: 5, modules: ['sales', 'accounts', 'marketing', 'operations', 'management'], description: '5 users · Sales, Accounts, Marketing, Operations', sort: 2 },
  { code: 'pro', name: 'Pro', priceMonthly: 1499, priceYearly: 14990, maxUsers: 0, modules: [...MODULES], description: 'Unlimited users · All modules · Full reports', sort: 3 },
];

let cache = { at: 0, plans: null };

// Makes sure the 3 default plans exist (super admin can change prices later).
export async function getPlans({ fresh = false } = {}) {
  if (!fresh && cache.plans && Date.now() - cache.at < 60000) return cache.plans;
  let plans = await prisma.plan.findMany({ orderBy: { sort: 'asc' } });
  if (plans.length < DEFAULT_PLANS.length) {
    await prisma.plan.createMany({ data: DEFAULT_PLANS, skipDuplicates: true });
    plans = await prisma.plan.findMany({ orderBy: { sort: 'asc' } });
  }
  cache = { at: Date.now(), plans };
  return plans;
}
export const clearPlanCache = () => { cache = { at: 0, plans: null }; };

const DAY = 86400000;
const daysLeft = (d) => Math.max(0, Math.ceil((new Date(d).getTime() - Date.now()) / DAY));

// Is this business allowed to use the app right now?
export function accessState(b, plans) {
  const plan = plans.find((p) => p.code === b.plan);
  if (b.plan === 'trial') {
    const left = daysLeft(b.trialEndsAt);
    return { plan: 'trial', planName: 'Free trial', active: left > 0, daysLeft: left, endsAt: b.trialEndsAt, modules: null, maxUsers: 0 };
  }
  if (!plan) return { plan: b.plan, planName: b.plan, active: false, daysLeft: 0, endsAt: null, modules: [], maxUsers: 1 };
  if (b.plan === 'free' || !b.planEndsAt) {
    return { plan: plan.code, planName: plan.name, active: true, daysLeft: null, endsAt: null, modules: plan.modules, maxUsers: plan.maxUsers };
  }
  const left = daysLeft(b.planEndsAt);
  return { plan: plan.code, planName: plan.name, active: left > 0, daysLeft: left, endsAt: b.planEndsAt, cycle: b.planCycle, modules: plan.modules, maxUsers: plan.maxUsers };
}

export const addPeriod = (from, cycle) => {
  const d = new Date(from);
  if (cycle === 'yearly') d.setUTCFullYear(d.getUTCFullYear() + 1);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return d;
};
