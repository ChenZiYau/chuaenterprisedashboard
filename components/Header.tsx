"use client";

import { usePathname } from "next/navigation";
import { useMobileNav } from "./MobileNavContext";

const VAULT_URL = (process.env.NEXT_PUBLIC_VAULT_URL ?? "").replace(/\/+$/, "");

const titles: Record<string, string> = {
  "/properties": "Properties",
  "/tenants": "Tenants",
  "/revenue": "Revenue",
  "/expenses": "Expenses",
  "/invoices": "Invoices",
  "/deposits": "Deposits",
  "/maintenance": "Maintenance",
  "/share": "Share",
  "/settings": "Settings",
};

function resolveTitle(pathname: string | null) {
  if (!pathname) return "Dashboard";
  for (const [prefix, title] of Object.entries(titles)) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) return title;
  }
  return "Dashboard";
}

export function Header() {
  const pathname = usePathname();
  const { toggle } = useMobileNav();

  return (
    <header
      className="sticky top-0 z-30 flex items-center gap-3 px-4 sm:px-6 lg:px-8 py-4"
      style={{
        background: "var(--background)",
        borderBottom: "1px solid var(--border-soft)",
      }}
    >
      {/* Hamburger - mobile / tablet only */}
      <button
        type="button"
        onClick={toggle}
        aria-label="Open navigation menu"
        className="lg:hidden w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition"
        style={{ background: "var(--surface-muted)", color: "var(--text-secondary)" }}
      >
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="4" y1="7" x2="20" y2="7" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <line x1="4" y1="17" x2="20" y2="17" />
        </svg>
      </button>

      <h1
        className="text-lg sm:text-xl font-semibold tracking-tight truncate mr-auto"
        style={{ color: "var(--text-primary)" }}
      >
        {resolveTitle(pathname)}
      </h1>

      {VAULT_URL && (
        <a
          href={VAULT_URL}
          target="_blank"
          rel="noreferrer"
          className="ui-btn shrink-0"
          title="Open the public Image Vault in a new tab"
        >
          Image Vault
          <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M15 3h6v6" />
            <path d="M10 14 21 3" />
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
          </svg>
        </a>
      )}
    </header>
  );
}
