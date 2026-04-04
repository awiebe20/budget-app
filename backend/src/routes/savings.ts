import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// GET /api/savings — goals with computed balances
router.get('/', async (_req: Request, res: Response) => {
  const [goals, savingsAccounts] = await Promise.all([
    prisma.savingsGoal.findMany({
      include: {
        transactions: { select: { amount: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.account.findMany({
      where: { type: 'SAVINGS' },
      select: { balance: true },
    }),
  ]);

  const totalSavingsBalance = savingsAccounts.reduce((sum, a) => sum + Number(a.balance), 0);
  const totalAllocatedPercent = goals.reduce((sum, g) => sum + g.allocationPercent, 0);

  const result = goals.map((goal) => {
    const allocated = (goal.allocationPercent / 100) * totalSavingsBalance;
    const withdrawn = goal.transactions
      .filter((t) => Number(t.amount) < 0)
      .reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0);
    const balance = Math.max(0, allocated - withdrawn);

    return {
      id: goal.id,
      name: goal.name,
      targetAmount: Number(goal.targetAmount),
      allocationPercent: goal.allocationPercent,
      color: goal.color,
      allocated,
      withdrawn,
      balance,
      progress: Number(goal.targetAmount) > 0 ? balance / Number(goal.targetAmount) : 0,
    };
  });

  res.json({
    goals: result,
    totalSavingsBalance,
    totalAllocatedPercent,
    unallocatedBalance: ((100 - totalAllocatedPercent) / 100) * totalSavingsBalance,
  });
});

// POST /api/savings
router.post('/', async (req: Request, res: Response) => {
  const { name, targetAmount, allocationPercent, color } = req.body;
  const goal = await prisma.savingsGoal.create({
    data: { name, targetAmount, allocationPercent: allocationPercent ?? 0, color },
  });
  res.json(goal);
});

// PATCH /api/savings/:id
router.patch('/:id', async (req: Request, res: Response) => {
  const { name, targetAmount, allocationPercent, color } = req.body;
  const goal = await prisma.savingsGoal.update({
    where: { id: parseInt(req.params.id) },
    data: {
      ...(name !== undefined && { name }),
      ...(targetAmount !== undefined && { targetAmount }),
      ...(allocationPercent !== undefined && { allocationPercent }),
      ...(color !== undefined && { color }),
    },
  });
  res.json(goal);
});

// DELETE /api/savings/:id
router.delete('/:id', async (req: Request, res: Response) => {
  await prisma.savingsGoal.delete({ where: { id: parseInt(req.params.id) } });
  res.json({ success: true });
});

export default router;
