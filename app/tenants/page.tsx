"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ActionMenu, DatePicker, Pagination, usePagination } from "@/components/ui";
import { AddTenantModal } from "@/components/AddTenantModal";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import { useData } from "@/lib/DataContext";
import { deleteResource, saveResource } from "@/lib/clientApi";
import {
  PAYMENT_STATUS_LABEL,
  fmtMYR,
  type PaymentStatus,
  type Property,
  type RevenueEntry,
  type Tenant,
  type Unit,
} from "@/lib/data";

const STATUS_COLOR: Record<PaymentStatus, string> = {
  paid: "var(--success)",
  partial: "var(--warning)",
  pending: "var(--warning)",
  overdue: "var(--danger)",
};

type LeaseStatus = { label: string; color: string };
const LEASE_SOON_DAYS = 30;

/** Lease status from the lease end date: expired, ending within 30 days, or active. */
function deriveLeaseStatus(leaseEnd: string): LeaseStatus {
  const end = new Date(`${leaseEnd}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((end.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return { label: "Expired", color: "var(--danger)" };
  if (days <= LEASE_SOON_DAYS) return { label: "Ending Soon", color: "var(--warning)" };
  return { label: "Active", color: "var(--success)" };
}

/** Current payment status for a tenant's unit, derived from revenue rows.
 *  Overdue anywhere wins; otherwise the most recent month's status. */
function derivePaymentStatus(unitId: string, revenueEntries: RevenueEntry[]): PaymentStatus | null {
  const entries = revenueEntries.filter((e) => e.unitId === unitId);
  if (entries.length === 0) return null;
  if (entries.some((e) => e.status === "overdue")) return "overdue";
  const latest = entries.reduce((a, b) =>
    b.year > a.year || (b.year === a.year && b.month > a.month) ? b : a
  );
  return latest.status;
}

/** One accent per property so every tenant of the same property shares a
 *  colour — the fastest way to see who belongs where. */
const PROPERTY_ACCENTS = [
  "#2f6fed", // blue
  "#2e7d64", // pine green
  "#8a6a45", // warm sand
  "#7048b5", // violet
  "#b04a4a", // brick
];

function propertyAccent(propertyId: string | undefined) {
  if (!propertyId) return "var(--text-faint)";
  let h = 0;
  for (let i = 0; i < propertyId.length; i++) h = (h * 31 + propertyId.charCodeAt(i)) >>> 0;
  return PROPERTY_ACCENTS[h % PROPERTY_ACCENTS.length];
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

function TenantCard({
  tenant,
  unit,
  prop,
  payment,
  lease,
  onEdit,
  onDelete,
  onLeaseEndChange,
}: {
  tenant: Tenant;
  unit: Unit | undefined;
  prop: Property | undefined;
  payment: PaymentStatus | null;
  lease: LeaseStatus;
  onEdit: () => void;
  onDelete: () => void;
  onLeaseEndChange: (date: string) => void;
}) {
  const accent = propertyAccent(prop?.id);

  return (
    <div className="ui-card p-5 flex flex-col gap-4 transition hover:shadow-md">
      {/* Identity — avatar tinted by property */}
      <div className="flex items-start gap-3">
        <div
          className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 text-sm font-semibold"
          style={{ background: `color-mix(in srgb, ${accent} 14%, transparent)`, color: accent }}
          aria-hidden
        >
          {initials(tenant.name)}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>
            {tenant.name}
          </h3>
          <p className="text-xs mt-0.5 truncate tabular-nums" style={{ color: "var(--text-faint)" }}>
            {tenant.icNumber}
          </p>
        </div>
        <ActionMenu
          label={`${tenant.name} actions`}
          items={[
            { label: "Edit", onClick: onEdit },
            { label: "Delete", danger: true, onClick: onDelete },
          ]}
        />
      </div>

      {/* Placement — the card's whole point: which property, which room */}
      <div
        className="rounded-lg px-3 py-2.5 flex items-center gap-2.5"
        style={{
          background: "var(--surface-muted)",
          borderLeft: `3px solid ${accent}`,
        }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" style={{ color: accent }} aria-hidden>
          <path d="M3 21h18" /><path d="M5 21V7l7-4 7 4v14" /><path d="M9 21v-6h6v6" />
        </svg>
        <div className="min-w-0">
          <p className="text-xs font-semibold truncate" style={{ color: "var(--text-primary)" }}>
            {prop?.name ?? "Unassigned"}
          </p>
          <p className="text-[11px] mt-0.5 truncate" style={{ color: "var(--text-muted)" }}>
            {unit?.name ?? "—"}
            {unit ? <span className="tabular-nums"> · {fmtMYR(unit.rentalRate)}/mo</span> : null}
          </p>
        </div>
      </div>

      {/* Contact */}
      <div className="flex flex-col gap-1.5 text-xs" style={{ color: "var(--text-secondary)" }}>
        <div className="flex items-center gap-2 min-w-0">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" style={{ color: "var(--text-faint)" }} aria-hidden>
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
          </svg>
          <span className="truncate tabular-nums">{tenant.phone}</span>
        </div>
        <div className="flex items-center gap-2 min-w-0">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" style={{ color: "var(--text-faint)" }} aria-hidden>
            <rect width="20" height="16" x="2" y="4" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
          </svg>
          <span className="truncate" style={{ color: tenant.email ? undefined : "var(--text-faint)" }}>
            {tenant.email ?? "No email"}
          </span>
        </div>
      </div>

      {/* Status footer */}
      <div
        className="grid grid-cols-3 gap-2 pt-3 mt-auto"
        style={{ borderTop: "1px solid var(--border-soft)" }}
      >
        <div>
          <p className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>Payment</p>
          <p className="text-xs font-semibold mt-0.5" style={{ color: payment ? STATUS_COLOR[payment] : "var(--text-faint)" }}>
            {payment ? PAYMENT_STATUS_LABEL[payment] : "—"}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>Lease</p>
          <p className="text-xs font-semibold mt-0.5" style={{ color: lease.color }}>{lease.label}</p>
        </div>
        <DatePicker
          value={tenant.leaseEnd}
          min={tenant.leaseStart || undefined}
          onChange={onLeaseEndChange}
          ariaLabel={`Change lease end date for ${tenant.name}`}
          triggerClassName="text-left rounded-md border px-2 py-1.5 -mx-1 transition hover:bg-[var(--surface-muted)] hover:border-[var(--accent,#2f6fed)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent,#2f6fed)] group"
          triggerStyle={{ display: "block", borderColor: "var(--border-soft)" }}
        >
          <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
            Until
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" aria-hidden>
              <rect width="18" height="18" x="3" y="4" rx="2" /><path d="M3 10h18M8 2v4M16 2v4" />
            </svg>
          </span>
          <span className="block text-xs font-semibold mt-0.5 tabular-nums" style={{ color: "var(--text-secondary)" }}>
            {tenant.leaseEnd}
          </span>
        </DatePicker>
      </div>
    </div>
  );
}

export default function TenantsPage() {
  const { properties, units, revenueEntries, tenants: liveTenants } = useData();
  const toast = useToast();
  const router = useRouter();
  const [tenants, setTenants] = useState(liveTenants);
  useEffect(() => setTenants(liveTenants), [liveTenants]);
  const pendingLeaseChanges = useRef(new Set<string>());
  const [search, setSearch] = useState("");
  const [filterProp, setFilterProp] = useState("all");
  const [filterPay, setFilterPay] = useState("all");
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Tenant | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Tenant | null>(null);

  async function deleteTenant(tenant: Tenant) {
    const res = await deleteResource(`/api/tenants/${encodeURIComponent(tenant.id)}`);
    if (res.ok) {
      setTenants((prev) => prev.filter((x) => x.id !== tenant.id));
      setDeleteTarget(null);
      toast.deleted(`Tenant ${tenant.name} deleted`);
      if (res.warning) toast.info(res.warning);
      router.refresh();
    } else {
      toast.info(res.error);
    }
  }

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tenants
      .map((tenant) => {
        const unit = units.find((u) => u.id === tenant.unitId);
        const prop = unit ? properties.find((p) => p.id === unit.propertyId) : undefined;
        return {
          tenant,
          unit,
          prop,
          payment: derivePaymentStatus(tenant.unitId, revenueEntries),
          lease: deriveLeaseStatus(tenant.leaseEnd),
        };
      })
      .filter(({ prop }) => filterProp === "all" || prop?.id === filterProp)
      .filter(({ payment }) => filterPay === "all" || payment === filterPay)
      .filter(({ tenant, unit, prop }) => {
        if (!q) return true;
        return (
          tenant.name.toLowerCase().includes(q) ||
          tenant.icNumber.toLowerCase().includes(q) ||
          (tenant.email ?? "").toLowerCase().includes(q) ||
          tenant.phone.toLowerCase().includes(q) ||
          (unit?.name ?? "").toLowerCase().includes(q) ||
          (prop?.name ?? "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.tenant.name.localeCompare(b.tenant.name));
  }, [tenants, search, filterProp, filterPay, properties, units, revenueEntries]);

  const resetKey = `${search}|${filterProp}|${filterPay}`;
  const { page, setPage, totalPages, total, pageSize, pageItems } = usePagination(rows, 9, resetKey);

  return (
    <div className="flex flex-col gap-6">
      {/* Filters - ghost strip, no boxed card to keep the page calm */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          className="ui-input w-auto min-w-[220px] flex-1 max-w-[360px]"
          placeholder="Search name, IC, phone, unit..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
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
          className="ui-select min-w-[150px]"
          aria-label="Filter by payment status"
          value={filterPay}
          onChange={(e) => setFilterPay(e.target.value)}
        >
          <option value="all">All Payments</option>
          <option value="paid">Paid</option>
          <option value="partial">Partial</option>
          <option value="pending">Pending</option>
          <option value="overdue">Overdue</option>
        </select>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            {rows.length} of {tenants.length} tenants
          </span>
          <button type="button" className="ui-btn ui-btn-primary" onClick={() => setAddOpen(true)}>
            + Add Tenant
          </button>
        </div>
      </div>

      {/* Card grid */}
      {rows.length === 0 ? (
        <div className="ui-card p-12 text-center">
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            No tenants match the current filters.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {pageItems.map(({ tenant, unit, prop, payment, lease }) => (
            <TenantCard
              key={tenant.id}
              tenant={tenant}
              unit={unit}
              prop={prop}
              payment={payment}
              lease={lease}
              onEdit={() => setEditTarget(tenant)}
              onDelete={() => setDeleteTarget(tenant)}
              onLeaseEndChange={async (date) => {
                if (pendingLeaseChanges.current.has(tenant.id) || date === tenant.leaseEnd) return;
                if (!date || date < tenant.leaseStart) {
                  toast.info("Lease end cannot be before the start.");
                  return;
                }
                pendingLeaseChanges.current.add(tenant.id);
                try {
                  const res = await saveResource<{ tenant: Tenant; warning?: string }>(
                    `/api/tenants/${encodeURIComponent(tenant.id)}`,
                    "PUT",
                    { ...tenant, leaseEnd: date },
                  );
                  if (!res.ok) {
                    toast.info(res.error);
                    return;
                  }
                  setTenants((prev) => prev.map((x) => x.id === tenant.id ? res.data.tenant : x));
                  if (res.data.warning) toast.info(res.data.warning);
                  router.refresh();
                } finally {
                  pendingLeaseChanges.current.delete(tenant.id);
                }
              }}
            />
          ))}
        </div>
      )}

      {rows.length > 0 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          pageSize={pageSize}
          onPage={setPage}
          unit="tenant"
        />
      )}

      {/* Add / Edit Tenant popup — same form, pre-filled when editing */}
      <AddTenantModal
        open={addOpen || editTarget !== null}
        editTenant={editTarget}
        onClose={() => {
          setAddOpen(false);
          setEditTarget(null);
        }}
        properties={properties}
        units={units}
        tenants={tenants}
        onAdd={async (t) => {
          const isEdit = tenants.some((x) => x.id === t.id);
          const res = isEdit
            ? await saveResource<{ tenant: Tenant; warning?: string }>(
                `/api/tenants/${encodeURIComponent(t.id)}`,
                "PUT",
                t,
              )
            : await saveResource<{ tenant: Tenant; warning?: string }>("/api/tenants", "POST", t);
          if (!res.ok) {
            toast.info(res.error);
            return false;
          }
          const saved = res.data.tenant;
          if (isEdit) {
            setTenants((prev) => prev.map((x) => (x.id === saved.id ? saved : x)));
            toast.updated(`Tenant ${saved.name} updated`);
          } else {
            setTenants((prev) => [saved, ...prev]);
            toast.created(`Tenant ${saved.name} created`);
          }
          if (res.data.warning) toast.info(res.data.warning);
          router.refresh();
        }}
      />

      {/* Delete — destructive confirm; also frees the tenant's unit */}
      {deleteTarget && (
        <ConfirmDialog
          open
          title="Delete Tenant"
          message={`Delete ${deleteTarget.name}? This permanently removes the tenant record and marks their unit as vacant if no other tenants remain, and cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={() => deleteTenant(deleteTarget)}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
