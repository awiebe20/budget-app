import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { imports, accounts } from '../lib/api';
import { fmt } from '../lib/format';
import { Upload, CheckCircle, AlertCircle, X, Loader } from 'lucide-react';

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

export default function Import() {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [filePreviews, setFilePreviews] = useState<FilePreview[]>([]);
  const [dragging, setDragging] = useState(false);

  const { data: accountList = [] } = useQuery({ queryKey: ['accounts'], queryFn: accounts.list });
  const { data: importHistory = [] } = useQuery({ queryKey: ['import-history'], queryFn: imports.history });

  const updatePreview = (id: string, updates: Partial<FilePreview>) => {
    setFilePreviews((prev) => prev.map((fp) => fp.id === id ? { ...fp, ...updates } : fp));
  };

  const addFiles = async (files: File[]) => {
    const newEntries: FilePreview[] = files.map((file) => ({
      id: `${file.name}-${Date.now()}`,
      file,
      status: 'loading',
      accountId: '',
      overrideAccount: false,
    }));

    setFilePreviews((prev) => [...prev, ...newEntries]);

    // Auto-preview each file
    for (const entry of newEntries) {
      try {
        const data = await imports.preview(entry.file);
        updatePreview(entry.id, {
          status: 'ready',
          preview: data,
          accountId: data.detectedAccountId ? String(data.detectedAccountId) : '',
        });
      } catch (err: any) {
        updatePreview(entry.id, {
          status: 'error',
          error: err?.response?.data?.error ?? 'Could not parse file',
        });
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files).filter((f) => f.name.endsWith('.csv'));
    if (files.length) addFiles(files);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length) addFiles(files);
    e.target.value = '';
  };

  const removeFile = (id: string) => {
    setFilePreviews((prev) => prev.filter((fp) => fp.id !== id));
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
    const ready = filePreviews.filter(
      (fp) => fp.status === 'ready' && fp.accountId && fp.preview
    );
    for (const fp of ready) await importOne(fp);
  };

  const readyCount = filePreviews.filter(
    (fp) => fp.status === 'ready' && fp.accountId && fp.preview
  ).length;

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Import Transactions</h2>
        {readyCount > 1 && (
          <button
            onClick={importAll}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded text-sm"
          >
            Import All ({readyCount} files)
          </button>
        )}
      </div>

      {/* Drop zone */}
      <div
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
          dragging ? 'border-blue-500 bg-blue-500/10' : 'border-gray-700 hover:border-gray-500'
        }`}
      >
        <Upload size={22} className="mx-auto text-gray-500 mb-2" />
        <p className="text-sm text-gray-400">Drop CSV files here or click to browse</p>
        <p className="text-xs text-gray-600 mt-1">Multiple files supported — bank and account auto-detected</p>
      </div>
      <input ref={fileInputRef} type="file" accept=".csv" multiple className="hidden" onChange={handleFileInput} />

      {/* File preview cards */}
      {filePreviews.length > 0 && (
        <div className="space-y-3">
          {filePreviews.map((fp) => (
            <FilePreviewCard
              key={fp.id}
              fp={fp}
              accountList={accountList}
              onRemove={() => removeFile(fp.id)}
              onImport={() => importOne(fp)}
              onAccountChange={(id) => updatePreview(fp.id, { accountId: id, overrideAccount: true })}
            />
          ))}
        </div>
      )}

      {/* Import history */}
      {importHistory.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-400">Import History</h3>
          <div className="space-y-1">
            {importHistory.map((log: any) => (
              <div key={log.id} className="bg-gray-900 rounded-lg px-4 py-3 flex items-center justify-between text-sm">
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
  );
}

function FilePreviewCard({ fp, accountList, onRemove, onImport, onAccountChange }: {
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-white font-medium">{fp.file.name}</span>
        {fp.status !== 'imported' && (
          <button onClick={onRemove} className="text-gray-600 hover:text-gray-300">
            <X size={14} />
          </button>
        )}
      </div>

      {/* Loading */}
      {fp.status === 'loading' && (
        <div className="flex items-center gap-2 text-gray-400 text-sm">
          <Loader size={14} className="animate-spin" /> Parsing...
        </div>
      )}

      {/* Error */}
      {fp.status === 'error' && (
        <div className="flex items-center gap-2 text-red-400 text-sm">
          <AlertCircle size={14} /> {fp.error}
        </div>
      )}

      {/* Imported */}
      {fp.status === 'imported' && fp.result && (
        <div className="flex items-center gap-2 text-green-400 text-sm">
          <CheckCircle size={14} />
          {fp.result.inserted} imported
          {fp.result.duplicates > 0 && `, ${fp.result.duplicates} skipped`}
        </div>
      )}

      {/* Ready */}
      {fp.status === 'ready' && fp.preview && (
        <>
          {/* Stats */}
          <div className="flex gap-4 text-xs">
            <span className="text-green-400">{fp.preview.newCount} new</span>
            {fp.preview.duplicateCount > 0 && (
              <span className="text-yellow-400">{fp.preview.duplicateCount} duplicate{fp.preview.duplicateCount > 1 ? 's' : ''}</span>
            )}
            {fp.preview.newCount === 0 && (
              <span className="text-gray-500">All transactions already imported</span>
            )}
          </div>

          {/* Account */}
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
                <span className="text-xs text-green-400 flex items-center gap-1">
                  <CheckCircle size={11} /> Detected
                </span>
                <button
                  onClick={() => onAccountChange('')}
                  className="text-xs text-gray-500 hover:text-gray-300"
                >
                  Change
                </button>
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

          {/* Transaction preview */}
          {fp.preview.newCount > 0 && (
            <div className="max-h-40 overflow-y-auto space-y-px">
              {fp.preview.transactions
                .filter((t) => !t.isDuplicate)
                .map((t, i) => (
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
            {fp.preview.newCount > 0
              ? `Import ${fp.preview.newCount} transactions`
              : 'Update Balance'}
          </button>
        </>
      )}
    </div>
  );
}
