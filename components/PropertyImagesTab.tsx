"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { VaultCropModal } from "@/components/VaultCropModal";
import { useToast } from "@/components/Toast";
import type { Property } from "@/lib/data";
import type { CropInfo, ImageEntry, PropertyIndex } from "@/lib/vaultTypes";

/**
 * Gallery manager for a property — the admin-side replacement for the Image
 * Vault's editor. Photos are stored in the vault (Vercel Blob) but every
 * read/write goes through the dashboard's session-gated /api/vault/* proxies,
 * so the vault itself exposes no admin surface.
 */

/** Working state for one image entry card (richer than the persisted shape). */
interface Card {
  id: string;
  title: string;
  description: string;
  /** Remote URL of the uploaded original ("" until first upload). */
  originalUrl: string;
  /** Pending local original to upload on save. */
  originalBlob: Blob | null;
  /** Source usable for preview + cropping (object URL or remote). */
  originalSrc: string;
  /** Pending cropped blob to upload on save. */
  croppedBlob: Blob | null;
  /** Cropped preview source (object URL or remote) when a crop is active. */
  croppedSrc: string | null;
  /** Remote cropped URL already saved (so we can keep it without re-upload). */
  croppedUrl: string;
  crop: CropInfo | null;
  hasImage: boolean;
}

function newCard(): Card {
  return {
    id: crypto.randomUUID(),
    title: "",
    description: "",
    originalUrl: "",
    originalBlob: null,
    originalSrc: "",
    croppedBlob: null,
    croppedSrc: null,
    croppedUrl: "",
    crop: null,
    hasImage: false,
  };
}

function cardFromEntry(e: ImageEntry): Card {
  const isCropped = !!e.imageUrl && e.imageUrl !== e.originalUrl;
  return {
    id: e.id || crypto.randomUUID(),
    title: e.title ?? "",
    description: e.description ?? "",
    originalUrl: e.originalUrl ?? e.imageUrl ?? "",
    originalBlob: null,
    originalSrc: e.originalUrl ?? e.imageUrl ?? "",
    croppedBlob: null,
    croppedSrc: isCropped ? e.imageUrl : null,
    croppedUrl: isCropped ? e.imageUrl : "",
    crop: e.crop ?? null,
    hasImage: !!(e.imageUrl || e.originalUrl),
  };
}

export function PropertyImagesTab({ property }: { property: Property }) {
  return <PropertyImagesEditor key={property.id} property={property} />;
}

function PropertyImagesEditor({ property }: { property: Property }) {
  const toast = useToast();
  const propertyId = property.id;

  const [cards, setCards] = useState<Card[]>([newCard()]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const loaded = useRef(false);
  const savePending = useRef(false);
  const [saving, setSaving] = useState(false);
  const [cropCardId, setCropCardId] = useState<string | null>(null);

  // Load saved images for this property from the vault (via proxy).
  useEffect(() => {
    let active = true;
    loaded.current = false;
    setLoading(true);
    setLoadError(false);
    (async () => {
      try {
        const res = await fetch(`/api/vault/images/${encodeURIComponent(propertyId)}`);
        if (!res.ok) throw new Error();
        const data: PropertyIndex = await res.json();
        if (!Array.isArray(data.images)) throw new Error("Invalid gallery response");
        if (!active) return;
        setCards(data.images.length ? data.images.map(cardFromEntry) : [newCard()]);
        loaded.current = true;
      } catch {
        if (active) setLoadError(true);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [propertyId, loadAttempt]);

  function patchCard(id: string, patch: Partial<Card>) {
    if (savePending.current) return;
    setCards((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  function addCard() {
    if (savePending.current) return;
    setCards((cs) => [...cs, newCard()]);
  }

  function removeCard(id: string) {
    if (savePending.current) return;
    setCards((cs) => (cs.length <= 1 ? [newCard()] : cs.filter((c) => c.id !== id)));
  }

  function onSelectFile(id: string, file: File) {
    const src = URL.createObjectURL(file);
    patchCard(id, {
      originalBlob: file,
      originalSrc: src,
      originalUrl: "",
      croppedBlob: null,
      croppedSrc: null,
      croppedUrl: "",
      crop: null,
      hasImage: true,
    });
  }

  function onCropApply(id: string, blob: Blob, info: CropInfo) {
    const src = URL.createObjectURL(blob);
    patchCard(id, { croppedBlob: blob, croppedSrc: src, croppedUrl: "", crop: info });
    setCropCardId(null);
  }

  async function uploadBlob(blob: Blob, id: string, kind: "original" | "cropped"): Promise<string> {
    const form = new FormData();
    form.append("file", blob);
    form.append("propertyId", propertyId);
    form.append("id", id);
    form.append("kind", kind);
    const res = await fetch("/api/vault/upload", { method: "POST", body: form });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error ?? "Upload failed.");
    return data.url as string;
  }

  async function saveAll() {
    if (!loaded.current || loading || loadError || savePending.current) return;
    savePending.current = true;
    setSaving(true);
    try {
      const entries: ImageEntry[] = [];
      for (const card of cards) {
        if (!card.hasImage) continue; // skip empty cards
        let originalUrl = card.originalUrl;
        if (card.originalBlob) {
          originalUrl = await uploadBlob(card.originalBlob, card.id, "original");
        }

        let imageUrl = originalUrl;
        if (card.croppedBlob) {
          imageUrl = await uploadBlob(card.croppedBlob, card.id, "cropped");
        } else if (card.croppedUrl) {
          imageUrl = card.croppedUrl;
        }

        entries.push({
          id: card.id,
          title: card.title.trim(),
          description: card.description.trim(),
          imageUrl,
          originalUrl,
          crop: card.crop,
          updatedAt: new Date().toISOString(),
        });
      }

      const res = await fetch(`/api/vault/images/${encodeURIComponent(propertyId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: entries }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? "Could not save.");
      }

      // Reflect uploaded URLs back into local state (clears pending blobs).
      setCards(entries.length > 0 ? entries.map(cardFromEntry) : [newCard()]);
      toast.created("Gallery saved");
    } catch (err) {
      toast.info(err instanceof Error ? err.message : "Save failed.");
    } finally {
      savePending.current = false;
      setSaving(false);
    }
  }

  const imageCount = useMemo(() => cards.filter((c) => c.hasImage).length, [cards]);
  const cropCard = cards.find((c) => c.id === cropCardId) ?? null;

  if (loading) {
    return (
      <div className="ui-card p-12 text-center">
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>Loading gallery…</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="ui-card p-6 flex flex-col items-start gap-3" role="alert">
        <p>Could not load the gallery. Load the existing photos before making changes.</p>
        <button type="button" className="ui-btn" onClick={() => setLoadAttempt((n) => n + 1)}>Retry loading photos</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          {imageCount} {imageCount === 1 ? "photo" : "photos"} in the public gallery
        </p>
        <button type="button" className="ui-btn ui-btn-primary shrink-0" onClick={saveAll} disabled={saving || !!cropCardId}>
          {saving ? "Saving…" : "Save all"}
        </button>
      </div>

      {/* Cards */}
      <fieldset className="space-y-4" disabled={saving}>
        {cards.map((card, i) => (
          <ImageCard
            key={card.id}
            card={card}
            index={i}
            onChange={(patch) => patchCard(card.id, patch)}
            onSelectFile={(file) => onSelectFile(card.id, file)}
            onRemove={() => removeCard(card.id)}
            onCrop={() => setCropCardId(card.id)}
          />
        ))}
      </fieldset>

      {/* Add image */}
      <button
        type="button"
        onClick={addCard}
        disabled={saving}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed py-4 text-sm font-medium transition hover:bg-[var(--surface-muted)]"
        style={{ borderColor: "var(--border-strong)", color: "var(--accent)" }}
      >
        + Add Image
      </button>

      {cropCard && cropCard.originalSrc && (
        <VaultCropModal
          src={cropCard.originalSrc}
          initial={cropCard.crop}
          onCancel={() => setCropCardId(null)}
          onApply={(blob, info) => onCropApply(cropCard.id, blob, info)}
        />
      )}
    </div>
  );
}

/* --------------------------- ImageCard --------------------------- */

interface ImageCardProps {
  card: Card;
  index: number;
  onChange: (patch: Partial<Card>) => void;
  onSelectFile: (file: File) => void;
  onRemove: () => void;
  onCrop: () => void;
}

function ImageCard({ card, index, onChange, onSelectFile, onRemove, onCrop }: ImageCardProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const preview = card.croppedSrc ?? (card.hasImage ? card.originalSrc : null);

  function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (file && file.type.startsWith("image/")) onSelectFile(file);
  }

  return (
    <div className="ui-card relative p-4 sm:p-5">
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove image"
        className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-md transition hover:bg-[var(--surface-muted)]"
        style={{ color: "var(--text-muted)" }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>

      <p className="text-[10px] uppercase tracking-[0.14em] mb-3" style={{ color: "var(--text-faint)" }}>
        Image {index + 1}
      </p>

      <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
        {/* Upload / preview zone */}
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              handleFiles(e.dataTransfer.files);
            }}
            className="grid aspect-square w-full place-items-center overflow-hidden rounded-lg border border-dashed transition"
            style={{
              borderColor: dragOver ? "var(--accent)" : "var(--border-strong)",
              background: dragOver ? "var(--accent-soft, var(--surface-muted))" : "var(--surface-muted)",
            }}
          >
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt={card.title || "Preview"} className="h-full w-full object-cover" />
            ) : (
              <span className="flex flex-col items-center gap-1.5 px-3 text-center" style={{ color: "var(--text-faint)" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <path d="m17 8-5-5-5 5" />
                  <path d="M12 3v12" />
                </svg>
                <span className="text-xs">Click or drop image</span>
              </span>
            )}
          </button>

          {card.hasImage && (
            <button type="button" onClick={onCrop} className="ui-btn mt-2 w-full justify-center">
              Crop / Resize
            </button>
          )}
        </div>

        {/* Fields */}
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: "var(--text-muted)" }} htmlFor={`title-${card.id}`}>
              Image title
            </label>
            <input
              id={`title-${card.id}`}
              type="text"
              value={card.title}
              onChange={(e) => onChange({ title: e.target.value })}
              placeholder="e.g. Master bedroom"
              className="ui-field"
            />
          </div>
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: "var(--text-muted)" }} htmlFor={`desc-${card.id}`}>
              Description
            </label>
            <textarea
              id={`desc-${card.id}`}
              value={card.description}
              onChange={(e) => onChange({ description: e.target.value })}
              placeholder="Notes about this photo…"
              rows={3}
              className="ui-field resize-y"
            />
          </div>
          {card.crop && (
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Cropped to {card.crop.width}×{card.crop.height}px
              {card.crop.aspect !== "free" ? ` (${card.crop.aspect})` : ""}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
