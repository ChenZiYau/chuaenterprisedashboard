"use client";

import { useState } from "react";
import { ModalShell } from "@/components/ModalShell";

/** Small destructive-action confirmation dialog. */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  /** May be async — the confirm button shows a spinner until it settles. */
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const titleId = "confirm-dialog-title";

  async function handleConfirm() {
    if (busy) return;
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell
      open={open}
      onClose={busy ? () => {} : onClose}
      labelledBy={titleId}
      panelClassName="w-full max-w-sm m-4 sm:m-0 rounded-2xl"
    >
      <div className="p-5 flex flex-col gap-3">
        <h2 id={titleId} className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
          {title}
        </h2>
        <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          {message}
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="ui-btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="ui-btn min-w-24 justify-center"
            onClick={handleConfirm}
            disabled={busy}
            style={{ background: "var(--danger)", borderColor: "var(--danger)", color: "#fff" }}
          >
            {busy ? (
              <span
                className="w-4 h-4 rounded-full border-2 animate-spin"
                style={{ borderColor: "rgba(255,255,255,.35)", borderTopColor: "#fff" }}
                aria-label="Working"
              />
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
