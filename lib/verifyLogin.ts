import "server-only";
import { supabaseAdmin } from "./supabaseServer";

/** True when the identifier (email or username, case-insensitive) and
 *  password match a row in Supabase `app_users`. Hash comparison happens
 *  in Postgres via the `verify_app_login` function; the password never
 *  touches a query result. */
export async function verifyCredentials(
  identifier: string,
  password: string,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin.rpc("verify_app_login", {
    identifier,
    password,
  });
  if (error) {
    console.error("verify_app_login failed:", error.message);
    return false;
  }
  return data === true;
}
