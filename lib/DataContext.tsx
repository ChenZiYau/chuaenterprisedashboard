"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
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
  upsertProperty: (property: Property, units: Unit[]) => void;
  updateUnit: (unit: Unit) => void;
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
  const [data, setData] = useState(value);
  useEffect(() => setData(value), [value]);
  const upsertProperty = useCallback((property: Property, units: Unit[]) => {
    setData((prev) => ({
      ...prev,
      properties: prev.properties.some((p) => p.id === property.id)
        ? prev.properties.map((p) => p.id === property.id ? property : p)
        : [...prev.properties, property],
      units: [...prev.units.filter((u) => u.propertyId !== property.id), ...units],
    }));
  }, []);
  const updateUnit = useCallback((unit: Unit) => {
    setData((prev) => ({ ...prev, units: prev.units.map((u) => u.id === unit.id ? unit : u) }));
  }, []);
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
    const properties = data.properties.filter((p) => !hiddenIds.has(p.id));
    const hiddenUnitIds = new Set(data.units.filter((u) => hiddenIds.has(u.propertyId)).map((u) => u.id));
    const units = data.units.filter((u) => !hiddenIds.has(u.propertyId));
    return {
      ...data,
      properties,
      units,
      tenants: data.tenants.filter((t) => !hiddenUnitIds.has(t.unitId)),
      revenueEntries: data.revenueEntries.filter((e) => !hiddenIds.has(e.propertyId)),
      expenseEntries: data.expenseEntries.filter((e) => !hiddenIds.has(e.propertyId)),
      getProperty: (id) => properties.find((p) => p.id === id),
      getUnit: (id) => units.find((u) => u.id === id),
      getUnitsForProperty: (propertyId) => units.filter((u) => u.propertyId === propertyId),
      hideProperty,
      unhideProperty,
      upsertProperty,
      updateUnit,
    };
  }, [data, hiddenIds, hideProperty, unhideProperty, upsertProperty, updateUnit]);

  return <DataContext.Provider value={ctx}>{children}</DataContext.Provider>;
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used within a DataProvider");
  return ctx;
}
