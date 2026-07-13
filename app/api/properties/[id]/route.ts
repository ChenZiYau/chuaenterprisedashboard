import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

// Deletes a property and everything that hangs off it (tenants, revenue,
// expenses, units). The FKs have no ON DELETE CASCADE, so the dependents are
// removed explicitly, leaf-first. Session-cookie-gated by proxy.ts.
export const dynamic = "force-dynamic";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const { data: units, error: unitsErr } = await supabaseAdmin
      .from("units")
      .select("id")
      .eq("property_id", id);
    if (unitsErr) throw unitsErr;
    const unitIds = (units ?? []).map((u) => u.id as string);

    if (unitIds.length > 0) {
      const { error } = await supabaseAdmin.from("tenants").delete().in("unit_id", unitIds);
      if (error) throw error;
    }

    for (const table of ["revenue", "expenses", "units"] as const) {
      const { error } = await supabaseAdmin.from(table).delete().eq("property_id", id);
      if (error) throw error;
    }

    const { data, error } = await supabaseAdmin
      .from("properties")
      .delete()
      .eq("id", id)
      .select("id");
    if (error) throw error;
    if (!data || data.length === 0) {
      return NextResponse.json({ error: "Property not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Could not delete the property." },
      { status: 500 },
    );
  }
}
