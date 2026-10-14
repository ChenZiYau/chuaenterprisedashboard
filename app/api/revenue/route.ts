import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { mapRevenue } from "@/lib/db";
import { hasValidEntryTarget, isRevenueEntry, revenueRow } from "@/app/api/_lib/financialEntries";

// Creates or updates a single revenue entry. An existing entry for the same
// unit+month+year is updated in place (upsert-style), so saving the same month
// twice does not create duplicates. Session-cookie-gated by proxy.ts.
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!isRevenueEntry(body)) {
    return NextResponse.json(
      { error: "Provide a valid property, unit, billing period, payment date and non-negative charges with positive rent." },
      { status: 400 },
    );
  }

  try {
    if (!(await hasValidEntryTarget(body.propertyId, body.unitId))) {
      return NextResponse.json({ error: "The selected unit does not belong to this property." }, { status: 400 });
    }
    // Check if an entry already exists for this unit+month+year.
    const { data: existing, error: findErr } = await supabaseAdmin
      .from("revenue")
      .select("id, invoice_generated, invoice_number, notes")
      .eq("unit_id", body.unitId)
      .eq("month", body.month)
      .eq("year", body.year)
      .limit(2);
    if (findErr) throw findErr;
    if (existing && existing.length > 1) {
      return NextResponse.json(
        { error: "Multiple entries exist for this unit and billing period. Edit the intended record from Revenue." },
        { status: 409 },
      );
    }
    const row = revenueRow(body, existing?.[0]);

    let result: Record<string, unknown>;

    if (existing && existing.length > 0) {
      // Update existing entry.
      const { data, error } = await supabaseAdmin
        .from("revenue")
        .update(row)
        .eq("id", existing[0].id)
        .select("*")
        .single();
      if (error || !data) throw error ?? new Error("update returned no row");
      result = data;
    } else {
      // Insert new entry.
      const { data, error } = await supabaseAdmin
        .from("revenue")
        .insert(row)
        .select("*")
        .single();
      if (error || !data) throw error ?? new Error("insert returned no row");
      result = data;
    }

    return NextResponse.json({ entry: mapRevenue(result) });
  } catch (err) {
    console.error("[POST /api/revenue]", err);
    return NextResponse.json(
      { error: "Could not save the revenue entry." },
      { status: 500 },
    );
  }
}
