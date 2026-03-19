import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// GET /api/transactions
router.get('/', async (req: Request, res: Response) => {
  const { startDate, endDate } = req.query;

  const transactions = await prisma.transaction.findMany({
    where: {
      isInternalTransfer: false,
      ...(startDate || endDate ? {
        date: {
          ...(startDate && { gte: new Date(startDate as string) }),
          ...(endDate && { lte: new Date(endDate as string) }),
        },
      } : {}),
    },
    include: {
      category: true,
      account: { select: { name: true } },
      splits: true,
    },
    orderBy: { date: 'desc' },
  });

  res.json(transactions);
});

// GET /api/transactions/:id
router.get('/:id', async (req: Request, res: Response) => {
  const transaction = await prisma.transaction.findUnique({
    where: { id: parseInt(req.params.id) },
    include: {
      category: true,
      account: { select: { name: true } },
      splits: { include: { settlement: { select: { settledDate: true } } } },
    },
  });
  if (!transaction) return res.status(404).json({ error: 'Not found' });
  res.json(transaction);
});

// PATCH /api/transactions/:id
router.patch('/:id', async (req: Request, res: Response) => {
  const { categoryId, notes, isRecurring, isInternalTransfer } = req.body;

  const updated = await prisma.transaction.update({
    where: { id: parseInt(req.params.id) },
    data: {
      ...(categoryId !== undefined && { categoryId }),
      ...(notes !== undefined && { notes }),
      ...(isRecurring !== undefined && { isRecurring }),
      ...(isInternalTransfer !== undefined && { isInternalTransfer }),
    },
    include: { category: true },
  });

  res.json(updated);
});

// POST /api/transactions/:id/splits
router.post('/:id/splits', async (req: Request, res: Response) => {
  const { amount, owedBy } = req.body;

  const split = await prisma.transactionSplit.create({
    data: {
      transactionId: parseInt(req.params.id),
      amount,
      owedBy,
    },
  });

  res.json(split);
});

// DELETE /api/transactions/:id/splits/:splitId
router.delete('/:id/splits/:splitId', async (req: Request, res: Response) => {
  await prisma.transactionSplit.delete({
    where: { id: parseInt(req.params.splitId) },
  });
  res.json({ success: true });
});

export default router;
