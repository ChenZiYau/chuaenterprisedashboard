import { NextRequest, NextResponse } from "next/server";
import { getProperties } from "@/lib/db";

// Consumed by the Image Vault companion app (chua-image-vault), which has no
// property database of its own. Sits outside the session-cookie gate (see
// proxy.ts) and is protected by the shared VAULT_API_KEY bearer token instead.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const expected = process.env.VAULT_API_KEY;
  if (!expected) {
    return NextResponse.json(
      { error: "Server is not configured: set VAULT_API_KEY." },
      { status: 500 },
    );
  }

  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const properties = (await getProperties()).map((p) => ({
      id: p.id,
      slug: p.slug ?? null,
      name: p.name,
      shortName: p.shortName,
      city: p.city,
    }));
    return NextResponse.json({ properties });
  } catch {
    return NextResponse.json(
      { error: "Could not load properties." },
      { status: 500 },
    );
  }
}
