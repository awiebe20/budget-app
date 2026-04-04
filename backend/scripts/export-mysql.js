// Run this BEFORE any schema changes, while MySQL is still running
// Usage: docker exec budget_backend node scripts/export-mysql.js

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function main() {
  console.log('Exporting data from MySQL...');

  const data = {
    // Order matters for import — parents before children
    accounts:                await prisma.account.findMany(),
    categories:              await prisma.category.findMany(),
    settings:                await prisma.setting.findMany(),
    savingsGoals:            await prisma.savingsGoal.findMany(),
    settlements:             await prisma.settlement.findMany(),
    importLogs:              await prisma.importLog.findMany(),
    budgets:                 await prisma.budget.findMany(),
    transactions:            await prisma.transaction.findMany(),
    transactionSplits:       await prisma.transactionSplit.findMany(),
    accountBalanceSnapshots: await prisma.accountBalanceSnapshot.findMany(),
  };

  // Serialize — Prisma Decimal comes out as an object, convert to string for safe round-trip
  const serialized = JSON.stringify(data, (_, value) => {
    if (value !== null && typeof value === 'object' && value.constructor?.name === 'Decimal') {
      return value.toString();
    }
    return value;
  }, 2);

  const outPath = path.join(__dirname, '../migration-data.json');
  fs.writeFileSync(outPath, serialized);

  console.log('\nExport complete:');
  for (const [key, value] of Object.entries(data)) {
    console.log(`  ${key}: ${value.length} records`);
  }
  console.log(`\nSaved to: ${outPath}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
