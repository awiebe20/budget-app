import { useQuery } from '@tanstack/react-query';
import { reports, accounts, settlements, onboarding } from '../lib/api';
import { fmt } from '../lib/format';
import { CheckCircle, Circle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

export default function Dashboard() {
  const navigate = useNavigate();
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const { data: summary } = useQuery({ queryKey: ['summary', month, year], queryFn: () => reports.summary(month, year) });
  const { data: budgetData } = useQuery({ queryKey: ['budgets-by-category', month, year], queryFn: () => reports.byCategory(month, year) });
  const { data: accountList } = useQuery({ queryKey: ['accounts'], queryFn: accounts.list });
  const { data: bills } = useQuery({ queryKey: ['upcoming-bills'], queryFn: reports.upcomingBills });
  const { data: pendingSplits } = useQuery({ queryKey: ['pending-splits'], queryFn: settlements.pending });
  const { data: ob } = useQuery({ queryKey: ['onboarding'], queryFn: onboarding.status });

  const totalOwed = pendingSplits?.reduce((sum: number, p: any) => sum + p.total, 0) ?? 0;
  const totalBalance = accountList?.reduce((sum: number, a: any) => sum + Number(a.balance), 0) ?? 0;
  const budgetedIncome = budgetData?.filter((b: any) => b.category.isIncome).reduce((sum: number, b: any) => sum + b.budgeted, 0) ?? 0;
  const chartYMax = budgetedIncome > 0 ? Math.ceil(budgetedIncome * 1.15 / 500) * 500 : undefined;

  const steps = [
    { key: 'simpleFinConnected', label: 'Connect SimpleFIN', done: ob?.simpleFinConnected },
    { key: 'accountsAdded', label: 'Add bank accounts', done: ob?.accountsAdded },
    { key: 'firstSyncDone', label: 'Run first sync', done: ob?.firstSyncDone },
    { key: 'categoriesSetUp', label: 'Set up categories', done: ob?.categoriesSetUp },
    { key: 'budgetsSetUp', label: 'Set budget limits', done: ob?.budgetsSetUp },
  ];
  const allDone = steps.every((s) => s.done);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Dashboard</h2>

      {/* Onboarding checklist */}
      {!allDone && ob && (
        <div className="bg-gray-900 rounded-lg p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-300">Getting Started</h3>
            <button onClick={() => navigate('/settings')} className="text-xs text-blue-400 hover:text-blue-300">
              Go to Settings →
            </button>
          </div>
          <div className="flex gap-6">
            {steps.map((step) => (
              <div key={step.key} className="flex items-center gap-2">
                {step.done
                  ? <CheckCircle size={14} className="text-green-400 shrink-0" />
                  : <Circle size={14} className="text-gray-600 shrink-0" />}
                <span className={`text-xs ${step.done ? 'text-gray-500 line-through' : 'text-gray-300'}`}>
                  {step.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top stats */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Income This Month" value={summary?.income != null ? `$${fmt(summary.income)}` : '—'} color="text-green-400" />
        <StatCard label="Expenses This Month" value={`$${fmt(Math.abs(summary?.expenses ?? 0))}`} color="text-red-400" />
        <StatCard
          label="Flexible Budget Left"
          value={summary?.nonEssentialBudgeted != null ? `$${fmt(Math.max(0, summary.nonEssentialBudgeted - summary.nonEssentialSpent))}` : '—'}
          color={(summary?.nonEssentialBudgeted - summary?.nonEssentialSpent) >= 0 ? 'text-green-400' : 'text-red-400'}
          subtitle={summary?.nonEssentialBudgeted > 0 ? `of $${fmt(summary.nonEssentialBudgeted)} flexible` : undefined}
        />
        <StatCard label="Total Balance" value={`$${fmt(totalBalance)}`} color="text-blue-400" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Income vs Expenses bar */}
        <div className="bg-gray-900 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-400 mb-4">This Month</h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={[{ name: 'Income', value: summary?.income ?? 0 }, { name: 'Expenses', value: Math.abs(summary?.expenses ?? 0) }]}>
              <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 12 }} />
              <YAxis tick={{ fill: '#9ca3af', fontSize: 12 }} domain={chartYMax ? [0, chartYMax] : undefined} />
              <Tooltip cursor={false} formatter={(v: number) => `$${fmt(v)}`} contentStyle={{ background: '#1f2937', border: '1px solid #374151', color: '#f9fafb' }} itemStyle={{ color: '#f9fafb' }} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]} activeBar={{ opacity: 0.75 }}>
                <Cell fill="#4ade80" />
                <Cell fill="#f87171" />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Upcoming bills */}
        <div className="bg-gray-900 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-400 mb-3">Upcoming Bills</h3>
          <div className="space-y-2">
            {bills?.slice(0, 5).map((bill: any, i: number) => (
              <div key={i} className="flex justify-between items-center text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-gray-300 truncate">{bill.merchant}</span>
                  <span className="text-xs text-gray-600 shrink-0">{new Date(bill.nextDate).toLocaleDateString()}</span>
                </div>
                <span className="text-gray-400 shrink-0">${fmt(Math.abs(bill.amount))}</span>
              </div>
            ))}
            {!bills?.length && <p className="text-gray-500 text-sm">No recurring bills found</p>}
          </div>
        </div>
      </div>

      {/* Accounts + pending splits */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gray-900 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-400 mb-3">Accounts</h3>
          <div className="space-y-2">
            {accountList?.map((a: any) => (
              <div key={a.id} className="flex justify-between text-sm">
                <span className="text-gray-300">{a.name}</span>
                <span className="text-gray-400">${fmt(Number(a.balance))}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-gray-900 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-400 mb-3">Outstanding Splits</h3>
          <div className="space-y-2">
            {pendingSplits?.map((p: any) => (
              <div key={p.person} className="flex justify-between text-sm">
                <span className="text-gray-300">{p.person}</span>
                <span className="text-green-400">${fmt(p.total)}</span>
              </div>
            ))}
            {totalOwed === 0 && <p className="text-gray-500 text-sm">No outstanding splits</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color, subtitle }: { label: string; value: string; color: string; subtitle?: string }) {
  return (
    <div className="bg-gray-900 rounded-lg p-4">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
    </div>
  );
}
