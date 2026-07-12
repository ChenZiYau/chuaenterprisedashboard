"use client";

import { useEffect, useMemo, useState } from "react";
import { PropertyCover } from "@/components/PropertyCover";
import { useToast } from "@/components/Toast";
import { useData } from "@/lib/DataContext";
import type { Property } from "@/lib/data";

/** Per-property gallery stats reported by the Image Vault. */
interface VaultSummary {
  count: number;
  coverUrl: string | null;
}

const VAULT_URL = (process.env.NEXT_PUBLIC_VAULT_URL ?? "").replace(/\/+$/, "");

/** Public customer-facing gallery link for a property. */
function galleryLink(propertyId: string): string {
  return `${VAULT_URL}/p/${encodeURIComponent(propertyId)}`;
}

/** Photos are managed inside the dashboard now — the vault has no admin UI. */
function manageLink(propertyId: string): string {
  return `/properties/${encodeURIComponent(propertyId)}?tab=images`;
}

function ShareCard({ property, summary }: { property: Property; summary?: VaultSummary }) {
  const toast = useToast();
  const count = summary?.count ?? 0;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(galleryLink(property.id));
      toast.created(`Gallery link for ${property.shortName || property.name} copied`);
    } catch {
      toast.info("Could not copy — long-press the Preview link instead.");
    }
  }

  // Prefer the vault gallery's first photo as the card cover; fall back to the
  // property's own cover (or its monogram gradient) when nothing is uploaded.
  const coverProperty = summary?.coverUrl
    ? { ...property, imageUrl: summary.coverUrl }
    : property;

  return (
    <div className="ui-card overflow-hidden flex flex-col transition hover:shadow-md group">
      <PropertyCover property={coverProperty} />

      <div className="p-5 flex flex-col gap-4 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-base font-semibold truncate" style={{ color: "var(--text-primary)" }}>
              {property.name}
            </h3>
            <p className="text-xs mt-1 truncate" style={{ color: "var(--text-muted)" }}>
              {property.city}
            </p>
          </div>
          <span
            className="shrink-0 px-2 py-0.5 rounded-md text-[11px] font-semibold tabular-nums"
            style={{
              background: count > 0 ? "var(--accent-soft, var(--surface-muted))" : "var(--surface-muted)",
              color: count > 0 ? "var(--accent)" : "var(--text-muted)",
            }}
          >
            {count} {count === 1 ? "photo" : "photos"}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 mt-auto">
          <button
            type="button"
            className="ui-btn ui-btn-primary justify-center"
            onClick={copyLink}
            disabled={count === 0}
            title={count === 0 ? "Upload photos first" : "Copy the public gallery link"}
          >
            Copy Link
          </button>
          <a href={manageLink(property.id)} className="ui-btn justify-center">
            Manage Photos
          </a>
        </div>

        {count > 0 && (
          <a
            href={galleryLink(property.id)}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-medium text-center transition hover:underline"
            style={{ color: "var(--text-muted)" }}
          >
            Preview what customers see →
          </a>
        )}
      </div>
    </div>
  );
}

export default function SharePage() {
  const { properties } = useData();
  const [search, setSearch] = useState("");
  const [summaries, setSummaries] = useState<Record<string, VaultSummary>>({});
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/vault/summary");
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (active) setSummaries(data.summaries ?? {});
      } catch {
        if (active) setLoadError(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return properties.filter(
      (p) =>
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.shortName.toLowerCase().includes(q) ||
        p.city.toLowerCase().includes(q)
    );
  }, [properties, search]);

  if (!VAULT_URL) {
    return (
      <div className="ui-card p-12 text-center">
        <h3 className="font-semibold" style={{ color: "var(--text-primary)" }}>
          Image Vault not connected
        </h3>
        <p className="text-sm mt-2" style={{ color: "var(--text-muted)" }}>
          Set <code>NEXT_PUBLIC_VAULT_URL</code> in the environment to the deployed
          chua-image-vault URL, then restart the app.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          className="ui-input w-auto min-w-[220px] flex-1 max-w-[360px]"
          placeholder="Search name or city..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loadError && (
        <div
          className="rounded-[var(--radius-md,12px)] border px-4 py-2.5 text-sm"
          style={{
            borderColor: "rgba(211,84,84,.35)",
            background: "rgba(211,84,84,.10)",
            color: "var(--danger)",
          }}
        >
          Could not reach the Image Vault — photo counts may be missing. Links
          still work.
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="ui-card p-12 text-center">
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            No properties match the current search.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map((p) => (
            <ShareCard key={p.id} property={p} summary={summaries[p.id]} />
          ))}
        </div>
      )}
    </div>
  );
}
