import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

/** Gate every page behind the signed session cookie. Unauthenticated requests
 *  are bounced to /login; an already-authenticated user visiting /login is
 *  sent on to the dashboard. Static assets and the login route are exempt via
 *  the matcher below. */
export async function proxy(req: NextRequest) {
  const authed = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  const { pathname, search } = req.nextUrl;
  const isLogin = pathname === "/login";
  // The keep-alive endpoint must be reachable by external schedulers, and the
  // Image Vault fetches the property list with its own bearer-token auth, so
  // both stay outside the session-cookie gate.
  const isPublicApi =
    pathname === "/api/keepalive" || pathname === "/api/vault/properties";
  if (isPublicApi) return NextResponse.next();

  if (!authed && !isLogin) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    if (pathname !== "/") url.searchParams.set("from", pathname + search);
    return NextResponse.redirect(url);
  }

  if (authed && isLogin) {
    const url = req.nextUrl.clone();
    url.pathname = "/properties";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Run on everything except Next internals and static files.
  matcher: ["/api/:path*", "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
