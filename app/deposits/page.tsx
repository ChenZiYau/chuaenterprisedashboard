"use client";

import { useState } from "react";
import { useData } from "@/lib/DataContext";
import { fmtMYR } from "@/lib/data";

export default function DepositsPage() {
  const { properties, tenants, units } = useData();
  const [selected, setSelected] = useState<string>("all");
  const tenantDeposits = tenants.filter((t) => t.depositAmount != null && (selected === "all" || units.some((u) => u.id === t.unitId && u.propertyId === selected)));

  const grandTotal = tenantDeposits.reduce((sum, tenant) => sum + (tenant.depositAmount ?? 0), 0);

  return (
    <div className="flex flex-col gap-8">
      {/* Property selector + grand total */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-2">
          <PropertyTab label="All Properties" active={selected === "all"} onClick={() => setSelected("all")} />
          {properties.map((property) => (
            <PropertyTab
              key={property.id}
              label={property.shortName}
              active={selected === property.id}
              onClick={() => setSelected(property.id)}
            />
          ))}
        </div>
        <div className="text-right">
          <p className="text-[11px] uppercase tracking-[0.16em]" style={{ color: "var(--text-faint)" }}>
            Total deposit held
          </p>
          <p className="text-2xl font-semibold mt-1 tabular-nums" style={{ color: "var(--text-primary)" }}>
            {fmtMYR(grandTotal)}
          </p>
        </div>
      </div>

      <p className="text-sm" style={{ color: "var(--text-muted)" }}>Deposits recorded for each tenant. Enter deposits when adding a tenant, or update them in Tenants.</p>
      {tenantDeposits.length > 0 && <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {tenantDeposits.map((tenant) => {
          const unit = units.find((u) => u.id === tenant.unitId);
          const property = properties.find((p) => p.id === unit?.propertyId);
          return <div key={tenant.id} className="ui-card p-4 flex flex-col gap-2">
            <p className="font-semibold">{tenant.name}</p>
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>{unit ? `${property?.name ?? ""} · ${unit.name}` : "Unassigned"}</p>
            <p className="text-sm">One-time deposit: <strong>{fmtMYR(tenant.depositAmount ?? 0)}</strong></p>
            <a href="/tenants" className="text-xs underline">Edit in Tenants</a>
          </div>;
        })}
      </div>}
      {tenantDeposits.length === 0 && (
        <div className="ui-card p-12 text-center" style={{ color: "var(--text-muted)" }}>
          <p className="text-sm">No tenant deposits recorded{selected === "all" ? " yet" : " for this property"}.</p>
          <a href="/tenants" className="text-sm underline mt-2 inline-block">Go to Tenants to record a deposit</a>
        </div>
      )}
    </div>
  );
}

/** A selectable property pill in the top nav strip. */
function PropertyTab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="px-3.5 py-2 text-sm font-medium rounded-lg border transition"
      style={{
        background: active ? "var(--btn-primary-bg)" : "var(--surface)",
        color: active ? "var(--btn-primary-fg)" : "var(--text-secondary)",
        borderColor: active ? "var(--btn-primary-bg)" : "var(--border-soft)",
      }}
    >
      {label}
    </button>
  );
}
