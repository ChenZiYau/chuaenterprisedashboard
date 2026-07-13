"use client";

import { useEffect, useMemo, useState } from "react";
import { PropertyCover } from "@/components/PropertyCover";
import { ActionMenu } from "@/components/ui";
import { ChangeLinkModal, copyText } from "@/components/ChangeLinkModal";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { IframeModal } from "@/components/IframeModal";
import { useToast } from "@/components/Toast";
import { useData } from "@/lib/DataContext";
import { PROPERTY_TYPE_LABEL, type Property } from "@/lib/data";

/** Per-property gallery stats reported by the Image Vault. */
interface VaultSummary {
  count: number;
  coverUrl: string | null;
}

const VAULT_URL =
  (process.env.NEXT_PUBLIC_VAULT_URL ?? "").replace(/\/+$/, "") ||
  "https://chuaimage.vercel.app";

type CardModal =
  | { kind: "link"; property: Property }
  | { kind: "images"; property: Property }
  | { kind: "preview"; property: Property }
  | { kind: "delete"; property: Property };

/** Public customer-facing gallery link (custom slug wins over the id). */
function galleryLink(property: Property, slug?: string): string {
  return `${VAULT_URL}/p/${encodeURIComponent(slug ?? property.id)}`;
}

function ShareCard({
  property,
  summary,
  slug,
  onOpen,
}: {
  property: Property;
  summary?: VaultSummary;
  slug?: string;
  onOpen: (modal: CardModal) => void;
}) {
  const toast = useToast();
  const count = summary?.count ?? 0;

  async function copyLink() {
    if (await copyText(galleryLink(property, slug))) {
      toast.created(`Gallery link for ${property.shortName || property.name} copied`);
    } else {
      toast.info("Could not copy the link.");
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
        {/* Header: name + location, kebab menu top-right */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-base font-semibold truncate" style={{ color: "var(--text-primary)" }}>
              {property.name}
            </h3>
            <p className="text-xs mt-1 truncate" style={{ color: "var(--text-muted)" }}>
              {property.city}
            </p>
          </div>
          <ActionMenu
            label={`${property.name} actions`}
            items={[
              { label: "Change Link", onClick: () => onOpen({ kind: "link", property }) },
              { label: "Manage Images", onClick: () => onOpen({ kind: "images", property }) },
              "separator",
              { label: "Delete Property", danger: true, onClick: () => onOpen({ kind: "delete", property }) },
            ]}
          />
        </div>

        {/* Meta: type badge + photo count */}
        <div className="flex items-center gap-2 mt-auto">
          {property.propertyType && (
            <span
              className="px-2 py-0.5 rounded-md text-[11px] font-semibold uppercase tracking-wider"
              style={{ background: "var(--surface-muted)", color: "var(--text-secondary)" }}
            >
              {PROPERTY_TYPE_LABEL[property.propertyType]}
            </span>
          )}
          <span
            className="px-2 py-0.5 rounded-md text-[11px] font-semibold tabular-nums"
            style={{
              background: count > 0 ? "var(--accent-soft, var(--surface-muted))" : "var(--surface-muted)",
              color: count > 0 ? "var(--accent)" : "var(--text-muted)",
            }}
          >
            {count} {count === 1 ? "photo" : "photos"}
          </span>
        </div>

        {/* Footer: Copy Link left, Preview right */}
        <div
          className="flex items-center justify-between gap-2 pt-3"
          style={{ borderTop: "1px solid var(--border-soft)" }}
        >
          <button type="button" className="ui-btn" onClick={copyLink} title="Copy the public gallery link">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect width="14" height="14" x="8" y="8" rx="2" />
              <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
            </svg>
            Copy Link
          </button>
          <button
            type="button"
            onClick={() => onOpen({ kind: "preview", property })}
            className="text-xs font-medium transition hover:underline"
            style={{ color: "var(--accent)" }}
            title="Preview what customers see"
          >
            Preview →
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SharePage() {
  const { properties: liveProperties } = useData();
  const toast = useToast();

  const [search, setSearch] = useState("");
  const [summaries, setSummaries] = useState<Record<string, VaultSummary>>({});
  const [loadError, setLoadError] = useState(false);

  // Seeded from live Supabase data; local state lets slug edits and deletions
  // reflect instantly without a reload.
  const [properties, setProperties] = useState<Property[]>(liveProperties);
  const [modal, setModal] = useState<CardModal | null>(null);

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

  async function deleteProperty(property: Property) {
    const res = await fetch(`/api/properties/${encodeURIComponent(property.id)}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setProperties((prev) => prev.filter((p) => p.id !== property.id));
      setModal(null);
      toast.deleted(`Property ${property.name} deleted`);
    } else {
      const data = await res.json().catch(() => ({}));
      toast.info((data as { error?: string }).error ?? "Could not delete the property.");
    }
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
            <ShareCard
              key={p.id}
              property={p}
              summary={summaries[p.id]}
              slug={p.slug}
              onOpen={setModal}
            />
          ))}
        </div>
      )}

      {/* Change Link — slug editor; uniqueness enforced server-side */}
      {modal?.kind === "link" && (
        <ChangeLinkModal
          open
          property={modal.property}
          baseUrl={VAULT_URL}
          currentSlug={modal.property.slug}
          onClose={() => setModal(null)}
          onSaved={(slug) =>
            setProperties((prev) =>
              prev.map((p) => (p.id === modal.property.id ? { ...p, slug } : p))
            )
          }
        />
      )}

      {/* Manage Images — same-origin embed of the existing PropertyImagesTab */}
      {modal?.kind === "images" && (
        <IframeModal
          open
          title={`Manage Images — ${modal.property.shortName || modal.property.name}`}
          src={`/embed/images/${encodeURIComponent(modal.property.id)}`}
          onClose={() => setModal(null)}
        />
      )}

      {/* Preview — the real customer-facing vault gallery, framed */}
      {modal?.kind === "preview" && (
        <IframeModal
          open
          title={`Preview — ${modal.property.shortName || modal.property.name}`}
          src={`${galleryLink(modal.property, modal.property.slug)}?preview=true`}
          onClose={() => setModal(null)}
        />
      )}

      {/* Delete — destructive confirm, cascades to units/tenants/records */}
      {modal?.kind === "delete" && (
        <ConfirmDialog
          open
          title="Delete Property"
          message={`Delete ${modal.property.name}? This permanently removes the property together with its units, tenants, revenue and expense records, and cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={() => deleteProperty(modal.property)}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
