import "server-only";
import { createClient } from "@supabase/supabase-js";

/** Server-only Supabase client using the service-role key.
 *
 *  This key bypasses Row Level Security, so it must NEVER reach the browser.
 *  The `server-only` import above makes the build fail if this module is ever
 *  pulled into a client component. All dashboard data access goes through here.
 */
const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url) throw new Error("SUPABASE_URL is not set");
if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");

export const supabaseAdmin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
