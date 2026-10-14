import { supabaseAdmin } from "@/lib/supabaseServer";

/** Recompute occupancy after a tenant mutation, preserving any co-tenants. */
export async function syncTenantOccupancy(unitIds: (string | null)[]): Promise<void> {
  for (const unitId of new Set(unitIds.filter((id): id is string => Boolean(id)))) {
    const { data: tenants, error: tenantError } = await supabaseAdmin
      .from("tenants")
      .select("name")
      .eq("unit_id", unitId)
      .order("name")
      .limit(1);
    if (tenantError) throw tenantError;
    const occupant = tenants?.[0];
    const { error: unitError } = await supabaseAdmin
      .from("units")
      .update({ tenant_name: occupant?.name ?? null, is_rented: Boolean(occupant) })
      .eq("id", unitId);
    if (unitError) throw unitError;
  }
}
