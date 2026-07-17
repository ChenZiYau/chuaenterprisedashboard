import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { mapProperty, mapUnit } from "@/lib/db";
import { parsePropertyPayload, propertyRow, resolveSlug, slugTaken, unitRow } from "@/lib/propertyRows";

// Creates a property together with its units. The database generates the real
// uuids; the client-side placeholder ids in the payload are ignored and the
// persisted rows are returned so the UI can adopt them. Session-cookie-gated
// by proxy.ts.
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
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

  const resolved = resolveSlug(payload.property);
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: 400 });
  }
  payload.property.slug = resolved.slug;

  try {
    if (await slugTaken(resolved.slug)) {
      return NextResponse.json(
        { error: `The slug "${resolved.slug}" is already used by another property.` },
        { status: 409 },
      );
    }

    const { data: pRow, error: pErr } = await supabaseAdmin
      .from("properties")
      .insert(propertyRow(payload.property, payload.units))
      .select("*")
      .single();
    if (pErr || !pRow) throw pErr ?? new Error("insert returned no row");

    let unitRows: Record<string, unknown>[] = [];
    if (payload.units.length > 0) {
      const { data, error } = await supabaseAdmin
        .from("units")
        .insert(payload.units.map((u, i) => unitRow(u, pRow.id as string, i)))
        .select("*");
      if (error) {
        // Best-effort rollback so a half-created property doesn't linger.
        await supabaseAdmin.from("properties").delete().eq("id", pRow.id);
        throw error;
      }
      unitRows = data ?? [];
    }

    return NextResponse.json({
      property: mapProperty(pRow),
      units: unitRows
        .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0))
        .map(mapUnit),
    });
  } catch {
    return NextResponse.json(
      { error: "Could not create the property." },
      { status: 500 },
    );
  }
}
