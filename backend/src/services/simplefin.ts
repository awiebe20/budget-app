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

interface SimplefinOrg {
  name?: string;
  'sfin-url'?: string;
  errors?: string[];
}

interface SimplefinAccount {
  id: string;
  name: string;
  org?: SimplefinOrg;
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

  let response;
  try {
    response = await axios.get(url.toString(), { timeout: 60000 });
  } catch (err: any) {
    const status = err?.response?.status;
    const body = err?.response?.data;
    if (status === 403 || status === 401) {
      throw new Error('SimpleFIN access denied — your access URL may have expired. Re-connect SimpleFIN from Settings.');
    }
    throw new Error(`SimpleFIN request failed (HTTP ${status ?? 'unknown'}): ${JSON.stringify(body ?? err?.message)}`);
  }

  // SimpleFIN can return non-fatal errors (e.g. date range capped) alongside valid accounts — just log them
  const errors: string[] = response.data.errors ?? [];
  if (errors.length > 0) {
    console.warn(`[SimpleFIN] Top-level errors (non-fatal): ${errors.join('; ')}`);
  }

  const accounts = response.data.accounts as SimplefinAccount[];
  if (!accounts) {
    throw new Error(`SimpleFIN reported errors: ${errors.join('; ')}`);
  }

  for (const acct of accounts) {
    const orgErrors = acct.org?.errors ?? [];
    const dates = acct.transactions.map(t => new Date(t.posted * 1000).toISOString().split('T')[0]).sort();
    if (orgErrors.length > 0) {
      console.warn(`[SimpleFIN] Account "${acct.name}" has org errors: ${orgErrors.join('; ')}`);
    }
    console.log(`[SimpleFIN] Account "${acct.name}": balance=${acct.balance}, transactions=${acct.transactions.length}, range=${dates[0] ?? 'none'} → ${dates[dates.length - 1] ?? 'none'}${orgErrors.length ? ` ⚠ org errors: ${orgErrors.join('; ')}` : ''}`);
  }

  return accounts;
}

export function getAccountWarnings(accounts: SimplefinAccount[]): { name: string; errors: string[]; stale?: boolean }[] {
  const warnings: { name: string; errors: string[]; stale?: boolean }[] = [];
  const now = Date.now();
  const staleThresholdMs = 3 * 24 * 60 * 60 * 1000; // 3 days

  for (const a of accounts) {
    const orgErrors = a.org?.errors ?? [];
    const txDates = a.transactions.map(t => t.posted * 1000);
    const mostRecentTx = txDates.length > 0 ? Math.max(...txDates) : null;
    const balanceAge = now - a['balance-date'] * 1000;
    const txAge = mostRecentTx ? now - mostRecentTx : null;

    const isStale = balanceAge > staleThresholdMs || (txAge !== null && txAge > staleThresholdMs);

    if (orgErrors.length > 0 || isStale) {
      const errors = [...orgErrors];
      if (isStale) {
        const daysOld = Math.floor(Math.max(balanceAge, txAge ?? 0) / (24 * 60 * 60 * 1000));
        errors.push(`Data appears stale — last update ${daysOld} day${daysOld !== 1 ? 's' : ''} ago`);
      }
      warnings.push({ name: a.name, errors, stale: isStale });
    }
  }

  return warnings;
}

export async function testConnection(): Promise<{
  ok: boolean;
  error?: string;
  staleAccounts: { simplefinId: string; name: string; daysStale: number }[];
}> {
  const accessUrl = await getAccessUrl();
  if (!accessUrl) return { ok: false, error: 'No access URL stored', staleAccounts: [] };

  try {
    const startTs = Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000);
    const url = new URL(`${accessUrl}/accounts`);
    url.searchParams.set('start-date', String(startTs));
    const response = await axios.get(url.toString(), { timeout: 30000 });

    const topErrors: string[] = response.data.errors ?? [];
    // Non-fatal if accounts are present (e.g. "date range capped")
    if (topErrors.length > 0 && !response.data.accounts) {
      return { ok: false, error: topErrors.join('; '), staleAccounts: [] };
    }

    const accounts: SimplefinAccount[] = response.data.accounts ?? [];

    // Collect stale accounts separately — staleness is a bank-side issue, not a connection failure
    const now = Date.now();
    const staleThresholdMs = 3 * 24 * 60 * 60 * 1000;
    const staleAccounts = accounts
      .filter(a => {
        const balanceAge = now - a['balance-date'] * 1000;
        const txDates = a.transactions.map(t => t.posted * 1000);
        const txAge = txDates.length > 0 ? now - Math.max(...txDates) : null;
        return balanceAge > staleThresholdMs || (txAge !== null && txAge > staleThresholdMs);
      })
      .map(a => {
        const balanceAge = now - a['balance-date'] * 1000;
        const txDates = a.transactions.map(t => t.posted * 1000);
        const txAge = txDates.length > 0 ? now - Math.max(...txDates) : balanceAge;
        const daysStale = Math.floor(Math.max(balanceAge, txAge) / (24 * 60 * 60 * 1000));
        return { simplefinId: a.id, name: a.name, daysStale };
      });

    // Only report org-level errors (actual auth failures) as connection errors
    const orgErrors = accounts
      .filter(a => (a.org?.errors ?? []).length > 0)
      .map(a => `${a.name}: ${a.org!.errors!.join(', ')}`);

    if (orgErrors.length > 0) {
      return { ok: false, error: orgErrors.join('; '), staleAccounts };
    }

    return { ok: true, staleAccounts };
  } catch (err: any) {
    const status = err?.response?.status;
    if (status === 403 || status === 401) {
      return { ok: false, error: 'Access denied — reconnect SimpleFIN from Settings', staleAccounts: [] };
    }
    return { ok: false, error: `Connection failed (HTTP ${status ?? err?.code ?? 'unknown'})`, staleAccounts: [] };
  }
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

