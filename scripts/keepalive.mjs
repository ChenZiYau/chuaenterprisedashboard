#!/usr/bin/env node
/**
 * Supabase keep-alive.
 *
 * Supabase's free tier may pause a project after a week of low activity. This
 * daily write reduces that risk; it cannot guarantee availability or resume
 * a paused project. Resume the project in the Supabase dashboard first.
 * Scheduled by .github/workflows/keepalive.yml daily at 08:17 Malaysia time.
 * First run scripts/setup-database-healthcheck.sql in the Supabase SQL editor.
 * Connects directly with Supabase credentials; CRON_SECRET is only needed
 * for the separate /api/keepalive HTTP endpoint. Do not add a second schedule.
 *
 * Env it reads (from process env or a local .env when run manually):
 *   SUPABASE_URL            (or NEXT_PUBLIC_SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY  (required; anonymous access is disabled)
 *
 * Usage: node scripts/keepalive.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

// Minimal .env loader so the script also works when run by hand without a
// process manager that injects env vars. Silently ignored in CI (env is set).
try {
  for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {
  /* no .env file — rely on the environment (CI, etc.) */
}

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("keepalive: missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY env vars");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const signal = AbortSignal.timeout(10_000);
try {
  const { error } = await supabase
    .rpc("record_database_healthcheck")
    .abortSignal(signal);
  if (error) throw error;
  console.log(JSON.stringify({ ok: true, at: new Date().toISOString() }));
} catch {
  console.error(JSON.stringify({ ok: false, at: new Date().toISOString(), error: signal.aborted ? "Database check timed out" : "Database check failed. Verify the project is resumed, setup SQL has been applied, and Actions secrets are configured." }));
  process.exitCode = 1;
}
