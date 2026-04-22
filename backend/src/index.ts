import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import transactionRoutes from './routes/transactions';
import accountRoutes from './routes/accounts';
import categoryRoutes from './routes/categories';
import budgetRoutes from './routes/budgets';
import importRoutes from './routes/imports';
import settlementRoutes from './routes/settlements';
import savingsRoutes from './routes/savings';
import reportRoutes from './routes/reports';
import simpleFinRoutes from './routes/simplefin';
import onboardingRoutes from './routes/onboarding';
import exportRoutes from './routes/export';

const app = express();
const PORT = process.env.PORT || 3001;
const prisma = new PrismaClient();

async function seedRequiredCategories() {
  await prisma.category.upsert({
    where: { name: 'Reimbursement' },
    update: {},
    create: { name: 'Reimbursement', color: '#34d399', isIncome: false, isReimbursement: true },
  });
  await prisma.category.upsert({
    where: { name: 'From Savings' },
    update: {},
    create: { name: 'From Savings', color: '#818cf8', isIncome: false, isFromSavings: true },
  });
}

app.use(cors({ origin: true }));
app.use(express.json());

app.use('/api/transactions', transactionRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/budgets', budgetRoutes);
app.use('/api/imports', importRoutes);
app.use('/api/settlements', settlementRoutes);
app.use('/api/savings', savingsRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/simplefin', simpleFinRoutes);
app.use('/api/onboarding', onboardingRoutes);
app.use('/api/export', exportRoutes);

app.get('/api/health', (_, res) => res.json({ status: 'ok' }));

app.listen(PORT, async () => {
  await seedRequiredCategories();
  console.log(`Backend running on port ${PORT}`);
});
