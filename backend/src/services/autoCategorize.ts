import { PrismaClient } from '@prisma/client';

export interface MerchantRule {
  categoryId: number;
  isRecurring: boolean;
}

/**
 * Builds a Set of merchantNormalized values that have been manually flagged
 * as internal transfers, so future transactions with the same description
 * are auto-flagged.
 */
export async function buildInternalTransferMerchants(prisma: PrismaClient): Promise<Set<string>> {
  const transfers = await prisma.transaction.findMany({
    where: { isInternalTransfer: true },
    select: { merchantNormalized: true },
    distinct: ['merchantNormalized'],
  });
  return new Set(transfers.map((t) => t.merchantNormalized));
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
