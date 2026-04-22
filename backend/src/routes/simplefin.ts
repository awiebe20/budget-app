import { Router, Request, Response } from 'express';
import { asyncHandler } from '../lib/asyncHandler';
import { PrismaClient } from '@prisma/client';
import {
  exchangeSetupToken,
  fetchSimplefinData,
  getAccessUrl,
  testConnection,
  getAccountWarnings,
  normalizeSimplefinTransaction,
} from '../services/simplefin';
import { generateFingerprint as generateLegacyFingerprint } from '../parsers/normalizer';
import { buildMerchantCategoryMap, buildInternalTransferMerchants, isInternalTransferMatch } from '../services/autoCategorize';

const router = Router();
const prisma = new PrismaClient();

// Check connection status (live ping to SimpleFIN)
router.get('/status', asyncHandler(async (_req: Request, res: Response) => {
  const accessUrl = await getAccessUrl();
  if (!accessUrl) return res.json({ connected: false, hasAccessUrl: false, staleAccounts: [] });
  const result = await testConnection();
  res.json({ connected: result.ok, hasAccessUrl: true, error: result.error ?? null, staleAccounts: result.staleAccounts });
}));

// Debug: show raw SimpleFIN data including org errors
router.get('/debug', asyncHandler(async (_req: Request, res: Response) => {
  const accounts = await fetchSimplefinData();
  res.json(accounts.map(a => ({
    name: a.name,
    id: a.id,
    balance: a.balance,
    orgErrors: (a as any).org?.errors ?? [],
    txCount: a.transactions.length,
    txDates: a.transactions.map((t: any) => ({
      id: t.id,
      date: new Date(t.posted * 1000).toISOString().split('T')[0],
      amount: t.amount,
      description: t.description,
    })).sort((a: any, b: any) => b.date.localeCompare(a.date)).slice(0, 5),
  })));
}));

// One-time token exchange
router.post('/connect', asyncHandler(async (req: Request, res: Response) => {
  const { setupToken } = req.body;
  if (!setupToken) return res.status(400).json({ error: 'setupToken required' });

  // Use env token if not provided in body
  const token = setupToken || process.env.SIMPLEFIN_TOKEN;
  await exchangeSetupToken(token);
  res.json({ success: true });
}));

// Sync transactions from SimpleFIN
router.post('/sync', asyncHandler(async (_req: Request, res: Response) => {
  let accounts;
  try {
    accounts = await fetchSimplefinData();
  } catch (err: any) {
    return res.status(502).json({ error: err.message ?? 'SimpleFIN sync failed' });
  }

  let newCount = 0;
  let dupCount = 0;

  const [merchantRules, internalTransferMerchants] = await Promise.all([
    buildMerchantCategoryMap(prisma),
    buildInternalTransferMerchants(prisma),
  ]);

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

    const newBalance = parseFloat(sfAccount.balance);
    const snapshotDate = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());

    // Update balance and store simplefinId for future syncs
    await prisma.account.update({
      where: { id: account.id },
      data: {
        balance: newBalance,
        balanceDate: new Date(sfAccount['balance-date'] * 1000),
        simplefinId: sfAccount.id,
      },
    });

    // Store a daily balance snapshot for net worth history
    await prisma.accountBalanceSnapshot.upsert({
      where: { accountId_date: { accountId: account.id, date: snapshotDate } },
      update: { balance: newBalance },
      create: { accountId: account.id, balance: newBalance, date: snapshotDate },
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

      const isKnownTransfer = isInternalTransferMatch(normalized.merchantNormalized, internalTransferMerchants);
      const rule = !isKnownTransfer ? merchantRules.get(normalized.merchantNormalized) : undefined;
      await prisma.transaction.create({
        data: {
          ...normalized,
          ...(isKnownTransfer ? { isInternalTransfer: true } : {}),
          ...(rule ? { categoryId: rule.categoryId, isRecurring: rule.isRecurring } : {}),
        },
      });
      newCount++;
    }
  }

  const warnings = getAccountWarnings(accounts);
  res.json({ newCount, dupCount, warnings });
}));

export default router;