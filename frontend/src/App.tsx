import { Routes, Route, NavLink } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Transactions from './pages/Transactions';
import Budget from './pages/Budget';
import Accounts from './pages/Accounts';
import Savings from './pages/Savings';
import Settlements from './pages/Settlements';
import Import from './pages/Import';
import CategoryReview from './pages/CategoryReview';

const navItems = [
  { to: '/', label: 'Dashboard' },
  { to: '/transactions', label: 'Transactions' },
  { to: '/budget', label: 'Budget' },
  { to: '/accounts', label: 'Accounts' },
  { to: '/savings', label: 'Savings' },
  { to: '/settlements', label: 'Splits' },
  { to: '/import', label: 'Import' },
  { to: '/review', label: 'Review' },
];

export default function App() {
  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <nav className="w-48 bg-gray-900 flex flex-col p-4 gap-1 shrink-0">
        <h1 className="text-lg font-bold mb-6 text-white">Budget</h1>
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
          <Route path="/accounts" element={<Accounts />} />
          <Route path="/savings" element={<Savings />} />
          <Route path="/settlements" element={<Settlements />} />
          <Route path="/import" element={<Import />} />
          <Route path="/review" element={<CategoryReview />} />
        </Routes>
      </main>
    </div>
  );
}
