import { useQuery } from '@tanstack/react-query';
import { reports, accounts, settlements } from '../lib/api';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

export default function Dashboard() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const { data: summary } = useQuery({ queryKey: ['summary', month, year], queryFn: () => reports.summary(month, year) });
  const { data: accountList } = useQuery({ queryKey: ['accounts'], queryFn: accounts.list });
  const { data: bills } = useQuery({ queryKey: ['upcoming-bills'], queryFn: reports.upcomingBills });
  const { data: pendingSplits } = useQuery({ queryKey: ['pending-splits'], queryFn: settlements.pending });

  const totalOwed = pendingSplits?.reduce((sum: number, p: any) => sum + p.total, 0) ?? 0;
  const totalBalance = accountList?.reduce((sum: number, a: any) => sum + Number(a.balance), 0) ?? 0;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Dashboard</h2>

      {/* Top stats */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Income This Month" value={`$${summary?.income?.toFixed(2) ?? '—'}`} color="text-green-400" />
        <StatCard label="Expenses This Month" value={`$${Math.abs(summary?.expenses ?? 0).toFixed(2)}`} color="text-red-400" />
        <StatCard label="Net" value={`$${summary?.net?.toFixed(2) ?? '—'}`} color={summary?.net >= 0 ? 'text-green-400' : 'text-red-400'} />
        <StatCard label="Total Balance" value={`$${totalBalance.toFixed(2)}`} color="text-blue-400" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Income vs Expenses bar */}
        <div className="bg-gray-900 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-400 mb-4">This Month</h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={[{ name: 'Income', value: summary?.income ?? 0 }, { name: 'Expenses', value: Math.abs(summary?.expenses ?? 0) }]}>
              <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 12 }} />
              <YAxis tick={{ fill: '#9ca3af', fontSize: 12 }} />
              <Tooltip formatter={(v: number) => `$${v.toFixed(2)}`} contentStyle={{ background: '#111827', border: 'none' }} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
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
              <div key={i} className="flex justify-between text-sm">
                <span className="text-gray-300">{bill.merchant}</span>
                <span className="text-gray-400">${Math.abs(bill.amount).toFixed(2)}</span>
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
                <span className="text-gray-400">${Number(a.balance).toFixed(2)}</span>
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
                <span className="text-green-400">${p.total.toFixed(2)}</span>
              </div>
            ))}
            {totalOwed === 0 && <p className="text-gray-500 text-sm">No outstanding splits</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-gray-900 rounded-lg p-4">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
    </div>
  );
}
