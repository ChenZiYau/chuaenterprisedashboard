import { NextRequest, NextResponse } from "next/server";
import { vaultFetch, VaultError } from "@/lib/vaultServer";

// Session-cookie-gated proxy (see proxy.ts) that forwards photo uploads to
// the vault's bearer-protected /api/upload.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }

  try {
    const res = await vaultFetch("/api/upload", { method: "POST", body: form });
    return NextResponse.json(await res.json(), { status: res.status });
  } catch (err) {
    const status = err instanceof VaultError ? err.status : 502;
    const message =
      err instanceof VaultError ? err.message : "Upload failed.";
    return NextResponse.json({ error: message }, { status });
  }
}
