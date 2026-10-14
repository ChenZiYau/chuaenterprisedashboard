"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ActionMenu } from "@/components/ui";
import { QuickEntryModal, type QuickEntryTab } from "@/components/QuickEntryModal";
import { AddPropertyModal } from "@/components/AddPropertyModal";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PropertyPreviewModal } from "@/components/PropertyPreviewModal";
import { PropertyCover } from "@/components/PropertyCover";
import { useToast } from "@/components/Toast";
import { useData } from "@/lib/DataContext";
import { deleteResource, saveResource } from "@/lib/clientApi";
import { fmtMYR, type Property, type Unit } from "@/lib/data";

/** Plain uppercase text label — no pill background, keeps cards calm. */
function Tag({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <span
      className="text-[11px] font-semibold uppercase tracking-wider"
      style={{ color: color ?? "var(--text-muted)" }}
    >
      {children}
    </span>
  );
}

function PropertyCard({
  property,
  units,
  onEntry,
  onEdit,
  onDelete,
}: {
  property: Property;
  units: Unit[];
  onEntry: (tab: QuickEntryTab) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const router = useRouter();
  const total = units.length;
  const rented = units.filter((u) => u.tenantName).length;
  const occPct = total > 0 ? Math.round((rented / total) * 100) : 0;
  const monthlyRent = units.filter((u) => u.tenantName).reduce((s, u) => s + u.rentalRate, 0);
  const isWhole = property.rentalModel === "whole_unit";
  const isOccupied = rented > 0;

  return (
    <div className="ui-card overflow-hidden flex flex-col transition hover:shadow-md group">
      {/* Cover photo — carries the rental-model chip; opens the detail page */}
      <Link href={`/properties/${property.id}`} aria-label={`Open ${property.name}`}>
        <PropertyCover property={property} />
      </Link>

      <div className="p-5 flex flex-col gap-4 flex-1">
        {/* Clickable upper zone — everything above the KPI divider opens the detail page */}
        <div
          className="flex flex-col gap-4 cursor-pointer"
          onClick={() => router.push(`/properties/${property.id}`)}
        >
        {/* Name + row actions */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link href={`/properties/${property.id}`} className="block min-w-0">
              <h3 className="text-base font-semibold truncate transition hover:text-[var(--accent)]" style={{ color: "var(--text-primary)" }}>
                {property.name}
              </h3>
            </Link>
            <p className="text-xs mt-1 truncate" style={{ color: "var(--text-muted)" }}>
              {property.city}
            </p>
          </div>
          <ActionMenu
            label={`${property.name} actions`}
            items={[
              { label: "Edit", onClick: onEdit },
              { label: "Delete", danger: true, onClick: onDelete },
            ]}
          />
        </div>

        {isWhole ? (
          /* A whole unit is let as one — just show occupied or available. */
          <div className="flex items-center justify-between text-xs">
            <span style={{ color: "var(--text-secondary)" }}>Whole unit</span>
            <Tag color={isOccupied ? "var(--success)" : "var(--warning)"}>
              {isOccupied ? "Occupied" : "Available"}
            </Tag>
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span style={{ color: "var(--text-secondary)" }}>
                {rented} of {total} rooms rented
              </span>
              <span className="font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
                {occPct}%
              </span>
            </div>
            <div
              className="h-1.5 w-full rounded-full overflow-hidden"
              style={{ background: "var(--surface-muted)" }}
            >
              <div
                className="h-full rounded-full"
                style={{ width: `${occPct}%`, background: "var(--accent)" }}
              />
            </div>
          </div>
        )}
        </div>

        {/* Two KPIs only — keeps the footer scannable */}
        <div
          className="grid grid-cols-2 gap-3 pt-3 mt-auto"
          style={{ borderTop: "1px solid var(--border-soft)" }}
        >
          <div>
            <p className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
              Monthly Rent
            </p>
            <p className="text-sm font-semibold mt-0.5 tabular-nums" style={{ color: "var(--text-primary)" }}>
              {fmtMYR(monthlyRent)}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
              {isWhole ? "Units" : "Rooms"}
            </p>
            <p className="text-sm font-semibold mt-0.5 tabular-nums" style={{ color: "var(--text-primary)" }}>
              {total}
            </p>
          </div>
        </div>

        {/* Quick entry — opens the Revenue / Expenses entry popup */}
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className="ui-btn justify-center" onClick={() => onEntry("revenue")}>
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ background: "var(--accent)" }}
              aria-hidden
            />
            Revenue
          </button>
          <button type="button" className="ui-btn justify-center" onClick={() => onEntry("expense")}>
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ background: "var(--danger)" }}
              aria-hidden
            />
            Expenses
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PropertiesPage() {
  const { properties: liveProperties, units: liveUnits, upsertProperty, hideProperty } = useData();
  const toast = useToast();
  const router = useRouter();

  const [search, setSearch] = useState("");
  const [filterModel, setFilterModel] = useState("all");

  // Seeded from live Supabase data. Local state lets a newly added property
  // appear immediately; a refresh re-reads from the database.
  const [properties, setProperties] = useState<Property[]>(liveProperties);
  const [units, setUnits] = useState<Unit[]>(liveUnits);
  useEffect(() => setProperties(liveProperties), [liveProperties]);
  useEffect(() => setUnits(liveUnits), [liveUnits]);

  const [entry, setEntry] = useState<{ property: Property; tab: QuickEntryTab } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  // Post-create preview: the property is already saved when this is set. Edit
  // temporarily swaps the preview for the form; only saving there updates it.
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Property | null>(null);

  async function deleteProperty(property: Property) {
    const res = await deleteResource(`/api/properties/${encodeURIComponent(property.id)}`);
    if (res.ok) {
      setProperties((prev) => prev.filter((p) => p.id !== property.id));
      setUnits((prev) => prev.filter((u) => u.propertyId !== property.id));
      hideProperty(property.id);
      router.refresh();
      setDeleteTarget(null);
      toast.deleted(`Property ${property.name} deleted`);
    } else {
      toast.info(res.error);
    }
  }

  const previewProperty = properties.find((p) => p.id === previewId);
  const editProperty = properties.find((p) => p.id === editId);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return properties
      .filter((p) => filterModel === "all" || p.rentalModel === filterModel)
      .filter(
        (p) =>
          !q ||
          p.name.toLowerCase().includes(q) ||
          p.shortName.toLowerCase().includes(q) ||
          p.city.toLowerCase().includes(q)
      );
  }, [properties, search, filterModel]);

  return (
    <div className="flex flex-col gap-6">
      {/* Filters - ghost strip, no boxed card to keep the page calm */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          className="ui-input w-auto min-w-[220px] flex-1 max-w-[360px]"
          placeholder="Search Property..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="ui-select min-w-[150px]"
          aria-label="Filter by rental model"
          value={filterModel}
          onChange={(e) => setFilterModel(e.target.value)}
        >
          <option value="all">All Models</option>
          <option value="room_rental">Room Rental</option>
          <option value="whole_unit">Whole Unit</option>
        </select>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            {filtered.length} of {properties.length} properties
          </span>
          <button type="button" className="ui-btn ui-btn-primary" onClick={() => setAddOpen(true)}>
            + Add Property
          </button>
        </div>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="ui-card p-12 text-center">
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            No properties match the current filters.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map((p) => (
            <PropertyCard
              key={p.id}
              property={p}
              units={units.filter((u) => u.propertyId === p.id)}
              onEntry={(tab) => setEntry({ property: p, tab })}
              onEdit={() => setEditId(p.id)}
              onDelete={() => setDeleteTarget(p)}
            />
          ))}
        </div>
      )}

      {/* Quick Entry popup (Revenue / Expenses) */}
      {entry && (
        <QuickEntryModal
          open
          onClose={() => setEntry(null)}
          property={entry.property}
          units={units.filter((u) => u.propertyId === entry.property.id)}
          initialTab={entry.tab}
        />
      )}

      {/* Add Property popup — persists to the database, then shows the preview.
          The saved rows come back with their real (server-generated) ids. */}
      <AddPropertyModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSubmit={async (property, newUnits) => {
          const res = await saveResource<{ property: Property; units: Unit[] }>(
            "/api/properties",
            "POST",
            { property, units: newUnits }
          );
          if (!res.ok) {
            toast.info(res.error);
            return false;
          }
          setProperties((prev) => [res.data.property, ...prev]);
          setUnits((prev) => [...prev, ...res.data.units]);
          upsertProperty(res.data.property, res.data.units);
          router.refresh();
          setPreviewId(res.data.property.id);
          toast.created(`Property ${res.data.property.name} created`);
        }}
      />

      {/* Edit popup — from the preview's Edit button or a card's action menu.
          Only saving here updates the property. */}
      {editProperty && (
        <AddPropertyModal
          open
          initial={{ property: editProperty, units: units.filter((u) => u.propertyId === editProperty.id) }}
          onClose={() => setEditId(null)}
          onSubmit={async (property, newUnits) => {
            const res = await saveResource<{ property: Property; units: Unit[] }>(
              `/api/properties/${encodeURIComponent(property.id)}`,
              "PUT",
              { property, units: newUnits }
            );
            if (!res.ok) {
              toast.info(res.error);
              return false;
            }
            setProperties((prev) => prev.map((p) => (p.id === property.id ? res.data.property : p)));
            setUnits((prev) => [...prev.filter((u) => u.propertyId !== property.id), ...res.data.units]);
            upsertProperty(res.data.property, res.data.units);
            router.refresh();
            setEditId(null);
            toast.updated(`Property ${res.data.property.name} updated`);
          }}
        />
      )}

      {/* Post-create preview — Done or clicking outside closes it */}
      {previewProperty && !editProperty && (
        <PropertyPreviewModal
          open
          property={previewProperty}
          units={units.filter((u) => u.propertyId === previewProperty.id)}
          onEdit={() => setEditId(previewProperty.id)}
          onClose={() => setPreviewId(null)}
        />
      )}

      {/* Delete — destructive confirm, cascades to units/tenants/records */}
      {deleteTarget && (
        <ConfirmDialog
          open
          title="Delete Property"
          message={`Delete ${deleteTarget.name}? This permanently removes the property together with its units, tenants, revenue and expense records, and cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={() => deleteProperty(deleteTarget)}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
