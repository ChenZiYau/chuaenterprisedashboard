import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

// Deletes a single expense entry. Session-cookie-gated by proxy.ts.
export const dynamic = "force-dynamic";

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
