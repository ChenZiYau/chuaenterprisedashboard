"use client";

import { createContext, useContext, useMemo } from "react";
import type {
  Property,
  Unit,
  Tenant,
  RevenueEntry,
  ExpenseEntry,
} from "@/lib/data";

export type DashboardData = {
  properties: Property[];
  units: Unit[];
  tenants: Tenant[];
  revenueEntries: RevenueEntry[];
  expenseEntries: ExpenseEntry[];
};

type DataContextValue = DashboardData & {
  getProperty: (id: string) => Property | undefined;
  getUnit: (id: string) => Unit | undefined;
  getUnitsForProperty: (propertyId: string) => Unit[];
};

const DataContext = createContext<DataContextValue | null>(null);

/** Wraps the dashboard with the live Supabase data fetched server-side and
 *  passed down. Components read it via useData() instead of importing the old
 *  static arrays, so a single request-time fetch feeds the whole tree. */
export function DataProvider({
  value,
  children,
}: {
  value: DashboardData;
  children: React.ReactNode;
}) {
  const ctx = useMemo<DataContextValue>(() => {
    const { properties, units } = value;
    return {
      ...value,
      getProperty: (id) => properties.find((p) => p.id === id),
      getUnit: (id) => units.find((u) => u.id === id),
      getUnitsForProperty: (propertyId) => units.filter((u) => u.propertyId === propertyId),
    };
  }, [value]);

  return <DataContext.Provider value={ctx}>{children}</DataContext.Provider>;
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used within a DataProvider");
  return ctx;
}
