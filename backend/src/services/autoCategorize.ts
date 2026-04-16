import { PrismaClient } from '@prisma/client';

export interface MerchantRule {
  categoryId: number;
  isRecurring: boolean;
}

/**
 * Strips dates, account numbers, and reference codes from a merchant string
 * so that bank transfers with embedded dates/references can still be matched.
 * e.g. "Online Transfer To Savings Xxxx1234 On 04/01" → "online transfer to savings"
 */
function extractTransferBase(merchantNormalized: string): string {
  return merchantNormalized
    .toLowerCase()
    .replace(/\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/g, '') // strip MM/DD or MM/DD/YYYY
    .replace(/\bx+[\dx]*\b/gi, '')                      // strip XXXX or XXXX1234
    .replace(/\bon\s+\S*/gi, '')                         // strip "on <date>"
    .replace(/\b(ref|#|id)\s*\S+/gi, '')                 // strip ref numbers
    .replace(/\b\d{4,}\b/g, '')                          // strip long digit sequences
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Builds a Set of transfer base strings from all manually flagged internal transfers.
 * Uses fuzzy base matching so transfers with embedded dates/reference numbers still match.
 */
export async function buildInternalTransferMerchants(prisma: PrismaClient): Promise<Set<string>> {
  const transfers = await prisma.transaction.findMany({
    where: { isInternalTransfer: true },
    select: { merchantNormalized: true, merchantRaw: true },
    distinct: ['merchantNormalized'],
  });

  const bases = new Set<string>();
  for (const t of transfers) {
    bases.add(t.merchantNormalized.toLowerCase()); // exact match
    const base = extractTransferBase(t.merchantNormalized);
    if (base.length >= 4) bases.add(base);         // fuzzy base match
  }
  return bases;
}

/**
 * Checks whether a merchantNormalized value matches any known internal transfer pattern.
 */
export function isInternalTransferMatch(merchantNormalized: string, knownBases: Set<string>): boolean {
  if (knownBases.has(merchantNormalized.toLowerCase())) return true;
  const base = extractTransferBase(merchantNormalized);
  if (base.length >= 4 && knownBases.has(base)) return true;
  // Also check if any known base is a prefix of this base (handles partial descriptions)
  for (const known of knownBases) {
    if (known.length >= 6 && base.startsWith(known)) return true;
  }
  return false;
}

/**
 * Builds a lookup map of merchantNormalized → category/isRecurring
 * from all previously categorized transactions.
 * Results are ordered newest-first so the most recent categorization wins.
 */
export async function buildMerchantCategoryMap(
  prisma: PrismaClient
): Promise<Map<string, MerchantRule>> {
  const categorized = await prisma.transaction.findMany({
    where: { categoryId: { not: null } },
    select: { merchantNormalized: true, categoryId: true, isRecurring: true },
    orderBy: { date: 'desc' },
  });

  const map = new Map<string, MerchantRule>();
  for (const tx of categorized) {
    if (!map.has(tx.merchantNormalized)) {
      map.set(tx.merchantNormalized, {
        categoryId: tx.categoryId!,
        isRecurring: tx.isRecurring,
      });
    }
  }
  return map;
}
