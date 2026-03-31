import axios from 'axios';
import { PrismaClient } from '@prisma/client';
import { normalizeMerchant } from '../parsers/normalizer';

const prisma = new PrismaClient();

const SETTING_KEY = 'simplefin_access_url';

export async function exchangeSetupToken(setupToken: string): Promise<string> {
  const decoded = Buffer.from(setupToken, 'base64').toString('utf-8');
  const response = await axios.post(decoded, null, {
    headers: { 'Content-Length': '0' },
  });
  const accessUrl = response.data as string;

  await prisma.setting.upsert({
    where: { key: SETTING_KEY },
    update: { value: accessUrl },
    create: { key: SETTING_KEY, value: accessUrl },
  });

  return accessUrl;
}

export async function getAccessUrl(): Promise<string | null> {
  const setting = await prisma.setting.findUnique({ where: { key: SETTING_KEY } });
  return setting?.value ?? null;
}

interface SimplefinAccount {
  id: string;
  name: string;
  currency: string;
  balance: string;
  'balance-date': number;
  transactions: SimplefinTransaction[];
}

interface SimplefinTransaction {
  id: string;
  posted: number;
  amount: string;
  description: string;
  memo?: string;
}

export async function fetchSimplefinData(startDate?: Date): Promise<SimplefinAccount[]> {
  const accessUrl = await getAccessUrl();
  if (!accessUrl) throw new Error('SimpleFIN not connected');

  const start = startDate ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const startTs = Math.floor(start.getTime() / 1000);

  const url = new URL(`${accessUrl}/accounts`);
  url.searchParams.set('start-date', String(startTs));

  console.log(`[SimpleFIN] Requesting: start-date=${startTs} (${start.toISOString()})`);

  const response = await axios.get(url.toString());
  const accounts = response.data.accounts as SimplefinAccount[];

  for (const acct of accounts) {
    const dates = acct.transactions.map(t => new Date(t.posted * 1000).toISOString().split('T')[0]).sort();
    console.log(`[SimpleFIN] Account "${acct.name}": balance=${acct.balance}, transactions=${acct.transactions.length}, range=${dates[0] ?? 'none'} → ${dates[dates.length - 1] ?? 'none'}`);
  }

  return accounts;
}

export function normalizeSimplefinTransaction(tx: SimplefinTransaction, accountId: number) {
  const date = new Date(tx.posted * 1000);
  const localDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0);
  const amount = parseFloat(tx.amount);
  const merchantRaw = tx.description ?? tx.memo ?? 'Unknown';
  const merchantNormalized = (tx as any).payee
    ? String((tx as any).payee)
    : normalizeMerchant(merchantRaw);

  return {
    accountId,
    date: localDate,
    amount,
    merchantRaw,
    merchantNormalized,
    notes: tx.memo ?? null,
    source: 'SIMPLEFIN' as const,
    fingerprint: Buffer.from(`simplefin|${tx.id}`).toString('base64'),
  };
}

