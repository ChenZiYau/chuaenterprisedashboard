"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ImageCropperModal } from "@/components/ImageCropperModal";
import { useData } from "@/lib/DataContext";
import {
  PROPERTY_STATUS_LABEL,
  PROPERTY_TYPE_LABEL,
  type Property,
  type PropertyStatus,
  type PropertyType,
  type RentalModel,
  type Unit,
} from "@/lib/data";

const labelCls = "block text-[10px] font-semibold uppercase tracking-[0.14em] mb-1.5";
const labelStyle: React.CSSProperties = { color: "var(--text-faint)" };
const fieldCls = "ui-field w-full";

const RENTAL_MODELS: { value: RentalModel; label: string }[] = [
  { value: "room_rental", label: "Room rental" },
  { value: "whole_unit", label: "Whole unit" },
];

/** Form-local room draft; numeric fields stay strings while editing. */
type RoomDraft = {
  key: string;
  name: string;
  rentalRate: string;
  tenantName: string;
};

let seq = 0;
function blankRoom(): RoomDraft {
  seq += 1;
  return { key: `room-${Date.now()}-${seq}`, name: "", rentalRate: "", tenantName: "" };
}

/**
 * Add / Edit Property popup — rental model, cover image (upload or link, both
 * croppable to the card's 5:2 strip), a dynamic room list for room rentals
 * ("+ Add Room"), then the property record.
 */
export function AddPropertyModal({
  open,
  onClose,
  onSubmit,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (property: Property, units: Unit[]) => void;
  /** When set, the form edits this property instead of creating a new one. */
  initial?: { property: Property; units: Unit[] };
}) {
  const { tenants } = useData();
  const [rentalModel, setRentalModel] = useState<RentalModel>("room_rental");
  const [rooms, setRooms] = useState<RoomDraft[]>([blankRoom()]);
  const [occupied, setOccupied] = useState(false);
  const [wholeRent, setWholeRent] = useState("");
  const [wholeTenant, setWholeTenant] = useState("");

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [postcode, setPostcode] = useState("");
  const [propertyType, setPropertyType] = useState<PropertyType>("house");
  const [status, setStatus] = useState<PropertyStatus>("active");
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Cover image. `cropped` (a data URL from the cropper) wins over the raw
  // link; `croppedFromUrl` remembers which link it was cut from, so typing a
  // different link discards the stale crop.
  const [imageUrl, setImageUrl] = useState("");
  const [cropped, setCropped] = useState<string | null>(null);
  const [croppedFromUrl, setCroppedFromUrl] = useState<string | null>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null); // cropper input; null = closed
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cover = cropped ?? imageUrl.trim();

  // Fresh form (or the property being edited) each time the modal opens.
  useEffect(() => {
    if (!open) return;
    const p = initial?.property;
    const u = initial?.units ?? [];
    setRentalModel(p?.rentalModel ?? "room_rental");
    if (p?.rentalModel === "whole_unit") {
      setRooms([blankRoom()]);
      setOccupied(!!u[0]?.tenantName);
      setWholeRent(u[0]?.rentalRate ? String(u[0].rentalRate) : "");
      setWholeTenant(u[0]?.tenantName ?? "");
    } else {
      setRooms(
        u.length
          ? u.map((unit) => {
              seq += 1;
              return {
                key: `room-${Date.now()}-${seq}`,
                name: unit.name,
                rentalRate: unit.rentalRate ? String(unit.rentalRate) : "",
                tenantName: unit.tenantName ?? "",
              };
            })
          : [blankRoom()]
      );
      setOccupied(false);
      setWholeRent("");
      setWholeTenant("");
    }
    setName(p?.name ?? "");
    setAddress(p?.address ?? "");
    setCity(p?.city ?? "");
    setState(p?.state ?? "");
    setPostcode(p?.postcode ?? "");
    setPropertyType(p?.propertyType ?? "house");
    setStatus(p?.status ?? "active");
    setDescription(p?.description ?? "");
    // A stored data URL was produced by the cropper; a normal link goes to the
    // link field so it stays editable.
    const img = p?.imageUrl ?? "";
    if (img.startsWith("data:")) {
      setImageUrl("");
      setCropped(img);
      setCroppedFromUrl(null);
    } else {
      setImageUrl(img);
      setCropped(null);
      setCroppedFromUrl(null);
    }
    setCropSrc(null);
    setErrors({});
  }, [open, initial]);

  // Clear a single field's error (leave the rest so each message persists
  // until its own field is fixed).
  const clearError = useCallback((field: string) => {
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  const requestClose = useCallback(() => onClose(), [onClose]);
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      // Let the cropper's own Escape handler run first when it's open.
      if (e.key === "Escape" && !cropSrc) requestClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, requestClose, cropSrc]);

  if (!open) return null;

  const isRoom = rentalModel === "room_rental";
  const isEdit = !!initial;

  // Tenant options come from the tenant table — a room is either vacant or
  // assigned to an existing tenant.
  const tenantNames = Array.from(new Set(tenants.map((t) => t.name))).sort((a, b) => a.localeCompare(b));

  function updateRoom(key: string, patch: Partial<RoomDraft>) {
    setRooms((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function handleUploadFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => setCropSrc(String(reader.result));
    reader.readAsDataURL(file);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "Enter a property name.";
    if (isRoom) {
      if (rooms.length === 0) errs.rooms = "Add at least one room.";
      else if (rooms.some((r) => !r.name.trim())) errs.rooms = "Every room needs a name.";
    }
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }

    const pid = initial?.property.id ?? `p-${Date.now()}`;
    const property: Property = {
      id: pid,
      name: name.trim(),
      shortName: name.trim(),
      city: city.trim(),
      rentalModel,
      address: address.trim(),
      state: state.trim(),
      postcode: postcode.trim(),
      propertyType,
      status,
      description: description.trim(),
      imageUrl: cover || undefined,
    };

    const newUnits: Unit[] = isRoom
      ? rooms.map((r, i) => ({
          id: `${pid}-u${i + 1}`,
          propertyId: pid,
          name: r.name.trim(),
          tenantName: r.tenantName || undefined,
          rentalRate: parseFloat(r.rentalRate) || 0,
          depositMonths: null,
          depositAmount: null,
          electricityFreeUnits: 30,
        }))
      : [
          {
            id: `${pid}-u1`,
            propertyId: pid,
            name: "Whole Unit",
            tenantName: occupied ? wholeTenant || undefined : undefined,
            rentalRate: parseFloat(wholeRent) || 0,
            depositMonths: null,
            depositAmount: null,
            electricityFreeUnits: 0,
          },
        ];

    onSubmit(property, newUnits);
    onClose();
  }

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 sm:p-6">
      <button
        type="button"
        aria-label="Close"
        onClick={requestClose}
        className="absolute inset-0"
        style={{ background: "rgba(15,17,22,0.45)", animation: "apFadeIn 140ms ease" }}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-property-title"
        className="relative w-full max-w-4xl max-h-[88vh] flex flex-col rounded-2xl overflow-hidden"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border-soft)",
          boxShadow: "0 24px 64px rgba(15,17,22,0.24)",
          animation: "apPop 180ms cubic-bezier(.2,.7,.2,1)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 shrink-0" style={{ borderBottom: "1px solid var(--border-soft)" }}>
          <h1 id="add-property-title" className="text-lg font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
            {isEdit ? "Edit Property" : "Add Property"}
          </h1>
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
        <form id="add-property-form" onSubmit={handleSubmit} className="flex-1 min-h-0 overflow-y-auto ui-scroll px-6 py-5">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-[1.5fr_2.5fr] md:gap-10">
            {/* ---- Left column: setup (rental model, cover, capacity) ---- */}
            <div className="flex flex-col gap-8">
              <Group title="Rental model">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {RENTAL_MODELS.map((m) => {
                    const active = rentalModel === m.value;
                    return (
                      <button
                        key={m.value}
                        type="button"
                        onClick={() => setRentalModel(m.value)}
                        className="p-3.5 rounded-xl text-center text-sm font-semibold transition"
                        style={{
                          border: `1px solid ${active ? "var(--accent)" : "var(--border-soft)"}`,
                          background: active ? "var(--accent-soft)" : "var(--surface)",
                          color: active ? "var(--accent)" : "var(--text-secondary)",
                          boxShadow: active ? "0 0 0 3px var(--accent-soft)" : "none",
                        }}
                      >
                        {m.label}
                      </button>
                    );
                  })}
                </div>
              </Group>

              <Group title="Cover image">
                <div className="flex flex-col gap-2.5">
                  {/* Upload — opens the crop dialog before anything is kept */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleUploadFile(f);
                      e.target.value = "";
                    }}
                  />
                  <button
                    type="button"
                    className="ui-btn justify-center"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m17 8-5-5-5 5" /><path d="M12 3v12" />
                    </svg>
                    Upload image
                  </button>

                  {/* Or paste a link — Edit crops the linked image */}
                  <div className="flex items-stretch gap-2">
                    <input
                      type="url"
                      className={fieldCls}
                      placeholder="https://... (optional)"
                      value={imageUrl}
                      onChange={(e) => {
                        setImageUrl(e.target.value);
                        // A crop cut from the previous link no longer matches.
                        if (croppedFromUrl !== null) {
                          setCropped(null);
                          setCroppedFromUrl(null);
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="ui-btn shrink-0"
                      disabled={!imageUrl.trim()}
                      style={{ opacity: imageUrl.trim() ? 1 : 0.5 }}
                      title="Crop the linked image"
                      onClick={() => setCropSrc(imageUrl.trim())}
                    >
                      Edit
                    </button>
                  </div>

                  {/* Current cover preview */}
                  {cover && (
                    <div className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={cover}
                        alt="Cover preview"
                        className="w-full aspect-[5/2] object-cover rounded-lg"
                        style={{ border: "1px solid var(--border-soft)" }}
                      />
                      <button
                        type="button"
                        aria-label="Remove cover image"
                        title="Remove cover image"
                        className="absolute top-2 right-2 w-7 h-7 rounded-md flex items-center justify-center backdrop-blur-sm transition hover:opacity-90"
                        style={{ background: "rgba(15,17,22,0.55)", color: "#fff" }}
                        onClick={() => {
                          setCropped(null);
                          setCroppedFromUrl(null);
                          setImageUrl("");
                        }}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                      </button>
                    </div>
                  )}
                </div>
              </Group>

              <Group title="Capacity">
                {isRoom ? (
                  <div className="flex flex-col gap-3">
                    {rooms.map((room, i) => (
                      <div
                        key={room.key}
                        className="rounded-xl p-3 flex flex-col gap-3"
                        style={{ border: "1px solid var(--border-soft)", background: "var(--surface-muted)" }}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--text-faint)" }}>
                            Room {i + 1}
                          </span>
                          <button
                            type="button"
                            onClick={() => setRooms((prev) => prev.filter((r) => r.key !== room.key))}
                            disabled={rooms.length === 1}
                            aria-label={`Remove room ${i + 1}`}
                            className="w-7 h-7 rounded-lg inline-flex items-center justify-center border transition hover:bg-[var(--surface)] disabled:opacity-40 disabled:cursor-not-allowed"
                            style={{ color: "var(--danger)", borderColor: "var(--border-soft)" }}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                          </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-[1.4fr_1fr] gap-3">
                          <div className="flex flex-col">
                            <label className={labelCls} style={labelStyle}>Room name</label>
                            <input
                              className={`${fieldCls} mt-auto`}
                              placeholder="e.g. Master, Middle 1"
                              value={room.name}
                              onChange={(e) => { updateRoom(room.key, { name: e.target.value }); clearError("rooms"); }}
                            />
                          </div>
                          <div className="flex flex-col">
                            <label className={labelCls} style={labelStyle}>Base rent (RM/mo)</label>
                            <input
                              type="number" inputMode="decimal" min={0} step="0.01"
                              className={`${fieldCls} mt-auto`}
                              placeholder="0.00"
                              value={room.rentalRate}
                              onChange={(e) => updateRoom(room.key, { rentalRate: e.target.value })}
                            />
                          </div>
                        </div>

                        <div>
                          <label className={labelCls} style={labelStyle}>Tenant (select Vacant if none)</label>
                          <select
                            className="ui-select w-full"
                            style={{ background: "var(--surface)" }}
                            aria-label={`Tenant for room ${i + 1}`}
                            value={room.tenantName}
                            onChange={(e) => updateRoom(room.key, { tenantName: e.target.value })}
                          >
                            <option value="">Vacant</option>
                            {tenantNames.map((n) => <option key={n} value={n}>{n}</option>)}
                          </select>
                        </div>
                      </div>
                    ))}

                    {errors.rooms && <p className="text-xs" style={{ color: "var(--danger)" }}>{errors.rooms}</p>}

                    <button
                      type="button"
                      onClick={() => setRooms((prev) => [...prev, blankRoom()])}
                      className="w-full rounded-xl border border-dashed py-2.5 text-sm font-medium transition hover:bg-[var(--surface-muted)]"
                      style={{ borderColor: "var(--border-strong)", color: "var(--accent)" }}
                    >
                      + Add Room
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-4">
                    <div>
                      <label className={labelCls} style={labelStyle}>Total Units</label>
                      <input type="number" min={1} disabled readOnly className={fieldCls} style={{ opacity: 0.6 }} value={1} />
                    </div>
                    <div>
                      <label className={labelCls} style={labelStyle}>Occupancy</label>
                      <select className="ui-select w-full" value={occupied ? "occupied" : "vacant"} onChange={(e) => setOccupied(e.target.value === "occupied")}>
                        <option value="vacant">Vacant</option>
                        <option value="occupied">Occupied</option>
                      </select>
                    </div>
                    <div>
                      <label className={labelCls} style={labelStyle}>Base rent (RM/mo)</label>
                      <input
                        type="number" inputMode="decimal" min={0} step="0.01"
                        className={fieldCls} placeholder="0.00"
                        value={wholeRent} onChange={(e) => setWholeRent(e.target.value)}
                      />
                    </div>
                    {occupied && (
                      <div>
                        <label className={labelCls} style={labelStyle}>Tenant</label>
                        <select className="ui-select w-full" value={wholeTenant} onChange={(e) => setWholeTenant(e.target.value)}>
                          <option value="">Select tenant...</option>
                          {tenantNames.map((n) => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </div>
                    )}
                  </div>
                )}
              </Group>
            </div>

            {/* ---- Right column: property record ---- */}
            <div className="flex flex-col gap-8">
              <Group title="Property details">
                <Row label="Property Name" required>
                  <input
                    className={fieldCls}
                    style={errors.name ? { borderColor: "var(--danger)" } : undefined}
                    placeholder="e.g. Platinum Suites"
                    value={name}
                    onChange={(e) => { setName(e.target.value); clearError("name"); }}
                  />
                  {errors.name && <p className="text-xs mt-1" style={{ color: "var(--danger)" }}>{errors.name}</p>}
                </Row>
              </Group>

              <Group title="Location">
                <div className="flex flex-col gap-4">
                  <Row label="Address">
                    <input className={fieldCls} placeholder="e.g. 123 Jalan Ampang" value={address} onChange={(e) => setAddress(e.target.value)} />
                  </Row>
                  <Row label="City">
                    <input className={fieldCls} placeholder="e.g. Kuala Lumpur" value={city} onChange={(e) => setCity(e.target.value)} />
                  </Row>
                  <Row label="State">
                    <input className={fieldCls} placeholder="e.g. Selangor" value={state} onChange={(e) => setState(e.target.value)} />
                  </Row>
                  <Row label="Postcode">
                    <input className={fieldCls} placeholder="e.g. 50450" value={postcode} onChange={(e) => setPostcode(e.target.value)} />
                  </Row>
                </div>
              </Group>

              <Group title="Classification">
                <div className="flex flex-col gap-4">
                  <Row label="Property Type">
                    <select className="ui-select w-full" value={propertyType} onChange={(e) => setPropertyType(e.target.value as PropertyType)}>
                      {(Object.keys(PROPERTY_TYPE_LABEL) as PropertyType[]).map((t) => (
                        <option key={t} value={t}>{PROPERTY_TYPE_LABEL[t]}</option>
                      ))}
                    </select>
                  </Row>
                  <Row label="Status">
                    <select className="ui-select w-full" value={status} onChange={(e) => setStatus(e.target.value as PropertyStatus)}>
                      {(Object.keys(PROPERTY_STATUS_LABEL) as PropertyStatus[]).map((s) => (
                        <option key={s} value={s}>{PROPERTY_STATUS_LABEL[s]}</option>
                      ))}
                    </select>
                  </Row>
                </div>
              </Group>

              <Group title="Description">
                <Row label="Description" align="start">
                  <textarea rows={4} className={`${fieldCls} resize-none`} placeholder="e.g. Freehold corner unit, 5 min walk to LRT" value={description} onChange={(e) => setDescription(e.target.value)} />
                </Row>
              </Group>
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="flex flex-wrap gap-2 justify-end px-6 py-4 shrink-0" style={{ borderTop: "1px solid var(--border-soft)", background: "var(--surface)" }}>
          <button type="button" className="ui-btn" onClick={requestClose}>Cancel</button>
          <button type="submit" form="add-property-form" className="ui-btn ui-btn-primary">
            {isEdit ? "Save Changes" : "Create Property"}
          </button>
        </div>
      </div>

      {/* Crop dialog — used by both Upload and the link's Edit button */}
      <ImageCropperModal
        open={!!cropSrc}
        src={cropSrc ?? ""}
        onCancel={() => setCropSrc(null)}
        onCropped={(dataUrl) => {
          setCropped(dataUrl);
          setCroppedFromUrl(cropSrc === imageUrl.trim() ? cropSrc : null);
          setCropSrc(null);
        }}
      />

      <style jsx global>{`
        @keyframes apFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes apPop { from { transform: scale(.97); opacity: 0; } to { transform: scale(1); opacity: 1; } }
      `}</style>
    </div>,
    document.body
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <p className="text-[10px] uppercase tracking-[0.16em]" style={{ color: "var(--text-faint)" }}>{title}</p>
      <div>{children}</div>
    </section>
  );
}

/** Side-by-side field: the label sits to the left of the control (stacking only
 *  on narrow screens), matching the Add Tenant form. */
function Row({
  label,
  required,
  align = "center",
  children,
}: {
  label: string;
  required?: boolean;
  align?: "center" | "start";
  children: React.ReactNode;
}) {
  return (
    <div className={"flex flex-col gap-1 sm:flex-row sm:gap-3 " + (align === "start" ? "sm:items-start" : "sm:items-center")}>
      <label
        className={"shrink-0 sm:w-36 text-[10px] font-semibold uppercase tracking-[0.14em] " + (align === "start" ? "sm:pt-2.5" : "")}
        style={labelStyle}
      >
        <span>{label}</span>
        {required ? <span className="ml-0.5" style={{ color: "var(--accent)" }}>*</span> : null}
      </label>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
