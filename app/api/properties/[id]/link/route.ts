import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { normalizeSlug, slugError } from "@/lib/slug";

// Updates a property's custom share-link slug. Session-cookie-gated by
// proxy.ts like every other dashboard API route.
export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const raw = (body as { slug?: unknown }).slug;
  if (typeof raw !== "string") {
    return NextResponse.json({ error: "Missing slug." }, { status: 400 });
  }

  const slug = normalizeSlug(raw);

  // An empty slug clears the customisation (link falls back to the id).
  if (slug !== "") {
    const invalid = slugError(slug);
    if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

    // Uniqueness across other properties (case-insensitive, matches the
    // partial unique index on lower(slug)).
    const { data: clash, error: clashErr } = await supabaseAdmin
      .from("properties")
      .select("id")
      .ilike("slug", slug)
      .neq("id", id)
      .limit(1);
    if (clashErr) {
      return NextResponse.json({ error: "Could not check availability." }, { status: 500 });
    }
    if (clash && clash.length > 0) {
      return NextResponse.json(
        { error: "That link is already used by another property." },
        { status: 409 },
      );
    }
  }

  const { data, error } = await supabaseAdmin
    .from("properties")
    .update({ slug: slug === "" ? null : slug, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id, slug");
  if (error) {
    return NextResponse.json({ error: "Could not save the link." }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "Property not found." }, { status: 404 });
  }

  return NextResponse.json({ slug: data[0].slug ?? null });
}
