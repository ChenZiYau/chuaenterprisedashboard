import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ThemeProvider, themeInitScript } from "@/components/ThemeProvider";
import { DashboardShell } from "@/components/DashboardShell";
import { ToastProvider } from "@/components/Toast";
import { DataProvider, type DashboardData } from "@/lib/DataContext";
import { getDashboardData } from "@/lib/db";
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
  // Fetch once for the whole tree. If Supabase is unreachable (e.g. paused),
  // fall back to empty data so the login screen still renders.
  let data: DashboardData = EMPTY;
  try {
    data = await getDashboardData();
  } catch (err) {
    console.error("[layout] Supabase fetch failed:", err);
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
              <DashboardShell>{children}</DashboardShell>
            </ToastProvider>
          </DataProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
