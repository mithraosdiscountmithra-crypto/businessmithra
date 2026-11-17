// HR: employees, daily attendance, monthly salary with advances.
import { Router } from 'express';
import { z } from 'zod';
import { prisma, logActivity } from '../lib/prisma.js';
import { h } from '../lib/route.js';
import { dateOnly, istToday, num, r2 } from '../lib/money.js';
import { HttpError, requireAuth, requirePermission } from '../middleware/auth.js';
import { defaultAccountId, MODES } from './invoices.js';

const router = Router();
router.use(requireAuth());

const empSchema = z.object({
  name: z.string().trim().min(1, 'Enter name').max(80),
  phone: z.string().trim().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number').optional().nullable().or(z.literal('')).transform((v) => v || null),
  role: z.string().trim().max(60).optional().nullable(),
  payType: z.enum(['monthly', 'daily']).default('monthly'),
  salary: z.coerce.number().min(0).default(0),
  joinedOn: z.string().optional().nullable().transform((v) => (v ? dateOnly(v) : null)),
  active: z.boolean().default(true),
  notes: z.string().trim().max(300).optional().nullable(),
});

router.get('/employees', requirePermission('hr', 'view'), h(async (req, res) => {
  res.json({ employees: await prisma.employee.findMany({ where: { businessId: req.businessId }, orderBy: [{ active: 'desc' }, { name: 'asc' }] }) });
}));
router.post('/employees', requirePermission('hr', 'add'), h(async (req, res) => {
  const d = empSchema.parse(req.body);
  res.status(201).json({ employee: await prisma.employee.create({ data: { ...d, businessId: req.businessId } }) });
}));
router.put('/employees/:id', requirePermission('hr', 'edit'), h(async (req, res) => {
  const d = empSchema.parse(req.body);
  const ex = await prisma.employee.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!ex) throw new HttpError(404, 'Employee not found');
  res.json({ employee: await prisma.employee.update({ where: { id: ex.id }, data: d }) });
}));

// ── Attendance for one day ──
router.get('/attendance', requirePermission('hr', 'view'), h(async (req, res) => {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date)) ? String(req.query.date) : istToday();
  const [employees, marks] = await Promise.all([
    prisma.employee.findMany({ where: { businessId: req.businessId, active: true }, orderBy: { name: 'asc' } }),
    prisma.attendance.findMany({ where: { date: dateOnly(day), employee: { businessId: req.businessId } } }),
  ]);
  const by = Object.fromEntries(marks.map((m) => [m.employeeId, m]));
  res.json({ date: day, rows: employees.map((e) => ({ id: e.id, name: e.name, role: e.role, status: by[e.id]?.status || null, note: by[e.id]?.note || '' })) });
}));

const STATUSES = ['present', 'absent', 'half', 'leave', 'holiday'];
router.put('/attendance', requirePermission('hr', 'edit'), h(async (req, res) => {
  const d = z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    marks: z.array(z.object({ employeeId: z.string(), status: z.enum(STATUSES).nullable(), note: z.string().max(100).optional().nullable() })).max(500),
  }).parse(req.body);
  const ids = (await prisma.employee.findMany({ where: { businessId: req.businessId, id: { in: d.marks.map((m) => m.employeeId) } }, select: { id: true } })).map((e) => e.id);
  const date = dateOnly(d.date);
  await prisma.$transaction(d.marks.filter((m) => ids.includes(m.employeeId)).map((m) => (m.status
    ? prisma.attendance.upsert({ where: { employeeId_date: { employeeId: m.employeeId, date } }, create: { employeeId: m.employeeId, date, status: m.status, note: m.note || null }, update: { status: m.status, note: m.note || null } })
    : prisma.attendance.deleteMany({ where: { employeeId: m.employeeId, date } }))));
  res.json({ ok: true });
}));

// ── Monthly salary sheet ──
// Monthly pay: salary × paid days ÷ days in month (present 1, half 0.5, leave/holiday paid, absent unpaid).
// Daily pay: rate × (present + half/2).
async function sheet(businessId, month) {
  const [y, m] = month.split('-').map(Number);
  const from = new Date(Date.UTC(y, m - 1, 1));
  const to = new Date(Date.UTC(y, m, 1));
  const days = Math.round((to - from) / 86400000);
  const [emps, marks, pays] = await Promise.all([
    prisma.employee.findMany({ where: { businessId }, orderBy: { name: 'asc' } }),
    prisma.attendance.findMany({ where: { date: { gte: from, lt: to }, employee: { businessId } } }),
    prisma.expense.findMany({ where: { businessId, refType: { in: ['salary', 'advance'] }, notes: { startsWith: `[${month}]` } } }),
  ]);
  return emps.map((e) => {
    const mine = marks.filter((x) => x.employeeId === e.id);
    const count = (s) => mine.filter((x) => x.status === s).length;
    const present = count('present');
    const half = count('half');
    const leave = count('leave') + count('holiday');
    const absent = count('absent');
    const marked = mine.length;
    let earned;
    if (e.payType === 'daily') earned = num(e.salary) * (present + half / 2);
    else {
      // Days not marked count as present (most shops only mark absences).
      const paidDays = days - absent - half / 2;
      earned = marked ? (num(e.salary) * paidDays) / days : num(e.salary);
    }
    const advances = pays.filter((p) => p.refId === e.id && p.refType === 'advance').reduce((a, p) => a + num(p.amount), 0);
    const paid = pays.filter((p) => p.refId === e.id && p.refType === 'salary').reduce((a, p) => a + num(p.amount), 0);
    earned = r2(earned);
    return { id: e.id, name: e.name, role: e.role, active: e.active, payType: e.payType, salary: num(e.salary), present, half, leave, absent, marked, days, earned, advances: r2(advances), paid: r2(paid), balance: r2(earned - advances - paid) };
  }).filter((r) => r.active || r.advances || r.paid);
}

router.get('/payroll', requirePermission('hr', 'view'), h(async (req, res) => {
  const month = /^\d{4}-\d{2}$/.test(String(req.query.month)) ? String(req.query.month) : istToday().slice(0, 7);
  res.json({ month, rows: await sheet(req.businessId, month) });
}));

// Pay salary or give an advance → saved as an expense (shows in Day Book and P&L).
router.post('/pay', requirePermission('hr', 'add'), h(async (req, res) => {
  const d = z.object({
    employeeId: z.string(),
    month: z.string().regex(/^\d{4}-\d{2}$/),
    kind: z.enum(['salary', 'advance']),
    amount: z.coerce.number().positive('Enter amount'),
    mode: z.enum(MODES).default('cash'),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    note: z.string().trim().max(100).optional().nullable(),
  }).parse(req.body);
  const e = await prisma.employee.findFirst({ where: { id: d.employeeId, businessId: req.businessId } });
  if (!e) throw new HttpError(404, 'Employee not found');
  const ex = await prisma.$transaction(async (tx) => tx.expense.create({
    data: {
      businessId: req.businessId, date: dateOnly(d.date || istToday()), category: d.kind === 'salary' ? 'Salary' : 'Salary Advance',
      amount: d.amount, taxAmount: 0, vendorName: e.name, accountId: await defaultAccountId(tx, req.businessId, d.mode), mode: d.mode,
      notes: `[${d.month}] ${d.kind === 'salary' ? 'Salary' : 'Advance'}${d.note ? ` – ${d.note}` : ''}`, refType: d.kind, refId: e.id, createdById: req.user.id,
    },
  }));
  await logActivity(req.businessId, req.user.id, d.kind, 'employee', e.id);
  res.status(201).json({ expense: ex });
}));

router.delete('/pay/:id', requirePermission('hr', 'delete'), h(async (req, res) => {
  const ex = await prisma.expense.findFirst({ where: { id: req.params.id, businessId: req.businessId, refType: { in: ['salary', 'advance'] } } });
  if (!ex) throw new HttpError(404, 'Entry not found');
  await prisma.expense.delete({ where: { id: ex.id } });
  res.json({ ok: true });
}));

router.get('/payments/:employeeId', requirePermission('hr', 'view'), h(async (req, res) => {
  const list = await prisma.expense.findMany({ where: { businessId: req.businessId, refId: req.params.employeeId, refType: { in: ['salary', 'advance'] } }, orderBy: { date: 'desc' }, take: 100 });
  res.json({ payments: list });
}));

export default router;
