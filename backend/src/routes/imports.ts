import { Router, Request, Response } from 'express';
import multer from 'multer';
import { PrismaClient } from '@prisma/client';
import { parseCSV, detectBankFromContent, BankSource } from '../parsers';
import { generateFingerprint } from '../parsers/normalizer';
import { buildMerchantCategoryMap, buildInternalTransferMerchants } from '../services/autoCategorize';

const router = Router();
const prisma = new PrismaClient();
const upload = multer({ storage: multer.memoryStorage() });

// POST /api/imports/preview - parse and return transactions without saving
// Also returns detectedAccountId if account number matches a stored account
router.post('/preview', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const content = req.file.buffer.toString('utf-8');

    // Detect bank from file content first to do an initial parse for account number
    const detectedFromContent = detectBankFromContent(content);
    if (!detectedFromContent) return res.status(400).json({ error: 'Could not detect bank format. Check the file.' });

    // Parse just enough to get account number, then check if account has a bank set
    const { accountNumber } = parseCSV(content, detectedFromContent);

    let detectedAccountId: number | null = null;
    let bank: BankSource = detectedFromContent;

    if (accountNumber) {
      const match = await prisma.account.findFirst({
        where: { accountNumber: { endsWith: accountNumber.slice(-4) } },
      });
      if (match) {
        detectedAccountId = match.id;
        // Use bank from account record if set, otherwise fall back to content detection
        if (match.bank) {
          bank = match.bank === 'CAPITAL_ONE' ? 'capital_one' : 'heritage';
        }
      }
    }

    const { transactions: parsed } = parseCSV(content, bank);

    // Check which fingerprints already exist
    const accountId = detectedAccountId ?? 0;
    const fingerprints = parsed.map((t) => generateFingerprint(t.date, t.amount, accountId));
    const existing = await prisma.transaction.findMany({
      where: { fingerprint: { in: fingerprints } },
      select: { fingerprint: true },
    });
    const existingSet = new Set(existing.map((t) => t.fingerprint));

    const preview = parsed.map((t) => ({
      ...t,
      isDuplicate: existingSet.has(generateFingerprint(t.date, t.amount, accountId)),
    }));

    res.json({
      accountNumber,
      detectedAccountId,
      detectedBank: bank,
      total: parsed.length,
      newCount: preview.filter((t) => !t.isDuplicate).length,
      duplicateCount: preview.filter((t) => t.isDuplicate).length,
      transactions: preview,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/imports/confirm - save previewed transactions to DB
router.post('/confirm', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const accountId = parseInt(req.body.accountId);
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    if (!accountId) return res.status(400).json({ error: 'accountId required' });

    const content = req.file.buffer.toString('utf-8');

    const account = await prisma.account.findUnique({ where: { id: accountId } });
    const bankFromAccount = account?.bank
      ? (account.bank === 'CAPITAL_ONE' ? 'capital_one' : 'heritage') as BankSource
      : detectBankFromContent(content);

    if (!bankFromAccount) return res.status(400).json({ error: 'Could not detect bank format.' });

    const { transactions: parsed } = parseCSV(content, bankFromAccount);

    const importLog = await prisma.importLog.create({
      data: {
        accountId,
        source: 'CSV',
        filename: req.file.originalname,
        transactionCount: 0,
        duplicateCount: 0,
        status: 'SUCCESS',
      },
    });

    let inserted = 0;
    let duplicates = 0;

    const [merchantRules, internalTransferMerchants] = await Promise.all([
      buildMerchantCategoryMap(prisma),
      buildInternalTransferMerchants(prisma),
    ]);

    for (const t of parsed) {
      const fingerprint = generateFingerprint(t.date, t.amount, accountId);
      const exists = await prisma.transaction.findUnique({ where: { fingerprint } });

      if (exists) {
        duplicates++;
        continue;
      }

      const isInternalTransfer =
        t.merchantNormalized.toLowerCase().includes('internal transfer') ||
        internalTransferMerchants.has(t.merchantNormalized);
      const rule = !isInternalTransfer ? merchantRules.get(t.merchantNormalized) : undefined;

      await prisma.transaction.create({
        data: {
          accountId,
          date: t.date,
          amount: t.amount,
          merchantRaw: t.merchantRaw,
          merchantNormalized: t.merchantNormalized,
          source: 'CSV',
          fingerprint,
          isInternalTransfer,
          importId: importLog.id,
          ...(rule ? { categoryId: rule.categoryId, isRecurring: rule.isRecurring } : {}),
        },
      });
      inserted++;
    }

    await prisma.importLog.update({
      where: { id: importLog.id },
      data: { transactionCount: inserted, duplicateCount: duplicates },
    });

    // Update account balance from the most recent transaction's balance value
    const latestWithBalance = parsed
      .filter((t) => t.balance !== null && t.balance !== undefined)
      .sort((a, b) => b.date.getTime() - a.date.getTime())[0];

    if (latestWithBalance?.balance !== null && latestWithBalance?.balance !== undefined) {
      await prisma.account.update({
        where: { id: accountId },
        data: { balance: latestWithBalance.balance },
      });
    }

    res.json({ inserted, duplicates, importId: importLog.id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/imports - list import history
router.get('/', async (_req: Request, res: Response) => {
  const logs = await prisma.importLog.findMany({
    orderBy: { importedAt: 'desc' },
    include: { account: { select: { name: true } } },
  });
  res.json(logs);
});

export default router;
