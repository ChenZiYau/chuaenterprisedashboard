import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ThemeProvider, themeInitScript } from "@/components/ThemeProvider";
import { DashboardShell } from "@/components/DashboardShell";
import { ToastProvider } from "@/components/Toast";
import { DataProvider, type DashboardData } from "@/lib/DataContext";
import { getDashboardData } from "@/lib/db";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], display: "swap" });

// Read fresh Supabase data on every request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Chua Enterprise",
  description: "Property management dashboard",
};

const EMPTY: DashboardData = {
  properties: [],
  units: [],
  tenants: [],
  revenueEntries: [],
  expenseEntries: [],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The public login page shares this layout. Never serialize private records
  // into its client provider, even though the dashboard chrome is hidden.
  let data: DashboardData = EMPTY;
  let dataError = false;
  const jar = await cookies();
  if (await verifySessionToken(jar.get(SESSION_COOKIE)?.value)) {
    try {
      data = await getDashboardData();
    } catch (err) {
      console.error("[layout] Supabase fetch failed:", err);
      dataError = true;
    }
  }

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className={inter.className}>
        <ThemeProvider>
          <DataProvider value={data}>
            <ToastProvider>
              <DashboardShell dataError={dataError}>{children}</DashboardShell>
            </ToastProvider>
          </DataProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
