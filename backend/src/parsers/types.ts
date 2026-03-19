export interface NormalizedTransaction {
  date: Date;
  amount: number; // negative = expense, positive = income
  merchantRaw: string;
  merchantNormalized: string;
  memo: string | null;
  balance: number | null;
}

export interface ParseResult {
  accountNumber: string | null;
  transactions: NormalizedTransaction[];
}
