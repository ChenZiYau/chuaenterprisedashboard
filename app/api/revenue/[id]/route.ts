import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { mapRevenue } from "@/lib/db";
import { hasValidEntryTarget, isRevenueEntry, revenueRow } from "@/app/api/_lib/financialEntries";

// Deletes a single revenue entry (invoices are rows of this table too).
// Session-cookie-gated by proxy.ts.
export const dynamic = "force-dynamic";

export async function PATCH(
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
  if (!body || typeof body !== "object" || Object.keys(body).length !== 1 ||
      (body as { invoiceGenerated?: unknown }).invoiceGenerated !== true) {
    return NextResponse.json({ error: "Only invoice generation can be updated here." }, { status: 400 });
  }
  try {
    const { data, error } = await supabaseAdmin.from("revenue").update({ invoice_generated: true }).eq("id", id).select("*").maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Revenue entry not found." }, { status: 404 });
    return NextResponse.json({ entry: mapRevenue(data) });
  } catch {
    return NextResponse.json({ error: "Could not generate the invoice." }, { status: 500 });
  }
}

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
  if (!isRevenueEntry(body)) {
    return NextResponse.json({ error: "Provide a valid revenue entry with positive rent and non-negative charges." }, { status: 400 });
  }
  try {
    const { data: existing, error: findError } = await supabaseAdmin.from("revenue").select("*").eq("id", id).maybeSingle();
    if (findError) throw findError;
    if (!existing) return NextResponse.json({ error: "Revenue entry not found." }, { status: 404 });
    // Editing an existing charge must never overwrite another unit or period.
    if (existing.property_id !== body.propertyId || existing.unit_id !== body.unitId ||
        Number(existing.month) !== body.month || Number(existing.year) !== body.year) {
      return NextResponse.json({ error: "The property, unit and billing period cannot change when editing revenue." }, { status: 400 });
    }
    if (!(await hasValidEntryTarget(body.propertyId, body.unitId))) {
      return NextResponse.json({ error: "The selected unit does not belong to this property." }, { status: 400 });
    }
    const { data, error } = await supabaseAdmin.from("revenue").update(revenueRow(body, existing)).eq("id", id).select("*").maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Revenue entry not found." }, { status: 404 });
    return NextResponse.json({ entry: mapRevenue(data) });
  } catch {
    return NextResponse.json({ error: "Could not update the revenue entry." }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const { data, error } = await supabaseAdmin
      .from("revenue")
      .delete()
      .eq("id", id)
      .select("id");
    if (error) throw error;
    if (!data || data.length === 0) {
      return NextResponse.json({ error: "Revenue entry not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Could not delete the revenue entry." },
      { status: 500 },
    );
  }
}
