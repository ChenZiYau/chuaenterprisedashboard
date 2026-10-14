import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { mapUnit } from "@/lib/db";

// Deposit editing is intentionally limited to these two fields. Property and
// tenant assignments continue to use their existing routes.
export const dynamic = "force-dynamic";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const input = body as { depositMonths?: unknown; depositAmount?: unknown } | null;
  const valid = (value: unknown) => value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0);
  if (!input || !valid(input.depositMonths) || !valid(input.depositAmount)) {
    return NextResponse.json({ error: "Deposit months and amount must be non-negative numbers or null." }, { status: 400 });
  }

  const { id } = await params;
  try {
    const { data, error } = await supabaseAdmin
      .from("units")
      .update({ deposit_months: input.depositMonths, deposit_amount: input.depositAmount })
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Unit not found." }, { status: 404 });
    return NextResponse.json({ unit: mapUnit(data) });
  } catch {
    return NextResponse.json({ error: "Could not save the deposit." }, { status: 500 });
  }
}
