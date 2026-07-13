import "server-only";
import type { Property, Unit } from "@/lib/data";

// Payload the Add/Edit Property form sends. Ids on units are either real
// database uuids (existing rows being edited) or client-side placeholders
// (new rows) — the routes tell them apart against the current unit set.
export type PropertyPayload = {
  property: Property;
  units: Unit[];
};

export function parsePropertyPayload(body: unknown): PropertyPayload | null {
  const b = body as Partial<PropertyPayload> | null;
  const p = b?.property;
  if (!p || typeof p.name !== "string" || !p.name.trim()) return null;
  return { property: p, units: Array.isArray(b?.units) ? b.units : [] };
}

/** camelCase form values -> properties table row (no id — the DB owns it). */
export function propertyRow(p: Property, units: Unit[]) {
  const name = p.name.trim();
  return {
    name,
    short_name: p.shortName?.trim() || name,
    city: p.city?.trim() ?? "",
    rental_model: p.rentalModel === "whole_unit" ? "whole_unit" : "room_rental",
    address: p.address?.trim() || null,
    state: p.state?.trim() || null,
    postcode: p.postcode?.trim() || null,
    property_type: p.propertyType ?? "house",
    status: p.status ?? "active",
    description: p.description?.trim() || null,
    image_url: p.imageUrl || null,
    total_units: units.length,
    rented_units: units.filter((u) => u.tenantName?.trim()).length,
  };
}

/** camelCase form values -> units table row (no id / property id supplied by caller). */
export function unitRow(u: Unit, propertyId: string, sortOrder: number) {
  const tenant = u.tenantName?.trim() || null;
  return {
    property_id: propertyId,
    name: (u.name ?? "").trim(),
    sort_order: sortOrder,
    is_rented: !!tenant,
    tenant_name: tenant,
    rental_rate: Number(u.rentalRate) || 0,
    deposit_months: u.depositMonths ?? null,
    deposit_amount: u.depositAmount ?? null,
    electricity_free_units: Number(u.electricityFreeUnits) || 0,
  };
}
