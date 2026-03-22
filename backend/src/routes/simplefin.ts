import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import {
  exchangeSetupToken,
  fetchSimplefinData,
  getAccessUrl,
  normalizeSimplefinTransaction,
} from '../services/simplefin';

const router = Router();
const prisma = new PrismaClient();

// Check connection status
router.get('/status', async (_req: Request, res: Response) => {
  const accessUrl = await getAccessUrl();
  res.json({ connected: !!accessUrl });
});

// One-time token exchange
router.post('/connect', async (req: Request, res: Response) => {
  const { setupToken } = req.body;
  if (!setupToken) return res.status(400).json({ error: 'setupToken required' });

  // Use env token if not provided in body
  const token = setupToken || process.env.SIMPLEFIN_TOKEN;
  await exchangeSetupToken(token);
  res.json({ success: true });
});

// Sync transactions from SimpleFIN
router.post('/sync', async (_req: Request, res: Response) => {
  const accounts = await fetchSimplefinData();

  let newCount = 0;
  let dupCount = 0;

  for (const sfAccount of accounts) {
    // Extract last 4 digits from name e.g. "360 Checking (5817)" or "Savings (XXXXX8259)"
    const nameMatch = sfAccount.name.match(/\(.*?(\d{4})\)\s*$/);
    const accountIdSuffix = nameMatch ? nameMatch[1] : null;

    if (!accountIdSuffix) continue;

    const account = await prisma.account.findFirst({
      where: { accountNumber: { endsWith: accountIdSuffix } },
    });

    if (!account) continue;

    // Update balance
    await prisma.account.update({
      where: { id: account.id },
      data: { balance: parseFloat(sfAccount.balance) },
    });

    // Ingest transactions
    for (const tx of sfAccount.transactions) {
      const normalized = normalizeSimplefinTransaction(tx, account.id);

      const existing = await prisma.transaction.findUnique({
        where: { fingerprint: normalized.fingerprint },
      });

      if (existing) {
        dupCount++;
        continue;
      }

      await prisma.transaction.create({ data: normalized });
      newCount++;
    }
  }

  res.json({ newCount, dupCount });
});

export default router;