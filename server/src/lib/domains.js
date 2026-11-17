import { prisma } from './prisma.js';

// Maps a vendor's own domain (www.shop.in / shop.in) to their shop. Cached for 60 seconds.
let cache = { at: 0, map: new Map() };

export const normalizeDomain = (d) => String(d || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');

export async function shopForHost(host) {
  const h = normalizeDomain(host);
  if (!h || h.endsWith('.onrender.com') || h === 'localhost') return null;
  if (Date.now() - cache.at > 60000) {
    const rows = await prisma.business.findMany({
      where: { customDomain: { not: null }, customDomainStatus: 'live', shopEnabled: true, status: 'active' },
      select: { customDomain: true, slug: true },
    });
    cache = { at: Date.now(), map: new Map(rows.map((r) => [normalizeDomain(r.customDomain), r.slug])) };
  }
  return cache.map.get(h) || null;
}

export const clearDomainCache = () => { cache = { at: 0, map: new Map() }; };
