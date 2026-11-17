import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';
import { COOKIE_NAME } from '../lib/constants.js';

export class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function signToken(userId) {
  return jwt.sign({ uid: userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

export function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

export function trialDaysLeft(business) {
  if (business.plan !== 'trial') return null;
  const ms = new Date(business.trialEndsAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86400000));
}

// Loads the logged-in user. options.allowExpired lets /auth/me work after trial ends.
export function requireAuth(options = {}) {
  return async (req, _res, next) => {
    try {
      const token = req.cookies?.[COOKIE_NAME];
      if (!token) throw new HttpError(401, 'Please log in');
      let payload;
      try {
        payload = jwt.verify(token, process.env.JWT_SECRET);
      } catch {
        throw new HttpError(401, 'Session expired, please log in again');
      }
      const user = await prisma.user.findUnique({
        where: { id: payload.uid },
        include: { business: { include: { modules: true } }, role: { include: { permissions: true } } },
      });
      if (!user || user.status !== 'active') throw new HttpError(401, 'Account not active');
      if (user.business.status === 'blocked') {
        throw new HttpError(403, 'This business account is blocked. Please contact BusinessMithra support.', 'BLOCKED');
      }
      if (!options.allowExpired && trialDaysLeft(user.business) === 0) {
        throw new HttpError(403, 'Your free trial has ended. Please choose a plan to continue.', 'TRIAL_EXPIRED');
      }
      req.user = user;
      req.businessId = user.businessId;
      next();
    } catch (e) {
      next(e);
    }
  };
}

export function requireOwner(req, _res, next) {
  if (!req.user?.isOwner) return next(new HttpError(403, 'Only the owner can do this'));
  next();
}

export function isModuleEnabled(user, module) {
  if (module === 'management') return true;
  return user.business.modules.some((m) => m.module === module && m.enabled);
}

export function hasPermission(user, module, action) {
  if (!isModuleEnabled(user, module)) return false;
  if (user.isOwner) return true;
  const p = user.role.permissions.find((x) => x.module === module);
  if (!p) return false;
  const key = { view: 'canView', add: 'canAdd', edit: 'canEdit', delete: 'canDelete' }[action];
  return Boolean(p[key]);
}

export function requireModule(module) {
  return (req, _res, next) => {
    if (!isModuleEnabled(req.user, module)) return next(new HttpError(403, 'This module is turned off for your business'));
    next();
  };
}

export function requirePermission(module, action) {
  return (req, _res, next) => {
    if (!isModuleEnabled(req.user, module)) return next(new HttpError(403, 'This module is turned off for your business'));
    if (!hasPermission(req.user, module, action)) return next(new HttpError(403, "You don't have permission for this"));
    next();
  };
}
