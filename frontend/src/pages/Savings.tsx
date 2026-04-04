import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { savings } from '../lib/api';
import { Pencil, Check, X, Trash2, Plus } from 'lucide-react';
import { fmt } from '../lib/format';

const GOAL_COLORS = [
  '#f87171', '#fb923c', '#facc15', '#4ade80',
  '#34d399', '#60a5fa', '#818cf8', '#a78bfa', '#f472b6',
];
const FALLBACK_COLOR = '#6b7280';

export default function Savings() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['savings'], queryFn: savings.list });

  const goals: any[] = data?.goals ?? [];
  const totalSavingsBalance: number = data?.totalSavingsBalance ?? 0;
  const totalAllocatedPercent: number = data?.totalAllocatedPercent ?? 0;
  const unallocatedBalance: number = data?.unallocatedBalance ?? 0;

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', targetAmount: '', allocationPercent: '', color: GOAL_COLORS[0] });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ name: '', targetAmount: '', allocationPercent: '', color: '' });
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const remainingPercent = 100 - totalAllocatedPercent;
  const formPercent = parseFloat(form.allocationPercent) || 0;
  const wouldExceed = formPercent > remainingPercent;

  const createMutation = useMutation({
    mutationFn: () => savings.create({
      name: form.name,
      targetAmount: parseFloat(form.targetAmount),
      allocationPercent: formPercent,
      color: form.color,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['savings'] });
      setForm({ name: '', targetAmount: '', allocationPercent: '', color: GOAL_COLORS[0] });
      setShowForm(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: object }) => savings.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['savings'] });
      setEditingId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => savings.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['savings'] });
      setConfirmDelete(null);
    },
  });

  const startEdit = (goal: any) => {
    setEditingId(goal.id);
    setEditForm({
      name: goal.name,
      targetAmount: String(goal.targetAmount),
      allocationPercent: String(goal.allocationPercent),
      color: goal.color ?? GOAL_COLORS[0],
    });
  };

  const saveEdit = (id: number) => {
    updateMutation.mutate({
      id,
      data: {
        name: editForm.name,
        targetAmount: parseFloat(editForm.targetAmount),
        allocationPercent: parseFloat(editForm.allocationPercent) || 0,
        color: editForm.color,
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Savings Goals</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm"
        >
          <Plus size={15} /> Add Goal
        </button>
      </div>

      {/* Summary bar */}
      <div className="bg-gray-900 rounded-lg p-5 space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Total Savings Balance</span>
          <span className="text-white font-semibold">${fmt(totalSavingsBalance)}</span>
        </div>
        <div className="w-full bg-gray-800 rounded-full h-2.5 overflow-hidden flex">
          {goals.map((g) => (
            <div
              key={g.id}
              style={{ width: `${g.allocationPercent}%`, background: g.color ?? FALLBACK_COLOR }}
              className="h-full"
              title={`${g.name}: ${g.allocationPercent}%`}
            />
          ))}
          <div
            style={{ width: `${Math.max(0, 100 - totalAllocatedPercent)}%` }}
            className="h-full bg-gray-700"
            title="Unallocated"
          />
        </div>
        <div className="flex justify-between text-xs text-gray-500">
          <span>{totalAllocatedPercent.toFixed(0)}% allocated across {goals.length} goal{goals.length !== 1 ? 's' : ''}</span>
          <span className="text-gray-400">Unallocated: ${fmt(unallocatedBalance)}</span>
        </div>
      </div>

      {/* Add goal form */}
      {showForm && (
        <div className="bg-gray-900 rounded-lg p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-300">New Goal</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Goal Name</label>
              <input
                type="text"
                placeholder="e.g. Emergency Fund"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="bg-gray-800 text-white rounded px-3 py-2 text-sm w-full"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Target Amount</label>
              <input
                type="number"
                placeholder="e.g. 10000"
                value={form.targetAmount}
                onChange={(e) => setForm({ ...form, targetAmount: e.target.value })}
                className="bg-gray-800 text-white rounded px-3 py-2 text-sm w-full"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">
                Allocation % of savings
                <span className="text-gray-500 ml-1">({remainingPercent.toFixed(0)}% remaining)</span>
              </label>
              <input
                type="number"
                min={0}
                max={100}
                placeholder="e.g. 25"
                value={form.allocationPercent}
                onChange={(e) => setForm({ ...form, allocationPercent: e.target.value })}
                className={`bg-gray-800 text-white rounded px-3 py-2 text-sm w-full ${wouldExceed ? 'border border-red-500' : ''}`}
              />
              {wouldExceed && (
                <p className="text-xs text-red-400 mt-1">Exceeds remaining {remainingPercent.toFixed(0)}%</p>
              )}
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Color</label>
              <div className="flex gap-2 flex-wrap">
                {GOAL_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setForm({ ...form, color: c })}
                    className={`w-6 h-6 rounded-full border-2 ${form.color === c ? 'border-white' : 'border-transparent'}`}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => createMutation.mutate()}
              disabled={!form.name || !form.targetAmount || wouldExceed || createMutation.isPending}
              className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-4 py-2 rounded text-sm"
            >
              {createMutation.isPending ? 'Saving...' : 'Save Goal'}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="text-gray-400 hover:text-white px-4 py-2 rounded text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Goal cards */}
      <div className="space-y-3">
        {goals.length === 0 && !showForm && (
          <p className="text-gray-500 text-sm">No savings goals yet. Add one to get started.</p>
        )}
        {goals.map((goal) => {
          const progressPct = Math.min(1, goal.progress) * 100;
          const isEditing = editingId === goal.id;

          return (
            <div key={goal.id} className="group bg-gray-900 rounded-lg p-5">
              {isEditing ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs text-gray-400 block mb-1">Name</label>
                      <input
                        type="text"
                        value={editForm.name}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        className="bg-gray-800 text-white rounded px-3 py-1.5 text-sm w-full"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 block mb-1">Target ($)</label>
                      <input
                        type="number"
                        value={editForm.targetAmount}
                        onChange={(e) => setEditForm({ ...editForm, targetAmount: e.target.value })}
                        className="bg-gray-800 text-white rounded px-3 py-1.5 text-sm w-full"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 block mb-1">Allocation %</label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={editForm.allocationPercent}
                        onChange={(e) => setEditForm({ ...editForm, allocationPercent: e.target.value })}
                        className="bg-gray-800 text-white rounded px-3 py-1.5 text-sm w-full"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Color</label>
                    <div className="flex gap-2">
                      {GOAL_COLORS.map((c) => (
                        <button
                          key={c}
                          onClick={() => setEditForm({ ...editForm, color: c })}
                          className={`w-6 h-6 rounded-full border-2 ${editForm.color === c ? 'border-white' : 'border-transparent'}`}
                          style={{ background: c }}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => saveEdit(goal.id)} className="text-green-400 hover:text-green-300 flex items-center gap-1 text-sm">
                      <Check size={14} /> Save
                    </button>
                    <button onClick={() => setEditingId(null)} className="text-gray-500 hover:text-white flex items-center gap-1 text-sm">
                      <X size={14} /> Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ background: goal.color ?? FALLBACK_COLOR }} />
                      <span className="font-medium text-white">{goal.name}</span>
                    </div>
                    <div className="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => startEdit(goal)} className="text-gray-500 hover:text-white">
                        <Pencil size={14} />
                      </button>
                      {confirmDelete === goal.id ? (
                        <span className="flex items-center gap-2 text-xs">
                          <span className="text-gray-400">Delete?</span>
                          <button onClick={() => deleteMutation.mutate(goal.id)} className="text-red-400 hover:text-red-300 font-medium">Yes</button>
                          <button onClick={() => setConfirmDelete(null)} className="text-gray-400 hover:text-white">No</button>
                        </span>
                      ) : (
                        <button onClick={() => setConfirmDelete(goal.id)} className="text-gray-500 hover:text-red-400">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="w-full bg-gray-800 rounded-full h-2 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${progressPct}%`, background: goal.color ?? FALLBACK_COLOR }}
                    />
                  </div>

                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">
                      ${fmt(goal.balance)}
                      {goal.withdrawn > 0 && <span className="text-gray-600 text-xs ml-1">(${fmt(goal.withdrawn)} withdrawn)</span>}
                    </span>
                    <span className="text-gray-500">${fmt(goal.targetAmount)} goal</span>
                  </div>

                  <div className="flex justify-between text-xs text-gray-600">
                    <span>{goal.allocationPercent}% of savings · ${fmt(goal.allocated)} allocated</span>
                    <span>{progressPct.toFixed(0)}% there</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
