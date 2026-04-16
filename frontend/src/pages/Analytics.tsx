import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { reports } from '../lib/api';
import { fmt } from '../lib/format';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Legend, BarChart, Cell, LineChart, Area, AreaChart,
} from 'recharts';

const PERIOD_OPTIONS = [
  { value: '3',   label: '3 months' },
  { value: '6',   label: '6 months' },
  { value: '12',  label: '12 months' },
  { value: 'ytd', label: 'Year to date' },
];

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FALLBACK_COLOR = '#6b7280';

function getMonths(period: string): number {
  if (period === 'ytd') return new Date().getMonth(); // exclude current month
  return parseInt(period) + 1; // request one extra so we have N completed after excluding current
}

export default function Analytics() {
  const [period, setPeriod] = useState('6');
  const months = getMonths(period);

  const { data: trend = [] } = useQuery({
    queryKey: ['trend', period],
    queryFn: () => reports.trend(months, true),
  });

  const { data: categoryTotals = [] } = useQuery({
    queryKey: ['category-totals', period],
    queryFn: () => reports.categoryTotals(months),
  });

  const { data: netWorthData = [] } = useQuery({
    queryKey: ['net-worth', period],
    queryFn: () => reports.netWorth(months),
  });

  // Summary stats across the period
  const totalIncome  = trend.reduce((s: number, m: any) => s + m.income, 0);
  const totalExpenses = trend.reduce((s: number, m: any) => s + Math.abs(m.expenses), 0);
  const totalNet     = trend.reduce((s: number, m: any) => s + m.net, 0);
  const avgIncome    = trend.length ? totalIncome / trend.length : 0;
  const avgExpenses  = trend.length ? totalExpenses / trend.length : 0;
  const avgNet       = trend.length ? totalNet / trend.length : 0;
  const savingsRate  = totalIncome > 0 ? (totalNet / totalIncome) * 100 : 0;

  // Chart data: add month label
  const trendData = trend.map((m: any) => ({
    label: `${MONTH_NAMES[m.month - 1]} '${String(m.year).slice(2)}`,
    income: m.income,
    expenses: Math.abs(m.expenses),
    net: m.net,
  }));

  const topCategories = (categoryTotals as any[]).slice(0, 12);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Analytics</h2>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="bg-gray-800 text-white rounded px-3 py-1.5 text-sm"
        >
          {PERIOD_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-4 gap-4">
        <StatTile label="Avg Monthly Income" value={`$${fmt(avgIncome)}`} color="text-green-400" />
        <StatTile label="Avg Monthly Expenses" value={`$${fmt(avgExpenses)}`} color="text-red-400" />
        <StatTile label="Avg Monthly Net" value={`$${fmt(avgNet)}`} color={avgNet >= 0 ? 'text-green-400' : 'text-red-400'} />
        <StatTile
          label="Savings Rate"
          value={`${savingsRate.toFixed(1)}%`}
          color={savingsRate >= 20 ? 'text-green-400' : savingsRate >= 10 ? 'text-yellow-400' : 'text-red-400'}
        />
      </div>

      {/* Monthly trend chart */}
      <div className="bg-gray-900 rounded-lg p-5">
        <h3 className="text-sm font-semibold text-gray-400 mb-4">Monthly Income vs Expenses</h3>
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={trendData} barGap={4}>
            <XAxis dataKey="label" tick={{ fill: '#9ca3af', fontSize: 12 }} />
            <YAxis tick={{ fill: '#9ca3af', fontSize: 12 }} tickFormatter={(v) => `$${fmt(v)}`} width={80} />
            <Tooltip
              formatter={(v: number, name: string) => [`$${fmt(v)}`, name.charAt(0).toUpperCase() + name.slice(1)]}
              contentStyle={{ background: '#111827', border: 'none', color: '#f9fafb' }}
              itemStyle={{ color: '#f9fafb' }}
            />
            <Legend wrapperStyle={{ fontSize: 12, color: '#9ca3af' }} />
            <Bar dataKey="income" name="Income" fill="#4ade80" radius={[3, 3, 0, 0]} barSize={18} />
            <Bar dataKey="expenses" name="Expenses" fill="#f87171" radius={[3, 3, 0, 0]} barSize={18} />
            <Line dataKey="net" name="Net" stroke="#60a5fa" strokeWidth={2} dot={{ r: 3, fill: '#60a5fa' }} type="monotone" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Net worth over time */}
      <div className="bg-gray-900 rounded-lg p-5">
        <h3 className="text-sm font-semibold text-gray-400 mb-4">Net Worth</h3>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={(netWorthData as any[]).map((m: any) => ({
            label: `${MONTH_NAMES[m.month - 1]} '${String(m.year).slice(2)}`,
            netWorth: m.netWorth,
          }))}>
            <defs>
              <linearGradient id="nwGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#60a5fa" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="label" tick={{ fill: '#9ca3af', fontSize: 12 }} />
            <YAxis tick={{ fill: '#9ca3af', fontSize: 12 }} tickFormatter={(v) => `$${fmt(v)}`} width={80} />
            <Tooltip
              formatter={(v: number) => [`$${fmt(v)}`, 'Net Worth']}
              contentStyle={{ background: '#111827', border: 'none', color: '#f9fafb' }}
              itemStyle={{ color: '#f9fafb' }}
            />
            <Area type="monotone" dataKey="netWorth" stroke="#60a5fa" strokeWidth={2} fill="url(#nwGradient)" dot={{ r: 3, fill: '#60a5fa' }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Spending by category */}
      <div className="bg-gray-900 rounded-lg p-5">
        <h3 className="text-sm font-semibold text-gray-400 mb-4">Spending by Category</h3>
        {topCategories.length === 0 ? (
          <p className="text-gray-500 text-sm">No categorized expenses found for this period.</p>
        ) : (
          <ResponsiveContainer width="100%" height={topCategories.length * 36 + 20}>
            <BarChart data={topCategories} layout="vertical" barSize={18}>
              <XAxis type="number" tick={{ fill: '#9ca3af', fontSize: 11 }} tickFormatter={(v) => `$${fmt(v)}`} />
              <YAxis type="category" dataKey="name" tick={{ fill: '#d1d5db', fontSize: 12 }} width={130} />
              <Tooltip
                cursor={false}
                formatter={(v: number) => [`$${fmt(v)}`, 'Spent']}
                contentStyle={{ background: '#111827', border: 'none', color: '#f9fafb' }}
                itemStyle={{ color: '#f9fafb' }}
              />
              <Bar dataKey="total" radius={[0, 3, 3, 0]} activeBar={{ opacity: 0.75 }}>
                {topCategories.map((c: any, i: number) => (
                  <Cell key={i} fill={c.color ?? FALLBACK_COLOR} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

function StatTile({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-gray-900 rounded-lg p-4">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
    </div>
  );
}
