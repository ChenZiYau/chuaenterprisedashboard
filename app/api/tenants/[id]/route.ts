import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

// Deletes a tenant and frees their unit (units.tenant_name is denormalised,
// so it has to be cleared explicitly). Session-cookie-gated by proxy.ts.
export const dynamic = "force-dynamic";

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
    if (unitId) {
      const { error: unitErr } = await supabaseAdmin
        .from("units")
        .update({ tenant_name: null })
        .eq("id", unitId);
      if (unitErr) throw unitErr;
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Could not delete the tenant." },
      { status: 500 },
    );
  }
}
