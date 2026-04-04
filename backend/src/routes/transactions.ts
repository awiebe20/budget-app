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
      savingsGoal: { select: { id: true, name: true, color: true } },
    },
    orderBy: { date: 'desc' },
  });

  res.json(transactions);
});

// GET /api/transactions/internal-transfers
router.get('/internal-transfers', async (_req: Request, res: Response) => {
  const transactions = await prisma.transaction.findMany({
    where: { isInternalTransfer: true },
    include: { account: { select: { name: true } } },
    orderBy: { date: 'desc' },
  });
  res.json(transactions);
});

// GET /api/transactions/people — distinct owedBy names from splits
router.get('/people', async (_req: Request, res: Response) => {
  const splits = await prisma.transactionSplit.findMany({
    select: { owedBy: true },
    distinct: ['owedBy'],
    orderBy: { owedBy: 'asc' },
  });
  res.json(splits.map(s => s.owedBy));
});

// GET /api/transactions/:id
router.get('/:id', async (req: Request, res: Response) => {
  const transaction = await prisma.transaction.findUnique({
    where: { id: parseInt(req.params.id) },
    include: {
      category: true,
      account: { select: { name: true } },
      splits: { include: { settlement: { select: { settledDate: true } } } },
      savingsGoal: { select: { id: true, name: true, color: true } },
    },
  });
  if (!transaction) return res.status(404).json({ error: 'Not found' });
  res.json(transaction);
});

// PATCH /api/transactions/:id
router.patch('/:id', async (req: Request, res: Response) => {
  const { categoryId, notes, isRecurring, isInternalTransfer, reimbursedBy, savingsGoalId } = req.body;

  const updated = await prisma.transaction.update({
    where: { id: parseInt(req.params.id) },
    data: {
      ...(categoryId !== undefined && { categoryId }),
      ...(notes !== undefined && { notes }),
      ...(isRecurring !== undefined && { isRecurring }),
      ...(isInternalTransfer !== undefined && { isInternalTransfer }),
      ...(reimbursedBy !== undefined && { reimbursedBy }),
      ...(savingsGoalId !== undefined && { savingsGoalId }),
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

// PATCH /api/transactions/:id/splits/:splitId
router.patch('/:id/splits/:splitId', async (req: Request, res: Response) => {
  const { owedBy } = req.body;
  const split = await prisma.transactionSplit.update({
    where: { id: parseInt(req.params.splitId) },
    data: { ...(owedBy !== undefined && { owedBy }) },
  });
  res.json(split);
});

// DELETE /api/transactions/:id/splits/:splitId
router.delete('/:id/splits/:splitId', async (req: Request, res: Response) => {
  const txId = parseInt(req.params.id);

  await prisma.transactionSplit.delete({
    where: { id: parseInt(req.params.splitId) },
  });

  // Rebalance remaining splits evenly
  const [remaining, tx] = await Promise.all([
    prisma.transactionSplit.findMany({ where: { transactionId: txId } }),
    prisma.transaction.findUnique({ where: { id: txId }, select: { amount: true } }),
  ]);

  if (remaining.length > 0 && tx) {
    const perPerson = parseFloat((Math.abs(Number(tx.amount)) / (remaining.length + 1)).toFixed(2));
    await Promise.all(remaining.map(s =>
      prisma.transactionSplit.update({ where: { id: s.id }, data: { amount: perPerson } })
    ));
  }

  const updatedSplits = await prisma.transactionSplit.findMany({ where: { transactionId: txId } });
  res.json({ splits: updatedSplits });
});

export default router;
