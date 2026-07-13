import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { mapProperty, mapUnit } from "@/lib/db";
import { parsePropertyPayload, propertyRow, unitRow } from "@/lib/propertyRows";

// Deletes a property and everything that hangs off it (tenants, revenue,
// expenses, units). The FKs have no ON DELETE CASCADE, so the dependents are
// removed explicitly, leaf-first. Session-cookie-gated by proxy.ts.
export const dynamic = "force-dynamic";

// Saves the Edit Property form: updates the property row, then reconciles the
// unit list — payload units whose id matches an existing row are updated in
// place (preserving tenant/revenue references), the rest are inserted, and
// existing units missing from the payload are deleted (their tenant/revenue
// FKs are ON DELETE SET NULL). Returns the persisted rows.
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

  const payload = parsePropertyPayload(body);
  if (!payload) {
    return NextResponse.json({ error: "Property name is required." }, { status: 400 });
  }

  try {
    const { data: pRows, error: pErr } = await supabaseAdmin
      .from("properties")
      .update({
        ...propertyRow(payload.property, payload.units),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*");
    if (pErr) throw pErr;
    if (!pRows || pRows.length === 0) {
      return NextResponse.json({ error: "Property not found." }, { status: 404 });
    }

    const { data: current, error: curErr } = await supabaseAdmin
      .from("units")
      .select("id")
      .eq("property_id", id);
    if (curErr) throw curErr;
    const existingIds = new Set((current ?? []).map((u) => u.id as string));

    const keptIds = new Set(
      payload.units.map((u) => u.id).filter((uid) => existingIds.has(uid)),
    );
    const removedIds = [...existingIds].filter((uid) => !keptIds.has(uid));
    if (removedIds.length > 0) {
      const { error } = await supabaseAdmin.from("units").delete().in("id", removedIds);
      if (error) throw error;
    }

    const inserts: Record<string, unknown>[] = [];
    for (let i = 0; i < payload.units.length; i++) {
      const u = payload.units[i];
      if (keptIds.has(u.id)) {
        const { error } = await supabaseAdmin
          .from("units")
          .update(unitRow(u, id, i))
          .eq("id", u.id);
        if (error) throw error;
      } else {
        inserts.push(unitRow(u, id, i));
      }
    }
    if (inserts.length > 0) {
      const { error } = await supabaseAdmin.from("units").insert(inserts);
      if (error) throw error;
    }

    const { data: uRows, error: uErr } = await supabaseAdmin
      .from("units")
      .select("*")
      .eq("property_id", id)
      .order("sort_order", { ascending: true });
    if (uErr) throw uErr;

    return NextResponse.json({
      property: mapProperty(pRows[0]),
      units: (uRows ?? []).map(mapUnit),
    });
  } catch {
    return NextResponse.json(
      { error: "Could not save the property." },
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
