import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { accounts, simplefin, onboarding } from '../lib/api';
import { Trash2, CheckCircle, Circle, ChevronRight } from 'lucide-react';

const ACCOUNT_TYPES = ['CHECKING', 'SAVINGS', 'CREDIT'];
const BANK_OPTIONS = [
  { value: 'CAPITAL_ONE', label: 'Capital One' },
  { value: 'HERITAGE', label: 'Heritage Bank' },
];

export default function Settings() {
  const qc = useQueryClient();

  const { data: ob } = useQuery({ queryKey: ['onboarding'], queryFn: onboarding.status });

  const steps = [
    { key: 'simpleFinConnected', label: 'Connect SimpleFIN', done: ob?.simpleFinConnected },
    { key: 'accountsAdded', label: 'Add bank accounts', done: ob?.accountsAdded },
    { key: 'firstSyncDone', label: 'Run first sync', done: ob?.firstSyncDone },
    { key: 'categoriesSetUp', label: 'Set up categories', done: ob?.categoriesSetUp },
    { key: 'budgetsSetUp', label: 'Set budget limits', done: ob?.budgetsSetUp },
  ];
  const allDone = steps.every((s) => s.done);

  // SimpleFIN
  const { data: sfStatus } = useQuery({ queryKey: ['simplefin-status'], queryFn: simplefin.status });
  const [showTokenInput, setShowTokenInput] = useState(false);
  const [setupToken, setSetupToken] = useState('');
  const [syncResult, setSyncResult] = useState<{ newCount: number; dupCount: number } | null>(null);

  const connectMutation = useMutation({
    mutationFn: () => simplefin.connect(setupToken),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['simplefin-status'] });
      qc.invalidateQueries({ queryKey: ['onboarding'] });
      setSetupToken('');
      setShowTokenInput(false);
    },
  });

  const syncMutation = useMutation({
    mutationFn: simplefin.sync,
    onSuccess: (data) => {
      setSyncResult(data);
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['accounts'] });
      qc.invalidateQueries({ queryKey: ['onboarding'] });
    },
  });

  // Accounts
  const { data: accountList } = useQuery({ queryKey: ['accounts'], queryFn: accounts.list });
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [accountForm, setAccountForm] = useState({ name: '', type: 'CHECKING', accountNumber: '', bank: '' });
  const [confirmDeleteAccount, setConfirmDeleteAccount] = useState<number | null>(null);

  const createAccountMutation = useMutation({
    mutationFn: () => accounts.create(accountForm),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts'] });
      qc.invalidateQueries({ queryKey: ['onboarding'] });
      setAccountForm({ name: '', type: 'CHECKING', accountNumber: '', bank: '' });
      setShowAccountForm(false);
    },
  });

  const deleteAccountMutation = useMutation({
    mutationFn: (id: number) => accounts.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts'] });
      qc.invalidateQueries({ queryKey: ['onboarding'] });
      setConfirmDeleteAccount(null);
    },
  });

  return (
    <div className="max-w-2xl space-y-8">
      <h2 className="text-2xl font-bold">Settings</h2>

      {/* Onboarding checklist */}
      {!allDone && (
        <section className="bg-gray-900 rounded-lg p-5 space-y-3">
          <h3 className="text-sm font-semibold text-gray-300">Getting Started</h3>
          {steps.map((step) => (
            <div key={step.key} className="flex items-center gap-3">
              {step.done
                ? <CheckCircle size={16} className="text-green-400 shrink-0" />
                : <Circle size={16} className="text-gray-600 shrink-0" />}
              <span className={`text-sm ${step.done ? 'text-gray-500 line-through' : 'text-gray-300'}`}>
                {step.label}
              </span>
            </div>
          ))}
        </section>
      )}

      {/* SimpleFIN */}
      <section className="space-y-3">
        <h3 className="text-base font-semibold text-white">SimpleFIN</h3>
        <div className="bg-gray-900 rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${sfStatus?.connected ? 'bg-green-400' : 'bg-gray-600'}`} />
              <span className="text-sm text-gray-300">
                {sfStatus?.connected ? 'Connected' : 'Not connected'}
              </span>
            </div>
            {sfStatus?.connected ? (
              <button
                onClick={() => syncMutation.mutate()}
                disabled={syncMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-1.5 rounded text-sm"
              >
                {syncMutation.isPending ? 'Syncing...' : 'Sync Now'}
              </button>
            ) : (
              <button
                onClick={() => setShowTokenInput(!showTokenInput)}
                className="flex items-center gap-1 text-blue-400 hover:text-blue-300 text-sm"
              >
                Connect <ChevronRight size={14} />
              </button>
            )}
          </div>

          {syncResult && (
            <p className="text-xs text-gray-400">
              Last sync: {syncResult.newCount} new transactions, {syncResult.dupCount} duplicates skipped
            </p>
          )}

          {showTokenInput && (
            <div className="space-y-3 pt-2 border-t border-gray-800">
              <p className="text-xs text-gray-500">
                Generate a setup token from your SimpleFIN dashboard and paste it below. This is a one-time step.
              </p>
              <input
                type="password"
                placeholder="Paste setup token..."
                value={setupToken}
                onChange={(e) => setSetupToken(e.target.value)}
                className="bg-gray-800 text-white rounded px-3 py-2 text-sm w-full font-mono"
              />
              <button
                onClick={() => connectMutation.mutate()}
                disabled={!setupToken || connectMutation.isPending}
                className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-4 py-1.5 rounded text-sm"
              >
                {connectMutation.isPending ? 'Connecting...' : 'Connect'}
              </button>
              {connectMutation.isError && (
                <p className="text-xs text-red-400">Connection failed. Check your token and try again.</p>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Accounts */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-white">Bank Accounts</h3>
          <button
            onClick={() => setShowAccountForm(!showAccountForm)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded text-sm"
          >
            {showAccountForm ? 'Cancel' : '+ Add Account'}
          </button>
        </div>

        {showAccountForm && (
          <div className="bg-gray-900 rounded-lg p-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Account Name</label>
                <input
                  type="text"
                  placeholder="e.g. Heritage Checking"
                  value={accountForm.name}
                  onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })}
                  className="bg-gray-800 text-white rounded px-3 py-2 text-sm w-full"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Type</label>
                <select
                  value={accountForm.type}
                  onChange={(e) => setAccountForm({ ...accountForm, type: e.target.value })}
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
                  value={accountForm.bank}
                  onChange={(e) => setAccountForm({ ...accountForm, bank: e.target.value })}
                  className="bg-gray-800 text-white rounded px-3 py-2 text-sm w-full"
                >
                  <option value="">Select bank...</option>
                  {BANK_OPTIONS.map((b) => (
                    <option key={b.value} value={b.value}>{b.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Account Number</label>
                <input
                  type="text"
                  placeholder="Last 4 digits or full number"
                  value={accountForm.accountNumber}
                  onChange={(e) => setAccountForm({ ...accountForm, accountNumber: e.target.value })}
                  className="bg-gray-800 text-white rounded px-3 py-2 text-sm w-full"
                />
                {accountForm.accountNumber.length > 0 && accountForm.accountNumber.length < 4 && (
                  <p className="text-xs text-red-400 mt-1">Must be at least 4 digits</p>
                )}
              </div>
            </div>
            <button
              disabled={!accountForm.name || (accountForm.accountNumber.length > 0 && accountForm.accountNumber.length < 4) || createAccountMutation.isPending}
              onClick={() => createAccountMutation.mutate()}
              className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-4 py-2 rounded text-sm"
            >
              {createAccountMutation.isPending ? 'Saving...' : 'Save Account'}
            </button>
          </div>
        )}

        <div className="space-y-2">
          {accountList?.map((account: any) => (
            <div key={account.id} className="group bg-gray-900 rounded-lg p-4 flex items-center justify-between">
              <div>
                <p className="font-medium text-white text-sm">{account.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {account.type.charAt(0) + account.type.slice(1).toLowerCase()}
                  {account.bank && ` · ${account.bank === 'CAPITAL_ONE' ? 'Capital One' : 'Heritage'}`}
                  {account.accountNumber && ` · ...${account.accountNumber.slice(-4)}`}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-sm font-semibold ${Number(account.balance) < 0 ? 'text-red-400' : 'text-white'}`}>
                  ${Number(account.balance).toFixed(2)}
                </span>
                {confirmDeleteAccount === account.id ? (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-gray-400">Delete?</span>
                    <button onClick={() => deleteAccountMutation.mutate(account.id)} className="text-red-400 hover:text-red-300 font-medium">Yes</button>
                    <button onClick={() => setConfirmDeleteAccount(null)} className="text-gray-400 hover:text-white">No</button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDeleteAccount(account.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-600 hover:text-red-400"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            </div>
          ))}
          {accountList?.length === 0 && <p className="text-gray-500 text-sm">No accounts yet.</p>}
        </div>
      </section>
    </div>
  );
}
