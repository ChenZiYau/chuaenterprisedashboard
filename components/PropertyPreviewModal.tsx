"use client";

import { useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { PropertyCover } from "@/components/PropertyCover";
import {
  PROPERTY_STATUS_LABEL,
  PROPERTY_TYPE_LABEL,
  fmtMYR,
  type Property,
  type Unit,
} from "@/lib/data";

/**
 * Post-create preview — the property is already saved when this opens. Done
 * (or clicking outside) just closes it; Edit reopens the property form, and
 * only saving there changes anything.
 */
export function PropertyPreviewModal({
  open,
  property,
  units,
  onEdit,
  onClose,
}: {
  open: boolean;
  property: Property;
  units: Unit[];
  onEdit: () => void;
  onClose: () => void;
}) {
  const requestClose = useCallback(() => onClose(), [onClose]);
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

  if (!open) return null;

  const isWhole = property.rentalModel === "whole_unit";
  const rented = units.filter((u) => u.tenantName).length;
  const monthlyRent = units.filter((u) => u.tenantName).reduce((s, u) => s + u.rentalRate, 0);
  const location = [property.address, property.city, property.state, property.postcode]
    .filter((s) => s && s.trim())
    .join(", ");

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 sm:p-6">
      {/* Click anywhere outside to exit */}
      <button
        type="button"
        aria-label="Close preview"
        onClick={requestClose}
        className="absolute inset-0"
        style={{ background: "rgba(15,17,22,0.45)", animation: "ppFadeIn 140ms ease" }}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="property-preview-title"
        className="relative w-full max-w-md max-h-[88vh] flex flex-col rounded-2xl overflow-hidden"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border-soft)",
          boxShadow: "0 24px 64px rgba(15,17,22,0.24)",
          animation: "ppPop 180ms cubic-bezier(.2,.7,.2,1)",
        }}
      >
        {/* Created banner */}
        <div className="flex items-center gap-2 px-5 py-3 shrink-0" style={{ background: "rgba(47,158,111,0.10)", borderBottom: "1px solid var(--border-soft)" }}>
          <span style={{ color: "var(--success)" }}>&#10003;</span>
          <span className="text-xs font-medium" style={{ color: "var(--success)" }}>Property created</span>
        </div>

        {/* Card-style preview — scrolls if the room list is long */}
        <div className="flex-1 min-h-0 overflow-y-auto ui-scroll">
          <PropertyCover property={property} />

          <div className="p-5 flex flex-col gap-4">
            <div className="min-w-0">
              <h2 id="property-preview-title" className="text-base font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                {property.name}
              </h2>
              <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                {location || "No address"}
              </p>
            </div>

            {/* Classification */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>Type</p>
                <p className="text-sm font-medium mt-0.5" style={{ color: "var(--text-primary)" }}>
                  {property.propertyType ? PROPERTY_TYPE_LABEL[property.propertyType] : "—"}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>Status</p>
                <p className="text-sm font-medium mt-0.5" style={{ color: "var(--text-primary)" }}>
                  {property.status ? PROPERTY_STATUS_LABEL[property.status] : "—"}
                </p>
              </div>
            </div>

            {/* Rooms / unit */}
            <div className="flex flex-col gap-1.5">
              <p className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
                {isWhole ? "Unit" : `Rooms (${units.length})`}
              </p>
              {units.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center justify-between rounded-lg px-3 py-2 text-xs"
                  style={{ background: "var(--surface-muted)", border: "1px solid var(--border-soft)" }}
                >
                  <span className="font-medium truncate" style={{ color: "var(--text-primary)" }}>{u.name}</span>
                  <span className="flex items-center gap-2 shrink-0">
                    <span style={{ color: u.tenantName ? "var(--success)" : "var(--text-faint)" }}>
                      {u.tenantName ?? "Vacant"}
                    </span>
                    <span className="tabular-nums" style={{ color: "var(--text-secondary)" }}>
                      {fmtMYR(u.rentalRate)}
                    </span>
                  </span>
                </div>
              ))}
            </div>

            {property.description && (
              <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
                {property.description}
              </p>
            )}

            {/* Footer KPIs */}
            <div className="grid grid-cols-2 gap-3 pt-3" style={{ borderTop: "1px solid var(--border-soft)" }}>
              <div>
                <p className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>Monthly Rent</p>
                <p className="text-sm font-semibold mt-0.5 tabular-nums" style={{ color: "var(--text-primary)" }}>
                  {fmtMYR(monthlyRent)}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
                  {isWhole ? "Occupancy" : "Rented"}
                </p>
                <p className="text-sm font-semibold mt-0.5 tabular-nums" style={{ color: "var(--text-primary)" }}>
                  {isWhole ? (rented > 0 ? "Occupied" : "Vacant") : `${rented} of ${units.length}`}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 justify-end px-5 py-4 shrink-0" style={{ borderTop: "1px solid var(--border-soft)", background: "var(--surface)" }}>
          <button type="button" className="ui-btn" onClick={onEdit}>Edit</button>
          <button type="button" className="ui-btn ui-btn-primary" onClick={requestClose}>Done</button>
        </div>
      </div>

      <style jsx global>{`
        @keyframes ppFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes ppPop { from { transform: scale(.97); opacity: 0; } to { transform: scale(1); opacity: 1; } }
      `}</style>
    </div>,
    document.body
  );
}
