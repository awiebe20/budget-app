import { Router, Request, Response } from 'express';
import { asyncHandler } from '../lib/asyncHandler';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// GET /api/transactions
router.get('/', asyncHandler(async (req: Request, res: Response) => {
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
}));

// POST /api/transactions/dedup — remove duplicate transactions (same accountId + date + amount)
router.post('/dedup', asyncHandler(async (_req: Request, res: Response) => {
  const all = await prisma.transaction.findMany({
    select: { id: true, accountId: true, date: true, amount: true, categoryId: true, notes: true },
    orderBy: { id: 'asc' },
  });

  // Group by accountId|date|amount
  const groups = new Map<string, typeof all>();
  for (const tx of all) {
    const key = `${tx.accountId}|${tx.date.toISOString()}|${Number(tx.amount).toFixed(2)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(tx);
  }

  const toDelete: number[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    // Keep the one with a category, or notes, falling back to lowest id
    const keeper = group.sort((a, b) => {
      if (a.categoryId && !b.categoryId) return -1;
      if (!a.categoryId && b.categoryId) return 1;
      if (a.notes && !b.notes) return -1;
      if (!a.notes && b.notes) return 1;
      return a.id - b.id;
    })[0];
    for (const tx of group) {
      if (tx.id !== keeper.id) toDelete.push(tx.id);
    }
  }

  if (toDelete.length > 0) {
    await prisma.transaction.deleteMany({ where: { id: { in: toDelete } } });
  }

  res.json({ removed: toDelete.length });
}));

// GET /api/transactions/internal-transfers
router.get('/internal-transfers', asyncHandler(async (_req: Request, res: Response) => {
  const transactions = await prisma.transaction.findMany({
    where: { isInternalTransfer: true },
    include: { account: { select: { name: true } } },
    orderBy: { date: 'desc' },
  });
  res.json(transactions);
}));

// GET /api/transactions/people — distinct owedBy names from splits
router.get('/people', asyncHandler(async (_req: Request, res: Response) => {
  const splits = await prisma.transactionSplit.findMany({
    select: { owedBy: true },
    distinct: ['owedBy'],
    orderBy: { owedBy: 'asc' },
  });
  res.json(splits.map(s => s.owedBy));
}));

// GET /api/transactions/:id
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
  const transaction = await prisma.transaction.findUnique({
    where: { id },
    include: {
      category: true,
      account: { select: { name: true } },
      splits: { include: { settlement: { select: { settledDate: true } } } },
      savingsGoal: { select: { id: true, name: true, color: true } },
    },
  });
  if (!transaction) return res.status(404).json({ error: 'Not found' });
  res.json(transaction);
}));

// PATCH /api/transactions/:id
router.patch('/:id', asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
  const { categoryId, notes, isRecurring, isInternalTransfer, reimbursedBy, savingsGoalId } = req.body;

  const updated = await prisma.transaction.update({
    where: { id },
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
}));

// POST /api/transactions/:id/splits
router.post('/:id/splits', asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
  const { amount, owedBy } = req.body;

  const split = await prisma.transactionSplit.create({
    data: {
      transactionId: id,
      amount,
      owedBy,
    },
  });

  res.json(split);
}));

// PATCH /api/transactions/:id/splits/:splitId
router.patch('/:id/splits/:splitId', asyncHandler(async (req: Request, res: Response) => {
  const splitId = parseInt(req.params.splitId);
  if (isNaN(splitId)) return res.status(400).json({ error: 'Invalid splitId' });
  const { owedBy } = req.body;
  const split = await prisma.transactionSplit.update({
    where: { id: splitId },
    data: { ...(owedBy !== undefined && { owedBy }) },
  });
  res.json(split);
}));

// DELETE /api/transactions/:id/splits/:splitId
router.delete('/:id/splits/:splitId', asyncHandler(async (req: Request, res: Response) => {
  const txId = parseInt(req.params.id);
  const splitId = parseInt(req.params.splitId);
  if (isNaN(txId) || isNaN(splitId)) return res.status(400).json({ error: 'Invalid id' });

  await prisma.transactionSplit.delete({
    where: { id: splitId },
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
}));

export default router;
