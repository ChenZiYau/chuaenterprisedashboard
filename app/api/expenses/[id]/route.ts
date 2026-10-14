import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { mapExpense } from "@/lib/db";
import { expenseRow, hasValidEntryTarget, isExpenseEntry } from "@/app/api/_lib/financialEntries";

// Deletes a single expense entry. Session-cookie-gated by proxy.ts.
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
  if (!isExpenseEntry(body)) {
    return NextResponse.json({ error: "Provide a valid expense with a positive amount, date and category." }, { status: 400 });
  }
  try {
    const { data: existing, error: findError } = await supabaseAdmin.from("expenses").select("id, property_id, month, year").eq("id", id).maybeSingle();
    if (findError) throw findError;
    if (!existing) return NextResponse.json({ error: "Expense not found." }, { status: 404 });
    if (existing.property_id !== body.propertyId || Number(existing.month) !== body.month || Number(existing.year) !== body.year) {
      return NextResponse.json({ error: "The property and billing period cannot change when editing an expense." }, { status: 400 });
    }
    if (!(await hasValidEntryTarget(body.propertyId, body.unitId))) {
      return NextResponse.json({ error: "The selected property or room is invalid." }, { status: 400 });
    }
    const { data, error } = await supabaseAdmin.from("expenses").update(expenseRow(body)).eq("id", id).select("*").maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Expense not found." }, { status: 404 });
    return NextResponse.json({ entry: mapExpense(data) });
  } catch {
    return NextResponse.json({ error: "Could not update the expense." }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const { data, error } = await supabaseAdmin
      .from("expenses")
      .delete()
      .eq("id", id)
      .select("id");
    if (error) throw error;
    if (!data || data.length === 0) {
      return NextResponse.json({ error: "Expense not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Could not delete the expense." },
      { status: 500 },
    );
  }
}
