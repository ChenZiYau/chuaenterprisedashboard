"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { QuickEntryModal } from "@/components/QuickEntryModal";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ActionMenu, Pagination, usePagination } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { useData } from "@/lib/DataContext";
import { deleteResource, saveResource } from "@/lib/clientApi";
import { MONTHS, fmtMYR, type RevenueEntry } from "@/lib/data";
import { buildReceiptData, openReceiptWindow } from "@/lib/receipt";

const CUR_YEAR = new Date().getFullYear();

function entryTotal(e: RevenueEntry) {
  return e.rental + (e.electricity ?? 0) + (e.other ?? 0);
}

export default function InvoicesPage() {
  const { properties, revenueEntries, getUnit, getUnitsForProperty } = useData();
  const toast = useToast();
  const router = useRouter();
  const [entries, setEntries] = useState(revenueEntries);
  useEffect(() => setEntries(revenueEntries), [revenueEntries]);
  const [editTarget, setEditTarget] = useState<RevenueEntry | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RevenueEntry | null>(null);
  const generating = useRef(new Set<string>());
  const [fromMonth, setFromMonth] = useState(`${CUR_YEAR}-01`);
  const [toMonth, setToMonth] = useState(`${CUR_YEAR}-12`);
  const [search, setSearch] = useState("");
  const [filterProp, setFilterProp] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries
      .filter((e) => {
        const key = `${e.year}-${String(e.month).padStart(2, "0")}`;
        if (fromMonth && key < fromMonth) return false;
        if (toMonth && key > toMonth) return false;
        return true;
      })
      .filter((e) => filterProp === "all" || e.propertyId === filterProp)
      .filter((e) => filterStatus === "all" || e.status === filterStatus)
      .filter((e) => {
        if (!q) return true;
        const prop = properties.find((p) => p.id === e.propertyId);
        const unit = getUnit(e.unitId);
        return (
          e.invoiceNumber.toLowerCase().includes(q) ||
          (prop?.name ?? "").toLowerCase().includes(q) ||
          (unit?.name ?? "").toLowerCase().includes(q) ||
          (unit?.tenantName ?? "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => (a.year !== b.year ? b.year - a.year : b.month - a.month));
  }, [entries, fromMonth, toMonth, search, filterProp, filterStatus, properties, getUnit]);

  const totalBilled = filtered.reduce((s, e) => s + entryTotal(e), 0);
  const totalOutstanding = filtered
    .filter((e) => e.status !== "paid")
    .reduce((s, e) => s + entryTotal(e), 0);

  const resetKey = `${fromMonth}|${toMonth}|${search}|${filterProp}|${filterStatus}`;
  const { page, setPage, totalPages, total, pageSize, pageItems } = usePagination(filtered, 10, resetKey);

  function receiptFor(entry: RevenueEntry) {
    const prop = properties.find((p) => p.id === entry.propertyId);
    const unit = getUnit(entry.unitId);
    return buildReceiptData(entry, prop, unit, unit?.tenantName, entry.invoiceNumber);
  }

  async function generateInvoice(entry: RevenueEntry) {
    if (generating.current.has(entry.id)) return;
    const receiptWindow = window.open("", "_blank", "width=840,height=1000");
    if (!receiptWindow) {
      toast.info("Allow pop-ups to open the receipt, then try again.");
      return;
    }
    generating.current.add(entry.id);
    try {
      const res = await saveResource<{ entry: RevenueEntry }>(`/api/revenue/${encodeURIComponent(entry.id)}`, "PATCH", { invoiceGenerated: true });
      if (!res.ok) {
        receiptWindow.close();
        toast.info(res.error);
        return;
      }
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

  async function deleteInvoice(entry: RevenueEntry) {
    const res = await deleteResource(`/api/revenue/${encodeURIComponent(entry.id)}`);
    if (!res.ok) { toast.info(res.error); return; }
    setEntries((prev) => prev.filter((x) => x.id !== entry.id));
    setDeleteTarget(null);
    router.refresh();
    toast.deleted(`Invoice ${entry.invoiceNumber} and revenue entry deleted`);
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Filters */}
      <div className="ui-card p-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="month"
            className="ui-field w-[150px]"
            value={fromMonth}
            onChange={(e) => setFromMonth(e.target.value)}
            aria-label="From month"
          />
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>to</span>
          <input
            type="month"
            className="ui-field w-[150px]"
            value={toMonth}
            onChange={(e) => setToMonth(e.target.value)}
            aria-label="To month"
          />

          <div className="ml-auto flex flex-wrap items-center gap-3">
            <select
              className="ui-select min-w-[160px]"
              aria-label="Filter by property"
              value={filterProp}
              onChange={(e) => setFilterProp(e.target.value)}
            >
              <option value="all">All Properties</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>

            <select
              className="ui-select min-w-[130px]"
              aria-label="Filter by status"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="all">All Statuses</option>
              <option value="paid">Paid</option>
              <option value="partial">Partial</option>
              <option value="pending">Pending</option>
              <option value="overdue">Overdue</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <input
            type="search"
            className="ui-input w-auto min-w-[200px] flex-1 max-w-[360px]"
            placeholder="Search invoice #, property, unit, tenant..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="ml-auto flex items-center gap-4 text-sm font-semibold">
            <span style={{ color: "var(--danger)" }}>
              Outstanding: {fmtMYR(totalOutstanding)}
            </span>
            <span style={{ color: "var(--text-primary)" }}>
              Billed: {fmtMYR(totalBilled)}
            </span>
          </div>
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="ui-card p-12 text-center">
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            No invoices found.
          </p>
        </div>
      ) : (
        <div className="ui-card ui-scroll overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead style={{ background: "var(--surface-muted)" }}>
              <tr style={{ color: "var(--text-faint)" }}>
                <th className="text-left text-xs uppercase tracking-wider px-5 py-3">Invoice ID</th>
                <th className="text-left text-xs uppercase tracking-wider px-4 py-3">Tenant</th>
                <th className="text-left text-xs uppercase tracking-wider px-4 py-3">Property</th>
                <th className="text-left text-xs uppercase tracking-wider px-4 py-3">Unit</th>
                <th className="text-left text-xs uppercase tracking-wider px-4 py-3">Period</th>
                <th className="text-right text-xs uppercase tracking-wider px-4 py-3">Amount</th>
                <th className="text-center text-xs uppercase tracking-wider px-4 py-3">Invoice Generation</th>
                <th className="text-right text-xs uppercase tracking-wider px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((entry) => {
                const prop = properties.find((p) => p.id === entry.propertyId);
                const unit = getUnit(entry.unitId);
                return (
                  <tr
                    key={entry.id}
                    className="border-t hover:bg-[var(--surface-muted)] transition-colors"
                    style={{ borderColor: "var(--border-soft)" }}
                  >
                    <td className="px-5 py-3 font-mono text-xs" style={{ color: "var(--text-primary)" }}>
                      {entry.invoiceNumber}
                    </td>
                    <td className="px-4 py-3" style={{ color: "var(--text-secondary)" }}>
                      {unit?.tenantName ?? "-"}
                    </td>
                    <td className="px-4 py-3 font-medium" style={{ color: "var(--text-primary)" }}>
                      {prop?.name ?? entry.propertyId}
                    </td>
                    <td className="px-4 py-3" style={{ color: "var(--text-secondary)" }}>
                      {unit?.name ?? entry.unitId}
                    </td>
                    <td className="px-4 py-3" style={{ color: "var(--text-secondary)" }}>
                      {MONTHS[entry.month - 1]} {entry.year}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
                      {fmtMYR(entryTotal(entry))}
                    </td>
                    <td
                      className="px-4 py-3 text-center font-semibold"
                      style={{ color: entry.invoiceGenerated ? "var(--success)" : "var(--warning)" }}
                    >
                      {entry.invoiceGenerated ? "Generated" : "Pending"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => generateInvoice(entry)}
                          className="ui-btn ui-btn-primary text-xs px-3 py-1.5"
                          title="Generate receipt"
                        >
                          Gen
                        </button>
                        <ActionMenu
                          label="Invoice actions"
                          items={[
                            { label: "Preview", onClick: () => previewInvoice(entry) },
                            { label: "Edit", onClick: () => setEditTarget(entry) },
                            {
                              label: "Delete",
                              danger: true,
                              onClick: () => setDeleteTarget(entry),
                            },
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
                <td colSpan={5} className="px-5 py-3 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                  Total ({filtered.length} {filtered.length === 1 ? "invoice" : "invoices"})
                </td>
                <td className="px-4 py-3 text-right font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>
                  {fmtMYR(totalBilled)}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {filtered.length > 0 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          pageSize={pageSize}
          onPage={setPage}
          unit="invoice"
        />
      )}
      {editTarget && properties.find((p) => p.id === editTarget.propertyId) && (
        <QuickEntryModal open onClose={() => setEditTarget(null)}
          property={properties.find((p) => p.id === editTarget.propertyId)!}
          units={getUnitsForProperty(editTarget.propertyId)} initialRevenueEntry={editTarget} />
      )}
      {deleteTarget && (
        <ConfirmDialog open title="Delete invoice and revenue entry"
          message="This permanently deletes the underlying revenue entry and changes financial totals. This cannot be undone."
          confirmLabel="Delete revenue entry" onConfirm={() => deleteInvoice(deleteTarget)} onClose={() => setDeleteTarget(null)} />
      )}
    </div>
  );
}
