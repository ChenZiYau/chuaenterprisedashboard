"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DateField } from "@/components/ui";
import type { Property, Tenant, Unit } from "@/lib/data";

const labelStyle: React.CSSProperties = { color: "var(--text-faint)" };
const fieldCls = "ui-field w-full";

/** Side-by-side field: label sits to the left of the control, stacking only
 *  on narrow screens. Shared by every field so the form reads as one system. */
function Field({
  label,
  align = "center",
  children,
}: {
  label: string;
  align?: "center" | "start";
  children: React.ReactNode;
}) {
  return (
    <div className={"flex flex-col gap-1 sm:flex-row sm:gap-3 " + (align === "start" ? "sm:items-start" : "sm:items-center")}>
      <label
        className={"shrink-0 sm:w-36 text-[10px] font-semibold uppercase tracking-[0.14em] " + (align === "start" ? "sm:pt-2.5" : "")}
        style={labelStyle}
      >
        {label}
      </label>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

/**
 * Add / Edit Tenant popup — records the person and, crucially, where they
 * live: pick a property, then one of its rooms/units. Pass `editTenant` to
 * open pre-filled in edit mode; submitting then keeps the tenant's id.
 */
export function AddTenantModal({
  open,
  onClose,
  properties,
  units,
  tenants,
  onAdd,
  editTenant,
}: {
  open: boolean;
  onClose: () => void;
  properties: Property[];
  units: Unit[];
  tenants: Tenant[];
  onAdd: (tenant: Tenant) => void | boolean | Promise<void | boolean>;
  editTenant?: Tenant | null;
}) {
  const today = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);
  const nextYear = useMemo(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  const [name, setName] = useState("");
  const [icNumber, setIcNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [leaseStart, setLeaseStart] = useState(today);
  const [leaseEnd, setLeaseEnd] = useState(nextYear);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const initializedFor = useRef<string | null>(null);

  // Fresh form each time the modal opens — pre-filled when editing.
  useEffect(() => {
    if (!open) {
      initializedFor.current = null;
      return;
    }
    const formKey = editTenant?.id ?? "new";
    if (initializedFor.current === formKey) return;
    initializedFor.current = formKey;
    setName(editTenant?.name ?? "");
    setIcNumber(editTenant?.icNumber ?? "");
    setPhone(editTenant?.phone ?? "");
    setEmail(editTenant?.email ?? "");
    setPropertyId(
      editTenant
        ? units.find((u) => u.id === editTenant.unitId)?.propertyId ?? ""
        : ""
    );
    setUnitId(editTenant?.unitId ?? "");
    setLeaseStart(editTenant?.leaseStart ?? today);
    setLeaseEnd(editTenant?.leaseEnd ?? nextYear);
    setErrors({});
    setSaving(false);
  }, [open, editTenant, units, today, nextYear]);

  // Clear a single field's error so each message persists until its own
  // field is fixed.
  const clearError = useCallback((field: string) => {
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  const requestClose = useCallback(() => {
    if (!savingRef.current) onClose();
  }, [onClose]);
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") requestClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, requestClose]);

  const propertyUnits = useMemo(
    () => units.filter((u) => u.propertyId === propertyId),
    [units, propertyId]
  );
  const occupiedUnitIds = useMemo(
    () => new Set(tenants.filter((t) => t.id !== editTenant?.id).map((t) => t.unitId)),
    [tenants, editTenant]
  );

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (savingRef.current) return;
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "Enter the tenant's name.";
    if (!icNumber.trim()) errs.icNumber = "Enter the IC / passport number.";
    if (!phone.trim()) errs.phone = "Enter a phone number.";
    if (!propertyId) errs.propertyId = "Select a property.";
    if (!unitId) errs.unitId = "Select a room or unit.";
    else if (!propertyUnits.some((unit) => unit.id === unitId)) errs.unitId = "Select a room or unit in this property.";
    if (!leaseStart) errs.leaseStart = "Enter the lease start date.";
    if (!leaseEnd) errs.leaseEnd = "Enter the lease end date.";
    if (leaseStart && leaseEnd && leaseEnd < leaseStart) errs.leaseEnd = "Lease end must be after the start.";
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      const result = await onAdd({
        id: editTenant?.id ?? `t-${Date.now()}`,
        name: name.trim(),
        icNumber: icNumber.trim(),
        phone: phone.trim(),
        email: email.trim() || null,
        unitId,
        leaseStart,
        leaseEnd,
      });
      if (result !== false) onClose();
    } catch {
      setErrors((prev) => ({ ...prev, submit: "Could not save the tenant. Your entries have been kept." }));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 sm:p-6">
      <button
        type="button"
        aria-label="Close"
        onClick={requestClose}
        className="absolute inset-0"
        style={{ background: "rgba(15,17,22,0.45)", animation: "atFadeIn 140ms ease" }}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-tenant-title"
        className="relative w-full max-w-lg max-h-[88vh] flex flex-col rounded-2xl overflow-hidden"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border-soft)",
          boxShadow: "0 24px 64px rgba(15,17,22,0.24)",
          animation: "atPop 180ms cubic-bezier(.2,.7,.2,1)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 shrink-0" style={{ borderBottom: "1px solid var(--border-soft)" }}>
          <div>
            <h1 id="add-tenant-title" className="text-lg font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
              {editTenant ? "Edit Tenant" : "Add Tenant"}
            </h1>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
              {editTenant
                ? `Update ${editTenant.name}'s details, placement, or lease.`
                : "Who they are, and which property and room they live in."}
            </p>
          </div>
          <button
            type="button"
            onClick={requestClose}
            aria-label="Close"
            className="w-8 h-8 rounded-md flex items-center justify-center shrink-0 transition hover:bg-[var(--surface-muted)]"
            style={{ color: "var(--text-muted)", border: "1px solid var(--border-soft)", background: "var(--surface)" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Body — scrolls */}
        <form id="add-tenant-form" onSubmit={handleSubmit} className="flex-1 min-h-0 overflow-y-auto ui-scroll px-6 py-5 flex flex-col gap-5">
          {/* Person */}
          <div className="flex flex-col gap-3">
            <p className="text-[10px] uppercase tracking-[0.16em]" style={{ color: "var(--text-faint)" }}>Tenant</p>
            <Field label="Full name">
              <input
                className={fieldCls}
                style={errors.name ? { borderColor: "var(--danger)" } : undefined}
                placeholder="e.g. Lim Wei Jian"
                value={name}
                onChange={(e) => { setName(e.target.value); clearError("name"); }}
              />
              {errors.name && <p className="text-xs mt-1" style={{ color: "var(--danger)" }}>{errors.name}</p>}
            </Field>
            <Field label="IC / Passport No.">
              <input
                className={fieldCls}
                style={errors.icNumber ? { borderColor: "var(--danger)" } : undefined}
                placeholder="e.g. 950214-14-5673"
                value={icNumber}
                onChange={(e) => { setIcNumber(e.target.value); clearError("icNumber"); }}
              />
              {errors.icNumber && <p className="text-xs mt-1" style={{ color: "var(--danger)" }}>{errors.icNumber}</p>}
            </Field>
            <Field label="Phone">
              <input
                type="tel"
                className={fieldCls}
                style={errors.phone ? { borderColor: "var(--danger)" } : undefined}
                placeholder="e.g. 012-345 6789"
                value={phone}
                onChange={(e) => { setPhone(e.target.value); clearError("phone"); }}
              />
              {errors.phone && <p className="text-xs mt-1" style={{ color: "var(--danger)" }}>{errors.phone}</p>}
            </Field>
            <Field label="Email (optional)">
              <input
                type="email"
                className={fieldCls}
                placeholder="e.g. name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
          </div>

          {/* Placement — property, then one of its rooms */}
          <div className="flex flex-col gap-3">
            <p className="text-[10px] uppercase tracking-[0.16em]" style={{ color: "var(--text-faint)" }}>Placement</p>
            <Field label="Property">
              <select
                className="ui-select w-full"
                style={errors.propertyId ? { borderColor: "var(--danger)" } : undefined}
                value={propertyId}
                onChange={(e) => { setPropertyId(e.target.value); setUnitId(""); clearError("propertyId"); }}
              >
                <option value="">Select property...</option>
                {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              {errors.propertyId && <p className="text-xs mt-1" style={{ color: "var(--danger)" }}>{errors.propertyId}</p>}
            </Field>
            <Field label="Room / Unit">
              <select
                className="ui-select w-full"
                style={errors.unitId ? { borderColor: "var(--danger)" } : undefined}
                value={unitId}
                disabled={!propertyId}
                onChange={(e) => { setUnitId(e.target.value); clearError("unitId"); }}
              >
                <option value="">{propertyId ? "Select room or unit..." : "Select a property first"}</option>
                {propertyUnits.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}{occupiedUnitIds.has(u.id) ? " — occupied" : ""}
                  </option>
                ))}
              </select>
              {errors.unitId && <p className="text-xs mt-1" style={{ color: "var(--danger)" }}>{errors.unitId}</p>}
            </Field>
          </div>

          {/* Lease */}
          <div className="flex flex-col gap-3">
            <p className="text-[10px] uppercase tracking-[0.16em]" style={{ color: "var(--text-faint)" }}>Lease</p>
            <Field label="Lease start">
              <DateField
                className={fieldCls}
                style={errors.leaseStart ? { borderColor: "var(--danger)" } : undefined}
                value={leaseStart}
                max={leaseEnd || undefined}
                ariaLabel="Lease start date"
                onChange={(v) => { setLeaseStart(v); clearError("leaseStart"); clearError("leaseEnd"); }}
              />
              {errors.leaseStart && <p className="text-xs mt-1" style={{ color: "var(--danger)" }}>{errors.leaseStart}</p>}
            </Field>
            <Field label="Lease end">
              <DateField
                className={fieldCls}
                style={errors.leaseEnd ? { borderColor: "var(--danger)" } : undefined}
                value={leaseEnd}
                min={leaseStart || undefined}
                ariaLabel="Lease end date"
                onChange={(v) => { setLeaseEnd(v); clearError("leaseEnd"); }}
              />
              {errors.leaseEnd && <p className="text-xs mt-1" style={{ color: "var(--danger)" }}>{errors.leaseEnd}</p>}
            </Field>
          </div>
        </form>

        {/* Footer */}
        <div className="flex flex-wrap gap-2 justify-end px-6 py-4 shrink-0" style={{ borderTop: "1px solid var(--border-soft)", background: "var(--surface)" }}>
          {errors.submit && <p role="alert" className="w-full text-xs" style={{ color: "var(--danger)" }}>{errors.submit}</p>}
          <button type="button" className="ui-btn" onClick={requestClose} disabled={saving}>Cancel</button>
          <button
            type="submit"
            form="add-tenant-form"
            className="ui-btn ui-btn-primary"
            disabled={saving}
            style={saving ? { opacity: 0.6, cursor: "wait" } : undefined}
          >
            {saving ? "Saving…" : editTenant ? "Save Changes" : "Add Tenant"}
          </button>
        </div>
      </div>

      <style jsx global>{`
        @keyframes atFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes atPop { from { transform: scale(.97); opacity: 0; } to { transform: scale(1); opacity: 1; } }
      `}</style>
    </div>,
    document.body
  );
}
