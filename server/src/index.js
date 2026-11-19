import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ZodError } from 'zod';
import authRoutes from './routes/auth.js';
import settingsRoutes from './routes/settings.js';
import staffRoutes from './routes/staff.js';
import roleRoutes from './routes/roles.js';
import customerRoutes from './routes/customers.js';
import leadRoutes from './routes/leads.js';
import followUpRoutes from './routes/followups.js';
import itemRoutes from './routes/items.js';
import quotationRoutes from './routes/quotations.js';
import invoiceRoutes from './routes/invoices.js';
import publicRoutes from './routes/public.js';
import dashboardRoutes from './routes/dashboard.js';
import salesReportRoutes from './routes/salesReports.js';
import accountsRoutes from './routes/accounts.js';
import shopRoutes from './routes/shop.js';
import shopAdminRoutes from './routes/shopAdmin.js';
import billingRoutes from './routes/billing.js';
import adminRoutes from './routes/admin.js';
import membershipRoutes from './routes/memberships.js';
import stockRoutes from './routes/stockRoutes.js';
import supplierRoutes from './routes/suppliers.js';
import purchaseRoutes from './routes/purchases.js';
import creditNoteRoutes from './routes/creditNotes.js';
import marketingRoutes, { runBirthdayWishes } from './routes/marketing.js';
import hrRoutes from './routes/hr.js';
import { validWebhook } from './lib/razorpay.js';
import { markOrderPaidOnline } from './lib/shopPay.js';
import { activateRequest } from './lib/subscription.js';
import { Prisma } from '@prisma/client';
import { prisma } from './lib/prisma.js';
import { shopForHost } from './lib/domains.js';

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error('JWT_SECRET is missing or shorter than 32 characters. Set it in Render > Environment.');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 4000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.set('trust proxy', 1); // Render sits behind a proxy
app.use(
  helmet({
    // OpenStreetMap map tiles need to know which site asks for them.
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://unpkg.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'https:'],
        scriptSrc: ["'self'", 'https://checkout.razorpay.com', 'https://unpkg.com'],
        connectSrc: ["'self'", 'https://api.cloudinary.com', 'https://api.razorpay.com', 'https://lumberjack.razorpay.com'],
        frameSrc: ["'self'", 'https://api.razorpay.com', 'https://checkout.razorpay.com', 'https://www.google.com', 'https://maps.google.com'],
      },
    },
  })
);
// Razorpay tells us about payments here (needs the raw body to check the signature).
app.post('/api/razorpay/webhook', express.raw({ type: '*/*', limit: '200kb' }), async (req, res) => {
  try {
    if (!validWebhook(req.body, req.get('x-razorpay-signature'))) return res.status(400).json({ error: 'bad signature' });
    const evt = JSON.parse(req.body.toString('utf8'));
    const p = evt?.payload?.payment?.entity;
    if (p && ['payment.captured', 'order.paid'].includes(evt.event)) {
      const o = await prisma.shopOrder.findFirst({ where: { rzpOrderId: p.order_id } });
      if (o && p.amount === Math.round(Number(o.total) * 100)) await markOrderPaidOnline(o.id, p.id);
      const r = await prisma.subscriptionRequest.findFirst({ where: { rzpOrderId: p.order_id, status: 'awaiting_payment' } });
      if (r && p.amount === Math.round(Number(r.amount) * 100)) await activateRequest(r, { paymentMode: 'online', reference: p.id });
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('razorpay webhook', e.message);
    res.status(500).json({ error: 'failed' });
  }
});
app.use(express.json({ limit: '1mb' }));
// Money columns come from the database as Decimal objects; send them to the web app as plain numbers.
app.set('json replacer', function replacer(key, value) {
  const raw = this[key];
  return raw && Prisma.Decimal.isDecimal(raw) ? Number(raw) : value;
});
app.use(cookieParser());

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again after 15 minutes.' },
});

app.get('/api/health', (_req, res) => res.json({ ok: true, app: 'BusinessMithra' }));
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/signup', authLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/roles', roleRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/leads', leadRoutes);
app.use('/api/followups', followUpRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/quotations', quotationRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/reports/sales', salesReportRoutes);
app.use('/api/finance', accountsRoutes);
app.use('/api/shop', shopRoutes);
app.use('/api/shop-admin', shopAdminRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/memberships', membershipRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/purchases', purchaseRoutes);
app.use('/api/credit-notes', creditNoteRoutes);
app.use('/api/marketing', marketingRoutes);
app.use('/api/hr', hrRoutes);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

// ── Google / WhatsApp friendly pages ──
const siteUrl = (req) => (process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

app.get('/robots.txt', async (req, res) => {
  if (await shopForHost(req.hostname)) return res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /o/\nDisallow: /i/\nSitemap: https://${req.hostname}/sitemap.xml\n`);
  res.type('text/plain').send(`User-agent: *\nAllow: /s/\nDisallow: /admin\nDisallow: /api/\nDisallow: /i/\nDisallow: /o/\nSitemap: ${siteUrl(req)}/sitemap.xml\n`);
});

app.get('/sitemap.xml', async (req, res, next) => {
  try {
    if (await shopForHost(req.hostname)) {
      return res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://${esc(req.hostname)}/</loc></url></urlset>`);
    }
    const shops = await prisma.business.findMany({ where: { shopEnabled: true, status: 'active', slug: { not: null } }, select: { slug: true, updatedAt: true }, take: 50000 });
    const base = siteUrl(req);
    const urls = [`<url><loc>${base}/</loc></url>`, ...shops.map((s2) => `<url><loc>${base}/s/${esc(s2.slug)}</loc><lastmod>${s2.updatedAt.toISOString().slice(0, 10)}</lastmod></url>`)];
    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>`);
  } catch (e) {
    next(e);
  }
});

// The same server also serves the built web app (one Render service, one URL).
const webDist = path.resolve(__dirname, '../../web/dist');
if (fs.existsSync(webDist)) {
  const indexHtml = fs.readFileSync(path.join(webDist, 'index.html'), 'utf8');
  // The service worker must always be fresh so app updates reach phones quickly.
  app.get('/sw.js', (req, res) => res.set('Cache-Control', 'no-cache').sendFile(path.join(webDist, 'sw.js')));
  app.use(express.static(webDist, { index: false, maxAge: '1h' }));

  // Shop pages get their own title, description, preview image and business details for Google & WhatsApp.
  const shopPage = async (req, res, slug, ownDomain) => {
    let html = indexHtml;
    try {
      const b = await prisma.business.findUnique({ where: { slug: String(slug).toLowerCase() } });
      if (b && b.shopEnabled && b.status === 'active') {
        const url = ownDomain ? `https://${req.hostname}/` : `${siteUrl(req)}/s/${b.slug}`;
        const place = [b.city, b.state].filter(Boolean).join(', ');
        const title = `${b.name}${place ? ` – ${b.city || b.state}` : ''} | Order Online`;
        const desc = (b.shopTagline || b.shopAbout || `${b.name}${place ? ` in ${place}` : ''}. Order online, home delivery, book and pay by UPI.`).slice(0, 160);
        const img = b.shopCover || b.shopLogo || '';
        const ld = {
          '@context': 'https://schema.org',
          '@type': b.type === 'restaurant' ? 'Restaurant' : 'LocalBusiness',
          name: b.name, url, telephone: b.phone ? `+91${b.phone}` : undefined, image: img || undefined, description: desc,
          address: b.address || b.city ? { '@type': 'PostalAddress', streetAddress: b.address || undefined, addressLocality: b.city || undefined, addressRegion: b.state || undefined, addressCountry: 'IN' } : undefined,
          geo: b.shopLat && b.showLocation !== false ? { '@type': 'GeoCoordinates', latitude: b.shopLat, longitude: b.shopLng } : undefined,
          openingHours: b.shopTimings || undefined,
        };
        const head = [
          `<title>${esc(title)}</title>`,
          `<meta name="description" content="${esc(desc)}" />`,
          `<link rel="canonical" href="${esc(url)}" />`,
          `<meta property="og:type" content="website" />`,
          `<meta property="og:title" content="${esc(b.name)}" />`,
          `<meta property="og:description" content="${esc(desc)}" />`,
          `<meta property="og:url" content="${esc(url)}" />`,
          img ? `<meta property="og:image" content="${esc(img)}" />` : '',
          `<meta name="twitter:card" content="${img ? 'summary_large_image' : 'summary'}" />`,
          `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`,
        ].join('\n    ');
        html = html.replace(/<title>[\s\S]*?<\/title>/, head);
      }
    } catch (e) {
      console.error('shop meta failed', e.message);
    }
    if (ownDomain) html = html.replace('</head>', `<meta name="bm-shop" content="${esc(slug)}" />\n  </head>`);
    html = html.replace('href="/manifest.webmanifest"', `href="/api/shop/${esc(String(slug).toLowerCase())}/manifest.webmanifest${ownDomain ? '?own=1' : ''}"`);
    res.set('Cache-Control', 'no-cache').type('html').send(html);
  };

  // Vendor's own domain (e.g. www.srisaitextiles.in) opens their shop directly.
  app.get('*', async (req, res, next) => {
    try {
      const slug = await shopForHost(req.hostname);
      if (!slug) return next();
      if (req.path === '/' || req.path === `/s/${slug}`) return shopPage(req, res, slug, true);
      const html = indexHtml.replace('</head>', `<meta name="bm-shop" content="${esc(slug)}" />\n  </head>`);
      return res.set('Cache-Control', 'no-cache').set('X-Robots-Tag', 'noindex').type('html').send(html);
    } catch (e) {
      return next(e);
    }
  });

  app.get('/s/:slug', (req, res) => shopPage(req, res, req.params.slug, false));

  app.get('*', (req, res) => {
    // Private pages stay out of Google.
    if (/^\/(admin|i|o|login|signup|sales|accounts|settings|staff|shop|billing|bill|memberships|m)(\/|$)/.test(req.path)) res.set('X-Robots-Tag', 'noindex');
    res.set('Cache-Control', 'no-cache').type('html').send(indexHtml);
  });
}

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: err.errors[0]?.message || 'Invalid input' });
  }
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Something went wrong. Please try again.' : err.message, code: err.code });
});

app.listen(PORT, () => console.log(`BusinessMithra running on port ${PORT}`));

// Daily jobs (birthday wishes). Checked every 30 minutes; each shop runs once per day.
const daily = () => runBirthdayWishes().catch((e) => console.error('birthday wishes failed', e.message));
setTimeout(daily, 60000);
setInterval(daily, 30 * 60000);
