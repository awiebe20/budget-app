import { parse } from 'csv-parse/sync';
import { ParseResult } from './types';
import { normalizeMerchant, parseLocalDate } from './normalizer';

export function parseCapitalOneCSV(fileContent: string): ParseResult {
  const records = parse(fileContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  // Account number is in every row — grab from first
  const accountNumber = records[0]?.['Account Number'] ?? null;

  const transactions = records.map((row: Record<string, string>) => {
    const date = parseLocalDate(row['Transaction Date']);
    const rawAmount = parseFloat(row['Transaction Amount']);
    const isDebit = row['Transaction Type'].toLowerCase() === 'debit';
    // Handle CSVs that already have negative amounts AND ones that use Transaction Type
    const amount = rawAmount < 0 ? rawAmount : (isDebit ? -Math.abs(rawAmount) : Math.abs(rawAmount));
    const merchantRaw = row['Transaction Description'];

    return {
      date,
      amount,
      merchantRaw,
      merchantNormalized: normalizeMerchant(merchantRaw),
      memo: null,
      balance: row['Balance'] ? parseFloat(row['Balance']) : null,
    };
  });

  return { accountNumber: String(accountNumber), transactions };
}
