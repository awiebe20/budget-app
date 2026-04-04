import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { accounts } from '../lib/api';
import { fmt } from '../lib/format';
import { Trash2, AlertTriangle } from 'lucide-react';

function staleDays(balanceDate: string | null): number | null {
  if (!balanceDate) return null;
  return Math.floor((Date.now() - new Date(balanceDate).getTime()) / (1000 * 60 * 60 * 24));
}

const ACCOUNT_TYPES = ['CHECKING', 'SAVINGS', 'CREDIT'];

export default function Accounts() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', type: 'CHECKING', accountNumber: '', bank: '', currency: 'USD' });

  const { data: accountList, isLoading } = useQuery({
    queryKey: ['accounts'],
    queryFn: accounts.list,
  });

  const createMutation = useMutation({
    mutationFn: () => accounts.create(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts'] });
      setForm({ name: '', type: 'CHECKING', accountNumber: '', bank: '', currency: 'USD' });
      setShowForm(false);
    },
  });

  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (id: number) => accounts.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts'] });
      setConfirmDelete(null);
    },
  });

  const totalBalance = accountList?.reduce((sum: number, a: any) => sum + Number(a.balance), 0) ?? 0;

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Accounts</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm"
        >
          {showForm ? 'Cancel' : '+ Add Account'}
        </button>
      </div>

      {/* Add account form */}
      {showForm && (
        <div className="bg-gray-900 rounded-lg p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-300">New Account</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Account Name</label>
              <input
                type="text"
                placeholder="e.g. Heritage Checking"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="bg-gray-800 text-white rounded px-3 py-2 text-sm w-full"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Type</label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                className="bg-gray-800 text-white rounded px-3 py-2 text-sm w-full"
              >
                {ACCOUNT_TYPES.map((t) => (
                  <option key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Bank</label>
              <select
                value={form.bank}
                onChange={(e) => setForm({ ...form, bank: e.target.value })}
                className="bg-gray-800 text-white rounded px-3 py-2 text-sm w-full"
              >
                <option value="">Select bank...</option>
                <option value="CAPITAL_ONE">Capital One</option>
                <option value="HERITAGE">Heritage Bank</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Account Number</label>
              <input
                type="text"
                placeholder="Last 4 digits or full number"
                value={form.accountNumber}
                onChange={(e) => setForm({ ...form, accountNumber: e.target.value })}
                className="bg-gray-800 text-white rounded px-3 py-2 text-sm w-full"
              />
              {form.accountNumber.length > 0 && form.accountNumber.length < 4 && (
                <p className="text-xs text-red-400 mt-1">Must be at least 4 digits</p>
              )}
            </div>
          </div>
          <button
            disabled={!form.name || (form.accountNumber.length > 0 && form.accountNumber.length < 4) || createMutation.isPending}
            onClick={() => createMutation.mutate()}
            className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-4 py-2 rounded text-sm"
          >
            {createMutation.isPending ? 'Saving...' : 'Save Account'}
          </button>
        </div>
      )}

      {/* Account list */}
      {isLoading ? (
        <p className="text-gray-500 text-sm">Loading...</p>
      ) : (
        <div className="space-y-3">
          {accountList?.map((account: any) => (
            <div key={account.id} className="group bg-gray-900 rounded-lg p-4 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium text-white">{account.name}</p>
                  {(() => {
                    const days = staleDays(account.balanceDate);
                    if (days === null || days < 3) return null;
                    return (
                      <span className={`flex items-center gap-1 text-xs px-1.5 py-0.5 rounded ${days >= 7 ? 'bg-red-900/50 text-red-400' : 'bg-yellow-900/50 text-yellow-400'}`}>
                        <AlertTriangle size={10} />
                        {days}d stale
                      </span>
                    );
                  })()}
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  {account.type.charAt(0) + account.type.slice(1).toLowerCase()}
                  {account.bank && ` · ${account.bank === 'CAPITAL_ONE' ? 'Capital One' : 'Heritage'}`}
                  {account.accountNumber && `  ····${account.accountNumber.slice(-4)}`}
                  {account.balanceDate && (
                    <span className="block mt-0.5 text-gray-600">
                      Balance as of {new Date(account.balanceDate).toLocaleDateString()}
                    </span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-lg font-semibold ${Number(account.balance) < 0 ? 'text-red-400' : 'text-white'}`}>
                  ${fmt(Number(account.balance))}
                </span>
                {confirmDelete === account.id ? (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-gray-400">Delete?</span>
                    <button
                      onClick={() => deleteMutation.mutate(account.id)}
                      className="text-red-400 hover:text-red-300 font-medium"
                    >
                      Yes
                    </button>
                    <button
                      onClick={() => setConfirmDelete(null)}
                      className="text-gray-400 hover:text-white"
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDelete(account.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-600 hover:text-red-400"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            </div>
          ))}

          {accountList?.length === 0 && (
            <p className="text-gray-500 text-sm">No accounts yet. Add one above.</p>
          )}
        </div>
      )}

      {/* Total */}
      {accountList?.length > 0 && (
        <div className="border-t border-gray-800 pt-4 flex justify-between text-sm">
          <span className="text-gray-400">Total Balance</span>
          <span className={`font-semibold ${totalBalance < 0 ? 'text-red-400' : 'text-white'}`}>
            ${fmt(totalBalance)}
          </span>
        </div>
      )}
    </div>
  );
}
