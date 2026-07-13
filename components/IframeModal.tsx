"use client";

import { useEffect, useState } from "react";
import { ModalShell } from "@/components/ModalShell";

/**
 * Fullscreen(ish) modal hosting an iframe — used by the Share page for
 * "Manage Images" (same-origin /embed page) and "Preview" (vault gallery).
 * No route change: closing returns instantly to the cards with scroll intact.
 */
export function IframeModal({
  open,
  title,
  src,
  onClose,
}: {
  open: boolean;
  title: string;
  src: string;
  onClose: () => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const titleId = "iframe-modal-title";

  // Show the spinner again whenever the modal opens on a new URL.
  useEffect(() => {
    if (open) setLoaded(false);
  }, [open, src]);

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      labelledBy={titleId}
      panelClassName="w-full h-full sm:h-[90vh] sm:max-w-5xl sm:rounded-2xl"
    >
      <div
        className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 shrink-0"
        style={{ borderBottom: "1px solid var(--border-soft)" }}
      >
        <h2 id={titleId} className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="w-8 h-8 shrink-0 rounded-lg inline-flex items-center justify-center transition hover:bg-[var(--surface-muted)]"
          style={{ color: "var(--text-muted)" }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="relative flex-1 min-h-0">
        {!loaded && (
          <div className="absolute inset-0 flex items-center justify-center" aria-hidden>
            <span
              className="w-6 h-6 rounded-full border-2 animate-spin"
              style={{ borderColor: "var(--border-soft)", borderTopColor: "var(--accent)" }}
            />
          </div>
        )}
        {open && (
          <iframe
            src={src}
            title={title}
            onLoad={() => setLoaded(true)}
            className="w-full h-full"
            style={{ border: 0, opacity: loaded ? 1 : 0, transition: "opacity 160ms ease" }}
          />
        )}
      </div>
    </ModalShell>
  );
}
