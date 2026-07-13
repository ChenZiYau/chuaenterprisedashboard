"use client";

import { useParams } from "next/navigation";
import { PropertyImagesTab } from "@/components/PropertyImagesTab";
import { useData } from "@/lib/DataContext";

/**
 * Chrome-less image manager, loaded inside the Share page's "Manage Images"
 * iframe modal. DashboardShell skips the sidebar/header for /embed/* and the
 * session cookie still gates it (same origin), so this reuses the exact
 * PropertyImagesTab the property detail page uses.
 */
export default function EmbedImagesPage() {
  const { id } = useParams<{ id: string }>();
  const { getProperty } = useData();
  const property = getProperty(decodeURIComponent(id));

  if (!property) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "var(--background)" }}>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Property not found.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 sm:p-6" style={{ background: "var(--background)" }}>
      <PropertyImagesTab property={property} />
    </div>
  );
}
