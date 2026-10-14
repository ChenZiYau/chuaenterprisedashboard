"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { MobileNavProvider } from "./MobileNavContext";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";

export function DashboardShell({ children, dataError = false }: { children: React.ReactNode; dataError?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const [retrying, startTransition] = useTransition();

  // The login screen and /embed/* iframe pages render standalone, without
  // the dashboard chrome (sidebar + sticky header).
  if (pathname === "/login" || pathname.startsWith("/embed/")) return <>{children}</>;

  return (
    <MobileNavProvider>
      <div className="min-h-screen flex" style={{ background: "var(--background)" }}>
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0 min-h-screen">
          <Header />
          <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-8 py-6">
            {dataError ? (
              <div className="ui-card p-8 flex flex-col items-start gap-4" role="alert">
                <p>Dashboard data could not be loaded. Please retry before entering records.</p>
                <button type="button" className="ui-btn ui-btn-primary" disabled={retrying} onClick={() => startTransition(() => router.refresh())}>
                  {retrying ? "Retrying…" : "Retry loading data"}
                </button>
              </div>
            ) : children}
          </main>
        </div>
      </div>
    </MobileNavProvider>
  );
}
