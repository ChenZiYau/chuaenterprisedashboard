import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { mapExpense } from "@/lib/db";
import type { ExpenseEntry } from "@/lib/data";

// Creates one or more expense entries. The database generates the real uuids;
// the client-side placeholder ids in the payload are ignored and the persisted
// rows are returned so the UI can adopt them. Session-cookie-gated by proxy.ts.
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const entries = (body as { entries?: ExpenseEntry[] })?.entries;
  if (!Array.isArray(entries) || entries.length === 0) {
    return NextResponse.json({ error: "No expense entries provided." }, { status: 400 });
  }
  for (const e of entries) {
    if (!e?.propertyId || !e.month || !e.year || !(Number(e.amount) > 0)) {
      return NextResponse.json({ error: "Each expense needs a property, month, year and a positive amount." }, { status: 400 });
    }
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("expenses")
      .insert(
        entries.map((e) => ({
          property_id: e.propertyId,
          unit_id: e.unitId ?? null,
          month: e.month,
          year: e.year,
          expense_date: e.expenseDate,
          category: e.category,
          description: e.description ?? null,
          is_recurring: e.type === "recurring",
          is_irregular: e.type === "irregular",
          amount: e.amount,
        })),
      )
      .select("*");
    if (error || !data) throw error ?? new Error("insert returned no rows");

    return NextResponse.json({ entries: data.map(mapExpense) });
  } catch {
    return NextResponse.json(
      { error: "Could not save the expense." },
      { status: 500 },
    );
  }
}
