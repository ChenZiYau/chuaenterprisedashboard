import { NextRequest, NextResponse } from "next/server";
import { vaultFetch, VaultError } from "@/lib/vaultServer";

// Session-cookie-gated proxy (see proxy.ts) to the vault's bearer-protected
// image index — the dashboard's Images tab reads and saves through here.
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ propertyId: string }>;
}

function fail(err: unknown) {
  const status = err instanceof VaultError ? err.status : 502;
  const message =
    err instanceof VaultError ? err.message : "Image Vault request failed.";
  return NextResponse.json({ error: message }, { status });
}

/** GET — load the saved image list for a property. */
export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { propertyId } = await ctx.params;
  try {
    const res = await vaultFetch(
      `/api/images/${encodeURIComponent(propertyId)}`,
    );
    return NextResponse.json(await res.json(), { status: res.status });
  } catch (err) {
    return fail(err);
  }
}

/** PUT — persist the full image list for a property. */
export async function PUT(req: NextRequest, ctx: RouteContext) {
  const { propertyId } = await ctx.params;
  try {
    const body = await req.text();
    const res = await vaultFetch(
      `/api/images/${encodeURIComponent(propertyId)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body,
      },
    );
    return NextResponse.json(await res.json(), { status: res.status });
  } catch (err) {
    return fail(err);
  }
}
