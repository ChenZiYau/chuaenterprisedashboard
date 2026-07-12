"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useMobileNav } from "./MobileNavContext";
import { logout } from "@/app/login/actions";

type NavItem = {
  label: string;
  href: string;
  icon: React.ReactNode;
};

/** Shared frame for the small line icons below. */
function NavIcon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="w-[18px] h-[18px] shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

const navSections: NavItem[][] = [
  [
    {
      label: "Properties",
      href: "/properties",
      icon: (
        <NavIcon>
          <path d="M3 11 12 4l9 7" />
          <path d="M5 10v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9" />
        </NavIcon>
      ),
    },
    {
      label: "Tenants",
      href: "/tenants",
      icon: (
        <NavIcon>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </NavIcon>
      ),
    },
  ],
  [
    {
      label: "Revenue",
      href: "/revenue",
      icon: (
        <NavIcon>
          <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
          <polyline points="16 7 22 7 22 13" />
        </NavIcon>
      ),
    },
    {
      label: "Expenses",
      href: "/expenses",
      icon: (
        <NavIcon>
          <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
          <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
          <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
        </NavIcon>
      ),
    },
    {
      label: "Invoices",
      href: "/invoices",
      icon: (
        <NavIcon>
          <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
          <path d="M14 2v4a2 2 0 0 0 2 2h4" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </NavIcon>
      ),
    },
    {
      label: "Deposits",
      href: "/deposits",
      icon: (
        <NavIcon>
          <line x1="3" y1="22" x2="21" y2="22" />
          <line x1="6" y1="18" x2="6" y2="11" />
          <line x1="10" y1="18" x2="10" y2="11" />
          <line x1="14" y1="18" x2="14" y2="11" />
          <line x1="18" y1="18" x2="18" y2="11" />
          <polygon points="12 2 20 7 4 7" />
        </NavIcon>
      ),
    },
  ],
  [
    {
      label: "Share",
      href: "/share",
      icon: (
        <NavIcon>
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
          <line x1="8.59" y1="10.49" x2="15.42" y2="6.51" />
        </NavIcon>
      ),
    },
  ],
  [
    {
      label: "Settings",
      href: "/settings",
      icon: (
        <NavIcon>
          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
          <circle cx="12" cy="12" r="3" />
        </NavIcon>
      ),
    },
  ],
];

function isActive(pathname: string | null, href: string) {
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(href + "/");
}

/** Remembers the desktop collapse choice across visits. */
const COLLAPSE_KEY = "chua.sidebar.collapsed";

export function Sidebar() {
  const pathname = usePathname();
  const { open, setOpen } = useMobileNav();
  const [collapsed, setCollapsed] = useState(false);

  // Restore after mount so server and client render the same initial markup.
  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      /* storage unavailable — stay expanded */
    }
  }, []);

  function toggleCollapsed() {
    setCollapsed((c) => {
      try {
        window.localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      } catch {
        /* storage unavailable — still toggle for this session */
      }
      return !c;
    });
  }

  const inner = (isCollapsed: boolean) => (
    <>
      {/* Brand */}
      <Link
        href="/properties"
        aria-label="Go to Properties"
        className={
          "flex items-center gap-2.5 min-w-0 rounded-lg pt-1 transition hover:opacity-80 " +
          (isCollapsed ? "justify-center px-0" : "px-0.5")
        }
      >
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: "var(--accent)" }}
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 11 12 4l9 7" />
            <path d="M5 10v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9" />
          </svg>
        </div>
        {!isCollapsed && (
          <span className="text-white font-semibold tracking-tight truncate">Chua Enterprise</span>
        )}
      </Link>

      {/* Admin Account */}
      <div
        className={"rounded-xl " + (isCollapsed ? "px-0 py-2 flex justify-center" : "px-3 py-3")}
        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
      >
        {!isCollapsed && (
          <p
            className="text-[10px] font-semibold uppercase tracking-wider mb-2.5"
            style={{ color: "var(--sidebar-text-muted)" }}
          >
            Admin Account
          </p>
        )}
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-xs font-semibold text-white"
            style={{
              background: "linear-gradient(135deg, #4a4f5b 0%, #2a2d34 100%)",
              border: "2px solid rgba(255,255,255,0.08)",
            }}
            title={isCollapsed ? "Admin User — admin@chua.co" : undefined}
          >
            AU
          </div>
          {!isCollapsed && (
            <>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white truncate leading-tight">Admin User</p>
                <p
                  className="text-[11px] truncate leading-tight mt-0.5"
                  style={{ color: "var(--sidebar-text-muted)" }}
                >
                  admin@chua.co
                </p>
              </div>
              <form action={logout}>
                <button
                  type="submit"
                  aria-label="Sign out"
                  title="Sign out"
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition hover:bg-white/10"
                  style={{ color: "var(--sidebar-text-muted)" }}
                >
                  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                </button>
              </form>
            </>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex flex-col gap-1 flex-1 overflow-y-auto" aria-label="Main navigation">
        {navSections.map((section, i) => (
          <div key={i} className="flex flex-col gap-1">
            {i > 0 && (
              <div
                className="my-2 mx-1 h-px shrink-0"
                style={{ background: "rgba(255,255,255,0.08)" }}
                aria-hidden
              />
            )}
            {section.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className={"nav-item gap-2.5 " + (isCollapsed ? "justify-center px-0" : "")}
                data-active={isActive(pathname, item.href) || undefined}
                onClick={() => setOpen(false)}
                title={isCollapsed ? item.label : undefined}
              >
                {item.icon}
                {!isCollapsed && <span className="truncate">{item.label}</span>}
              </Link>
            ))}
          </div>
        ))}
      </nav>

      {/* Collapse toggle — desktop only; the mobile drawer is always full width */}
      <button
        type="button"
        onClick={toggleCollapsed}
        aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        className={
          "hidden lg:flex items-center gap-2.5 rounded-lg py-2 text-sm font-medium transition hover:bg-white/10 " +
          (isCollapsed ? "justify-center px-0" : "px-3")
        }
        style={{ color: "var(--sidebar-text-muted)" }}
      >
        <svg
          viewBox="0 0 24 24"
          className={"w-[18px] h-[18px] shrink-0 transition-transform duration-200 " + (isCollapsed ? "rotate-180" : "")}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="m11 17-5-5 5-5" />
          <path d="m18 17-5-5 5-5" />
        </svg>
        {!isCollapsed && "Collapse"}
      </button>
    </>
  );

  return (
    <>
      {/* Desktop sidebar - always visible, collapsible to an icon rail */}
      <aside
        className={
          "hidden lg:flex flex-col shrink-0 gap-5 sticky top-0 h-screen transition-[width,padding] duration-200 ease-out " +
          (collapsed ? "w-[72px] p-3" : "w-[248px] p-5")
        }
        style={{ background: "var(--sidebar)", color: "var(--sidebar-text)" }}
      >
        {inner(collapsed)}
      </aside>

      {/* Mobile / tablet overlay */}
      <div
        className={
          "lg:hidden fixed inset-0 z-40 transition-opacity duration-200 " +
          (open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none")
        }
        style={{ background: "rgba(0,0,0,0.5)" }}
        onClick={() => setOpen(false)}
        aria-hidden
      />

      {/* Mobile / tablet drawer - slides in from the left */}
      <aside
        className={
          "lg:hidden fixed top-0 left-0 z-50 flex flex-col w-[260px] max-w-[80vw] h-screen p-5 gap-5 transition-transform duration-200 ease-out " +
          (open ? "translate-x-0" : "-translate-x-full")
        }
        style={{ background: "var(--sidebar)", color: "var(--sidebar-text)" }}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
      >
        {inner(false)}
      </aside>
    </>
  );
}
