import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

router.get('/status', async (_req: Request, res: Response) => {
  const [simplefinSetting, accountCount, simpleFinTxCount, categoryCount, budgetCount] =
    await Promise.all([
      prisma.setting.findUnique({ where: { key: 'simplefin_access_url' } }),
      prisma.account.count(),
      prisma.transaction.count({ where: { source: 'SIMPLEFIN' } }),
      prisma.category.count(),
      prisma.budget.count(),
    ]);

  res.json({
    simpleFinConnected: !!simplefinSetting,
    accountsAdded: accountCount > 0,
    firstSyncDone: simpleFinTxCount > 0,
    categoriesSetUp: categoryCount > 0,
    budgetsSetUp: budgetCount > 0,
  });
});

export default router;