import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// Returns the current active budget for each category (latest effectiveFrom <= now)
router.get('/', async (_req: Request, res: Response) => {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const budgets = await prisma.budget.findMany({
    where: { effectiveFrom: { lte: startOfMonth } },
    orderBy: { effectiveFrom: 'desc' },
    distinct: ['categoryId'],
    include: { category: true },
  });

  res.json(budgets);
});

// Upsert budget for the current month — creates a new record if amount changed
router.post('/', async (req: Request, res: Response) => {
  const { categoryId, amount, frequency = 'MONTHLY' } = req.body;
  const now = new Date();
  const effectiveFrom = new Date(now.getFullYear(), now.getMonth(), 1);

  const budget = await prisma.budget.upsert({
    where: { categoryId_effectiveFrom: { categoryId, effectiveFrom } },
    update: { amount, frequency },
    create: { categoryId, amount, frequency, effectiveFrom },
  });

  res.json(budget);
});

export default router;
