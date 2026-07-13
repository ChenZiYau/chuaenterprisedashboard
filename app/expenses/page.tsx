"use client";

import { useMemo, useState } from "react";
import { ActionMenu, DateField, Pagination, usePagination } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { QuickEntryModal } from "@/components/QuickEntryModal";
import { useData } from "@/lib/DataContext";
import { deleteResource } from "@/lib/clientApi";
import { EXPENSE_CATEGORY_LABEL, MONTHS, fmtMYR } from "@/lib/data";

const CUR_YEAR = 2026;

export default function ExpensesPage() {
  const { properties, units, expenseEntries, getUnit, getUnitsForProperty } = useData();
  const toast = useToast();
  const [entries, setEntries] = useState(expenseEntries);
  const [entryOpen, setEntryOpen] = useState(false);
  const [fromDate, setFromDate] = useState(`${CUR_YEAR}-01-01`);
  const [toDate, setToDate] = useState(`${CUR_YEAR}-12-31`);
  const [search, setSearch] = useState("");
  const [filterProp, setFilterProp] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries
      .filter((e) => (!fromDate || e.expenseDate >= fromDate) && (!toDate || e.expenseDate <= toDate))
      .filter((e) => filterProp === "all" || e.propertyId === filterProp)
      .filter((e) => filterCategory === "all" || e.category === filterCategory)
      .filter((e) => {
        if (!q) return true;
        const prop = properties.find((p) => p.id === e.propertyId);
        return (
          (prop?.name ?? "").toLowerCase().includes(q) ||
          EXPENSE_CATEGORY_LABEL[e.category].toLowerCase().includes(q) ||
          (e.description ?? "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => (a.year !== b.year ? b.year - a.year : b.month - a.month));
  }, [entries, fromDate, toDate, search, filterProp, filterCategory, properties]);

  const totalExpenses = filtered.reduce((s, e) => s + e.amount, 0);

  const resetKey = `${fromDate}|${toDate}|${search}|${filterProp}|${filterCategory}`;
  const { page, setPage, totalPages, total, pageSize, pageItems } = usePagination(filtered, 10, resetKey);

  return (
    <div className="flex flex-col gap-6">
      {/* Action bar */}
      <div className="flex justify-end">
        <button type="button" className="ui-btn ui-btn-primary" onClick={() => setEntryOpen(true)}>
          + Add Expense
        </button>
      </div>

      {/* Quick Entry popup — pick a property in the header, then record expenses */}
      {entryOpen && (
        <QuickEntryModal
          open
          onClose={() => setEntryOpen(false)}
          property={properties[0]}
          units={getUnitsForProperty(properties[0].id)}
          selectableProperties={properties}
          allUnits={units}
          initialTab="expense"
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
              className="ui-select min-w-[180px]"
              aria-label="Filter by category"
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
            >
              <option value="all">All Categories</option>
              {Object.entries(EXPENSE_CATEGORY_LABEL).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <input
            type="search"
            className="ui-input w-auto min-w-[200px] flex-1 max-w-[360px]"
            placeholder="Search property, category, description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="ml-auto text-sm font-semibold" style={{ color: "var(--danger)" }}>
            Total: {fmtMYR(totalExpenses)}
          </div>
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="ui-card p-12 text-center">
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            No expense entries found.
          </p>
        </div>
      ) : (
        <div className="ui-card ui-scroll overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead style={{ background: "var(--surface-muted)" }}>
              <tr style={{ color: "var(--text-faint)" }}>
                <th className="text-center text-xs uppercase tracking-wider px-5 py-3">Property</th>
                <th className="text-center text-xs uppercase tracking-wider px-4 py-3">Room</th>
                <th className="text-center text-xs uppercase tracking-wider px-4 py-3">Month</th>
                <th className="text-center text-xs uppercase tracking-wider px-4 py-3">Category</th>
                <th className="text-center text-xs uppercase tracking-wider px-4 py-3">Description</th>
                <th className="text-center text-xs uppercase tracking-wider px-4 py-3">Type</th>
                <th className="text-center text-xs uppercase tracking-wider px-5 py-3">Amount</th>
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
                return (
                  <tr
                    key={entry.id}
                    className="border-t hover:bg-[var(--surface-muted)] transition-colors"
                    style={{ borderColor: "var(--border-soft)" }}
                  >
                    <td className="px-5 py-3 text-center font-medium" style={{ color: "var(--text-primary)" }}>
                      {prop?.name ?? entry.propertyId}
                    </td>
                    <td
                      className="px-4 py-3 text-center"
                      style={{ color: entry.unitId ? "var(--text-secondary)" : "var(--text-faint)" }}
                    >
                      {entry.unitId ? (getUnit(entry.unitId)?.name ?? "-") : "Whole property"}
                    </td>
                    <td className="px-4 py-3 text-center" style={{ color: "var(--text-secondary)" }}>
                      {MONTHS[entry.month - 1]} {entry.year}
                    </td>
                    <td className="px-4 py-3 text-center" style={{ color: "var(--text-secondary)" }}>
                      {EXPENSE_CATEGORY_LABEL[entry.category]}
                    </td>
                    <td
                      className="px-4 py-3 text-center max-w-[220px] truncate"
                      style={{ color: entry.description ? "var(--text-muted)" : "var(--text-faint)" }}
                    >
                      {entry.description ?? "—"}
                    </td>
                    <td
                      className="px-4 py-3 text-center font-semibold"
                      style={{
                        color:
                          entry.type === "recurring"
                            ? "var(--text-primary)"
                            : entry.type === "irregular"
                            ? "var(--warning)"
                            : "var(--text-faint)",
                      }}
                    >
                      {entry.type === "recurring" ? "Recurring" : entry.type === "irregular" ? "Irregular" : "—"}
                    </td>
                    <td className="px-5 py-3 text-center font-semibold tabular-nums" style={{ color: "var(--danger)" }}>
                      {fmtMYR(entry.amount)}
                    </td>
                    <td
                      className="px-3 py-3 sticky right-0 z-[1]"
                      style={{ background: "var(--surface)", borderLeft: "1px solid var(--border-soft)" }}
                    >
                      <div className="flex items-center justify-center">
                        <ActionMenu
                          label="Expense actions"
                          items={[
                            { label: "Edit", onClick: () => {} },
                            {
                              label: "Delete",
                              danger: true,
                              onClick: async () => {
                                const res = await deleteResource(`/api/expenses/${encodeURIComponent(entry.id)}`);
                                if (res.ok) {
                                  setEntries((prev) => prev.filter((x) => x.id !== entry.id));
                                  toast.deleted("Expense deleted");
                                } else {
                                  toast.info(res.error);
                                }
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
                <td colSpan={6} className="px-5 py-3 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                  Total ({filtered.length} {filtered.length === 1 ? "entry" : "entries"})
                </td>
                <td className="px-5 py-3 text-center font-bold tabular-nums" style={{ color: "var(--danger)" }}>
                  {fmtMYR(totalExpenses)}
                </td>
                <td />
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
