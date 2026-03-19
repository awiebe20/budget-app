import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { transactions, categories, accounts } from '../lib/api';
import { X, SplitSquareHorizontal, RefreshCw, ArrowLeftRight, SlidersHorizontal, ArrowUpDown } from 'lucide-react';

const SORT_OPTIONS = [
  { value: 'date_desc',   label: 'Newest first' },
  { value: 'date_asc',    label: 'Oldest first' },
  { value: 'amount_desc', label: 'Largest first' },
  { value: 'amount_asc',  label: 'Smallest first' },
  { value: 'merchant',    label: 'Merchant A–Z' },
];

const EMPTY_FILTERS = {
  search: '', accountId: '', categoryId: '',
  minAmount: '', maxAmount: '',
};

// Default window: first day of current month to today
function defaultDateRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const end = now.toISOString().split('T')[0];
  return { startDate: start, endDate: end };
}

export default function Transactions() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<any>(null);
  const [sort, setSort] = useState('date_desc');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [dateRange, setDateRange] = useState(defaultDateRange());
  const [showSort, setShowSort] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [draftFilters, setDraftFilters] = useState(EMPTY_FILTERS);
  const [draftDateRange, setDraftDateRange] = useState(defaultDateRange());
  const sortRef = useRef<HTMLDivElement>(null);

  // Close sort dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) {
        setShowSort(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const { data: rawList = [], isLoading } = useQuery({
    queryKey: ['transactions', dateRange],
    queryFn: () => transactions.list(dateRange),
  });

  // All filtering and sorting happens client-side
  const txList = rawList
    .filter((tx: any) => {
      const search = filters.search.toLowerCase();
      if (search && ![tx.merchantNormalized, tx.merchantRaw, tx.notes, tx.memo]
        .filter(Boolean).some((f: string) => f.toLowerCase().includes(search))) return false;
      if (filters.accountId && tx.accountId !== parseInt(filters.accountId)) return false;
      if (filters.categoryId && tx.categoryId !== parseInt(filters.categoryId)) return false;
      if (filters.minAmount && Math.abs(Number(tx.amount)) < parseFloat(filters.minAmount)) return false;
      if (filters.maxAmount && Math.abs(Number(tx.amount)) > parseFloat(filters.maxAmount)) return false;
      return true;
    })
    .sort((a: any, b: any) => {
      switch (sort) {
        case 'date_asc':    return new Date(a.date).getTime() - new Date(b.date).getTime();
        case 'amount_desc': return Math.abs(Number(b.amount)) - Math.abs(Number(a.amount));
        case 'amount_asc':  return Math.abs(Number(a.amount)) - Math.abs(Number(b.amount));
        case 'merchant':    return a.merchantNormalized.localeCompare(b.merchantNormalized);
        default:            return new Date(b.date).getTime() - new Date(a.date).getTime();
      }
    });

  const { data: categoryList = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: categories.list,
  });

  const { data: accountList = [] } = useQuery({
    queryKey: ['accounts'],
    queryFn: accounts.list,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: object }) =>
      transactions.update(id, data),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ['transactions'] });
      setSelected((prev: any) => prev ? { ...prev, ...updated } : prev);
    },
  });

  const addSplitMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: object }) =>
      transactions.addSplit(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transactions'] }),
  });

  const deleteSplitMutation = useMutation({
    mutationFn: ({ id, splitId }: { id: number; splitId: number }) =>
      transactions.deleteSplit(id, splitId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transactions'] }),
  });

  const activeFilterCount = Object.entries(filters).filter(([k, v]) => k !== 'search' && v !== '').length;
  const currentSortLabel = SORT_OPTIONS.find((o) => o.value === sort)?.label;

  const applyFilters = () => {
    setFilters(draftFilters);
    setDateRange(draftDateRange);
    setShowFilters(false);
  };

  const clearFilters = () => {
    setFilters(EMPTY_FILTERS);
    setDraftFilters(EMPTY_FILTERS);
    const def = defaultDateRange();
    setDateRange(def);
    setDraftDateRange(def);
    setShowFilters(false);
  };

  const openFilters = () => {
    setDraftFilters(filters);
    setDraftDateRange(dateRange);
    setShowFilters(true);
  };

  return (
    <div className="flex gap-4 h-full">
      {/* Main list */}
      <div className="flex-1 min-w-0 space-y-4">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold shrink-0">Transactions</h2>
          <input
            placeholder="Search transactions..."
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            className="flex-1 bg-gray-800 text-white rounded px-3 py-1.5 text-sm"
          />
          <div className="flex items-center gap-2 shrink-0">
            {/* Sort button */}
            <div className="relative" ref={sortRef}>
              <button
                onClick={() => setShowSort((s) => !s)}
                className="flex items-center gap-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded text-sm"
              >
                <ArrowUpDown size={13} />
                {currentSortLabel}
              </button>
              {showSort && (
                <div className="absolute right-0 top-full mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-lg z-10 py-1 w-44">
                  {SORT_OPTIONS.map((o) => (
                    <button
                      key={o.value}
                      onClick={() => { setSort(o.value); setShowSort(false); }}
                      className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-700 ${sort === o.value ? 'text-white' : 'text-gray-400'}`}
                    >
                      {o.value === sort && '✓ '}{o.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Filter button */}
            <button
              onClick={openFilters}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm ${
                activeFilterCount > 0
                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                  : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
              }`}
            >
              <SlidersHorizontal size={13} />
              Filters{activeFilterCount > 0 && ` (${activeFilterCount})`}
            </button>
          </div>
        </div>

        {/* Transaction list */}
        {isLoading ? (
          <p className="text-gray-500 text-sm">Loading...</p>
        ) : txList.length === 0 ? (
          <p className="text-gray-500 text-sm">No transactions found.</p>
        ) : (
          <div className="space-y-1">
            {txList.map((tx: any) => (
              <div
                key={tx.id}
                onClick={() => setSelected(tx)}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg cursor-pointer transition-colors ${
                  selected?.id === tx.id ? 'bg-gray-700' : 'bg-gray-900 hover:bg-gray-800'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-white truncate">{tx.merchantNormalized}</span>
                    {tx.isRecurring && <RefreshCw size={11} className="text-blue-400 shrink-0" />}
                    {tx.splits?.length > 0 && <SplitSquareHorizontal size={11} className="text-yellow-400 shrink-0" />}
                    {tx.isInternalTransfer && <ArrowLeftRight size={11} className="text-gray-500 shrink-0" />}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-gray-500">{new Date(tx.date).toLocaleDateString()}</span>
                    <span className="text-xs text-gray-600">{tx.account?.name}</span>
                    {tx.category && (
                      <span className="text-xs text-gray-400 bg-gray-800 px-1.5 py-0.5 rounded">{tx.category.name}</span>
                    )}
                    {tx.notes && (
                      <span className="text-xs text-gray-500 italic truncate">{tx.notes}</span>
                    )}
                  </div>
                </div>
                <span className={`text-sm font-medium shrink-0 ${Number(tx.amount) < 0 ? 'text-red-400' : 'text-green-400'}`}>
                  {Number(tx.amount) < 0 ? '-' : '+'}${Math.abs(Number(tx.amount)).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Detail panel */}
      {selected && (
        <TransactionDetail
          tx={selected}
          categoryList={categoryList}
          onClose={() => setSelected(null)}
          onUpdate={(data) => updateMutation.mutate({ id: selected.id, data })}
          onAddSplit={(data) => addSplitMutation.mutate({ id: selected.id, data })}
          onDeleteSplit={(splitId) => deleteSplitMutation.mutate({ id: selected.id, splitId })}
        />
      )}

      {/* Filter modal */}
      {showFilters && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-20" onClick={() => setShowFilters(false)}>
          <div className="bg-gray-900 rounded-xl p-6 w-96 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-white">Filter Transactions</h3>
              <button onClick={() => setShowFilters(false)} className="text-gray-500 hover:text-white">
                <X size={16} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Account</label>
                <select
                  value={draftFilters.accountId}
                  onChange={(e) => setDraftFilters((f) => ({ ...f, accountId: e.target.value }))}
                  className="bg-gray-800 text-white rounded px-3 py-2 text-sm w-full"
                >
                  <option value="">All</option>
                  {accountList.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Category</label>
                <select
                  value={draftFilters.categoryId}
                  onChange={(e) => setDraftFilters((f) => ({ ...f, categoryId: e.target.value }))}
                  className="bg-gray-800 text-white rounded px-3 py-2 text-sm w-full"
                >
                  <option value="">All</option>
                  {categoryList.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-400 block mb-1">From</label>
                <input
                  type="date"
                  value={draftDateRange.startDate}
                  onChange={(e) => setDraftDateRange((d) => ({ ...d, startDate: e.target.value }))}
                  className="bg-gray-800 text-white rounded px-3 py-2 text-sm w-full"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">To</label>
                <input
                  type="date"
                  value={draftDateRange.endDate}
                  onChange={(e) => setDraftDateRange((d) => ({ ...d, endDate: e.target.value }))}
                  className="bg-gray-800 text-white rounded px-3 py-2 text-sm w-full"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Min Amount</label>
                <input
                  placeholder="$0.00"
                  type="number"
                  value={draftFilters.minAmount}
                  onChange={(e) => setDraftFilters((f) => ({ ...f, minAmount: e.target.value }))}
                  className="bg-gray-800 text-white rounded px-3 py-2 text-sm w-full"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Max Amount</label>
                <input
                  placeholder="$0.00"
                  type="number"
                  value={draftFilters.maxAmount}
                  onChange={(e) => setDraftFilters((f) => ({ ...f, maxAmount: e.target.value }))}
                  className="bg-gray-800 text-white rounded px-3 py-2 text-sm w-full"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={applyFilters} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded text-sm font-medium">
                Apply
              </button>
              {activeFilterCount > 0 && (
                <button onClick={clearFilters} className="px-4 bg-gray-800 hover:bg-gray-700 text-gray-300 py-2 rounded text-sm">
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TransactionDetail({ tx, categoryList, onClose, onUpdate, onAddSplit, onDeleteSplit }: {
  tx: any;
  categoryList: any[];
  onClose: () => void;
  onUpdate: (data: object) => void;
  onAddSplit: (data: object) => void;
  onDeleteSplit: (splitId: number) => void;
}) {
  const [splitAmount, setSplitAmount] = useState('');
  const [splitPerson, setSplitPerson] = useState('');

  const flatCategories = categoryList.flatMap((c: any) =>
    c.children?.length ? [c, ...c.children] : [c]
  );

  const totalSplit = tx.splits?.reduce((sum: number, s: any) => sum + Number(s.amount), 0) ?? 0;
  const yourPortion = Math.abs(Number(tx.amount)) - totalSplit;

  return (
    <div className="w-80 shrink-0 bg-gray-900 rounded-lg p-5 space-y-5 overflow-y-auto">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-white">{tx.merchantNormalized}</h3>
          <p className="text-xs text-gray-500 mt-0.5">{new Date(tx.date).toLocaleDateString()} · {tx.account?.name}</p>
        </div>
        <button onClick={onClose} className="text-gray-500 hover:text-white">
          <X size={16} />
        </button>
      </div>

      <div className="text-2xl font-bold">
        <span className={Number(tx.amount) < 0 ? 'text-red-400' : 'text-green-400'}>
          {Number(tx.amount) < 0 ? '-' : '+'}${Math.abs(Number(tx.amount)).toFixed(2)}
        </span>
      </div>

      <div>
        <label className="text-xs text-gray-400 block mb-1">Category</label>
        <select
          value={tx.categoryId ?? ''}
          onChange={(e) => onUpdate({ categoryId: e.target.value ? parseInt(e.target.value) : null })}
          className="bg-gray-800 text-white rounded px-3 py-1.5 text-sm w-full"
        >
          <option value="">Uncategorized</option>
          {flatCategories.map((c: any) => (
            <option key={c.id} value={c.id}>
              {c.parentId ? `  ${c.name}` : c.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-xs text-gray-400 block mb-1">Notes</label>
        <textarea
          defaultValue={tx.notes ?? ''}
          onBlur={(e) => onUpdate({ notes: e.target.value || null })}
          placeholder="e.g. Venmo to Jake for dinner"
          rows={2}
          className="bg-gray-800 text-white rounded px-3 py-2 text-sm w-full resize-none"
        />
      </div>

      <div className="space-y-2">
        <label className="text-xs text-gray-400 block">Flags</label>
        <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
          <input
            type="checkbox"
            checked={tx.isRecurring}
            onChange={(e) => onUpdate({ isRecurring: e.target.checked })}
          />
          <RefreshCw size={13} className="text-blue-400" /> Recurring
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
          <input
            type="checkbox"
            checked={tx.isInternalTransfer}
            onChange={(e) => onUpdate({ isInternalTransfer: e.target.checked })}
          />
          <ArrowLeftRight size={13} className="text-gray-400" /> Internal transfer
        </label>
      </div>

      <div>
        <label className="text-xs text-gray-400 block mb-2">Split</label>
        {tx.splits?.length > 0 && (
          <div className="space-y-1 mb-3">
            {tx.splits.map((s: any) => (
              <div key={s.id} className="flex items-center justify-between text-sm">
                <span className="text-gray-300">{s.owedBy}</span>
                <div className="flex items-center gap-2">
                  <span className="text-yellow-400">${Number(s.amount).toFixed(2)}</span>
                  {!s.settlement ? (
                    <button onClick={() => onDeleteSplit(s.id)} className="text-gray-600 hover:text-red-400">
                      <X size={12} />
                    </button>
                  ) : (
                    <span className="text-xs text-gray-500">settled</span>
                  )}
                </div>
              </div>
            ))}
            <div className="flex justify-between text-xs text-gray-500 border-t border-gray-800 pt-1 mt-1">
              <span>Your portion</span>
              <span>${yourPortion.toFixed(2)}</span>
            </div>
          </div>
        )}
        <div className="flex gap-2">
          <input
            placeholder="Person"
            value={splitPerson}
            onChange={(e) => setSplitPerson(e.target.value)}
            className="bg-gray-800 text-white rounded px-2 py-1.5 text-sm flex-1"
          />
          <input
            placeholder="$"
            type="number"
            value={splitAmount}
            onChange={(e) => setSplitAmount(e.target.value)}
            className="bg-gray-800 text-white rounded px-2 py-1.5 text-sm w-20"
          />
          <button
            disabled={!splitPerson || !splitAmount}
            onClick={() => {
              onAddSplit({ amount: parseFloat(splitAmount), owedBy: splitPerson });
              setSplitAmount('');
              setSplitPerson('');
            }}
            className="bg-yellow-600 hover:bg-yellow-700 disabled:opacity-50 text-white px-3 py-1.5 rounded text-sm"
          >
            Add
          </button>
        </div>
      </div>

      <div className="border-t border-gray-800 pt-4">
        <p className="text-xs text-gray-600">Raw: {tx.merchantRaw}</p>
        {tx.memo && <p className="text-xs text-gray-600 mt-0.5">Memo: {tx.memo}</p>}
      </div>
    </div>
  );
}
