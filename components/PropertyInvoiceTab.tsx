"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ActionMenu, Pagination, usePagination } from "@/components/ui";
import { buildReceiptData, openReceiptWindow } from "@/lib/receipt";
import { useToast } from "@/components/Toast";
import { useData } from "@/lib/DataContext";
import { deleteResource, saveResource } from "@/lib/clientApi";
import { MONTHS, fmtMYR, type Property, type RevenueEntry } from "@/lib/data";

const CUR_YEAR = new Date().getFullYear();

function entryTotal(e: RevenueEntry) {
  return e.rental + (e.electricity ?? 0) + (e.other ?? 0);
}

export function PropertyInvoiceTab({ property }: { property: Property }) {
  const { revenueEntries, getUnit, getUnitsForProperty } = useData();
  const toast = useToast();
  const router = useRouter();
  const [entries, setEntries] = useState(revenueEntries);
  useEffect(() => setEntries(revenueEntries), [revenueEntries]);
  const [deleteTarget, setDeleteTarget] = useState<RevenueEntry | null>(null);
  const generating = useRef(new Set<string>());

  async function deleteEntry(entry: RevenueEntry) {
    // Invoices are revenue rows — deleting one removes the entry.
    const res = await deleteResource(`/api/revenue/${encodeURIComponent(entry.id)}`);
    if (res.ok) {
      setEntries((prev) => prev.filter((x) => x.id !== entry.id));
      setDeleteTarget(null);
      router.refresh();
      toast.deleted(`Invoice ${entry.invoiceNumber} and revenue entry deleted`);
    } else {
      toast.info(res.error);
    }
  }
  const [fromMonth, setFromMonth] = useState(`${CUR_YEAR}-01`);
  const [toMonth, setToMonth] = useState(`${CUR_YEAR}-12`);
  const [search, setSearch] = useState("");
  const [filterUnit, setFilterUnit] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  const isRoom = property.rentalModel === "room_rental";
  const rooms = getUnitsForProperty(property.id);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries
      .filter((e) => e.propertyId === property.id)
      .filter((e) => {
        const key = `${e.year}-${String(e.month).padStart(2, "0")}`;
        if (fromMonth && key < fromMonth) return false;
        if (toMonth && key > toMonth) return false;
        return true;
      })
      .filter((e) => filterUnit === "all" || e.unitId === filterUnit)
      .filter((e) => filterStatus === "all" || e.status === filterStatus)
      .filter((e) => {
        if (!q) return true;
        const unit = getUnit(e.unitId);
        return (
          e.invoiceNumber.toLowerCase().includes(q) ||
          (unit?.name ?? "").toLowerCase().includes(q) ||
          (unit?.tenantName ?? "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => (a.year !== b.year ? b.year - a.year : b.month - a.month));
  }, [entries, property.id, fromMonth, toMonth, search, filterUnit, filterStatus, getUnit]);

  const totalBilled = filtered.reduce((s, e) => s + entryTotal(e), 0);
  const totalOutstanding = filtered.filter((e) => e.status !== "paid").reduce((s, e) => s + entryTotal(e), 0);

  const resetKey = `${property.id}|${fromMonth}|${toMonth}|${search}|${filterUnit}|${filterStatus}`;
  const { page, setPage, totalPages, total, pageSize, pageItems } = usePagination(filtered, 10, resetKey);

  function receiptFor(entry: RevenueEntry) {
    const unit = getUnit(entry.unitId);
    return buildReceiptData(entry, property, unit, unit?.tenantName, entry.invoiceNumber);
  }

  async function generateInvoice(entry: RevenueEntry) {
    if (generating.current.has(entry.id)) return;
    const receiptWindow = window.open("", "_blank", "width=840,height=1000");
    if (!receiptWindow) { toast.info("Allow pop-ups to open the receipt, then try again."); return; }
    generating.current.add(entry.id);
    try {
      const res = await saveResource<{ entry: RevenueEntry }>(`/api/revenue/${encodeURIComponent(entry.id)}`, "PATCH", { invoiceGenerated: true });
      if (!res.ok) { receiptWindow.close(); toast.info(res.error); return; }
      setEntries((prev) => prev.map((e) => e.id === entry.id ? res.data.entry : e));
      openReceiptWindow(receiptFor(res.data.entry), true, receiptWindow);
      router.refresh();
      toast.updated(`Invoice ${res.data.entry.invoiceNumber} generated`);
    } finally {
      generating.current.delete(entry.id);
    }
  }

  function previewInvoice(entry: RevenueEntry) {
    if (!openReceiptWindow(receiptFor(entry), false)) toast.info("Allow pop-ups to preview the receipt.");
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Filters */}
      <div className="ui-card p-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <input type="month" className="ui-field w-[150px]" value={fromMonth} onChange={(e) => setFromMonth(e.target.value)} aria-label="From month" />
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>to</span>
          <input type="month" className="ui-field w-[150px]" value={toMonth} onChange={(e) => setToMonth(e.target.value)} aria-label="To month" />

          <div className="ml-auto flex flex-wrap items-center gap-3">
            {isRoom && rooms.length > 0 && (
              <select className="ui-select min-w-[160px]" aria-label="Filter by room" value={filterUnit} onChange={(e) => setFilterUnit(e.target.value)}>
                <option value="all">All Rooms</option>
                {rooms.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            )}
            <select className="ui-select min-w-[130px]" aria-label="Filter by status" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="all">All Statuses</option>
              <option value="paid">Paid</option>
              <option value="partial">Partial</option>
              <option value="pending">Pending</option>
              <option value="overdue">Overdue</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <input type="search" className="ui-input w-auto min-w-[200px] flex-1 max-w-[360px]" placeholder="Search invoice #, unit, tenant..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="ml-auto flex items-center gap-4 text-sm font-semibold">
            <span style={{ color: "var(--danger)" }}>Outstanding: {fmtMYR(totalOutstanding)}</span>
            <span style={{ color: "var(--text-primary)" }}>Billed: {fmtMYR(totalBilled)}</span>
          </div>
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="ui-card p-12 text-center">
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>No invoices found.</p>
        </div>
      ) : (
        <div className="ui-card ui-scroll overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead style={{ background: "var(--surface-muted)" }}>
              <tr style={{ color: "var(--text-faint)" }}>
                <th className="text-left text-xs uppercase tracking-wider px-5 py-3">Invoice ID</th>
                <th className="text-left text-xs uppercase tracking-wider px-4 py-3">Tenant</th>
                <th className="text-left text-xs uppercase tracking-wider px-4 py-3">Unit</th>
                <th className="text-left text-xs uppercase tracking-wider px-4 py-3">Period</th>
                <th className="text-right text-xs uppercase tracking-wider px-4 py-3">Amount</th>
                <th className="text-center text-xs uppercase tracking-wider px-4 py-3">Invoice Generation</th>
                <th className="text-right text-xs uppercase tracking-wider px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((entry) => {
                const unit = getUnit(entry.unitId);
                return (
                  <tr key={entry.id} className="border-t hover:bg-[var(--surface-muted)] transition-colors" style={{ borderColor: "var(--border-soft)" }}>
                    <td className="px-5 py-3 font-mono text-xs" style={{ color: "var(--text-primary)" }}>{entry.invoiceNumber}</td>
                    <td className="px-4 py-3" style={{ color: "var(--text-secondary)" }}>{unit?.tenantName ?? "-"}</td>
                    <td className="px-4 py-3" style={{ color: "var(--text-secondary)" }}>{unit?.name ?? entry.unitId}</td>
                    <td className="px-4 py-3" style={{ color: "var(--text-secondary)" }}>{MONTHS[entry.month - 1]} {entry.year}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>{fmtMYR(entryTotal(entry))}</td>
                    <td className="px-4 py-3 text-center font-semibold" style={{ color: entry.invoiceGenerated ? "var(--success)" : "var(--warning)" }}>{entry.invoiceGenerated ? "Generated" : "Pending"}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button type="button" onClick={() => generateInvoice(entry)} className="ui-btn ui-btn-primary text-xs px-3 py-1.5" title="Generate receipt">Gen</button>
                        <ActionMenu
                          label="Invoice actions"
                          items={[
                            { label: "Preview", onClick: () => previewInvoice(entry) },
                            { label: "Delete", danger: true, onClick: () => setDeleteTarget(entry) },
                          ]}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot style={{ background: "var(--surface-muted)" }}>
              <tr className="border-t" style={{ borderColor: "var(--border-soft)" }}>
                <td colSpan={4} className="px-5 py-3 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Total ({filtered.length} {filtered.length === 1 ? "invoice" : "invoices"})</td>
                <td className="px-4 py-3 text-right font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>{fmtMYR(totalBilled)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {filtered.length > 0 && (
        <Pagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} onPage={setPage} unit="invoice" unitPlural="invoices" />
      )}
      {deleteTarget && (
        <ConfirmDialog open title="Delete invoice and revenue entry"
          message="This permanently deletes the underlying revenue entry and changes financial totals. This cannot be undone."
          confirmLabel="Delete revenue entry" onConfirm={() => deleteEntry(deleteTarget)} onClose={() => setDeleteTarget(null)} />
      )}
    </div>
  );
}
