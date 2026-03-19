import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

router.get('/', async (_req: Request, res: Response) => {
  const goals = await prisma.savingsGoal.findMany();
  res.json(goals);
});

router.post('/', async (req: Request, res: Response) => {
  const { name, targetAmount, currentAmount, targetDate } = req.body;
  const goal = await prisma.savingsGoal.create({
    data: { name, targetAmount, currentAmount, targetDate: targetDate ? new Date(targetDate) : null },
  });
  res.json(goal);
});

router.patch('/:id', async (req: Request, res: Response) => {
  const { name, targetAmount, currentAmount, targetDate } = req.body;
  const goal = await prisma.savingsGoal.update({
    where: { id: parseInt(req.params.id) },
    data: {
      ...(name && { name }),
      ...(targetAmount !== undefined && { targetAmount }),
      ...(currentAmount !== undefined && { currentAmount }),
      ...(targetDate !== undefined && { targetDate: targetDate ? new Date(targetDate) : null }),
    },
  });
  res.json(goal);
});

router.delete('/:id', async (req: Request, res: Response) => {
  await prisma.savingsGoal.delete({ where: { id: parseInt(req.params.id) } });
  res.json({ success: true });
});

export default router;
