"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

/**
 * Shared dialog scaffolding: portal, dimmed click-to-close overlay, Escape
 * handling, body scroll lock and entrance animation. Panel styling is left to
 * the caller so compact dialogs and fullscreen iframe modals can share it.
 */
export function ModalShell({
  open,
  onClose,
  labelledBy,
  panelClassName,
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** id of the element that titles the dialog (aria-labelledby). */
  labelledBy: string;
  panelClassName: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-0 sm:p-6">
      <button
        type="button"
        aria-label="Close dialog"
        onClick={onClose}
        className="absolute inset-0"
        style={{ background: "rgba(15,17,22,0.45)", animation: "uiFadeIn 140ms ease" }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={`relative flex flex-col overflow-hidden ${panelClassName}`}
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border-soft)",
          boxShadow: "0 24px 64px rgba(15,17,22,0.24)",
          animation: "uiModalPop 180ms cubic-bezier(.2,.7,.2,1)",
        }}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
