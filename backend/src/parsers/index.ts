import { parseCapitalOneCSV } from './capitalOne';
import { parseHeritageCSV } from './heritage';
import { ParseResult } from './types';

export type BankSource = 'capital_one' | 'heritage';

export function detectBankFromContent(content: string): BankSource | null {
  if (content.includes('Transaction Description') && content.includes('Transaction Type')) {
    return 'capital_one';
  }
  if (content.includes('Transaction Number') || content.includes('Account Number :')) {
    return 'heritage';
  }
  return null;
}

export function parseCSV(fileContent: string, bank: BankSource): ParseResult {
  switch (bank) {
    case 'capital_one':
      return parseCapitalOneCSV(fileContent);
    case 'heritage':
      return parseHeritageCSV(fileContent);
    default:
      throw new Error(`Unknown bank source: ${bank}`);
  }
}

export { ParseResult };
