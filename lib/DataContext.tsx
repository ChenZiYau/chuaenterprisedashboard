"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
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
  /** Hide a property client-side while its deletion is pending (undoable). */
  hideProperty: (id: string) => void;
  /** Bring a hidden property back (deletion was undone or failed). */
  unhideProperty: (id: string) => void;
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
  // Ids of properties with a pending (undoable) delete — filtered out of every
  // consumer until the delete commits server-side or is undone.
  const [hiddenIds, setHiddenIds] = useState<ReadonlySet<string>>(new Set());
  const hideProperty = useCallback((id: string) => {
    setHiddenIds((prev) => new Set(prev).add(id));
  }, []);
  const unhideProperty = useCallback((id: string) => {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const ctx = useMemo<DataContextValue>(() => {
    const properties = value.properties.filter((p) => !hiddenIds.has(p.id));
    const units = value.units;
    return {
      ...value,
      properties,
      getProperty: (id) => properties.find((p) => p.id === id),
      getUnit: (id) => units.find((u) => u.id === id),
      getUnitsForProperty: (propertyId) => units.filter((u) => u.propertyId === propertyId),
      hideProperty,
      unhideProperty,
    };
  }, [value, hiddenIds, hideProperty, unhideProperty]);

  return <DataContext.Provider value={ctx}>{children}</DataContext.Provider>;
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used within a DataProvider");
  return ctx;
}
