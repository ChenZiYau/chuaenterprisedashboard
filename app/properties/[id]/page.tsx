"use client";

import Link from "next/link";
import { use, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AddPropertyModal } from "@/components/AddPropertyModal";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PropertyRevenueTab } from "@/components/PropertyRevenueTab";
import { PropertyExpensesTab } from "@/components/PropertyExpensesTab";
import { PropertyInvoiceTab } from "@/components/PropertyInvoiceTab";
import { PropertyImagesTab } from "@/components/PropertyImagesTab";
import { useToast } from "@/components/Toast";
import { useData } from "@/lib/DataContext";
import { saveResource } from "@/lib/clientApi";
import {
  PROPERTY_STATUS_LABEL,
  RENTAL_MODEL_LABEL,
  type Property,
  type PropertyStatus,
  type Unit,
} from "@/lib/data";

const CUR_YEAR = 2026;

function statMYR(value: number) {
  return new Intl.NumberFormat("en-MY", { style: "currency", currency: "MYR", maximumFractionDigits: 0 }).format(value);
}

const COVER_FALLBACKS = [
  ["#41506b", "#6b7f9e"],
  ["#2f6fed", "#7ea6f4"],
  ["#2e7d64", "#6fae97"],
  ["#8a6a45", "#bfa07a"],
];
function coverFallback(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const [a, b] = COVER_FALLBACKS[h % COVER_FALLBACKS.length];
  return `linear-gradient(135deg, ${a}, ${b})`;
}

const STATUS_COLOR: Record<PropertyStatus, string> = {
  active: "var(--success)",
  under_service: "var(--warning)",
  inactive: "var(--text-muted)",
};

type TabKey = "revenue" | "expenses" | "invoice" | "images";
const TABS: { key: TabKey; label: string }[] = [
  { key: "revenue", label: "Revenue" },
  { key: "expenses", label: "Expenses" },
  { key: "invoice", label: "Invoice" },
  { key: "images", label: "Images" },
];

export default function PropertyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { getProperty, getUnitsForProperty, revenueEntries, expenseEntries, hideProperty, unhideProperty } = useData();
  const toast = useToast();

  const [property, setProperty] = useState<Property | undefined>(() => getProperty(id));
  const [units, setUnits] = useState<Unit[]>(() => getUnitsForProperty(id));
  const [imgBroken, setImgBroken] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  // "?tab=images" (from Share → Manage Photos) opens straight on that tab.
  const [tab, setTab] = useState<TabKey>(() => {
    const t = searchParams.get("tab");
    return TABS.some((x) => x.key === t) ? (t as TabKey) : "revenue";
  });

  const ytd = useMemo(() => {
    if (!property) return { revenue: 0, expenses: 0, net: 0 };
    const revenue = revenueEntries
      .filter((e) => e.propertyId === property.id && e.year === CUR_YEAR)
      .reduce((s, e) => s + e.rental + (e.electricity ?? 0) + (e.other ?? 0), 0);
    const expenses = expenseEntries
      .filter((e) => e.propertyId === property.id && e.year === CUR_YEAR)
      .reduce((s, e) => s + e.amount, 0);
    return { revenue, expenses, net: revenue - expenses };
  }, [property, revenueEntries, expenseEntries]);

  if (!property) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink />
        <div className="ui-card p-12 text-center">
          <h2 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>Property not found</h2>
        </div>
      </div>
    );
  }

  /** Confirmed trash: hide the property everywhere and leave for the list page.
   *  The real DELETE only fires when the undo toast closes without "Undo". */
  function moveToTrash(p: Property) {
    setTrashOpen(false);
    hideProperty(p.id);
    router.push("/properties");
    toast.undoable(`${p.name} moved to Trash. In case it was accidental, you can undo.`, {
      onUndo: () => unhideProperty(p.id),
      onCommit: async () => {
        const res = await fetch(`/api/properties/${encodeURIComponent(p.id)}`, { method: "DELETE" });
        if (res.ok) {
          router.refresh();
        } else {
          unhideProperty(p.id);
          const data = await res.json().catch(() => ({}));
          toast.info((data as { error?: string }).error ?? "Could not delete the property.");
        }
      },
    });
  }

  const status = property.status ?? "active";
  const rentedCount = units.filter((u) => u.tenantName).length;
  const totalUnits = units.length;
  const isWhole = property.rentalModel === "whole_unit";
  const occupied = rentedCount > 0;
  const showPhoto = !!property.imageUrl && !imgBroken;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <BackLink />
          <p className="text-sm font-medium truncate mt-0.5" style={{ color: "var(--text-primary)" }}>{property.name}</p>
        </div>
        <button type="button" className="ui-btn shrink-0" onClick={() => setTrashOpen(true)}>Move to Trash</button>
      </div>

      {/* Cover with overlaid property details */}
      <section className="relative w-full rounded-lg overflow-hidden" style={{ background: "var(--surface-muted)" }}>
        {showPhoto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={property.imageUrl} alt={property.name} className="w-full h-[240px] sm:h-[300px] lg:h-[340px] object-cover" onError={() => setImgBroken(true)} />
        ) : (
          <div className="w-full h-[240px] sm:h-[300px] lg:h-[340px]" style={{ background: coverFallback(property.id) }} aria-hidden />
        )}
        <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.25) 45%, rgba(0,0,0,0.05) 100%)" }} />
        <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6 flex items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white drop-shadow">{property.name}</h1>
            <p className="text-sm mt-1 text-white/85 drop-shadow">
              {[property.address, property.city, property.state, property.postcode].filter(Boolean).join(", ")}
            </p>
            <div className="flex items-center gap-2 flex-wrap mt-3">
              <span className="px-2.5 py-1 rounded-md text-xs font-semibold" style={{ background: "rgba(255,255,255,0.18)", color: "#fff" }}>{RENTAL_MODEL_LABEL[property.rentalModel]}</span>
              <span className="px-2.5 py-1 rounded-md text-xs font-semibold" style={{ background: "rgba(255,255,255,0.18)", color: STATUS_COLOR[status] === "var(--text-muted)" ? "#fff" : STATUS_COLOR[status] }}>{PROPERTY_STATUS_LABEL[status]}</span>
            </div>
          </div>
          <button type="button" className="ui-btn shrink-0" onClick={() => setEditOpen(true)}>Edit</button>
        </div>
      </section>

      {/* Stat cards */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-px rounded-lg overflow-hidden" style={{ background: "var(--border-soft)", border: "1px solid var(--border-soft)" }}>
        <Stat label="Status" value={occupied ? "OCCUPIED" : "VACANT"} valueColor={occupied ? "var(--success)" : "var(--warning)"} sub={isWhole ? undefined : `${rentedCount} of ${totalUnits} rooms`} />
        <Stat label={`Revenue ${CUR_YEAR}`} value={statMYR(ytd.revenue)} />
        <Stat label={`Expenses ${CUR_YEAR}`} value={statMYR(ytd.expenses)} />
        <Stat label="Net PnL" value={statMYR(ytd.net)} valueColor={ytd.net >= 0 ? "var(--success)" : "var(--danger)"} />
      </section>

      {/* Tabs */}
      <nav className="grid grid-cols-4 rounded-lg overflow-hidden border" style={{ borderColor: "var(--border-soft)" }}>
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className="px-4 py-3 text-sm font-medium transition border-l first:border-l-0"
              style={{
                borderColor: "var(--border-soft)",
                background: active ? "var(--surface-muted)" : "var(--surface)",
                color: active ? "var(--text-primary)" : "var(--text-muted)",
                boxShadow: active ? "inset 0 -2px 0 var(--accent)" : "none",
              }}
            >
              {t.label}
            </button>
          );
        })}
      </nav>

      {/* Tab content */}
      {tab === "revenue" && <PropertyRevenueTab property={property} />}
      {tab === "expenses" && <PropertyExpensesTab property={property} />}
      {tab === "invoice" && <PropertyInvoiceTab property={property} />}
      {tab === "images" && <PropertyImagesTab property={property} />}

      {/* Move to Trash — destructive confirm, delete cascades to units/tenants/records */}
      <ConfirmDialog
        open={trashOpen}
        title="Move to Trash"
        message={`Move ${property.name} to Trash? This removes the property together with its units, tenants, revenue and expense records. You will have a few seconds to undo.`}
        confirmLabel="Move to Trash"
        onConfirm={() => moveToTrash(property)}
        onClose={() => setTrashOpen(false)}
      />

      {/* Edit modal */}
      <AddPropertyModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        initial={{ property, units }}
        onSubmit={async (p, u) => {
          const res = await saveResource<{ property: Property; units: Unit[] }>(
            `/api/properties/${encodeURIComponent(p.id)}`,
            "PUT",
            { property: p, units: u }
          );
          if (!res.ok) {
            toast.info(res.error);
            return false;
          }
          setProperty(res.data.property);
          setUnits(res.data.units);
          setEditOpen(false);
          toast.updated(`Property ${res.data.property.name} updated`);
        }}
      />
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/properties" className="text-xs inline-flex items-center gap-1.5 w-fit" style={{ color: "var(--text-muted)" }}>
      <span aria-hidden>&#8592;</span>Properties
    </Link>
  );
}

function Stat({ label, value, sub, valueColor }: { label: string; value: string; sub?: string; valueColor?: string }) {
  return (
    <div className="p-5" style={{ background: "var(--surface)" }}>
      <p className="text-[10px] uppercase tracking-[0.14em]" style={{ color: "var(--text-faint)" }}>{label}</p>
      <p className="text-xl font-semibold mt-1.5 tabular-nums" style={{ color: valueColor ?? "var(--text-primary)" }}>{value}</p>
      {sub && <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>{sub}</p>}
    </div>
  );
}
