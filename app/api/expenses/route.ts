import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { mapExpense } from "@/lib/db";
import { expenseRow, hasValidEntryTarget, isExpenseEntry } from "@/app/api/_lib/financialEntries";

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

  const entries = (body as { entries?: unknown[] })?.entries;
  if (!Array.isArray(entries) || entries.length === 0) {
    return NextResponse.json({ error: "No expense entries provided." }, { status: 400 });
  }
  if (!entries.every(isExpenseEntry)) {
    return NextResponse.json({ error: "Each expense needs a valid property, billing period, date, category and positive amount." }, { status: 400 });
  }

  try {
    for (const entry of entries) {
      if (!(await hasValidEntryTarget(entry.propertyId, entry.unitId))) {
        return NextResponse.json({ error: "An expense has an invalid property or room." }, { status: 400 });
      }
    }
    const { data, error } = await supabaseAdmin
      .from("expenses")
      .insert(
        entries.map(expenseRow),
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
