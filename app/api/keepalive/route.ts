import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

// GitHub Actions runs scripts/keepalive.mjs directly; this authenticated endpoint
// also supports manual checks. Do not add a second schedule for it.
export const dynamic = "force-dynamic";

function respond(ok: boolean, status: number, error?: string) {
  return NextResponse.json(
    { ok, at: new Date().toISOString(), ...(error ? { error } : {}) },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret?.trim()) {
    console.error(JSON.stringify({ event: "keepalive", outcome: "missing_cron_secret", at: new Date().toISOString() }));
    return respond(false, 503, "Keepalive is not configured");
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return respond(false, 401, "Unauthorized");
  }

  const signal = AbortSignal.timeout(10_000);
  try {
    const { error } = await supabaseAdmin
      .from("properties")
      .select("id", { head: true })
      .limit(1)
      .abortSignal(signal);

    if (error) throw error;
    console.info(JSON.stringify({ event: "keepalive", outcome: "success", at: new Date().toISOString() }));
    return respond(true, 200);
  } catch {
    const timedOut = signal.aborted;
    // Do not log raw SDK errors: they can contain URLs or database details.
    console.error(JSON.stringify({ event: "keepalive", outcome: timedOut ? "timeout" : "database_error", at: new Date().toISOString() }));
    return respond(false, timedOut ? 504 : 500, timedOut ? "Database check timed out" : "Database check failed");
  }
}
