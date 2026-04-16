import { useState, useRef, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { budgets, reports, categories } from '../lib/api';
import { useMonthContext } from '../lib/MonthContext';
import { fmt } from '../lib/format';
import { ChevronLeft, ChevronRight, Pencil, Check, X, Trash2, Plus, GripVertical } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

const FALLBACK_COLOR = '#6b7280';
const CATEGORY_COLORS = [
  '#f87171', '#fb923c', '#facc15', '#a3e635',
  '#4ade80', '#34d399', '#2dd4bf', '#60a5fa',
  '#818cf8', '#a78bfa', '#f472b6', '#94a3b8',
];

const PRESET_CATEGORIES = [
  // Income
  { name: 'Paycheck', color: '#4ade80', isIncome: true },
  { name: 'Side Income', color: '#34d399', isIncome: true },
  { name: 'Other Income', color: '#6ee7b7', isIncome: true },
  // Expenses
  { name: 'Rent / Mortgage', color: '#f87171', isIncome: false },
  { name: 'Utilities', color: '#fb923c', isIncome: false },
  { name: 'Groceries', color: '#facc15', isIncome: false },
  { name: 'Dining Out', color: '#f97316', isIncome: false },
  { name: 'Transportation / Gas', color: '#60a5fa', isIncome: false },
  { name: 'Car Payment', color: '#3b82f6', isIncome: false },
  { name: 'Insurance', color: '#818cf8', isIncome: false },
  { name: 'Healthcare', color: '#e879f9', isIncome: false },
  { name: 'Entertainment', color: '#a78bfa', isIncome: false },
  { name: 'Subscriptions', color: '#c084fc', isIncome: false },
  { name: 'Shopping', color: '#f472b6', isIncome: false },
  { name: 'Personal Care', color: '#fb7185', isIncome: false },
  { name: 'Phone', color: '#94a3b8', isIncome: false },
  { name: 'Internet', color: '#64748b', isIncome: false },
  { name: 'Travel', color: '#2dd4bf', isIncome: false },
  { name: 'Gym / Fitness', color: '#34d399', isIncome: false },
  { name: 'Education', color: '#fbbf24', isIncome: false },
  { name: 'Gifts / Donations', color: '#f43f5e', isIncome: false },
  { name: 'Savings', color: '#10b981', isIncome: false },
  { name: 'Miscellaneous', color: '#6b7280', isIncome: false },
];

export default function Budget() {
  const qc = useQueryClient();
  const now = new Date();
  const { month, year, setMonth, setYear } = useMonthContext();
  const navigate = useNavigate();
  const [editingBudget, setEditingBudget] = useState<number | null>(null);
  const [editBudgetValue, setEditBudgetValue] = useState('');
  const [editFrequencyValue, setEditFrequencyValue] = useState<'MONTHLY' | 'QUARTERLY' | 'SEMI_ANNUAL' | 'ANNUAL'>('MONTHLY');
  const [editTimingValue, setEditTimingValue] = useState<'CURRENT' | 'NEXT_MONTH'>('CURRENT');
  const [editColorValue, setEditColorValue] = useState(CATEGORY_COLORS[0]);
  const [editIsEssential, setEditIsEssential] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [categoryForm, setCategoryForm] = useState({ preset: '', customName: '', color: CATEGORY_COLORS[0], isIncome: false, isReimbursement: false, budgetAmount: '', frequency: 'MONTHLY' as 'MONTHLY' | 'QUARTERLY' | 'SEMI_ANNUAL' | 'ANNUAL' });

  const selectedPreset = PRESET_CATEGORIES.find((p) => p.name === categoryForm.preset);
  const isCustom = categoryForm.preset === '__custom__';
  const resolvedName = isCustom ? categoryForm.customName : categoryForm.preset;
  const [confirmDeleteCategory, setConfirmDeleteCategory] = useState<number | null>(null);
  const [dragInsertBeforeId, setDragInsertBeforeId] = useState<number | 'income-end' | 'expense-end' | null>(null);
  const dragIdRef = useRef<number | null>(null);

  const { data: budgetData } = useQuery({
    queryKey: ['budgets-by-category', month, year],
    queryFn: () => reports.byCategory(month, year),
  });

  const { data: summary } = useQuery({
    queryKey: ['summary', month, year],
    queryFn: () => reports.summary(month, year),
  });

  const { data: categoryList } = useQuery({
    queryKey: ['categories'],
    queryFn: categories.list,
  });

  const { data: budgetList } = useQuery({
    queryKey: ['budgets'],
    queryFn: budgets.list,
  });

  const upsertBudgetMutation = useMutation({
    mutationFn: (data: { categoryId: number; amount: number; frequency: string }) => budgets.upsert(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['budgets-by-category', month, year] });
      qc.invalidateQueries({ queryKey: ['budgets'] });
      qc.invalidateQueries({ queryKey: ['onboarding'] });
      setEditingBudget(null);
    },
  });

  const updateCategoryMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: object }) => categories.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories'] });
      qc.invalidateQueries({ queryKey: ['budgets-by-category', month, year] });
      qc.invalidateQueries({ queryKey: ['summary', month, year] });
    },
  });

  const createCategoryMutation = useMutation({
    mutationFn: async () => {
      const cat = await categories.create({ name: resolvedName, color: categoryForm.color, isIncome: categoryForm.isIncome, isReimbursement: categoryForm.isReimbursement, isEssential: (categoryForm as any).isEssential ?? false });
      if (categoryForm.budgetAmount) {
        await budgets.upsert({ categoryId: cat.id, amount: parseFloat(categoryForm.budgetAmount), frequency: categoryForm.frequency });
      }
      return cat;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories'] });
      qc.invalidateQueries({ queryKey: ['budgets'] });
      qc.invalidateQueries({ queryKey: ['budgets-by-category', month, year] });
      qc.invalidateQueries({ queryKey: ['onboarding'] });
      setCategoryForm({ preset: '', customName: '', color: CATEGORY_COLORS[0], isIncome: false, isReimbursement: false, budgetAmount: '', frequency: 'MONTHLY' });
      setShowCategoryForm(false);
    },
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: (id: number) => categories.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories'] });
      qc.invalidateQueries({ queryKey: ['budgets'] });
      qc.invalidateQueries({ queryKey: ['budgets-by-category', month, year] });
      setConfirmDeleteCategory(null);
    },
  });

  const reorderMutation = useMutation({
    mutationFn: (order: { id: number; order: number }[]) => categories.reorder(order),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
    onError: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  });

  const handleDrop = (insertBefore: number | 'income-end' | 'expense-end') => {
    const fromId = dragIdRef.current;
    if (!fromId) return;
    const allCats = categoryList ?? [];
    const reordered: number[] = allCats.map((c: any) => c.id).filter((id: number) => id !== fromId);
    if (insertBefore === 'income-end' || insertBefore === 'expense-end') {
      const isIncome = insertBefore === 'income-end';
      const sectionIds = new Set(
        allCats
          .filter((c: any) => c.isIncome === isIncome && !c.isReimbursement && !c.isFromSavings && c.id !== fromId)
          .map((c: any) => c.id)
      );
      let lastIdx = -1;
      for (let i = reordered.length - 1; i >= 0; i--) {
        if (sectionIds.has(reordered[i])) { lastIdx = i; break; }
      }
      reordered.splice(lastIdx + 1, 0, fromId);
    } else {
      if (insertBefore === fromId) return;
      const toIdx = reordered.indexOf(insertBefore);
      if (toIdx !== -1) reordered.splice(toIdx, 0, fromId);
      else reordered.push(fromId);
    }
    reorderMutation.mutate(reordered.map((id: number, i: number) => ({ id, order: i })));
    qc.setQueryData(['categories'], (old: any[]) => {
      if (!old) return old;
      const map = new Map(old.map((c: any) => [c.id, c]));
      return reordered.map((id: number) => map.get(id)).filter(Boolean);
    });
    setDragInsertBeforeId(null);
    dragIdRef.current = null;
  };

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear(year - 1); }
    else setMonth(month - 1);
  };

  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear(year + 1); }
    else setMonth(month + 1);
  };

  const monthLabel = new Date(year, month - 1).toLocaleString('default', { month: 'long', year: 'numeric' });
  const isCurrentMonth = month === now.getMonth() + 1 && year === now.getFullYear();

  const historicalBudgetMap: Record<number, number> = {};
  const spendingMap: Record<number, number> = {};
  budgetData?.forEach((b: any) => {
    historicalBudgetMap[b.category.id] = b.budgeted;
    spendingMap[b.category.id] = b.spent;
  });

  const currentBudgetMap: Record<number, { amount: number; frequency: string }> = {};
  budgetList?.forEach((b: any) => { currentBudgetMap[b.categoryId] = { amount: Number(b.amount), frequency: b.frequency ?? 'MONTHLY' }; });

  const coveredThroughMap: Record<number, string | null> = {};
  budgetData?.forEach((b: any) => { if (b.category?.id) coveredThroughMap[b.category.id] = b.coveredThrough ?? null; });

  const incomeCategories = categoryList?.filter((c: any) => c.isIncome && !c.isReimbursement && !c.isFromSavings) ?? [];
  const expenseCategories = categoryList?.filter((c: any) => !c.isIncome && !c.isReimbursement && !c.isFromSavings) ?? [];

  const expectedIncome = incomeCategories.reduce((sum: number, c: any) => sum + (historicalBudgetMap[c.id] ?? 0), 0);
  const actualIncome = summary?.income ?? 0;
  const totalBudgeted = expenseCategories.reduce((sum: number, c: any) => sum + (historicalBudgetMap[c.id] ?? 0), 0);
  const totalSpent = expenseCategories.reduce((sum: number, c: any) => sum + (spendingMap[c.id] ?? 0), 0);

  const plannedSavings = expectedIncome - totalBudgeted;
  const overspend = Math.max(0, totalSpent - totalBudgeted);
  const projectedSavings = plannedSavings - overspend;

  const budgetedPieData = expenseCategories
    .filter((c: any) => historicalBudgetMap[c.id] > 0)
    .map((c: any) => ({ name: c.name, value: historicalBudgetMap[c.id], color: c.color ?? FALLBACK_COLOR }));

  const spentPieData = expenseCategories
    .filter((c: any) => spendingMap[c.id] > 0)
    .map((c: any) => ({ name: c.name, value: spendingMap[c.id], color: c.color ?? FALLBACK_COLOR }));

  const startEditBudget = (cat: any) => {
    const current = currentBudgetMap[cat.id];
    setEditingBudget(cat.id);
    setEditBudgetValue(current?.amount > 0 ? String(current.amount) : '');
    setEditFrequencyValue((current?.frequency ?? 'MONTHLY') as 'MONTHLY' | 'QUARTERLY' | 'ANNUAL');
    setEditTimingValue((cat.paycheckTiming ?? 'CURRENT') as 'CURRENT' | 'NEXT_MONTH');
    setEditColorValue(cat.color ?? FALLBACK_COLOR);
    setEditIsEssential(cat.isEssential ?? false);
    setShowColorPicker(false);
  };

  const saveBudget = (cat: any) => {
    const amount = parseFloat(editBudgetValue);
    if (!isNaN(amount) && amount >= 0) {
      upsertBudgetMutation.mutate({ categoryId: cat.id, amount, frequency: editFrequencyValue });
    } else {
      setEditingBudget(null);
    }
    const colorChanged = editColorValue !== cat.color;
    const timingChanged = editTimingValue !== (cat.paycheckTiming ?? 'CURRENT');
    const essentialChanged = editIsEssential !== (cat.isEssential ?? false);
    if (colorChanged || (cat.isIncome && timingChanged) || essentialChanged) {
      updateCategoryMutation.mutate({ id: cat.id, data: { color: editColorValue, ...(cat.isIncome && { paycheckTiming: editTimingValue }), isEssential: editIsEssential } });
    }
  };

  const toMonthly = (amount: number, frequency: string) => {
    if (frequency === 'QUARTERLY') return amount / 3;
    if (frequency === 'SEMI_ANNUAL') return amount / 6;
    if (frequency === 'ANNUAL') return amount / 12;
    return amount;
  };

  const frequencyLabel = (amount: number, frequency: string) => {
    if (frequency === 'QUARTERLY') return `$${fmt(amount)}/qtr`;
    if (frequency === 'SEMI_ANNUAL') return `$${fmt(amount)}/6mo`;
    if (frequency === 'ANNUAL') return `$${fmt(amount)}/yr`;
    return null;
  };

  const renderCategoryRow = (cat: any, isIncome: boolean) => {
    const budgeted = historicalBudgetMap[cat.id] ?? 0;
    const currentBudgetEntry = currentBudgetMap[cat.id];
    const currentBudget = currentBudgetEntry?.amount ?? 0;
    const currentFrequency = currentBudgetEntry?.frequency ?? 'MONTHLY';
    const received = spendingMap[cat.id] ?? 0;
    const spent = received;
    const remaining = budgeted - spent;
    const pct = budgeted > 0 ? Math.min((spent / budgeted) * 100, 100) : 0;
    const incomePercent = !isIncome && actualIncome > 0 && budgeted > 0 ? ((budgeted / actualIncome) * 100).toFixed(0) : null;
    const isOver = !isIncome && spent > budgeted && budgeted > 0;
    const isUnder = isIncome && spent < budgeted && budgeted > 0;
    const isEditingBudget = editingBudget === cat.id;
    const rawLabel = frequencyLabel(currentBudget, currentFrequency);
    const budgetEntry = budgetData?.find((b: any) => b.category?.id === cat.id);

    return (
      <div
        key={cat.id}
        className="group bg-gray-900 rounded-lg p-4 space-y-2"
        draggable
        onDragStart={() => { dragIdRef.current = cat.id; }}
        onDragOver={(e) => { e.preventDefault(); if (dragIdRef.current !== cat.id) setDragInsertBeforeId(cat.id); }}
        onDrop={() => handleDrop(cat.id)}
        onDragEnd={() => { setDragInsertBeforeId(null); dragIdRef.current = null; }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GripVertical size={14} className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-600 cursor-grab shrink-0" />
            {isEditingBudget ? (
              <button
                onClick={() => setShowColorPicker((v) => !v)}
                className="w-2.5 h-2.5 rounded-full shrink-0 ring-1 ring-white/40 hover:ring-white transition-all"
                style={{ backgroundColor: editColorValue }}
                title="Change color"
              />
            ) : (
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cat.color ?? FALLBACK_COLOR }} />
            )}
            {isEditingBudget ? (
              <span className="text-sm font-medium text-white">{cat.name}</span>
            ) : (
              <button
                onClick={() => navigate(`/transactions?categoryId=${cat.id}&month=${month}&year=${year}&from=budget`)}
                className="text-sm font-medium text-white hover:text-blue-400 transition-colors"
              >
                {cat.name}
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {isEditingBudget ? (
              <>
                <select
                  value={editFrequencyValue}
                  onChange={(e) => setEditFrequencyValue(e.target.value as 'MONTHLY' | 'QUARTERLY' | 'SEMI_ANNUAL' | 'ANNUAL')}
                  className="bg-gray-800 text-white rounded px-2 py-1 text-xs"
                >
                  <option value="MONTHLY">Monthly</option>
                  <option value="QUARTERLY">Quarterly</option>
                  <option value="SEMI_ANNUAL">Semi-Annual</option>
                  <option value="ANNUAL">Annual</option>
                </select>
                {isIncome && (
                  <select
                    value={editTimingValue}
                    onChange={(e) => setEditTimingValue(e.target.value as 'CURRENT' | 'NEXT_MONTH')}
                    className="bg-gray-800 text-white rounded px-2 py-1 text-xs"
                    title="When does this paycheck count?"
                  >
                    <option value="CURRENT">Same month</option>
                    <option value="NEXT_MONTH">Following month</option>
                  </select>
                )}
                <span className="text-gray-400 text-sm">$</span>
                <input
                  type="number"
                  value={editBudgetValue}
                  onChange={(e) => setEditBudgetValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveBudget(cat); if (e.key === 'Escape') setEditingBudget(null); }}
                  className="bg-gray-800 text-white rounded px-2 py-1 text-sm w-24 text-right"
                  autoFocus
                  min="0"
                />
                {!isIncome && (
                  <button
                    onClick={() => setEditIsEssential(!editIsEssential)}
                    className={`text-xs px-2 py-0.5 rounded border transition-colors ${editIsEssential ? 'border-orange-500 text-orange-400' : 'border-gray-600 text-gray-500 hover:border-gray-400'}`}
                    title="Toggle fixed/flexible"
                  >
                    {editIsEssential ? 'Fixed' : 'Flexible'}
                  </button>
                )}
                <button onClick={() => saveBudget(cat)} className="text-green-400 hover:text-green-300">
                  <Check size={15} />
                </button>
                <button onClick={() => setEditingBudget(null)} className="text-gray-500 hover:text-gray-300">
                  <X size={15} />
                </button>
              </>
            ) : (
              <div className="flex items-center gap-2">
                {(budgeted > 0 || currentBudget > 0) ? (
                  <>
                    {incomePercent && <span className="text-xs text-gray-600">{incomePercent}% of income</span>}
                    {rawLabel && (
                      <span className="text-xs text-gray-500">{rawLabel}</span>
                    )}
                    {!isIncome && cat.isEssential && (
                      <span className="text-xs text-orange-500/70">Fixed</span>
                    )}
                    <span className={`text-sm font-semibold ${isOver ? 'text-red-400' : 'text-white'}`}>
                      ${fmt(budgeted || toMonthly(currentBudget, currentFrequency))}/mo
                    </span>
                  </>
                ) : (
                  <span className="text-xs text-gray-600">{isIncome ? 'No target set' : 'No budget set'}</span>
                )}
                {isCurrentMonth && (
                  <button onClick={() => startEditBudget(cat)} className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-600 hover:text-gray-400">
                    <Pencil size={13} />
                  </button>
                )}
                {confirmDeleteCategory === cat.id ? (
                  <div className="flex items-center gap-1 text-xs">
                    <span className="text-gray-400">Delete?</span>
                    <button onClick={() => deleteCategoryMutation.mutate(cat.id)} className="text-red-400 hover:text-red-300 font-medium">Yes</button>
                    <button onClick={() => setConfirmDeleteCategory(null)} className="text-gray-400 hover:text-white">No</button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDeleteCategory(cat.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-600 hover:text-red-400"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {isEditingBudget && showColorPicker && (
          <div className="grid grid-cols-6 gap-1.5 pt-1">
            {CATEGORY_COLORS.map((color) => (
              <button
                key={color}
                onClick={() => { setEditColorValue(color); setShowColorPicker(false); }}
                className={`w-6 h-6 rounded-full border-2 ${editColorValue === color ? 'border-white' : 'border-transparent'}`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        )}

        {budgeted > 0 && (
          <>
            {budgetEntry?.coveredThrough ? (
              <div className="flex justify-between text-xs">
                <span className="text-green-400">Covered</span>
                <span className="text-gray-500">
                  through {new Date(budgetEntry.coveredThrough).toLocaleDateString('default', { month: 'short', year: 'numeric' })}
                </span>
              </div>
            ) : (
              <>
                <div className="w-full bg-gray-800 rounded-full h-1.5">
                  <div
                    className={`h-1.5 rounded-full transition-all ${isOver ? 'bg-red-500' : isIncome ? 'bg-green-500' : 'bg-blue-500'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-gray-500">
                  <span>${fmt(spent)} {isIncome ? 'received' : 'spent'}</span>
                  <span className={isOver ? 'text-red-400' : isUnder ? 'text-yellow-400' : 'text-gray-400'}>
                    {isIncome
                      ? remaining > 0 ? `$${fmt(remaining)} expected` : 'Target met'
                      : remaining < 0 ? `-$${fmt(Math.abs(remaining))} over` : `$${fmt(remaining)} left`}
                  </span>
                </div>
              </>
            )}
          </>
        )}

        {budgeted === 0 && spent > 0 && (
          <p className="text-xs text-yellow-500">
            ${fmt(spent)} {isIncome ? 'received' : 'spent'} — no {isIncome ? 'target' : 'budget'} set
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Budget</h2>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setShowCategoryForm(!showCategoryForm)}
            className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded text-sm"
          >
            <Plus size={14} /> Add Category
          </button>
          <div className="flex items-center gap-2">
            <button onClick={prevMonth} className="text-gray-400 hover:text-white"><ChevronLeft size={18} /></button>
            <span className="text-sm text-gray-300 w-36 text-center">{monthLabel}</span>
            <button onClick={nextMonth} className="text-gray-400 hover:text-white"><ChevronRight size={18} /></button>
          </div>
        </div>
      </div>

      {/* Add category form */}
      {showCategoryForm && (
        <div className="bg-gray-900 rounded-lg p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-300">New Category</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Category</label>
              <select
                value={categoryForm.preset}
                onChange={(e) => {
                  const val = e.target.value;
                  const preset = PRESET_CATEGORIES.find((p) => p.name === val);
                  setCategoryForm({
                    ...categoryForm,
                    preset: val,
                    color: preset ? preset.color : categoryForm.color,
                    isIncome: preset ? preset.isIncome : categoryForm.isIncome,
                  });
                }}
                className="bg-gray-800 text-white rounded px-3 py-2 text-sm w-full"
                autoFocus
              >
                <option value="">Select a category...</option>
                <optgroup label="Income">
                  {PRESET_CATEGORIES.filter((p) => p.isIncome).map((p) => (
                    <option key={p.name} value={p.name}>{p.name}</option>
                  ))}
                </optgroup>
                <optgroup label="Expenses">
                  {PRESET_CATEGORIES.filter((p) => !p.isIncome).map((p) => (
                    <option key={p.name} value={p.name}>{p.name}</option>
                  ))}
                </optgroup>
                <option value="__custom__">Custom...</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-gray-400 block mb-1">Budget Amount</label>
              <div className="flex gap-2">
                <select
                  value={categoryForm.frequency}
                  onChange={(e) => setCategoryForm({ ...categoryForm, frequency: e.target.value as 'MONTHLY' | 'QUARTERLY' | 'SEMI_ANNUAL' | 'ANNUAL' })}
                  className="bg-gray-800 text-white rounded px-2 py-2 text-xs"
                >
                  <option value="MONTHLY">Monthly</option>
                  <option value="QUARTERLY">Quarterly</option>
                  <option value="SEMI_ANNUAL">Semi-Annual</option>
                  <option value="ANNUAL">Annual</option>
                </select>
                <input
                  type="number"
                  placeholder="e.g. 350"
                  value={categoryForm.budgetAmount}
                  onChange={(e) => setCategoryForm({ ...categoryForm, budgetAmount: e.target.value })}
                  className="bg-gray-800 text-white rounded px-3 py-2 text-sm flex-1"
                  min="0"
                />
              </div>
            </div>

            {isCustom && (
              <div>
                <label className="text-xs text-gray-400 block mb-1">Custom Name</label>
                <input
                  type="text"
                  placeholder="e.g. Dog Food"
                  value={categoryForm.customName}
                  onChange={(e) => setCategoryForm({ ...categoryForm, customName: e.target.value })}
                  className="bg-gray-800 text-white rounded px-3 py-2 text-sm w-full"
                  autoFocus
                />
              </div>
            )}

            <div className={isCustom ? '' : 'col-span-1'}>
              <label className="text-xs text-gray-400 block mb-1">Color</label>
              <div className="grid grid-cols-6 gap-1.5 mt-1">
                {CATEGORY_COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => setCategoryForm({ ...categoryForm, color })}
                    className={`w-6 h-6 rounded-full border-2 ${categoryForm.color === color ? 'border-white' : 'border-transparent'}`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>

            {isCustom && (
              <div className="flex items-center gap-6 mt-4">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="isIncome"
                    checked={categoryForm.isIncome}
                    onChange={(e) => setCategoryForm({ ...categoryForm, isIncome: e.target.checked, isReimbursement: false })}
                    className="w-4 h-4"
                  />
                  <label htmlFor="isIncome" className="text-xs text-gray-400">Income category</label>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="isReimbursement"
                    checked={categoryForm.isReimbursement}
                    onChange={(e) => setCategoryForm({ ...categoryForm, isReimbursement: e.target.checked, isIncome: false })}
                    className="w-4 h-4"
                  />
                  <label htmlFor="isReimbursement" className="text-xs text-gray-400">Reimbursement category</label>
                </div>
                {!categoryForm.isIncome && !categoryForm.isReimbursement && (
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="isEssential"
                      checked={categoryForm.isReimbursement ? false : (categoryForm as any).isEssential ?? false}
                      onChange={(e) => setCategoryForm({ ...categoryForm, isReimbursement: false, isEssential: e.target.checked } as any)}
                      className="w-4 h-4"
                    />
                    <label htmlFor="isEssential" className="text-xs text-gray-400">Fixed expense</label>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button
              disabled={!resolvedName || createCategoryMutation.isPending}
              onClick={() => createCategoryMutation.mutate()}
              className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-4 py-2 rounded text-sm"
            >
              {createCategoryMutation.isPending ? 'Saving...' : 'Save'}
            </button>
            <button onClick={() => setShowCategoryForm(false)} className="text-gray-400 hover:text-white text-sm px-3 py-2">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-4 gap-4">
        {/* Income tile */}
        <div className="bg-gray-900 rounded-lg p-4">
          <p className="text-xs text-gray-400 mb-1">Income</p>
          <p className={`text-lg font-bold ${actualIncome < expectedIncome && expectedIncome > 0 ? 'text-yellow-400' : 'text-green-400'}`}>
            ${fmt(actualIncome)}
          </p>
          {expectedIncome > 0 && (
            <p className="text-xs text-gray-600 mt-0.5">of ${fmt(expectedIncome)} expected</p>
          )}
        </div>

        {/* Savings tile */}
        <div className="bg-gray-900 rounded-lg p-4">
          <p className="text-xs text-gray-400 mb-1">Savings</p>
          {expectedIncome > 0 ? (
            <>
              <p className={`text-lg font-bold ${projectedSavings < 0 ? 'text-red-400' : overspend > 0 ? 'text-yellow-400' : 'text-white'}`}>
                ${fmt(projectedSavings)}
              </p>
              {overspend > 0 ? (
                <p className="text-xs text-red-500 mt-0.5">-${fmt(overspend)} overspend</p>
              ) : (
                <p className="text-xs text-gray-600 mt-0.5">${fmt(plannedSavings)} planned</p>
              )}
            </>
          ) : (
            <p className="text-lg font-bold text-gray-600">—</p>
          )}
        </div>

        <div className="bg-gray-900 rounded-lg p-4">
          <p className="text-xs text-gray-400 mb-1">Budgeted</p>
          <p className={`text-lg font-bold ${totalBudgeted > expectedIncome && expectedIncome > 0 ? 'text-red-400' : 'text-white'}`}>
            ${fmt(totalBudgeted)}
          </p>
        </div>
        <div className="bg-gray-900 rounded-lg p-4">
          <p className="text-xs text-gray-400 mb-1">Spent</p>
          <p className={`text-lg font-bold ${totalSpent > totalBudgeted && totalBudgeted > 0 ? 'text-red-400' : 'text-white'}`}>
            ${fmt(totalSpent)}
          </p>
        </div>
      </div>

      {/* Pie charts */}
      {(budgetedPieData.length > 0 || spentPieData.length > 0) && (
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-gray-900 rounded-lg p-4">
            <p className="text-xs text-gray-400 mb-2">Budget Allocation</p>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={budgetedPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90}>
                  {budgetedPieData.map((entry: { color: string }, i: number) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip formatter={(v: number) => `$${fmt(v)}`} contentStyle={{ background: '#1f2937', border: '1px solid #374151', fontSize: 12 }} itemStyle={{ color: '#f9fafb' }} labelStyle={{ color: '#f9fafb' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-gray-900 rounded-lg p-4">
            <p className="text-xs text-gray-400 mb-2">Actual Spending</p>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={spentPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90}>
                  {spentPieData.map((entry: { color: string }, i: number) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip formatter={(v: number) => `$${fmt(v)}`} contentStyle={{ background: '#1f2937', border: '1px solid #374151', fontSize: 12 }} itemStyle={{ color: '#f9fafb' }} labelStyle={{ color: '#f9fafb' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Income categories */}
      {incomeCategories.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Income</h3>
          {incomeCategories.map((cat: any) => (
            <Fragment key={cat.id}>
              {dragInsertBeforeId === cat.id && dragIdRef.current !== cat.id && (
                <div className="h-0.5 bg-blue-500 rounded mx-1" />
              )}
              {renderCategoryRow(cat, true)}
            </Fragment>
          ))}
          {dragInsertBeforeId === 'income-end' && <div className="h-0.5 bg-blue-500 rounded mx-1" />}
          <div
            className="h-2"
            onDragOver={(e) => { e.preventDefault(); setDragInsertBeforeId('income-end'); }}
            onDrop={() => handleDrop('income-end')}
          />
        </div>
      )}

      {/* Expense categories */}
      <div className="space-y-2">
        {incomeCategories.length > 0 && (
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Expenses</h3>
        )}
        {expenseCategories.map((cat: any) => (
          <Fragment key={cat.id}>
            {dragInsertBeforeId === cat.id && dragIdRef.current !== cat.id && (
              <div className="h-0.5 bg-blue-500 rounded mx-1" />
            )}
            {renderCategoryRow(cat, false)}
          </Fragment>
        ))}
        {dragInsertBeforeId === 'expense-end' && <div className="h-0.5 bg-blue-500 rounded mx-1" />}
        <div
          className="h-2"
          onDragOver={(e) => { e.preventDefault(); setDragInsertBeforeId('expense-end'); }}
          onDrop={() => handleDrop('expense-end')}
        />
        {expenseCategories.length === 0 && (
          <p className="text-gray-500 text-sm">No categories yet. Click "Add Category" to get started.</p>
        )}
      </div>
    </div>
  );
}
