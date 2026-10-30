"use client";

import { useRef, useState } from "react";
import { useData } from "@/lib/DataContext";
import { useToast } from "@/components/Toast";
import { withScheduledRent } from "@/lib/tenantRent";
import type { RevenueEntry, ExpenseEntry } from "@/lib/data";

export function AccountsExportButton({ fromDate, toDate, propertyId = "all", displayed, source, filters }: {
  fromDate: string; toDate: string; propertyId?: string;
  displayed: RevenueEntry[] | ExpenseEntry[]; source: "revenue" | "expenses"; filters: string;
}) {
  const data = useData();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  async function download() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      const { downloadAccounts } = await import("@/lib/accountsExport");
      await downloadAccounts({
        properties: data.properties.filter(p => propertyId === "all" || p.id === propertyId),
        units: data.units,
        revenue: withScheduledRent(data.revenueEntries, data.tenants, data.units, fromDate, toDate),
        expenses: data.expenseEntries, fromDate, toDate, displayed, source, filters,
      });
      toast.created("Excel accounts downloaded");
    } catch {
      toast.info("Could not export accounts. Check the date range and try again.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return <div className="flex flex-col items-start gap-1">
    <button type="button" className="ui-btn" disabled={busy || !!(fromDate && toDate && fromDate > toDate)} onClick={download}>{busy ? "Exporting…" : "Export Excel accounts"}</button>
    <span className="text-xs max-w-sm" style={{ color: "var(--text-muted)" }}>Includes displayed rows and complete property accounts for these dates.</span>
  </div>;
}
