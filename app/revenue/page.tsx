"use client";

import { useMemo, useState } from "react";
import { ActionMenu, DateField, Pagination, usePagination } from "@/components/ui";
import { QuickEntryModal } from "@/components/QuickEntryModal";
import { useToast } from "@/components/Toast";
import { useData } from "@/lib/DataContext";
import {
  MONTHS,
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
  fmtMYR,
  type PaymentStatus,
  type RevenueEntry,
} from "@/lib/data";

const CUR_YEAR = 2026;

const STATUS_COLOR: Record<PaymentStatus, string> = {
  paid: "var(--success)",
  partial: "var(--warning)",
  pending: "var(--warning)",
  overdue: "var(--danger)",
};

function entryTotal(e: RevenueEntry) {
  return e.rental + (e.electricity ?? 0) + (e.other ?? 0);
}

export default function RevenuePage() {
  const { properties, units, revenueEntries, getUnit, getUnitsForProperty } = useData();
  const toast = useToast();
  const [entries, setEntries] = useState(revenueEntries);
  const [entryOpen, setEntryOpen] = useState(false);
  const [fromDate, setFromDate] = useState(`${CUR_YEAR}-01-01`);
  const [toDate, setToDate] = useState(`${CUR_YEAR}-12-31`);
  const [search, setSearch] = useState("");
  const [filterProp, setFilterProp] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries
      .filter((e) => (!fromDate || e.paymentDate >= fromDate) && (!toDate || e.paymentDate <= toDate))
      .filter((e) => filterProp === "all" || e.propertyId === filterProp)
      .filter((e) => filterStatus === "all" || e.status === filterStatus)
      .filter((e) => {
        if (!q) return true;
        const prop = properties.find((p) => p.id === e.propertyId);
        const unit = getUnit(e.unitId);
        return (
          (prop?.name ?? "").toLowerCase().includes(q) ||
          (unit?.name ?? "").toLowerCase().includes(q) ||
          (unit?.tenantName ?? "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => (a.year !== b.year ? b.year - a.year : b.month - a.month));
  }, [entries, fromDate, toDate, search, filterProp, filterStatus, properties, getUnit]);

  const totalRevenue = filtered.reduce((s, e) => s + entryTotal(e), 0);

  const resetKey = `${fromDate}|${toDate}|${search}|${filterProp}|${filterStatus}`;
  const { page, setPage, totalPages, total, pageSize, pageItems } = usePagination(filtered, 10, resetKey);

  return (
    <div className="flex flex-col gap-6">
      {/* Action bar */}
      <div className="flex justify-end">
        <button type="button" className="ui-btn ui-btn-primary" onClick={() => setEntryOpen(true)}>
          + Enter Revenue
        </button>
      </div>

      {/* Quick Entry popup — pick a property in the header, then record revenue */}
      {entryOpen && (
        <QuickEntryModal
          open
          onClose={() => setEntryOpen(false)}
          property={properties[0]}
          units={getUnitsForProperty(properties[0].id)}
          selectableProperties={properties}
          allUnits={units}
          initialTab="revenue"
        />
      )}

      {/* Filters */}
      <div className="ui-card p-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <DateField
            className="ui-field w-[150px]"
            value={fromDate}
            onChange={setFromDate}
            max={toDate || undefined}
            ariaLabel="From date"
            placeholder="From"
          />
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>to</span>
          <DateField
            className="ui-field w-[150px]"
            value={toDate}
            onChange={setToDate}
            min={fromDate || undefined}
            ariaLabel="To date"
            placeholder="To"
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
            placeholder="Search property, unit, tenant..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="ml-auto text-sm font-semibold" style={{ color: "var(--success)" }}>
            Total: {fmtMYR(totalRevenue)}
          </div>
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="ui-card p-12 text-center">
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            No revenue entries found.
          </p>
        </div>
      ) : (
        <div className="ui-card ui-scroll overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead style={{ background: "var(--surface-muted)" }}>
              <tr style={{ color: "var(--text-faint)" }}>
                <th className="text-center text-xs uppercase tracking-wider px-5 py-3">Tenant Name</th>
                <th className="text-center text-xs uppercase tracking-wider px-4 py-3">Property</th>
                <th className="text-center text-xs uppercase tracking-wider px-4 py-3">Unit</th>
                <th className="text-center text-xs uppercase tracking-wider px-4 py-3">Month</th>
                <th className="text-center text-xs uppercase tracking-wider px-4 py-3">Rental</th>
                <th className="text-center text-xs uppercase tracking-wider px-4 py-3">Electricity</th>
                <th className="text-center text-xs uppercase tracking-wider px-4 py-3">Other</th>
                <th className="text-center text-xs uppercase tracking-wider px-4 py-3">Total</th>
                <th className="text-center text-xs uppercase tracking-wider px-4 py-3">Method</th>
                <th className="text-center text-xs uppercase tracking-wider px-4 py-3">Status</th>
                <th className="text-center text-xs uppercase tracking-wider px-4 py-3">Invoice</th>
                <th
                  className="text-center text-xs uppercase tracking-wider px-3 py-3 sticky right-0"
                  style={{ background: "var(--surface-muted)", borderLeft: "1px solid var(--border-soft)" }}
                >
                  Action
                </th>
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
                    <td
                      className="px-5 py-3 text-center font-medium"
                      style={{ color: unit?.tenantName ? "var(--text-primary)" : "var(--text-faint)" }}
                    >
                      {unit?.tenantName ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-center font-medium" style={{ color: "var(--text-primary)" }}>
                      {prop?.name ?? entry.propertyId}
                    </td>
                    <td className="px-4 py-3 text-center" style={{ color: "var(--text-secondary)" }}>
                      {unit?.name ?? entry.unitId}
                    </td>
                    <td className="px-4 py-3 text-center" style={{ color: "var(--text-secondary)" }}>
                      {MONTHS[entry.month - 1]} {entry.year}
                    </td>
                    <td className="px-4 py-3 text-center tabular-nums" style={{ color: "var(--text-secondary)" }}>
                      {fmtMYR(entry.rental)}
                    </td>
                    <td className="px-4 py-3 text-center tabular-nums" style={{ color: "var(--text-secondary)" }}>
                      {entry.electricity != null ? fmtMYR(entry.electricity) : "-"}
                    </td>
                    <td className="px-4 py-3 text-center tabular-nums" style={{ color: "var(--text-secondary)" }}>
                      {entry.other != null && entry.other > 0 ? fmtMYR(entry.other) : "-"}
                    </td>
                    <td className="px-4 py-3 text-center font-semibold tabular-nums" style={{ color: "var(--success)" }}>
                      {fmtMYR(entryTotal(entry))}
                    </td>
                    <td className="px-4 py-3 text-center" style={{ color: "var(--text-muted)" }}>
                      {PAYMENT_METHOD_LABEL[entry.method]}
                    </td>
                    <td className="px-4 py-3 text-center font-semibold" style={{ color: STATUS_COLOR[entry.status] }}>
                      {PAYMENT_STATUS_LABEL[entry.status]}
                    </td>
                    <td
                      className="px-4 py-3 text-center font-semibold"
                      style={{ color: entry.invoiceGenerated ? "var(--success)" : "var(--warning)" }}
                    >
                      {entry.invoiceGenerated ? "Generated" : "Pending"}
                    </td>
                    <td
                      className="px-3 py-3 sticky right-0 z-[1]"
                      style={{ background: "var(--surface)", borderLeft: "1px solid var(--border-soft)" }}
                    >
                      <div className="flex items-center justify-center">
                        <ActionMenu
                          label="Revenue actions"
                          items={[
                            { label: "Edit", onClick: () => {} },
                            {
                              label: "Delete",
                              danger: true,
                              onClick: () => {
                                setEntries((prev) => prev.filter((x) => x.id !== entry.id));
                                toast.deleted("Revenue entry deleted");
                              },
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
                <td colSpan={7} className="px-5 py-3 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                  Total ({filtered.length} {filtered.length === 1 ? "entry" : "entries"})
                </td>
                <td className="px-4 py-3 text-center font-bold tabular-nums" style={{ color: "var(--success)" }}>
                  {fmtMYR(totalRevenue)}
                </td>
                <td colSpan={4} />
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
          unit="entry"
          unitPlural="entries"
        />
      )}
    </div>
  );
}
