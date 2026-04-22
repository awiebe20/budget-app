import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { asyncHandler } from '../lib/asyncHandler';

const router = Router();
const prisma = new PrismaClient();

router.get('/', asyncHandler(async (_req: Request, res: Response) => {
  const accounts = await prisma.account.findMany({
    include: {
      imports: {
        orderBy: { importedAt: 'desc' },
        take: 1,
        select: { importedAt: true, transactionCount: true },
      },
    },
  });

  const result = accounts.map((a) => ({
    ...a,
    lastImportedAt: a.imports[0]?.importedAt ?? null,
    lastImportCount: a.imports[0]?.transactionCount ?? null,
    imports: undefined,
  }));

  res.json(result);
}));

router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const { name, type, currency, accountNumber, bank } = req.body;
  const account = await prisma.account.create({
    data: { name, type, currency, accountNumber, bank },
  });
  res.json(account);
}));

router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  await prisma.account.delete({ where: { id: parseInt(req.params.id) } });
  res.json({ success: true });
}));

router.patch('/:id', asyncHandler(async (req: Request, res: Response) => {
  const { name, balance, accountNumber } = req.body;
  const account = await prisma.account.update({
    where: { id: parseInt(req.params.id) },
    data: {
      ...(name && { name }),
      ...(balance !== undefined && { balance }),
      ...(accountNumber !== undefined && { accountNumber }),
    },
  });
  res.json(account);
}));

export default router;
