import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { asyncHandler } from '../lib/asyncHandler';

const router = Router();
const prisma = new PrismaClient();

// GET /api/export — full data export as JSON
router.get('/', asyncHandler(async (_req: Request, res: Response) => {
  const [transactions, categories, budgets, accounts, savingsGoals] = await Promise.all([
    prisma.transaction.findMany({ orderBy: { date: 'desc' } }),
    prisma.category.findMany({ orderBy: { order: 'asc' } }),
    prisma.budget.findMany({ orderBy: { effectiveFrom: 'desc' } }),
    prisma.account.findMany(),
    prisma.savingsGoal.findMany(),
  ]);

  const exportData = {
    exportedAt: new Date().toISOString(),
    transactions,
    categories,
    budgets,
    accounts,
    savingsGoals,
  };

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="abundance-backup-${new Date().toISOString().slice(0, 10)}.json"`);
  res.json(exportData);
}));

export default router;
