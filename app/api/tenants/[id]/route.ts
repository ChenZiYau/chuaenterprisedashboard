import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { mapTenant } from "@/lib/db";
import { parseTenantInput } from "@/lib/tenantInput";
import { syncTenantOccupancy } from "@/lib/tenantOccupancy";

// Updates or deletes a tenant. units.tenant_name is denormalised,
// so it has to be synced explicitly. Session-cookie-gated by proxy.ts.
export const dynamic = "force-dynamic";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

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
    // Fetch old tenant to know the previous unit (for clearing tenant_name).
    const { data: oldRows, error: findErr } = await supabaseAdmin
      .from("tenants")
      .select("unit_id")
      .eq("id", id)
      .limit(1);
    if (findErr) throw findErr;
    if (!oldRows || oldRows.length === 0) {
      return NextResponse.json({ error: "Tenant not found." }, { status: 404 });
    }
    const oldUnitId = oldRows[0].unit_id as string | null;

    // Update the tenant.
    const { data, error } = await supabaseAdmin
      .from("tenants")
      .update(row)
      .eq("id", id)
      .select("*")
      .single();
    if (error || !data) throw error ?? new Error("update returned no row");

    let warning: string | undefined;
    try {
      await syncTenantOccupancy([row.unit_id, oldUnitId]);
    } catch (err) {
      console.error("[PUT /api/tenants/[id]] occupancy sync:", err);
      warning = "Tenant saved, but room occupancy could not be updated.";
    }

    return NextResponse.json({ tenant: mapTenant(data), warning });
  } catch (err) {
    console.error("[PUT /api/tenants/[id]]", err);
    return NextResponse.json(
      { error: "Could not update the tenant." },
      { status: 500 },
    );
  }
}


export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const { data, error } = await supabaseAdmin
      .from("tenants")
      .delete()
      .eq("id", id)
      .select("unit_id");
    if (error) throw error;
    if (!data || data.length === 0) {
      return NextResponse.json({ error: "Tenant not found." }, { status: 404 });
    }

    const unitId = data[0].unit_id as string | null;
    let warning: string | undefined;
    try {
      await syncTenantOccupancy([unitId]);
    } catch (err) {
      console.error("[DELETE /api/tenants/[id]] occupancy sync:", err);
      warning = "Tenant deleted, but room occupancy could not be updated.";
    }

    return NextResponse.json({ ok: true, warning });
  } catch {
    return NextResponse.json(
      { error: "Could not delete the tenant." },
      { status: 500 },
    );
  }
}
