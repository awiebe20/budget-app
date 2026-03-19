import express from 'express';
import cors from 'cors';
import transactionRoutes from './routes/transactions';
import accountRoutes from './routes/accounts';
import categoryRoutes from './routes/categories';
import budgetRoutes from './routes/budgets';
import importRoutes from './routes/imports';
import settlementRoutes from './routes/settlements';
import savingsRoutes from './routes/savings';
import reportRoutes from './routes/reports';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());

app.use('/api/transactions', transactionRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/budgets', budgetRoutes);
app.use('/api/imports', importRoutes);
app.use('/api/settlements', settlementRoutes);
app.use('/api/savings', savingsRoutes);
app.use('/api/reports', reportRoutes);

app.get('/api/health', (_, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});
