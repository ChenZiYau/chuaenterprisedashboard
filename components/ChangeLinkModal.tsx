"use client";

import { useEffect, useMemo, useState } from "react";
import { ModalShell } from "@/components/ModalShell";
import { useToast } from "@/components/Toast";
import { normalizeSlug, slugError } from "@/lib/slug";
import type { Property } from "@/lib/data";

/** Copy text to the clipboard, falling back for non-secure contexts. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

/**
 * Edits a property's public gallery URL. The vault domain is fixed — only the
 * slug after /p/ can change. Uniqueness is enforced server-side
 * (PATCH /api/properties/[id]/link); on success the parent updates its local
 * slug map immediately so every card link reflects the change without reload.
 */
export function ChangeLinkModal({
  open,
  property,
  baseUrl,
  currentSlug,
  onClose,
  onSaved,
}: {
  open: boolean;
  property: Property;
  /** Vault origin, no trailing slash (e.g. https://chuaimage.vercel.app). */
  baseUrl: string;
  /** Active custom slug, or undefined when the link uses the property id. */
  currentSlug?: string;
  onClose: () => void;
  onSaved: (slug: string | undefined) => void;
}) {
  const toast = useToast();
  const [value, setValue] = useState(currentSlug ?? "");
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // Re-seed the field each time the modal opens for a property.
  useEffect(() => {
    if (open) {
      setValue(currentSlug ?? "");
      setServerError(null);
    }
  }, [open, currentSlug]);

  const slug = normalizeSlug(value);
  const validation = slug === "" ? null : slugError(slug);
  const effectiveSlug = slug === "" ? property.id : slug;
  const fullUrl = `${baseUrl}/p/${encodeURIComponent(effectiveSlug)}`;
  const dirty = slug !== (currentSlug ?? "");

  async function handleCopy() {
    if (await copyText(fullUrl)) toast.created("Link copied");
    else toast.info("Could not copy the link.");
  }

  async function handleSave() {
    if (validation || saving) return;
    setSaving(true);
    setServerError(null);
    try {
      const res = await fetch(`/api/properties/${encodeURIComponent(property.id)}/link`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setServerError((data as { error?: string }).error ?? "Could not save the link.");
        return;
      }
      onSaved(slug === "" ? undefined : slug);
      toast.updated(`Link for ${property.shortName || property.name} updated`);
      onClose();
    } catch {
      setServerError("Network error — the link was not saved.");
    } finally {
      setSaving(false);
    }
  }

  const titleId = "change-link-title";
  const errorText = validation ?? serverError;

  const prefix = useMemo(() => `${baseUrl.replace(/^https?:\/\//, "")}/p/`, [baseUrl]);

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      labelledBy={titleId}
      panelClassName="w-full max-w-md m-4 sm:m-0 rounded-2xl"
    >
      <div className="p-5 flex flex-col gap-4">
        <div>
          <h2 id={titleId} className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
            Change Property Link
          </h2>
          <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
            {property.name} — the domain is fixed, only the part after /p/ changes.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="change-link-slug" className="text-[10px] uppercase tracking-wider font-medium" style={{ color: "var(--text-faint)" }}>
            Property URL
          </label>
          <div
            className="flex items-center rounded-[var(--radius-md,12px)] border overflow-hidden text-sm"
            style={{
              borderColor: errorText ? "var(--danger)" : "var(--border-soft)",
              background: "var(--surface-muted)",
            }}
          >
            <span className="pl-3 pr-0.5 py-2.5 shrink-0 select-none whitespace-nowrap text-xs" style={{ color: "var(--text-muted)" }}>
              {prefix}
            </span>
            <input
              id="change-link-slug"
              type="text"
              className="flex-1 min-w-0 py-2.5 pr-3 bg-transparent outline-none text-xs"
              style={{ color: "var(--text-primary)" }}
              value={value}
              placeholder={property.id}
              onChange={(e) => {
                setValue(e.target.value);
                setServerError(null);
              }}
              disabled={saving}
              spellCheck={false}
              autoFocus
            />
          </div>
          <p className="text-[11px] min-h-4" style={{ color: errorText ? "var(--danger)" : "var(--text-faint)" }}>
            {errorText ?? "Lowercase letters, numbers and hyphens. Leave empty to use the default link."}
          </p>
        </div>

        <div className="flex items-center justify-between gap-2 pt-1">
          <button type="button" className="ui-btn" onClick={handleCopy} disabled={!!validation}>
            Copy
          </button>
          <div className="flex gap-2">
            <button type="button" className="ui-btn" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button
              type="button"
              className="ui-btn ui-btn-primary min-w-20 justify-center"
              onClick={handleSave}
              disabled={!!validation || !dirty || saving}
            >
              {saving ? (
                <span
                  className="w-4 h-4 rounded-full border-2 animate-spin"
                  style={{ borderColor: "rgba(255,255,255,.35)", borderTopColor: "#fff" }}
                  aria-label="Saving"
                />
              ) : (
                "Save"
              )}
            </button>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}
