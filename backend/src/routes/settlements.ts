import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { asyncHandler } from '../lib/asyncHandler';

const router = Router();
const prisma = new PrismaClient();

router.get('/pending', asyncHandler(async (_req: Request, res: Response) => {
  const [splits, reimbursements] = await Promise.all([
    prisma.transactionSplit.findMany({
      where: { settlementId: null },
      include: {
        transaction: { select: { date: true, merchantNormalized: true, amount: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.transaction.findMany({
      where: { reimbursedBy: { not: null } },
      select: { reimbursedBy: true, amount: true },
    }),
  ]);

  const reimbursedTotals: Record<string, number> = {};
  for (const tx of reimbursements) {
    const person = tx.reimbursedBy!;
    reimbursedTotals[person] = (reimbursedTotals[person] ?? 0) + Math.abs(Number(tx.amount));
  }

  const grouped = splits.reduce<Record<string, typeof splits>>((acc, split) => {
    if (!acc[split.owedBy]) acc[split.owedBy] = [];
    acc[split.owedBy].push(split);
    return acc;
  }, {});

  const result = Object.entries(grouped).map(([person, personSplits]) => {
    const owed = personSplits.reduce((sum, s) => sum + Number(s.amount), 0);
    const reimbursed = reimbursedTotals[person] ?? 0;
    return {
      person,
      total: Math.max(0, owed - reimbursed),
      splits: personSplits,
    };
  }).filter(p => p.total > 0);

  res.json(result);
}));

router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const { person, periodStart, periodEnd } = req.body;

  const pendingSplits = await prisma.transactionSplit.findMany({
    where: { owedBy: person, settlementId: null },
  });

  if (pendingSplits.length === 0) {
    return res.status(400).json({ error: 'No pending splits for this person' });
  }

  const total = pendingSplits.reduce((sum, s) => sum + Number(s.amount), 0);

  const settlement = await prisma.settlement.create({
    data: {
      person,
      amount: total,
      periodStart: new Date(periodStart),
      periodEnd: new Date(periodEnd),
      settledDate: new Date(),
    },
  });

  await prisma.transactionSplit.updateMany({
    where: { id: { in: pendingSplits.map((s) => s.id) } },
    data: { settlementId: settlement.id },
  });

  res.json(settlement);
}));

router.get('/', asyncHandler(async (_req: Request, res: Response) => {
  const settlements = await prisma.settlement.findMany({
    orderBy: { settledDate: 'desc' },
    include: { splits: { include: { transaction: { select: { merchantNormalized: true, date: true } } } } },
  });
  res.json(settlements);
}));

export default router;
