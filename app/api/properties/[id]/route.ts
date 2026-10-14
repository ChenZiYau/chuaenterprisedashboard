import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { mapProperty, mapUnit } from "@/lib/db";
import { parsePropertyPayload, propertyRow, resolveSlug, slugTaken, unitRow } from "@/lib/propertyRows";

// Deletes a property and everything that hangs off it (tenants, revenue,
// expenses, units). The FKs have no ON DELETE CASCADE, so the dependents are
// removed explicitly, leaf-first. Session-cookie-gated by proxy.ts.
export const dynamic = "force-dynamic";

// Saves the Edit Property form: updates the property row, then reconciles the
// unit list — payload units whose id matches an existing row are updated in
// place (preserving tenant/revenue references), the rest are inserted, and
// existing units missing from the payload are deleted only when they have no
// linked tenant or financial records. Returns the persisted rows.
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
    return NextResponse.json({ error: "A property name and a valid, non-empty unit list are required." }, { status: 400 });
  }

  const resolved = resolveSlug(payload.property);
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: 400 });
  }
  payload.property.slug = resolved.slug;

  try {
    if (await slugTaken(resolved.slug, id)) {
      return NextResponse.json(
        { error: `The slug "${resolved.slug}" is already used by another property.` },
        { status: 409 },
      );
    }

    const { data: current, error: curErr } = await supabaseAdmin
      .from("units")
      .select("id, tenant_name")
      .eq("property_id", id);
    if (curErr) throw curErr;
    const existingIds = new Set((current ?? []).map((u) => u.id as string));
    // Tenant assignment belongs to the tenant routes. Property edits must not
    // overwrite occupancy with a stale form value or move only a display name.
    const currentNames = new Map((current ?? []).map((u) => [u.id as string, u.tenant_name as string | null]));
    const unitsForSave = payload.units.map((u) => ({ ...u, tenantName: currentNames.get(u.id) ?? undefined }));

    const keptIds = new Set(
      payload.units.map((u) => u.id).filter((uid) => existingIds.has(uid)),
    );
    const removedIds = [...existingIds].filter((uid) => !keptIds.has(uid));
    // Check before any writes: removing a linked room would detach its
    // tenants and historical income/expenses, including on model changes.
    if (removedIds.length > 0) {
      for (const table of ["tenants", "revenue", "expenses"] as const) {
        const { data, error } = await supabaseAdmin
          .from(table)
          .select("id")
          .in("unit_id", removedIds)
          .limit(1);
        if (error) throw error;
        if (data?.length) {
          return NextResponse.json(
            { error: "Cannot remove a unit with linked tenants, revenue or expenses. Keep the unit to preserve its records." },
            { status: 409 },
          );
        }
      }
    }

    const { data: pRows, error: pErr } = await supabaseAdmin
      .from("properties")
      .update({
        ...propertyRow(payload.property, unitsForSave),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*");
    if (pErr) throw pErr;
    if (!pRows || pRows.length === 0) {
      return NextResponse.json({ error: "Property not found." }, { status: 404 });
    }

    if (removedIds.length > 0) {
      const { error } = await supabaseAdmin.from("units").delete().in("id", removedIds);
      if (error) throw error;
    }

    const inserts: Record<string, unknown>[] = [];
    for (let i = 0; i < payload.units.length; i++) {
      const u = payload.units[i];
      if (keptIds.has(u.id)) {
        const { tenant_name: _tenantName, is_rented: _isRented, ...fields } = unitRow(u, id, i);
        const { error } = await supabaseAdmin
          .from("units")
          .update(fields)
          .eq("id", u.id);
        if (error) throw error;
      } else {
        inserts.push(unitRow({ ...u, tenantName: undefined }, id, i));
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
