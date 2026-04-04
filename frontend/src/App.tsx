import React from 'react';
import { Routes, Route, NavLink } from 'react-router-dom';
import { MonthProvider } from './lib/MonthContext';
import Dashboard from './pages/Dashboard';
import Transactions from './pages/Transactions';
import Budget from './pages/Budget';
import Settings from './pages/Settings';
import Savings from './pages/Savings';
import Settlements from './pages/Settlements';
import Analytics from './pages/Analytics';

const navItems = [
  { to: '/', label: 'Dashboard' },
  { to: '/transactions', label: 'Transactions' },
  { to: '/budget', label: 'Budget' },
  { to: '/savings', label: 'Savings' },
  { to: '/analytics', label: 'Analytics' },
  { to: '/settings', label: 'Settings' },
];

export default function App() {
  return (
    <MonthProvider>
    <div className="flex flex-col h-screen">
      {/* Title bar drag region */}
      <div
        className="w-full bg-gray-900 shrink-0"
        style={{ height: 40, WebkitAppRegion: 'drag' } as React.CSSProperties}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <nav className="w-48 bg-gray-900 flex flex-col p-4 gap-1 shrink-0">
          <h1 className="text-lg font-bold mb-6 text-white select-none">Budget</h1>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `px-3 py-2 rounded text-sm transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Main content */}
        <main className="flex-1 overflow-auto p-6">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/budget" element={<Budget />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/savings" element={<Savings />} />
            <Route path="/settlements" element={<Settlements />} />
            <Route path="/analytics" element={<Analytics />} />
          </Routes>
        </main>
      </div>
    </div>
    </MonthProvider>
  );
}
