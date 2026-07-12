/** Session tokens for the dashboard's cookie auth.
 *
 *  A session is `exp.signature` where `exp` is a unix-seconds expiry and
 *  `signature` is HMAC-SHA256 over it with SESSION_SECRET — unforgeable
 *  without the secret, self-expiring, and verifiable in edge middleware.
 *
 *  Credential checking lives in Supabase (`app_users` table +
 *  `verify_app_login` RPC — see lib/verifyLogin.ts). This module uses only
 *  Web Crypto because proxy.ts (edge middleware) imports it. */

export const SESSION_COOKIE = "ce_session";

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "SESSION_SECRET must be set (>= 32 chars) — sessions cannot be signed without it.",
    );
  }
  return secret;
}

async function hmac(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`ce-session:${payload}`),
  );
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Mint a signed session token valid for `maxAgeSeconds` from now. */
export async function createSessionToken(maxAgeSeconds: number): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + maxAgeSeconds;
  return `${exp}.${await hmac(String(exp))}`;
}

/** True when the token is well-formed, unexpired, and correctly signed. */
export async function verifySessionToken(
  token: string | undefined,
): Promise<boolean> {
  if (!token) return false;
  const dot = token.indexOf(".");
  if (dot <= 0) return false;

  const exp = Number(token.slice(0, dot));
  if (!Number.isFinite(exp) || exp < Date.now() / 1000) return false;

  let expected: string;
  try {
    expected = await hmac(token.slice(0, dot));
  } catch {
    return false; // secret not configured — nobody is signed in
  }
  const given = token.slice(dot + 1);

  // Constant-time comparison.
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}
