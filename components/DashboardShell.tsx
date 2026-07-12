"use client";

import { usePathname } from "next/navigation";
import { MobileNavProvider } from "./MobileNavContext";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // The login screen renders standalone, without the dashboard chrome.
  if (pathname === "/login") return <>{children}</>;

  return (
    <MobileNavProvider>
      <div className="min-h-screen flex" style={{ background: "var(--background)" }}>
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0 min-h-screen">
          <Header />
          <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-8 py-6">{children}</main>
        </div>
      </div>
    </MobileNavProvider>
  );
}
