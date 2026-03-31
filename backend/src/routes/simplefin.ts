import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import {
  exchangeSetupToken,
  fetchSimplefinData,
  getAccessUrl,
  normalizeSimplefinTransaction,
} from '../services/simplefin';
import { generateFingerprint as generateLegacyFingerprint } from '../parsers/normalizer';

const router = Router();
const prisma = new PrismaClient();

// Check connection status
router.get('/status', async (_req: Request, res: Response) => {
  const accessUrl = await getAccessUrl();
  res.json({ connected: !!accessUrl });
});

// Debug: show raw SimpleFIN data
router.get('/debug', async (_req: Request, res: Response) => {
  const accounts = await fetchSimplefinData();
  res.json(accounts.map(a => ({
    name: a.name,
    id: a.id,
    balance: a.balance,
    txCount: a.transactions.length,
    txDates: a.transactions.map((t: any) => ({
      id: t.id,
      date: new Date(t.posted * 1000).toISOString().split('T')[0],
      amount: t.amount,
      description: t.description,
    })).sort((a: any, b: any) => b.date.localeCompare(a.date)).slice(0, 5),
  })));
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
    // Try to match by stored simplefinId first
    let account = await prisma.account.findFirst({
      where: { simplefinId: sfAccount.id },
    });

    // Fall back to last-4-digits name match
    if (!account) {
      const nameMatch = sfAccount.name.match(/\(.*?(\d{4})\)\s*$/);
      const accountIdSuffix = nameMatch ? nameMatch[1] : null;
      if (accountIdSuffix) {
        account = await prisma.account.findFirst({
          where: { accountNumber: { endsWith: accountIdSuffix } },
        });
      }
    }

    if (!account) continue;

    // Update balance and store simplefinId for future syncs
    await prisma.account.update({
      where: { id: account.id },
      data: {
        balance: parseFloat(sfAccount.balance),
        balanceDate: new Date(sfAccount['balance-date'] * 1000),
        simplefinId: sfAccount.id,
      },
    });

    // Ingest transactions
    for (const tx of sfAccount.transactions) {
      const normalized = normalizeSimplefinTransaction(tx, account.id);

      // Check by new fingerprint
      const existing = await prisma.transaction.findUnique({
        where: { fingerprint: normalized.fingerprint },
      });

      if (existing) {
        dupCount++;
        continue;
      }

      // Check by old fingerprint (accountId|date|amount) and upgrade if found
      const oldFingerprint = generateLegacyFingerprint(normalized.date, Number(normalized.amount), account.id);
      const legacy = await prisma.transaction.findUnique({
        where: { fingerprint: oldFingerprint },
      });

      if (legacy) {
        await prisma.transaction.update({
          where: { id: legacy.id },
          data: { fingerprint: normalized.fingerprint },
        });
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