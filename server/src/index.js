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
import { Prisma } from '@prisma/client';

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
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'https:'],
        scriptSrc: ["'self'"],
        connectSrc: ["'self'", 'https://api.cloudinary.com'],
      },
    },
  })
);
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
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

// The same server also serves the built web app (one Render service, one URL).
const webDist = path.resolve(__dirname, '../../web/dist');
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist, { index: false, maxAge: '1h' }));
  app.get('*', (_req, res) => res.sendFile(path.join(webDist, 'index.html')));
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
