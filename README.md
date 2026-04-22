# Abundance Budgeting

A personal finance desktop app for tracking spending, managing budgets, and monitoring net worth. Built as a self-contained Electron app — no accounts, no cloud, your data stays on your machine.

## Features

- **Transaction management** — view, categorize, and edit transactions with split support for shared expenses
- **Budget tracking** — set monthly budgets per category, track flexible vs. essential spending, see what's left at a glance
- **SimpleFIN sync** — connect your bank accounts via SimpleFIN Bridge for automatic transaction syncing
- **CSV import** — manually import transactions, with duplicate detection and auto-categorization
- **Analytics** — spending trends, category breakdowns, net worth over time, and upcoming recurring bills
- **Savings goals** — track progress toward savings targets with contributions pulled from budget
- **Settlements** — track shared expenses and settle up with people
- **Data export** — full JSON backup of all transactions, categories, budgets, accounts, and savings goals
- **Auto-updates** — the app updates itself silently in the background when a new version is released

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop shell | Electron 33 |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| Backend | Node.js, Express, TypeScript |
| Database | SQLite via Prisma ORM |
| Data fetching | TanStack Query (React Query) |
| Charts | Recharts |
| Auto-updater | electron-updater |
| Bank sync | SimpleFIN Bridge API |

## Project Structure

```
budget-app/
├── electron/         # Electron main process
├── frontend/         # React app (Vite)
│   └── src/
│       ├── pages/    # Dashboard, Budget, Transactions, Analytics, Settings
│       └── lib/      # API client, formatters
├── backend/          # Express API server
│   └── src/
│       ├── routes/   # REST endpoints
│       ├── parsers/  # CSV bank statement parsers
│       └── services/ # Auto-categorization logic
└── prisma/           # Database schema and migrations
```

## Development

```bash
# Install dependencies
npm install
cd frontend && npm install
cd backend && npm install

# Run in development
npx electron .

# Build
npm run build:all

# Package installer
npm run dist
```
