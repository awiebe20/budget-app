import { Router, Request, Response } from 'express';
import { asyncHandler } from '../lib/asyncHandler';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// GET /api/reports/summary?month=3&year=2026
// Dashboard: total income vs total expenses for a given month
router.get('/summary', asyncHandler(async (req: Request, res: Response) => {
  const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;
  const year = parseInt(req.query.year as string) || new Date().getFullYear();

  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59);

  const prevStart = new Date(year, month - 2, 1);
  const prevEnd   = new Date(year, month - 1, 0, 23, 59, 59);

  const nextMonthCats = await prisma.category.findMany({
    where: { isIncome: true, paycheckTiming: 'NEXT_MONTH' },
    select: { id: true },
  });
  const nextMonthCatIds = new Set(nextMonthCats.map((c) => c.id));

  const [transactions, shiftedIncome] = await Promise.all([
    prisma.transaction.findMany({
      where: { date: { gte: start, lte: end }, isInternalTransfer: false },
      select: { amount: true, reimbursedBy: true, categoryId: true, splits: { select: { amount: true } }, category: { select: { isFromSavings: true, isReimbursement: true, isIncome: true } } },
    }),
    nextMonthCatIds.size > 0
      ? prisma.transaction.findMany({
          where: {
            date: { gte: prevStart, lte: prevEnd },
            isInternalTransfer: false,
            categoryId: { in: [...nextMonthCatIds] },
          },
          select: { amount: true, reimbursedBy: true, categoryId: true, splits: { select: { amount: true } }, category: { select: { isFromSavings: true, isReimbursement: true, isIncome: true } } },
        })
      : Promise.resolve([]),
  ]);

  const effectiveAmount = (t: { amount: any, splits: { amount: any }[] }) => {
    const splitTotal = t.splits.reduce((s, sp) => s + Number(sp.amount), 0);
    return Number(t.amount) + (Number(t.amount) < 0 ? splitTotal : -splitTotal);
  };

  // Income = current-month non-shifted + previous-month shifted (as next-month income)
  const income = [
    ...transactions.filter((t) => Number(t.amount) > 0 && t.category?.isIncome === true && !nextMonthCatIds.has(t.categoryId!)),
    ...shiftedIncome.filter((t) => Number(t.amount) > 0 && t.category?.isIncome === true),
  ].reduce((sum, t) => sum + effectiveAmount(t), 0);

  const expenses = transactions
    .filter((t) => Number(t.amount) < 0 && !t.category?.isFromSavings)
    .reduce((sum, t) => sum + effectiveAmount(t), 0);

  // Non-essential: sum budgeted vs spent for non-essential expense categories
  const nonEssentialBudgets = await prisma.budget.findMany({
    where: { effectiveFrom: { lte: start } },
    orderBy: { effectiveFrom: 'desc' },
    distinct: ['categoryId'],
    include: { category: true },
  });
  const toMonthlyNE = (amount: number, freq: string) => {
    if (freq === 'QUARTERLY') return amount / 3;
    if (freq === 'SEMI_ANNUAL') return amount / 6;
    if (freq === 'ANNUAL') return amount / 12;
    return amount;
  };
  const nonEssentialCatIds = new Set(
    nonEssentialBudgets
      .filter((b) => !b.category.isIncome && !b.category.isReimbursement && !b.category.isFromSavings && !b.category.isEssential)
      .map((b) => b.categoryId)
  );
  const nonEssentialBudgeted = nonEssentialBudgets
    .filter((b) => nonEssentialCatIds.has(b.categoryId))
    .reduce((sum, b) => sum + toMonthlyNE(Number(b.amount), b.frequency), 0);
  const nonEssentialSpent = transactions
    .filter((t) => t.categoryId && nonEssentialCatIds.has(t.categoryId) && Number(t.amount) < 0)
    .reduce((sum, t) => sum + Math.abs(effectiveAmount(t)), 0);

  res.json({ month, year, income, expenses, net: income + expenses, nonEssentialBudgeted, nonEssentialSpent });
}));

// GET /api/reports/by-category?month=3&year=2026
// Budget view: spending per category vs budget limit
router.get('/by-category', asyncHandler(async (req: Request, res: Response) => {
  const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;
  const year = parseInt(req.query.year as string) || new Date().getFullYear();

  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59);

  const prevStartBC = new Date(year, month - 2, 1);
  const prevEndBC   = new Date(year, month - 1, 0, 23, 59, 59);

  const [transactions, budgets] = await Promise.all([
    prisma.transaction.findMany({
      where: { date: { gte: start, lte: end }, isInternalTransfer: false, categoryId: { not: null } },
      select: { amount: true, categoryId: true, splits: { select: { amount: true } } },
    }),
    prisma.budget.findMany({
      where: { effectiveFrom: { lte: start } },
      orderBy: { effectiveFrom: 'desc' },
      distinct: ['categoryId'],
      include: { category: true },
    }),
  ]);

  // Fetch prev-month transactions for NEXT_MONTH income categories
  const nextMonthBudgetCatIds = new Set(
    budgets
      .filter((b) => b.category.isIncome && b.category.paycheckTiming === 'NEXT_MONTH')
      .map((b) => b.categoryId)
  );
  const prevMonthIncomeTxs = nextMonthBudgetCatIds.size > 0
    ? await prisma.transaction.findMany({
        where: {
          date: { gte: prevStartBC, lte: prevEndBC },
          categoryId: { in: [...nextMonthBudgetCatIds] },
        },
        select: { amount: true, categoryId: true, splits: { select: { amount: true } } },
      })
    : [];

  // Sum spending per category using your portion only
  const spendingMap: Record<number, number> = {};
  const addToMap = (t: { categoryId: number | null, amount: any, splits: { amount: any }[] }) => {
    if (!t.categoryId) return;
    const splitTotal = t.splits.reduce((s, sp) => s + Number(sp.amount), 0);
    spendingMap[t.categoryId] = (spendingMap[t.categoryId] || 0) + Number(t.amount) + splitTotal;
  };
  // Current-month: skip NEXT_MONTH income categories (they use prev-month data)
  for (const t of transactions) {
    if (nextMonthBudgetCatIds.has(t.categoryId!)) continue;
    addToMap(t);
  }
  // NEXT_MONTH income categories: use previous month's transactions
  for (const t of prevMonthIncomeTxs) {
    addToMap(t);
  }

  const toMonthly = (amount: number, frequency: string) => {
    if (frequency === 'QUARTERLY') return amount / 3;
    if (frequency === 'SEMI_ANNUAL') return amount / 6;
    if (frequency === 'ANNUAL') return amount / 12;
    return amount;
  };

  const cadenceMonths: Record<string, number> = {
    QUARTERLY: 3, SEMI_ANNUAL: 6, ANNUAL: 12,
  };

  // For non-monthly budgets, find the last transaction date so frontend can show coverage
  const nonMonthlyBudgetCatIds = budgets
    .filter((b) => b.frequency !== 'MONTHLY')
    .map((b) => b.categoryId);

  const lastTxByCategory: Record<number, Date> = {};
  if (nonMonthlyBudgetCatIds.length > 0) {
    const lookback = new Date(year, month - 1 - 12, 1);
    const lastTxs = await prisma.transaction.findMany({
      where: { categoryId: { in: nonMonthlyBudgetCatIds }, date: { gte: lookback }, amount: { lt: 0 } },
      orderBy: { date: 'desc' },
      select: { categoryId: true, date: true },
    });
    for (const tx of lastTxs) {
      if (tx.categoryId && !lastTxByCategory[tx.categoryId]) {
        lastTxByCategory[tx.categoryId] = tx.date;
      }
    }
  }

  const result = budgets.map((b) => {
    const monthlyBudget = toMonthly(Number(b.amount), b.frequency);
    const spent = Math.abs(spendingMap[b.categoryId] || 0);
    const cadence = cadenceMonths[b.frequency];
    const lastTxDate = lastTxByCategory[b.categoryId] ?? null;

    let coveredThrough: string | null = null;
    if (cadence && lastTxDate) {
      const covered = new Date(lastTxDate);
      covered.setMonth(covered.getMonth() + cadence);
      const monthEnd = new Date(year, month, 0);
      if (covered > monthEnd) {
        coveredThrough = covered.toISOString();
      }
    }

    return {
      category: b.category,
      budgeted: monthlyBudget,
      budgetedRaw: Number(b.amount),
      frequency: b.frequency,
      spent,
      remaining: monthlyBudget - spent,
      coveredThrough,
    };
  });

  res.json(result);
}));

// GET /api/reports/trend?months=6
// Monthly income vs expenses over the last N months
router.get('/trend', asyncHandler(async (req: Request, res: Response) => {
  const months = parseInt(req.query.months as string) || 6;
  const completedOnly = req.query.completedOnly === 'true';

  const results = [];
  const now = new Date();

  // completedOnly: skip i=0 (current incomplete month)
  const minI = completedOnly ? 1 : 0;
  for (let i = months - 1; i >= minI; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const month = date.getMonth() + 1;
    const year = date.getFullYear();
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0, 23, 59, 59);

    const transactions = await prisma.transaction.findMany({
      where: { date: { gte: start, lte: end }, isInternalTransfer: false },
      select: { amount: true, splits: { select: { amount: true } }, category: { select: { isFromSavings: true, isIncome: true } } },
    });

    const effectiveAmt = (t: { amount: any, splits: { amount: any }[] }) => {
      const splitTotal = t.splits.reduce((s, sp) => s + Number(sp.amount), 0);
      return Number(t.amount) + (Number(t.amount) < 0 ? splitTotal : -splitTotal);
    };

    const income = transactions
      .filter((t) => Number(t.amount) > 0 && t.category?.isIncome === true)
      .reduce((sum, t) => sum + effectiveAmt(t), 0);

    const expenses = transactions
      .filter((t) => Number(t.amount) < 0 && !t.category?.isFromSavings)
      .reduce((sum, t) => sum + effectiveAmt(t), 0);

    results.push({ month, year, income, expenses, net: income + expenses });
  }

  res.json(results);
}));

// GET /api/reports/category-totals?months=6
// Total spending per category over a period (for analytics)
router.get('/category-totals', asyncHandler(async (req: Request, res: Response) => {
  const months = parseInt(req.query.months as string) || 6;
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const transactions = await prisma.transaction.findMany({
    where: {
      date: { gte: start, lte: end },
      isInternalTransfer: false,
      amount: { lt: 0 },
      category: { isReimbursement: false, isFromSavings: false },
      categoryId: { not: null },
    },
    select: {
      amount: true,
      categoryId: true,
      category: { select: { name: true, color: true } },
    },
  });

  const map: Record<number, { name: string; color: string | null; total: number }> = {};
  for (const tx of transactions) {
    if (!tx.categoryId) continue;
    if (!map[tx.categoryId]) {
      map[tx.categoryId] = { name: tx.category!.name, color: tx.category!.color, total: 0 };
    }
    map[tx.categoryId].total += Math.abs(Number(tx.amount));
  }

  const result = Object.values(map).sort((a, b) => b.total - a.total);
  res.json(result);
}));

// GET /api/reports/net-worth?months=12
// Uses stored balance snapshots for accuracy. Falls back to transaction reconstruction only when no snapshot exists.
router.get('/net-worth', asyncHandler(async (req: Request, res: Response) => {
  const months = parseInt(req.query.months as string) || 12;
  const now = new Date();

  const [accountList, snapshots, transactions] = await Promise.all([
    prisma.account.findMany({ select: { id: true, balance: true } }),
    prisma.accountBalanceSnapshot.findMany({
      orderBy: { date: 'desc' },
    }),
    prisma.transaction.findMany({
      where: { isInternalTransfer: false },
      select: { accountId: true, amount: true, date: true },
    }),
  ]);

  const points = [];

  for (let i = months - 1; i >= 1; i--) {
    const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);

    let netWorth = 0;
    for (const account of accountList) {
      // Find the most recent snapshot on or before this month-end
      const snapshot = snapshots.find(
        (s) => s.accountId === account.id && new Date(s.date) <= monthEnd
      );

      if (snapshot) {
        netWorth += Number(snapshot.balance);
      } else {
        // No snapshot yet — fall back to transaction-based reconstruction
        const delta = transactions
          .filter((t) => t.accountId === account.id && new Date(t.date) > monthEnd)
          .reduce((sum, t) => sum + Number(t.amount), 0);
        netWorth += Number(account.balance) - delta;
      }
    }

    points.push({
      month: monthEnd.getMonth() + 1,
      year: monthEnd.getFullYear(),
      netWorth: Math.round(netWorth * 100) / 100,
    });
  }

  res.json(points);
}));

// GET /api/reports/upcoming-bills
// Recurring transactions projected to next occurrence
router.get('/upcoming-bills', asyncHandler(async (_req: Request, res: Response) => {
  const recurring = await prisma.transaction.findMany({
    where: { isRecurring: true, amount: { lt: 0 } },
    orderBy: { date: 'desc' },
    distinct: ['merchantNormalized'],
    include: { category: { select: { name: true } } },
  });

  const now = new Date();
  const upcoming = recurring.map((t) => {
    const lastDate = new Date(t.date);
    const nextDate = new Date(lastDate);
    nextDate.setMonth(nextDate.getMonth() + 1);
    while (nextDate < now) {
      nextDate.setMonth(nextDate.getMonth() + 1);
    }

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
}));

export default router;
