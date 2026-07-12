import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

// Lightweight keep-alive endpoint. Hitting it runs a tiny DB query so the
// free-tier Supabase project stays awake. Point an external scheduler at it
// (Vercel Cron, cron-job.org, UptimeRobot, ...) every few days, or use the
// GitHub Action / scripts/keepalive.mjs instead.
export const dynamic = "force-dynamic";

export async function GET() {
  const { count, error } = await supabaseAdmin
    .from("properties")
    .select("*", { count: "exact", head: true });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, at: new Date().toISOString(), count });
}
