#!/usr/bin/env node
/**
 * Supabase keep-alive.
 *
 * Supabase's free tier pauses a project after ~7 days with no activity. This
 * script makes a tiny request against the database so the project stays awake.
 * Run it on a schedule (GitHub Actions, Vercel Cron, or Windows Task Scheduler)
 * at least once every few days.
 *
 * Env it reads (from process env or a local .env when run manually):
 *   SUPABASE_URL            (or NEXT_PUBLIC_SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY  (preferred) or NEXT_PUBLIC_SUPABASE_ANON_KEY
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
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {
  /* no .env file — rely on the environment (CI, etc.) */
}

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error("keepalive: missing SUPABASE_URL / key env vars");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { count, error } = await supabase
  .from("properties")
  .select("*", { count: "exact", head: true });

if (error) {
  console.error("keepalive: query failed:", error.message);
  process.exit(1);
}

console.log(`keepalive: ok @ ${new Date().toISOString()} (properties count=${count ?? "n/a"})`);
