import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';

const now = new Date();

const defaultDateRange = () => {
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const end = now.toISOString().split('T')[0];
  return { startDate: start, endDate: end };
};

interface MonthContextType {
  month: number;
  year: number;
  setMonth: (m: number) => void;
  setYear: (y: number) => void;
  dateRange: { startDate: string; endDate: string };
  setDateRange: (r: { startDate: string; endDate: string }) => void;
}

const MonthContext = createContext<MonthContextType>({} as MonthContextType);

export function MonthProvider({ children }: { children: ReactNode }) {
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [dateRange, setDateRange] = useState(defaultDateRange());

  return (
    <MonthContext.Provider value={{ month, year, setMonth, setYear, dateRange, setDateRange }}>
      {children}
    </MonthContext.Provider>
  );
}

export const useMonthContext = () => useContext(MonthContext);
