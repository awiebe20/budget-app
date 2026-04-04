/** Format a number as a dollar amount with thousands separators, e.g. 25000.5 → "25,000.50" */
export const fmt = (value: number): string =>
  value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
