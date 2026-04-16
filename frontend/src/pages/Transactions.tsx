import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { transactions, categories, accounts, savings } from '../lib/api';
import { fmt } from '../lib/format';
import { useMonthContext } from '../lib/MonthContext';
import { X, SplitSquareHorizontal, RefreshCw, ArrowLeftRight, SlidersHorizontal, ArrowUpDown, Tag, ChevronDown, ArrowLeft } from 'lucide-react';

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
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const fromBudget = searchParams.get('from') === 'budget';
  const paramCategoryId = searchParams.get('categoryId') ?? '';
  const paramMonth = searchParams.get('month');
  const paramYear = searchParams.get('year');

  const [selected, setSelected] = useState<any>(null);
  const [sort, setSort] = useState('date_desc');
  const [filters, setFilters] = useState({ ...EMPTY_FILTERS, categoryId: paramCategoryId });
  const { dateRange, setDateRange } = useMonthContext();

  // When navigating from budget, lock the date range to that month
  useEffect(() => {
    if (fromBudget && paramMonth && paramYear) {
      const m = parseInt(paramMonth);
      const y = parseInt(paramYear);
      const start = new Date(y, m - 1, 1).toISOString().split('T')[0];
      const now = new Date();
      const isCurrentMonth = now.getMonth() + 1 === m && now.getFullYear() === y;
      const end = isCurrentMonth
        ? now.toISOString().split('T')[0]
        : new Date(y, m, 0).toISOString().split('T')[0];
      setDateRange({ startDate: start, endDate: end });
    }
  }, []);
  const [showSort, setShowSort] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [draftFilters, setDraftFilters] = useState(EMPTY_FILTERS);
  const [draftDateRange, setDraftDateRange] = useState(dateRange);
  const [quickCategoryTxId, setQuickCategoryTxId] = useState<number | null>(null);
  const [categorySearch, setCategorySearch] = useState('');
  const sortRef = useRef<HTMLDivElement>(null);
  const categoryPickerRef = useRef<HTMLDivElement>(null);

  // Close sort dropdown and category picker on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) {
        setShowSort(false);
      }
      if (categoryPickerRef.current && !categoryPickerRef.current.contains(e.target as Node)) {
        setQuickCategoryTxId(null);
        setCategorySearch('');
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
      if (filters.categoryId === '__uncategorized__') {
        if (tx.categoryId != null) return false;
      } else if (filters.categoryId && tx.categoryId !== parseInt(filters.categoryId)) return false;
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
    onSuccess: (newSplit) => {
      setSelected((prev: any) => prev ? { ...prev, splits: [...(prev.splits ?? []), newSplit] } : prev);
      qc.invalidateQueries({ queryKey: ['transactions'] });
    },
  });

  const updateSplitMutation = useMutation({
    mutationFn: ({ id, splitId, data }: { id: number; splitId: number; data: object }) =>
      transactions.updateSplit(id, splitId, data),
    onSuccess: (updated) => {
      setSelected((prev: any) => prev ? { ...prev, splits: prev.splits.map((s: any) => s.id === updated.id ? { ...s, ...updated } : s) } : prev);
      qc.invalidateQueries({ queryKey: ['transactions'] });
    },
  });

  const deleteSplitMutation = useMutation({
    mutationFn: ({ id, splitId }: { id: number; splitId: number }) =>
      transactions.deleteSplit(id, splitId),
    onSuccess: (result) => {
      setSelected((prev: any) => prev ? { ...prev, splits: result.splits } : prev);
      qc.invalidateQueries({ queryKey: ['transactions'] });
    },
  });

  const activeFilterCount = Object.entries(filters).filter(([k, v]) => k !== 'search' && v !== '').length;
  const uncategorizedCount = rawList.filter((tx: any) => tx.categoryId == null).length;
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
    <div className="flex gap-4 items-start">
      {/* Main list */}
      <div className="flex-1 min-w-0 space-y-4">
        {fromBudget && (
          <button
            onClick={() => navigate('/budget')}
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors mb-1"
          >
            <ArrowLeft size={15} /> Back to Budget
          </button>
        )}
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

        {/* Quick filters */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilters(f => ({ ...f, categoryId: f.categoryId === '__uncategorized__' ? '' : '__uncategorized__' }))}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs ${
              filters.categoryId === '__uncategorized__'
                ? 'bg-yellow-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            <Tag size={11} /> Uncategorized
            {uncategorizedCount > 0 && (
              <span className={`ml-0.5 px-1.5 py-0.5 rounded-full text-xs font-medium ${filters.categoryId === '__uncategorized__' ? 'bg-yellow-500 text-white' : 'bg-gray-700 text-gray-300'}`}>
                {uncategorizedCount}
              </span>
            )}
          </button>
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
                    <div className="relative" ref={quickCategoryTxId === tx.id ? categoryPickerRef : null}>
                      <button
                        onClick={(e) => { e.stopPropagation(); setQuickCategoryTxId(quickCategoryTxId === tx.id ? null : tx.id); setCategorySearch(''); }}
                        className={`text-xs px-1.5 py-0.5 rounded transition-colors ${
                          tx.category
                            ? 'text-gray-300 bg-gray-800 hover:bg-gray-700'
                            : 'text-gray-600 hover:text-gray-400'
                        }`}
                      >
                        {tx.category ? tx.category.name : '+ category'}
                      </button>
                      {quickCategoryTxId === tx.id && (
                        <div className="absolute left-0 top-full mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-30 w-48 py-1" onClick={(e) => e.stopPropagation()}>
                          <input
                            autoFocus
                            placeholder="Search..."
                            value={categorySearch}
                            onChange={(e) => setCategorySearch(e.target.value)}
                            className="w-full bg-gray-700 text-white text-xs px-3 py-1.5 border-b border-gray-600 outline-none"
                          />
                          <div className="max-h-48 overflow-y-auto">
                            {tx.category && (
                              <button
                                onClick={() => { updateMutation.mutate({ id: tx.id, data: { categoryId: null } }); setQuickCategoryTxId(null); }}
                                className="w-full text-left px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-700 italic"
                              >
                                Remove category
                              </button>
                            )}
                            {categoryList
                              .filter((c: any) => !categorySearch || c.name.toLowerCase().includes(categorySearch.toLowerCase()))
                              .map((c: any) => (
                                <button
                                  key={c.id}
                                  onClick={() => { updateMutation.mutate({ id: tx.id, data: { categoryId: c.id } }); setQuickCategoryTxId(null); setCategorySearch(''); }}
                                  className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700 flex items-center gap-2"
                                >
                                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c.color ?? '#6b7280' }} />
                                  {c.name}
                                </button>
                              ))}
                          </div>
                        </div>
                      )}
                    </div>
                    {tx.notes && (
                      <span className="text-xs text-gray-500 italic truncate">{tx.notes}</span>
                    )}
                  </div>
                </div>
                {(() => {
                  const full = Math.abs(Number(tx.amount));
                  const splitTotal = tx.splits?.reduce((s: number, sp: any) => s + Number(sp.amount), 0) ?? 0;
                  const display = splitTotal > 0 ? full - splitTotal : full;
                  return (
                    <div className="text-right shrink-0">
                      <span className={`text-sm font-medium ${Number(tx.amount) < 0 ? 'text-red-400' : 'text-green-400'}`}>
                        {Number(tx.amount) < 0 ? '-' : '+'}${fmt(display)}
                      </span>
                      {splitTotal > 0 && (
                        <p className="text-xs text-gray-600 leading-none mt-0.5">of ${fmt(full)}</p>
                      )}
                    </div>
                  );
                })()}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Detail panel */}
      {selected && (
        <TransactionDetail
          key={selected.id}
          tx={selected}
          categoryList={categoryList}
          onClose={() => setSelected(null)}
          onUpdate={(data) => updateMutation.mutate({ id: selected.id, data })}
          onAddSplit={(data) => addSplitMutation.mutateAsync({ id: selected.id, data })}
          onUpdateSplit={(splitId, data) => updateSplitMutation.mutate({ id: selected.id, splitId, data })}
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

function TransactionDetail({ tx, categoryList, onClose, onUpdate, onAddSplit, onUpdateSplit, onDeleteSplit }: {
  tx: any;
  categoryList: any[];
  onClose: () => void;
  onUpdate: (data: object) => void;
  onAddSplit: (data: object) => Promise<any>;
  onUpdateSplit: (splitId: number, data: object) => void;
  onDeleteSplit: (splitId: number) => void;
}) {
  const { data: people = [] } = useQuery({ queryKey: ['people'], queryFn: transactions.people });
  const { data: savingsData } = useQuery({ queryKey: ['savings'], queryFn: savings.list });
  const savingsGoals: any[] = savingsData?.goals ?? [];

  const flatCategories = categoryList.flatMap((c: any) =>
    c.children?.length ? [c, ...c.children] : [c]
  );

  const [splitWays, setSplitWays] = useState('');
  const [customAmount, setCustomAmount] = useState('');
  const [showSplitOptions, setShowSplitOptions] = useState(false);
  const [splitDropdownCoords, setSplitDropdownCoords] = useState<{ top: number; left: number } | null>(null);
  const splitDropdownRef = useRef<HTMLDivElement>(null);
  const splitListRef = useRef<HTMLDivElement>(null);
  const [editingNameId, setEditingNameId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (
        !splitDropdownRef.current?.contains(t) &&
        !splitListRef.current?.contains(t)
      ) {
        setShowSplitOptions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const openSplitDropdown = () => {
    if (!showSplitOptions && splitDropdownRef.current) {
      const rect = splitDropdownRef.current.getBoundingClientRect();
      setSplitDropdownCoords({ top: rect.bottom + 4, left: rect.left });
    }
    setShowSplitOptions(s => !s);
  };

  const totalSplit = tx.splits?.reduce((sum: number, s: any) => sum + Number(s.amount), 0) ?? 0;
  const yourPortion = Math.abs(Number(tx.amount)) - totalSplit;

  return (
    <div className="w-80 shrink-0 bg-gray-900 rounded-lg p-5 space-y-5 overflow-y-auto overflow-x-hidden sticky top-4 self-start max-h-[calc(100vh-2.5rem)]">
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
          {Number(tx.amount) < 0 ? '-' : '+'}${fmt(Math.abs(Number(tx.amount)))}
        </span>
      </div>

      <div className="space-y-2">
        <div>
          <label className="text-xs text-gray-400 block mb-1">Category</label>
          <select
            value={tx.categoryId ?? ''}
            onChange={(e) => {
              const newCatId = e.target.value ? parseInt(e.target.value) : null;
              const newCat = flatCategories.find((c: any) => c.id === newCatId);
              onUpdate({
                categoryId: newCatId,
                ...(!newCat?.isReimbursement && { reimbursedBy: null }),
                ...(!newCat?.isFromSavings && { savingsGoalId: null }),
              });
            }}
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
        {flatCategories.find((c: any) => c.id === tx.categoryId)?.isReimbursement && (
          <div>
            <label className="text-xs text-gray-400 block mb-1">Paid back by</label>
            <select
              value={tx.reimbursedBy ?? ''}
              onChange={(e) => onUpdate({ reimbursedBy: e.target.value || null })}
              className="bg-gray-800 text-white rounded px-3 py-1.5 text-sm w-full"
            >
              <option value="">Select person...</option>
              {(people as string[]).map((p: string) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
        )}
        {flatCategories.find((c: any) => c.id === tx.categoryId)?.isFromSavings && savingsGoals.length > 0 && (
          <div>
            <label className="text-xs text-gray-400 block mb-1">From which goal?</label>
            <select
              value={tx.savingsGoalId ?? ''}
              onChange={(e) => onUpdate({ savingsGoalId: e.target.value ? parseInt(e.target.value) : null })}
              className="bg-gray-800 text-white rounded px-3 py-1.5 text-sm w-full"
            >
              <option value="">Select goal...</option>
              {savingsGoals.map((g: any) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>
        )}
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
        {tx.splits?.length > 0 && (
          <div className="space-y-1 mb-3">
            {tx.splits.map((s: any) => (
              <div key={s.id} className="flex items-center justify-between text-sm">
                {editingNameId === s.id ? (
                  <input
                    autoFocus
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onBlur={() => { onUpdateSplit(s.id, { owedBy: editingName || s.owedBy }); setEditingNameId(null); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { onUpdateSplit(s.id, { owedBy: editingName || s.owedBy }); setEditingNameId(null); } if (e.key === 'Escape') setEditingNameId(null); }}
                    className="bg-gray-700 text-white rounded px-1.5 py-0.5 text-sm w-28"
                  />
                ) : (
                  <button
                    onClick={() => { setEditingNameId(s.id); setEditingName(s.owedBy); }}
                    className="text-gray-300 hover:text-white hover:underline text-left"
                  >
                    {s.owedBy}
                  </button>
                )}
                <div className="flex items-center gap-2">
                  <span className="text-yellow-400">${fmt(Number(s.amount))}</span>
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
              <span>${fmt(yourPortion)}</span>
            </div>
          </div>
        )}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 shrink-0">Split</span>
          <div className="relative shrink-0" ref={splitDropdownRef}>
            <button
              onClick={openSplitDropdown}
              className="bg-gray-800 text-white rounded px-2 py-1.5 text-sm flex items-center gap-1.5 min-w-[6.5rem]"
            >
              {splitWays === 'custom' ? (
                <input
                  autoFocus
                  type="number"
                  placeholder="$0.00"
                  min="0"
                  step="0.01"
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  className="bg-transparent text-white text-sm w-16 outline-none"
                />
              ) : (
                <span className="flex-1 text-left text-sm">
                  {splitWays ? `${splitWays} ways` : '— ways'}
                </span>
              )}
              <ChevronDown size={13} className="text-gray-400 shrink-0" />
            </button>
            {showSplitOptions && splitDropdownCoords && (
              <div
                ref={splitListRef}
                style={{ position: 'fixed', top: splitDropdownCoords.top, left: splitDropdownCoords.left }}
                className="bg-gray-800 border border-gray-700 rounded-lg shadow-lg z-50 py-1 w-32"
              >
                <button
                  onClick={() => { setSplitWays(''); setCustomAmount(''); setShowSplitOptions(false); }}
                  className="w-full text-left px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-700"
                >
                  — ways
                </button>
                {[2,3,4,5,6,7,8,9,10].map(n => (
                  <button
                    key={n}
                    onClick={() => { setSplitWays(String(n)); setShowSplitOptions(false); }}
                    className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-700 ${splitWays === String(n) ? 'text-white' : 'text-gray-300'}`}
                  >
                    {n} ways
                  </button>
                ))}
                <button
                  onClick={() => { setSplitWays('custom'); setShowSplitOptions(false); }}
                  className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-700 border-t border-gray-700 ${splitWays === 'custom' ? 'text-white' : 'text-gray-300'}`}
                >
                  Custom $
                </button>
              </div>
            )}
          </div>
          {splitWays && splitWays !== 'custom' && !tx.splits?.length && (
            <button
              onClick={async () => {
                const ways = parseInt(splitWays);
                const perPerson = parseFloat((Math.abs(Number(tx.amount)) / ways).toFixed(2));
                for (let i = 1; i < ways; i++) {
                  await onAddSplit({ amount: perPerson, owedBy: `Person ${i}` });
                }
                setSplitWays('');
              }}
              className="bg-blue-500 hover:bg-blue-400 text-white px-3 py-1.5 rounded text-sm shrink-0"
            >
              Split
            </button>
          )}
          {splitWays === 'custom' && (
            <button
              disabled={!customAmount || parseFloat(customAmount) <= 0}
              onClick={async () => {
                await onAddSplit({ amount: parseFloat(customAmount), owedBy: 'Person' });
                setCustomAmount('');
              }}
              className="bg-blue-500 hover:bg-blue-400 disabled:opacity-50 text-white px-3 py-1.5 rounded text-sm shrink-0"
            >
              Split
            </button>
          )}
        </div>
      </div>

      <div className="border-t border-gray-800 pt-4">
        <p className="text-xs text-gray-600 break-words">Raw: {tx.merchantRaw}</p>
        {tx.memo && <p className="text-xs text-gray-600 mt-0.5 break-words">Memo: {tx.memo}</p>}
      </div>
    </div>
  );
}
