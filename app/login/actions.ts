"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, createSessionToken } from "@/lib/auth";
import { verifyCredentials } from "@/lib/verifyLogin";

const REMEMBER_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const SESSION_MAX_AGE = 60 * 60 * 8; // 8 hours

// Brute-force throttle: after MAX_FAILS failed attempts from one source the
// login is locked for LOCK_MS. In-memory (per server instance) — enough to
// make online guessing of a strong password impractical.
const MAX_FAILS = 5;
const LOCK_MS = 60_000;
const failures = new Map<string, { fails: number; lockedUntil: number }>();

async function throttleKey(identifier: string): Promise<string> {
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? "local";
  return `${ip}|${identifier.trim().toLowerCase()}`;
}

export type LoginState = { error?: string };

/** Validate credentials and, on success, set the session cookie and redirect
 *  to the originally requested page (or /properties). Returns an error state
 *  that the form renders when credentials are wrong. */
export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const identifier = String(formData.get("identifier") ?? "");
  const password = String(formData.get("password") ?? "");
  const remember = formData.get("remember") === "on";
  const from = String(formData.get("from") ?? "");

  const key = await throttleKey(identifier);
  const record = failures.get(key);
  if (record && record.lockedUntil > Date.now()) {
    return { error: "Too many attempts. Try again in a minute." };
  }

  if (!(await verifyCredentials(identifier, password))) {
    const fails = (record?.fails ?? 0) + 1;
    failures.set(key, {
      fails,
      lockedUntil: fails >= MAX_FAILS ? Date.now() + LOCK_MS : 0,
    });
    return { error: "Incorrect email/username or password." };
  }
  failures.delete(key);

  const maxAge = remember ? REMEMBER_MAX_AGE : SESSION_MAX_AGE;
  const jar = await cookies();
  jar.set(SESSION_COOKIE, await createSessionToken(maxAge), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  });

  // Reject browser-normalized external redirects as well as absolute URLs.
  const localPath = from.startsWith("/") && !from.startsWith("//") && !/[\\\u0000-\u0020\u007f]/.test(from);
  redirect(localPath ? from : "/properties");
}

/** Clear the session and return to the login screen. */
export async function logout() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  redirect("/login");
}
