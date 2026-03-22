import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// GET /api/reports/summary?month=3&year=2026
// Dashboard: total income vs total expenses for a given month
router.get('/summary', async (req: Request, res: Response) => {
  const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;
  const year = parseInt(req.query.year as string) || new Date().getFullYear();

  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59);

  const transactions = await prisma.transaction.findMany({
    where: { date: { gte: start, lte: end }, isInternalTransfer: false },
    select: { amount: true },
  });

  const income = transactions
    .filter((t) => Number(t.amount) > 0)
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const expenses = transactions
    .filter((t) => Number(t.amount) < 0)
    .reduce((sum, t) => sum + Number(t.amount), 0);

  res.json({ month, year, income, expenses, net: income + expenses });
});

// GET /api/reports/by-category?month=3&year=2026
// Budget view: spending per category vs budget limit
router.get('/by-category', async (req: Request, res: Response) => {
  const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;
  const year = parseInt(req.query.year as string) || new Date().getFullYear();

  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59);

  const [transactions, budgets] = await Promise.all([
    prisma.transaction.findMany({
      where: { date: { gte: start, lte: end }, isInternalTransfer: false, categoryId: { not: null } },
      select: { amount: true, categoryId: true },
    }),
    prisma.budget.findMany({
      where: { effectiveFrom: { lte: start } },
      orderBy: { effectiveFrom: 'desc' },
      distinct: ['categoryId'],
      include: { category: true },
    }),
  ]);

  // Sum spending per category
  const spendingMap: Record<number, number> = {};
  for (const t of transactions) {
    if (t.categoryId) {
      spendingMap[t.categoryId] = (spendingMap[t.categoryId] || 0) + Number(t.amount);
    }
  }

  const result = budgets.map((b) => ({
    category: b.category,
    budgeted: Number(b.amount),
    spent: Math.abs(spendingMap[b.categoryId] || 0),
    remaining: Number(b.amount) - Math.abs(spendingMap[b.categoryId] || 0),
  }));

  res.json(result);
});

// GET /api/reports/trend?months=6
// Monthly income vs expenses over the last N months
router.get('/trend', async (req: Request, res: Response) => {
  const months = parseInt(req.query.months as string) || 6;

  const results = [];
  const now = new Date();

  for (let i = months - 1; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const month = date.getMonth() + 1;
    const year = date.getFullYear();
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0, 23, 59, 59);

    const transactions = await prisma.transaction.findMany({
      where: { date: { gte: start, lte: end }, isInternalTransfer: false },
      select: { amount: true },
    });

    const income = transactions
      .filter((t) => Number(t.amount) > 0)
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const expenses = transactions
      .filter((t) => Number(t.amount) < 0)
      .reduce((sum, t) => sum + Number(t.amount), 0);

    results.push({ month, year, income, expenses, net: income + expenses });
  }

  res.json(results);
});

// GET /api/reports/upcoming-bills
// Recurring transactions projected to next occurrence
router.get('/upcoming-bills', async (_req: Request, res: Response) => {
  const recurring = await prisma.transaction.findMany({
    where: { isRecurring: true },
    orderBy: { date: 'desc' },
    distinct: ['merchantNormalized'],
    include: { category: { select: { name: true } } },
  });

  const upcoming = recurring.map((t) => {
    const lastDate = new Date(t.date);
    const nextDate = new Date(lastDate);
    nextDate.setMonth(nextDate.getMonth() + 1);

    return {
      merchant: t.merchantNormalized,
      amount: t.amount,
      category: t.category?.name,
      lastDate,
      nextDate,
    };
  });

  // Sort by soonest upcoming
  upcoming.sort((a, b) => a.nextDate.getTime() - b.nextDate.getTime());

  res.json(upcoming);
});

export default router;
