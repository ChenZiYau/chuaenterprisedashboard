import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { mapTenant } from "@/lib/db";
import { parseTenantInput } from "@/lib/tenantInput";
import { syncTenantOccupancy } from "@/lib/tenantOccupancy";

// Creates a new tenant and updates the denormalised units.tenant_name column.
// Session-cookie-gated by proxy.ts.
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = parseTenantInput(body);
  if (parsed.error) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const row = parsed.row!;

  try {
    const { data, error } = await supabaseAdmin
      .from("tenants")
      .insert(row)
      .select("*")
      .single();
    if (error || !data) throw error ?? new Error("insert returned no row");

    // The tenant is already committed. Report a secondary failure accurately
    // so a retry cannot create a duplicate tenant.
    let warning: string | undefined;
    try {
      await syncTenantOccupancy([row.unit_id]);
    } catch (err) {
      console.error("[POST /api/tenants] occupancy sync:", err);
      warning = "Tenant saved, but room occupancy could not be updated.";
    }

    return NextResponse.json({ tenant: mapTenant(data), warning });
  } catch (err) {
    console.error("[POST /api/tenants]", err);
    return NextResponse.json(
      { error: "Could not create the tenant." },
      { status: 500 },
    );
  }
}
