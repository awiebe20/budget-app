import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { accounts, simplefin, onboarding, transactions, imports, exportData } from '../lib/api';
import { fmt } from '../lib/format';
import { Trash2, CheckCircle, Circle, ChevronRight, ChevronDown, Upload, AlertCircle, X, Loader } from 'lucide-react';

type FilePreview = {
  id: string;
  file: File;
  status: 'loading' | 'ready' | 'error' | 'imported';
  accountId: string;
  overrideAccount: boolean;
  preview?: {
    accountNumber: string | null;
    detectedAccountId: number | null;
    detectedBank: string | null;
    total: number;
    newCount: number;
    duplicateCount: number;
    transactions: any[];
  };
  result?: { inserted: number; duplicates: number };
  error?: string;
};

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
  const { data: sfStatus, isLoading: sfLoading } = useQuery({ queryKey: ['simplefin-status'], queryFn: simplefin.status });
  const [showTokenInput, setShowTokenInput] = useState(false);
  const [setupToken, setSetupToken] = useState('');
  const [syncResult, setSyncResult] = useState<{ newCount: number; dupCount: number } | null>(null);
  const [syncWarnings, setSyncWarnings] = useState<{ name: string; errors: string[] }[]>([]);
  const [syncError, setSyncError] = useState<string | null>(null);

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
      if (data.error) {
        setSyncError(data.error);
        setSyncResult(null);
        setSyncWarnings([]);
      } else {
        setSyncResult(data);
        setSyncError(null);
        setSyncWarnings(data.warnings ?? []);
        qc.invalidateQueries({ queryKey: ['transactions'] });
        qc.invalidateQueries({ queryKey: ['accounts'] });
        qc.invalidateQueries({ queryKey: ['onboarding'] });
        qc.invalidateQueries({ queryKey: ['simplefin-status'] });
      }
    },
    onError: (err: any) => {
      setSyncError(err?.response?.data?.error ?? 'Sync failed — check your SimpleFIN connection');
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

  // CSV Import
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [showInternalTransfers, setShowInternalTransfers] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [filePreviews, setFilePreviews] = useState<FilePreview[]>([]);
  const [dragging, setDragging] = useState(false);
  const { data: importHistory = [] } = useQuery({
    queryKey: ['import-history'],
    queryFn: imports.history,
    enabled: showCsvImport,
  });

  const updatePreview = (id: string, updates: Partial<FilePreview>) =>
    setFilePreviews((prev) => prev.map((fp) => fp.id === id ? { ...fp, ...updates } : fp));

  const addFiles = async (files: File[]) => {
    const newEntries: FilePreview[] = files.map((file) => ({
      id: `${file.name}-${Date.now()}`,
      file,
      status: 'loading',
      accountId: '',
      overrideAccount: false,
    }));
    setFilePreviews((prev) => [...prev, ...newEntries]);
    for (const entry of newEntries) {
      try {
        const data = await imports.preview(entry.file);
        updatePreview(entry.id, {
          status: 'ready',
          preview: data,
          accountId: data.detectedAccountId ? String(data.detectedAccountId) : '',
        });
      } catch (err: any) {
        updatePreview(entry.id, { status: 'error', error: err?.response?.data?.error ?? 'Could not parse file' });
      }
    }
  };

  const importOne = async (fp: FilePreview) => {
    if (!fp.accountId || !fp.preview) return;
    updatePreview(fp.id, { status: 'loading' });
    try {
      const result = await imports.confirm(fp.file, parseInt(fp.accountId));
      updatePreview(fp.id, { status: 'imported', result });
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['import-history'] });
      qc.invalidateQueries({ queryKey: ['accounts'] });
    } catch (err: any) {
      updatePreview(fp.id, { status: 'error', error: err?.response?.data?.error ?? 'Import failed' });
    }
  };

  const importAll = async () => {
    const ready = filePreviews.filter((fp) => fp.status === 'ready' && fp.accountId && fp.preview);
    for (const fp of ready) await importOne(fp);
  };

  const readyCount = filePreviews.filter((fp) => fp.status === 'ready' && fp.accountId && fp.preview).length;

  const { data: internalTransferList } = useQuery({
    queryKey: ['internal-transfers'],
    queryFn: transactions.internalTransfers,
    enabled: showInternalTransfers,
  });

  const [exportState, setExportState] = useState<'idle' | 'loading' | 'done'>('idle');

  const handleExport = async () => {
    setExportState('loading');
    try {
      const res = await fetch(exportData.url());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `abundance-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setExportState('done');
      setTimeout(() => setExportState('idle'), 6000);
    } catch {
      setExportState('idle');
    }
  };

  const unmarkTransferMutation = useMutation({
    mutationFn: (id: number) => transactions.update(id, { isInternalTransfer: false }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['internal-transfers'] }),
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
              <span className={`w-2 h-2 rounded-full ${sfLoading ? 'bg-gray-600 animate-pulse' : sfStatus?.connected ? 'bg-green-400' : sfStatus?.hasAccessUrl ? 'bg-yellow-400' : sfStatus?.error ? 'bg-red-500' : 'bg-gray-600'}`} />
              <span className="text-sm text-gray-300">
                {sfLoading ? 'Checking...' : sfStatus?.connected ? 'Connected' : sfStatus?.hasAccessUrl ? 'Saved — connection check failed' : 'Not connected'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {sfStatus?.hasAccessUrl ? (
                <button
                  onClick={() => syncMutation.mutate()}
                  disabled={syncMutation.isPending}
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-1.5 rounded text-sm"
                >
                  {syncMutation.isPending ? 'Syncing...' : 'Sync Now'}
                </button>
              ) : !sfLoading ? (
                <button
                  onClick={() => setShowTokenInput(!showTokenInput)}
                  className="flex items-center gap-1 text-blue-400 hover:text-blue-300 text-sm"
                >
                  Connect <ChevronRight size={14} />
                </button>
              ) : null}
            </div>
          </div>

          {sfStatus?.error && (
            <div className="bg-red-950 border border-red-800 rounded p-3 space-y-1">
              <p className="text-xs text-red-400 font-medium">SimpleFIN connection error</p>
              <p className="text-xs text-red-300">{sfStatus.error}</p>
            </div>
          )}

          {syncError && (
            <div className="bg-red-950 border border-red-800 rounded p-3 space-y-1">
              <p className="text-xs text-red-400 font-medium">Sync failed</p>
              <p className="text-xs text-red-300">{syncError}</p>
            </div>
          )}

          {syncResult && !syncError && (
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
          {accountList?.map((account: any) => {
            const staleInfo = sfStatus?.staleAccounts?.find((s: any) => s.simplefinId === account.simplefinId);
            return (
              <div key={account.id} className="group bg-gray-900 rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between">
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
                      ${fmt(Number(account.balance))}
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
                {staleInfo && (
                  <p className="text-xs text-yellow-600">
                    Not updated in {staleInfo.daysStale} day{staleInfo.daysStale !== 1 ? 's' : ''} — re-authorize this account in SimpleFIN Bridge
                  </p>
                )}
              </div>
            );
          })}
          {accountList?.length === 0 && <p className="text-gray-500 text-sm">No accounts yet.</p>}
        </div>
      </section>
      {/* CSV Import */}
      <section className="space-y-3">
        <button
          onClick={() => setShowCsvImport(!showCsvImport)}
          className="flex items-center gap-2 text-base font-semibold text-white w-full text-left"
        >
          {showCsvImport ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          CSV Import
        </button>

        {showCsvImport && (
          <div className="space-y-4">
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); const files = Array.from(e.dataTransfer.files).filter((f) => f.name.endsWith('.csv')); if (files.length) addFiles(files); }}
              className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${dragging ? 'border-blue-500 bg-blue-500/10' : 'border-gray-700 hover:border-gray-500'}`}
            >
              <Upload size={20} className="mx-auto text-gray-500 mb-2" />
              <p className="text-sm text-gray-400">Drop CSV files here or click to browse</p>
              <p className="text-xs text-gray-600 mt-1">Multiple files supported — bank and account auto-detected</p>
            </div>
            <input ref={fileInputRef} type="file" accept=".csv" multiple className="hidden" onChange={(e) => { const files = Array.from(e.target.files ?? []); if (files.length) addFiles(files); e.target.value = ''; }} />

            {filePreviews.length > 0 && (
              <div className="space-y-3">
                {readyCount > 1 && (
                  <button onClick={importAll} className="bg-green-600 hover:bg-green-700 text-white px-4 py-1.5 rounded text-sm">
                    Import All ({readyCount} files)
                  </button>
                )}
                {filePreviews.map((fp) => (
                  <ImportFileCard
                    key={fp.id}
                    fp={fp}
                    accountList={accountList ?? []}
                    onRemove={() => setFilePreviews((prev) => prev.filter((f) => f.id !== fp.id))}
                    onImport={() => importOne(fp)}
                    onAccountChange={(id) => updatePreview(fp.id, { accountId: id, overrideAccount: true })}
                  />
                ))}
              </div>
            )}

            {importHistory.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Import History</h4>
                <div className="bg-gray-900 rounded-lg divide-y divide-gray-800">
                  {importHistory.map((log: any) => (
                    <div key={log.id} className="flex items-center justify-between px-4 py-3 text-sm">
                      <div>
                        <span className="text-white">{log.filename}</span>
                        <span className="text-gray-500 ml-2">{log.account?.name}</span>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <span>{log.transactionCount} imported</span>
                        {log.duplicateCount > 0 && <span>{log.duplicateCount} skipped</span>}
                        <span>{new Date(log.importedAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Data Export */}
      <section className="space-y-3">
        <h3 className="text-base font-semibold text-white">Data Export</h3>
        <div className="bg-gray-900 rounded-lg p-5 space-y-3">
          <p className="text-sm text-gray-400">
            Download a full backup of your data as JSON — includes all transactions, categories, budgets, accounts, and savings goals.
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={handleExport}
              disabled={exportState !== 'idle'}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded text-sm"
            >
              {exportState === 'loading' ? 'Preparing...' : 'Download Backup'}
            </button>
            {exportState === 'done' && (
              <span className="flex items-center gap-1.5 text-sm text-green-400">
                <CheckCircle size={14} /> Success
              </span>
            )}
          </div>
        </div>
      </section>

      {/* Internal Transfers */}
      <section className="space-y-3">
        <button
          onClick={() => setShowInternalTransfers(!showInternalTransfers)}
          className="flex items-center gap-2 text-base font-semibold text-white w-full text-left"
        >
          {showInternalTransfers ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          Internal Transfers
        </button>

        {showInternalTransfers && (
          <div className="bg-gray-900 rounded-lg divide-y divide-gray-800">
            {internalTransferList?.length === 0 && (
              <p className="text-gray-500 text-sm p-4">No internal transfers found.</p>
            )}
            {internalTransferList?.map((tx: any) => (
              <div key={tx.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm text-white">{tx.merchantNormalized}</p>
                  <p className="text-xs text-gray-500">
                    {new Date(tx.date).toLocaleDateString()} · {tx.account?.name}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-sm font-medium ${Number(tx.amount) < 0 ? 'text-red-400' : 'text-green-400'}`}>
                    {Number(tx.amount) < 0 ? '-' : '+'}${fmt(Math.abs(Number(tx.amount)))}
                  </span>
                  <button
                    onClick={() => unmarkTransferMutation.mutate(tx.id)}
                    className="text-xs text-gray-500 hover:text-red-400 transition-colors"
                    title="Remove internal transfer flag"
                  >
                    Unmark
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ImportFileCard({ fp, accountList, onRemove, onImport, onAccountChange }: {
  fp: FilePreview;
  accountList: any[];
  onRemove: () => void;
  onImport: () => void;
  onAccountChange: (id: string) => void;
}) {
  const detectedAccount = fp.preview?.detectedAccountId
    ? accountList.find((a: any) => a.id === fp.preview!.detectedAccountId)
    : null;
  const showDetected = detectedAccount && !fp.overrideAccount;

  return (
    <div className="bg-gray-900 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-white font-medium">{fp.file.name}</span>
        {fp.status !== 'imported' && (
          <button onClick={onRemove} className="text-gray-600 hover:text-gray-300"><X size={14} /></button>
        )}
      </div>

      {fp.status === 'loading' && (
        <div className="flex items-center gap-2 text-gray-400 text-sm">
          <Loader size={14} className="animate-spin" /> Parsing...
        </div>
      )}
      {fp.status === 'error' && (
        <div className="flex items-center gap-2 text-red-400 text-sm">
          <AlertCircle size={14} /> {fp.error}
        </div>
      )}
      {fp.status === 'imported' && fp.result && (
        <div className="flex items-center gap-2 text-green-400 text-sm">
          <CheckCircle size={14} />
          {fp.result.inserted} imported{fp.result.duplicates > 0 && `, ${fp.result.duplicates} skipped`}
        </div>
      )}
      {fp.status === 'ready' && fp.preview && (
        <>
          <div className="flex gap-4 text-xs">
            <span className="text-green-400">{fp.preview.newCount} new</span>
            {fp.preview.duplicateCount > 0 && (
              <span className="text-yellow-400">{fp.preview.duplicateCount} duplicate{fp.preview.duplicateCount > 1 ? 's' : ''}</span>
            )}
            {fp.preview.newCount === 0 && <span className="text-gray-500">All transactions already imported</span>}
          </div>

          {showDetected ? (
            <div className="flex items-center justify-between bg-gray-800 rounded px-3 py-2">
              <div>
                <p className="text-sm text-white">{detectedAccount.name}</p>
                <p className="text-xs text-gray-400">
                  {detectedAccount.bank === 'CAPITAL_ONE' ? 'Capital One' : 'Heritage'}
                  {detectedAccount.accountNumber && `  ····${detectedAccount.accountNumber.slice(-4)}`}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-green-400 flex items-center gap-1"><CheckCircle size={11} /> Detected</span>
                <button onClick={() => onAccountChange('')} className="text-xs text-gray-500 hover:text-gray-300">Change</button>
              </div>
            </div>
          ) : (
            <select
              value={fp.accountId}
              onChange={(e) => onAccountChange(e.target.value)}
              className="bg-gray-800 text-white rounded px-3 py-2 text-sm w-full"
            >
              <option value="">Select account...</option>
              {accountList.map((a: any) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          )}

          {fp.preview.newCount > 0 && (
            <div className="max-h-40 overflow-y-auto space-y-px">
              {fp.preview.transactions.filter((t) => !t.isDuplicate).map((t, i) => (
                <div key={i} className="flex items-center gap-3 px-1 py-1 text-xs">
                  <span className="text-gray-500 w-20 shrink-0">{new Date(t.date).toLocaleDateString()}</span>
                  <span className="text-gray-300 flex-1 truncate">{t.merchantNormalized}</span>
                  <span className={Number(t.amount) < 0 ? 'text-red-400' : 'text-green-400'}>
                    {Number(t.amount) < 0 ? '-' : '+'}${fmt(Math.abs(Number(t.amount)))}
                  </span>
                </div>
              ))}
            </div>
          )}

          <button
            disabled={!fp.accountId}
            onClick={onImport}
            className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-4 py-2 rounded text-sm w-full"
          >
            {fp.preview.newCount > 0 ? `Import ${fp.preview.newCount} transactions` : 'Update Balance'}
          </button>
        </>
      )}
    </div>
  );
}
