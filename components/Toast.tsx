"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/* ───────────────────────────── Types ───────────────────────────── */

export type ToastVariant = "created" | "updated" | "deleted" | "info";

type Toast = {
  id: number;
  variant: ToastVariant;
  message: string;
  leaving: boolean;
};

type ToastApi = {
  /** Green — a record was created. */
  created: (message: string) => void;
  /** Yellow — a record was updated. */
  updated: (message: string) => void;
  /** Red — a record was deleted. */
  deleted: (message: string) => void;
  /** Neutral message. */
  info: (message: string) => void;
  /** Low-level: push any variant. */
  show: (message: string, variant?: ToastVariant) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

/* How long a toast stays before it auto-dismisses (ms). */
const DURATION = 3200;
/* Exit animation length (ms) — keep in sync with the CSS below. */
const EXIT_MS = 220;

/* ───────────────────────────── Provider ───────────────────────────── */

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  const timers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  const remove = useCallback((id: number) => {
    // Play the exit animation, then drop it from the list.
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, EXIT_MS);
  }, []);

  const show = useCallback(
    (message: string, variant: ToastVariant = "info") => {
      const id = (seq.current += 1);
      setToasts((prev) => [...prev, { id, variant, message, leaving: false }]);
      timers.current[id] = setTimeout(() => remove(id), DURATION);
    },
    [remove]
  );

  // Clear any pending timers on unmount.
  useEffect(() => {
    const t = timers.current;
    return () => Object.values(t).forEach(clearTimeout);
  }, []);

  const api: ToastApi = {
    created: (m) => show(m, "created"),
    updated: (m) => show(m, "updated"),
    deleted: (m) => show(m, "deleted"),
    info: (m) => show(m, "info"),
    show,
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={remove} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}

/* ───────────────────────────── Rendering ───────────────────────────── */

const VARIANT: Record<ToastVariant, { color: string; icon: React.ReactNode }> = {
  created: {
    color: "var(--success)",
    // Check in a circle
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M20 6 9 17l-5-5" />
      </svg>
    ),
  },
  updated: {
    color: "var(--warning)",
    // Refresh arrows
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M21 12a9 9 0 1 1-2.64-6.36" />
        <path d="M21 3v6h-6" />
      </svg>
    ),
  },
  deleted: {
    color: "var(--danger)",
    // Trash
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M3 6h18" />
        <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6" />
        <path d="M10 11v6M14 11v6" />
      </svg>
    ),
  },
  info: {
    color: "var(--accent)",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8h.01M11 12h1v4h1" />
      </svg>
    ),
  },
};

function ToastViewport({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <div
      aria-live="polite"
      aria-atomic="false"
      className="fixed z-[100] flex flex-col gap-2.5 pointer-events-none"
      style={{ top: "1rem", right: "1rem", maxWidth: "min(360px, calc(100vw - 2rem))" }}
    >
      {toasts.map((t) => {
        const v = VARIANT[t.variant];
        return (
          <div
            key={t.id}
            role="status"
            className="pointer-events-auto flex items-center gap-3 rounded-xl pl-3 pr-3.5 py-3"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border-soft)",
              borderLeft: `3px solid ${v.color}`,
              boxShadow: "0 12px 32px rgba(15,17,22,0.18)",
              animation: t.leaving
                ? "toastOut 220ms cubic-bezier(.4,0,1,1) forwards"
                : "toastIn 260ms cubic-bezier(.2,.8,.2,1)",
            }}
          >
            <span
              className="shrink-0 inline-flex items-center justify-center rounded-full"
              style={{ width: 26, height: 26, background: `color-mix(in srgb, ${v.color} 16%, transparent)`, color: v.color }}
            >
              {v.icon}
            </span>
            <p className="text-sm font-medium leading-snug flex-1 min-w-0" style={{ color: "var(--text-primary)" }}>
              {t.message}
            </p>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => onDismiss(t.id)}
              className="shrink-0 w-6 h-6 rounded-md inline-flex items-center justify-center transition hover:bg-[var(--surface-muted)]"
              style={{ color: "var(--text-faint)" }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </div>
        );
      })}

      <style jsx global>{`
        @keyframes toastIn {
          from { transform: translateX(12px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes toastOut {
          from { transform: translateX(0); opacity: 1; }
          to { transform: translateX(12px); opacity: 0; }
        }
      `}</style>
    </div>,
    document.body
  );
}
