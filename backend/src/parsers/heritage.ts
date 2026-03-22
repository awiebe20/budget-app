import { parse } from 'csv-parse/sync';
import { ParseResult } from './types';
import { normalizeMerchant, parseLocalDate } from './normalizer';

function extractMetadata(content: string): { accountNumber: string | null; csvBody: string } {
  const lines = content.split('\n');

  // Extract account number from metadata lines before the header
  let accountNumber: string | null = null;
  for (const line of lines) {
    const match = line.match(/Account Number\s*:\s*(\S+)/i);
    if (match) { accountNumber = match[1]; break; }
  }

  // Find header row and slice from there
  const headerIndex = lines.findIndex((line) => line.trim().startsWith('Transaction Number'));
  if (headerIndex === -1) throw new Error('Could not find Heritage CSV header row');

  return { accountNumber, csvBody: lines.slice(headerIndex).join('\n') };
}

export function parseHeritageCSV(fileContent: string): ParseResult {
  const { accountNumber, csvBody } = extractMetadata(fileContent);

  const records = parse(csvBody, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  const transactions = records.map((row: Record<string, string>) => {
    const date = parseLocalDate(row['Date']);
    const debit = parseFloat(row['Amount Debit']);
    const credit = parseFloat(row['Amount Credit']);
    // Both columns are already correctly signed — credit is positive, debit is negative
    const amount = !isNaN(credit) && credit !== 0 ? credit : debit;

    const description = row['Description'] || '';
    const memo = row['Memo'] || '';
    const merchantRaw = memo ? `${description} ${memo}`.trim() : description;

    return {
      date,
      amount,
      merchantRaw,
      merchantNormalized: normalizeMerchant(merchantRaw),
      memo: memo || null,
      balance: row['Balance'] ? parseFloat(row['Balance']) : null,
    };
  });

  return { accountNumber, transactions };
}
