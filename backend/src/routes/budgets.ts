import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// GET /api/budgets?month=3&year=2026
router.get('/', async (req: Request, res: Response) => {
  const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;
  const year = parseInt(req.query.year as string) || new Date().getFullYear();

  const budgets = await prisma.budget.findMany({
    where: { month, year },
    include: { category: true },
  });

  res.json(budgets);
});

router.post('/', async (req: Request, res: Response) => {
  const { categoryId, amount, month, year } = req.body;

  const budget = await prisma.budget.upsert({
    where: { categoryId_month_year: { categoryId, month, year } },
    update: { amount },
    create: { categoryId, amount, month, year },
  });

  res.json(budget);
});

export default router;
