// Parse MM/DD/YYYY or MM/DD/YY as local noon to avoid UTC timezone day shifts
export function parseLocalDate(dateStr: string): Date {
  const parts = dateStr.trim().split('/');
  if (parts.length === 3) {
    const month = parseInt(parts[0]) - 1;
    const day = parseInt(parts[1]);
    const year = parts[2].length === 2 ? 2000 + parseInt(parts[2]) : parseInt(parts[2]);
    return new Date(year, month, day, 12, 0, 0);
  }
  return new Date(dateStr);
}

const STRIP_PREFIXES = [
  'debit card purchase - ',
  'ach transfer - ',
  'online transfer - ',
  'pos purchase - ',
  'recurring payment - ',
];

export function normalizeMerchant(raw: string): string {
  let normalized = raw.toLowerCase().trim();

  for (const prefix of STRIP_PREFIXES) {
    if (normalized.startsWith(prefix)) {
      normalized = normalized.slice(prefix.length);
      break;
    }
  }

  // Strip trailing order/reference numbers (e.g. "amazon.com*ab12cd" -> "amazon.com")
  normalized = normalized.replace(/[*#]\w+$/, '').trim();

  // Capitalize first letter of each word
  return normalized.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function generateFingerprint(date: Date, amount: number, accountId: number): string {
  const d = new Date(date);
  const dateStr = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const amountStr = Math.abs(amount).toFixed(2);
  return Buffer.from(`${accountId}|${dateStr}|${amountStr}`).toString('base64');
}
