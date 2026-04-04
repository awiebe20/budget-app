// Run after SQLite schema is created
// Usage: docker exec -e DATABASE_URL="file:./budget.db" budget_backend node scripts/import-sqlite.js

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

function toFloat(val) {
  if (val === null || val === undefined) return null;
  return parseFloat(String(val));
}

function toDate(val) {
  if (val === null || val === undefined) return null;
  return new Date(val);
}

async function main() {
  const dataPath = path.join(__dirname, '../migration-data.json');
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

  console.log('Importing into SQLite...\n');

  // 1. Accounts
  for (const r of data.accounts) {
    await prisma.account.create({ data: {
      id: r.id, name: r.name, accountNumber: r.accountNumber,
      simplefinId: r.simplefinId, bank: r.bank, type: r.type,
      balance: toFloat(r.balance), balanceDate: toDate(r.balanceDate),
      currency: r.currency, createdAt: toDate(r.createdAt),
    }});
  }
  console.log(`  accounts: ${data.accounts.length}`);

  // 2. Categories (parents first, then children)
  const parents = data.categories.filter(c => !c.parentId);
  const children = data.categories.filter(c => c.parentId);
  for (const r of [...parents, ...children]) {
    await prisma.category.create({ data: {
      id: r.id, name: r.name, parentId: r.parentId, color: r.color,
      isIncome: r.isIncome, isReimbursement: r.isReimbursement,
      isFromSavings: r.isFromSavings ?? false,
      paycheckTiming: r.paycheckTiming ?? 'CURRENT',
    }});
  }
  console.log(`  categories: ${data.categories.length}`);

  // 3. Settings
  for (const r of data.settings) {
    await prisma.setting.create({ data: {
      id: r.id, key: r.key, value: r.value, updatedAt: toDate(r.updatedAt),
    }});
  }
  console.log(`  settings: ${data.settings.length}`);

  // 4. Savings goals
  for (const r of data.savingsGoals) {
    await prisma.savingsGoal.create({ data: {
      id: r.id, name: r.name, targetAmount: toFloat(r.targetAmount),
      allocationPercent: r.allocationPercent ?? 0, color: r.color,
      createdAt: toDate(r.createdAt),
    }});
  }
  console.log(`  savingsGoals: ${data.savingsGoals.length}`);

  // 5. Settlements
  for (const r of data.settlements) {
    await prisma.settlement.create({ data: {
      id: r.id, person: r.person, amount: toFloat(r.amount),
      periodStart: toDate(r.periodStart), periodEnd: toDate(r.periodEnd),
      settledDate: toDate(r.settledDate), createdAt: toDate(r.createdAt),
    }});
  }
  console.log(`  settlements: ${data.settlements.length}`);

  // 6. Import logs
  for (const r of data.importLogs) {
    await prisma.importLog.create({ data: {
      id: r.id, accountId: r.accountId, source: r.source,
      filename: r.filename, importedAt: toDate(r.importedAt),
      transactionCount: r.transactionCount, duplicateCount: r.duplicateCount,
      status: r.status,
    }});
  }
  console.log(`  importLogs: ${data.importLogs.length}`);

  // 7. Budgets
  for (const r of data.budgets) {
    await prisma.budget.create({ data: {
      id: r.id, categoryId: r.categoryId, amount: toFloat(r.amount),
      frequency: r.frequency ?? 'MONTHLY', effectiveFrom: toDate(r.effectiveFrom),
      createdAt: toDate(r.createdAt),
    }});
  }
  console.log(`  budgets: ${data.budgets.length}`);

  // 8. Transactions
  for (const r of data.transactions) {
    await prisma.transaction.create({ data: {
      id: r.id, accountId: r.accountId, date: toDate(r.date),
      amount: toFloat(r.amount), merchantRaw: r.merchantRaw,
      merchantNormalized: r.merchantNormalized, categoryId: r.categoryId,
      notes: r.notes, reimbursedBy: r.reimbursedBy,
      savingsGoalId: r.savingsGoalId, source: r.source,
      fingerprint: r.fingerprint, isRecurring: r.isRecurring,
      isInternalTransfer: r.isInternalTransfer, importId: r.importId,
      createdAt: toDate(r.createdAt),
    }});
  }
  console.log(`  transactions: ${data.transactions.length}`);

  // 9. Transaction splits
  for (const r of data.transactionSplits) {
    await prisma.transactionSplit.create({ data: {
      id: r.id, transactionId: r.transactionId, amount: toFloat(r.amount),
      owedBy: r.owedBy, settlementId: r.settlementId, createdAt: toDate(r.createdAt),
    }});
  }
  console.log(`  transactionSplits: ${data.transactionSplits.length}`);

  // 10. Balance snapshots
  for (const r of data.accountBalanceSnapshots) {
    await prisma.accountBalanceSnapshot.create({ data: {
      id: r.id, accountId: r.accountId, balance: toFloat(r.balance),
      date: toDate(r.date),
    }});
  }
  console.log(`  accountBalanceSnapshots: ${data.accountBalanceSnapshots.length}`);

  console.log('\nVerifying counts...');
  const counts = await Promise.all([
    prisma.account.count(),
    prisma.transaction.count(),
    prisma.category.count(),
    prisma.budget.count(),
    prisma.savingsGoal.count(),
    prisma.transactionSplit.count(),
    prisma.setting.count(),
  ]);
  console.log(`  accounts: ${counts[0]}, transactions: ${counts[1]}, categories: ${counts[2]}`);
  console.log(`  budgets: ${counts[3]}, savingsGoals: ${counts[4]}, splits: ${counts[5]}, settings: ${counts[6]}`);
  console.log('\nImport complete.');
}

main().catch(console.error).finally(() => prisma.$disconnect());
