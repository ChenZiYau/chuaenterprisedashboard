import "server-only";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { normalizeSlug, slugError, slugify } from "@/lib/slug";
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
  // An omitted or malformed unit list must never be treated as a request to
  // remove every existing unit during an edit.
  if (!Array.isArray(b?.units) || b.units.length === 0) return null;
  const ids = new Set<string>();
  const nonNegative = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0;
  for (const unit of b.units) {
    if (
      !unit || typeof unit.id !== "string" || !unit.id || ids.has(unit.id) ||
      typeof unit.name !== "string" || !unit.name.trim() ||
      (unit.tenantName != null && typeof unit.tenantName !== "string") ||
      !nonNegative(unit.rentalRate) || !nonNegative(unit.electricityFreeUnits) ||
      (unit.depositMonths != null && !nonNegative(unit.depositMonths)) ||
      (unit.depositAmount != null && !nonNegative(unit.depositAmount))
    ) return null;
    ids.add(unit.id);
  }
  return { property: p, units: b.units };
}

/** Canonical share-link slug for the payload: the submitted slug, falling
 *  back to one derived from the name. Returns an error string when invalid. */
export function resolveSlug(p: Property): { slug: string } | { error: string } {
  const slug = normalizeSlug(typeof p.slug === "string" ? p.slug : "") || slugify(p.name);
  const invalid = slugError(slug);
  return invalid ? { error: `Slug name: ${invalid}` } : { slug };
}

/** True when another property already uses `slug` (unique per lower(slug)). */
export async function slugTaken(slug: string, excludeId?: string): Promise<boolean> {
  let q = supabaseAdmin.from("properties").select("id").ilike("slug", slug).limit(1);
  if (excludeId) q = q.neq("id", excludeId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).length > 0;
}

/** camelCase form values -> properties table row (no id — the DB owns it). */
export function propertyRow(p: Property, units: Unit[]) {
  const name = p.name.trim();
  return {
    name,
    slug: normalizeSlug(p.slug ?? "") || null,
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
