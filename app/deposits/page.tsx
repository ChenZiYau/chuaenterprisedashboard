"use client";

import { useMemo, useState } from "react";
import { useData } from "@/lib/DataContext";
import { fmtMYR, type Property, type Unit } from "@/lib/data";

/** The deposit held for a room: an explicit amount when set, otherwise the
 *  computed rental rate × deposit months. */
function effectiveDeposit(unit: Unit): number {
  if (unit.depositAmount != null && unit.depositAmount > 0) return unit.depositAmount;
  return unit.rentalRate * (unit.depositMonths ?? 0);
}

export default function DepositsPage() {
  const { properties, getUnitsForProperty } = useData();
  const [selected, setSelected] = useState<string>("all");

  const withUnits = useMemo(
    () =>
      properties
        .map((p) => ({ property: p, units: getUnitsForProperty(p.id) }))
        .filter((s) => s.units.length > 0),
    [properties, getUnitsForProperty]
  );

  const sections = selected === "all" ? withUnits : withUnits.filter((s) => s.property.id === selected);

  const grandTotal = sections.reduce(
    (sum, s) => sum + s.units.reduce((u, unit) => u + effectiveDeposit(unit), 0),
    0
  );

  return (
    <div className="flex flex-col gap-8">
      {/* Property selector + grand total */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-2">
          <PropertyTab label="All Properties" active={selected === "all"} onClick={() => setSelected("all")} />
          {withUnits.map(({ property }) => (
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

      {/* Per-property sections */}
      {sections.length === 0 ? (
        <div className="ui-card p-12 text-center" style={{ color: "var(--text-muted)" }}>
          <p className="text-sm">No rooms found for this property yet.</p>
        </div>
      ) : (
        sections.map(({ property, units }, i) => (
          <PropertyDepositSection key={property.id} property={property} units={units} divider={i > 0} />
        ))
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

function PropertyDepositSection({
  property,
  units,
  divider,
}: {
  property: Property;
  units: Unit[];
  divider?: boolean;
}) {
  const total = units.reduce((sum, u) => sum + effectiveDeposit(u), 0);
  const isWhole = property.rentalModel === "whole_unit";

  return (
    <section
      className={"flex flex-col gap-3" + (divider ? " border-t pt-8" : "")}
      style={divider ? { borderColor: "var(--border-soft)" } : undefined}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-lg font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
            {property.name}
          </p>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-faint)" }}>
            {isWhole ? "Whole unit" : "Room rental"} · {property.city} · {units.length}{" "}
            {isWhole ? "unit" : "rooms"}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-[0.14em]" style={{ color: "var(--text-faint)" }}>
            Total deposit ({units.length} {isWhole ? "unit" : "rooms"})
          </p>
          <p className="text-lg font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
            {fmtMYR(total)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {units.map((unit) => (
          <DepositRoomCard key={unit.id} unit={unit} />
        ))}
      </div>
    </section>
  );
}

const fieldClass =
  "w-28 px-2.5 py-1.5 text-sm text-right rounded-md border outline-none transition tabular-nums";
const fieldStyle: React.CSSProperties = {
  borderColor: "var(--border-soft)",
  background: "var(--surface)",
  color: "var(--text-primary)",
};

function DepositRoomCard({ unit }: { unit: Unit }) {
  const rate = unit.rentalRate;
  const depositLabel = unit.tenantName ?? "Deposit";

  const [editing, setEditing] = useState(false);
  const [monthsStr, setMonthsStr] = useState(unit.depositMonths != null ? String(unit.depositMonths) : "");
  const [amountStr, setAmountStr] = useState(
    unit.depositAmount != null && unit.depositAmount > 0 ? String(unit.depositAmount) : ""
  );

  const months = parseFloat(monthsStr);
  const computed = Number.isFinite(months) ? rate * months : 0;
  const amountNum = parseFloat(amountStr);
  const effective = Number.isFinite(amountNum) && amountNum > 0 ? amountNum : computed;

  // Changing months auto-fills the amount with rent × months; the amount can
  // still be overridden afterwards.
  function handleMonthsChange(v: string) {
    setMonthsStr(v);
    const m = parseFloat(v);
    if (Number.isFinite(m) && rate * m > 0) setAmountStr(String(rate * m));
  }

  return (
    <div
      className="rounded-xl border p-4 flex flex-col gap-3"
      style={{ borderColor: "var(--border-soft)", background: "var(--surface-muted)" }}
    >
      {/* Header: centered room name with an edit affordance on the right */}
      <div className="relative flex items-center justify-center">
        <span className="text-sm font-semibold truncate px-7" style={{ color: "var(--text-primary)" }}>
          {unit.name}
        </span>
        {editing ? (
          <div className="absolute right-0 flex items-center gap-1">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="text-[11px] font-medium px-2 py-1 rounded-md transition"
              style={{ background: "var(--btn-primary-bg)", color: "var(--btn-primary-fg)" }}
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="text-[11px] font-medium px-2 py-1 rounded-md border transition"
              style={{ borderColor: "var(--border-soft)", background: "var(--surface)", color: "var(--text-muted)" }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label={`Edit deposit for ${unit.name}`}
            className="absolute right-0 text-[11px] font-medium px-2 py-1 rounded-md border transition hover:bg-[var(--surface)]"
            style={{ borderColor: "var(--border-soft)", background: "var(--surface)", color: "var(--text-primary)" }}
          >
            Edit
          </button>
        )}
      </div>

      <DepositRow label="Rental per Month">
        <span className="font-medium tabular-nums" style={{ color: "var(--text-secondary)" }}>
          {fmtMYR(rate)}
        </span>
      </DepositRow>

      <DepositRow label="Deposit (month rental)">
        {editing ? (
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.5"
            className={fieldClass}
            style={fieldStyle}
            placeholder="0"
            value={monthsStr}
            onChange={(e) => handleMonthsChange(e.target.value)}
          />
        ) : (
          <span className="font-medium tabular-nums" style={{ color: "var(--text-secondary)" }}>
            {monthsStr ? monthsStr : "—"}
          </span>
        )}
      </DepositRow>

      <DepositRow label={depositLabel} muted={!unit.tenantName}>
        {editing ? (
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            className={fieldClass}
            style={fieldStyle}
            placeholder={computed > 0 ? String(computed) : "0.00"}
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
          />
        ) : (
          <span className="text-base font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
            {fmtMYR(effective)}
          </span>
        )}
      </DepositRow>
    </div>
  );
}

/** One label-left / value-right row, the building block of a deposit card. */
function DepositRow({
  label,
  muted,
  children,
}: {
  label: string;
  muted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 min-h-[34px]">
      <span
        className="text-sm truncate"
        style={{ color: muted ? "var(--text-faint)" : "var(--text-muted)" }}
        title={label}
      >
        {label}
      </span>
      {children}
    </div>
  );
}
