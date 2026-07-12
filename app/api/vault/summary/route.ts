import { NextResponse } from "next/server";
import { getProperties } from "@/lib/db";
import { vaultFetch } from "@/lib/vaultServer";

/** What the Share page needs to know about each property's vault gallery. */
interface VaultSummary {
  count: number;
  coverUrl: string | null;
}

// Aggregates the Vault's per-property image indexes server-side so the Share
// page can show counts and cover thumbnails without cross-origin requests.
// Stays behind the session-cookie gate — only the logged-in dashboard uses it.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const properties = await getProperties();

    const entries = await Promise.all(
      properties.map(async (p): Promise<[string, VaultSummary]> => {
        try {
          const res = await vaultFetch(
            `/api/images/${encodeURIComponent(p.id)}`,
          );
          if (!res.ok) return [p.id, { count: 0, coverUrl: null }];
          const index = (await res.json()) as {
            images?: { imageUrl?: string }[];
          };
          const images = Array.isArray(index.images) ? index.images : [];
          return [
            p.id,
            {
              count: images.length,
              coverUrl: images[0]?.imageUrl ?? null,
            },
          ];
        } catch {
          return [p.id, { count: 0, coverUrl: null }];
        }
      }),
    );

    return NextResponse.json({ summaries: Object.fromEntries(entries) });
  } catch {
    return NextResponse.json(
      { error: "Could not load vault summary." },
      { status: 500 },
    );
  }
}
