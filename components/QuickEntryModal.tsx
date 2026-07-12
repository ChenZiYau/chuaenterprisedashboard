"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABEL,
  MONTHS,
  MONTHS_FULL,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUSES,
  PAYMENT_STATUS_LABEL,
  fmtMYR,
  type ExpenseCategory,
  type ExpenseEntry,
  type PaymentMethod,
  type PaymentStatus,
  type Property,
  type RevenueEntry,
  type Unit,
} from "@/lib/data";
import { calculateElectricityCharge } from "@/lib/electricity";
import { DateField } from "@/components/ui";
import { useData } from "@/lib/DataContext";
import { useToast } from "@/components/Toast";

export type QuickEntryTab = "revenue" | "expense";

const labelCls = "block text-[10px] font-semibold uppercase tracking-[0.14em] mb-1.5";
const labelStyle: React.CSSProperties = { color: "var(--text-faint)" };
const fieldCls = "ui-field w-full";

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

/** The most recent saved meter reading for a unit strictly before the given
 *  billing period — i.e. "last month's" reading. Null when the unit has no
 *  earlier reading (this entry sets the baseline). */
function previousReading(entries: RevenueEntry[], unitId: string, year: number, month: number): number | null {
  const prior = entries
    .filter(
      (e) =>
        e.unitId === unitId &&
        e.electricityReading != null &&
        (e.year < year || (e.year === year && e.month < month))
    )
    .sort((a, b) => b.year - a.year || b.month - a.month);
  return prior.length ? prior[0].electricityReading : null;
}

/**
 * Quick Entry popup, opened from a property card's Revenue / Expenses buttons.
 * Left column: Revenue/Expense toggle + billing-month grid. Right column: the
 * entry form. Sticky footer: monthly total + save actions.
 */
export function QuickEntryModal({
  open,
  onClose,
  property,
  units,
  initialTab = "revenue",
  selectableProperties,
  allUnits,
}: {
  open: boolean;
  onClose: () => void;
  property: Property;
  units: Unit[];
  initialTab?: QuickEntryTab;
  /** When provided, the header shows a property picker so the popup can be
   *  opened globally (e.g. from the Revenue / Expenses pages) rather than being
   *  pinned to a single property card. */
  selectableProperties?: Property[];
  /** Full unit list, used to derive the selected property's units when the
   *  property picker is active. */
  allUnits?: Unit[];
}) {
  const { tenants, revenueEntries: seedRevenue, expenseEntries: seedExpenses } = useData();
  const toast = useToast();
  const [tab, setTab] = useState<QuickEntryTab>(initialTab);
  const now = useMemo(() => new Date(), []);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-12
  const [unitId, setUnitId] = useState("");

  // When a property picker is active the popup tracks its own selected
  // property; otherwise it stays pinned to the `property` prop.
  const [activePropertyId, setActivePropertyId] = useState(property.id);
  const activeProperty =
    selectableProperties?.find((p) => p.id === activePropertyId) ?? property;
  const activeUnits = useMemo(
    () => (allUnits ? allUnits.filter((u) => u.propertyId === activeProperty.id) : units),
    [allUnits, units, activeProperty.id]
  );

  // Session-local copies of the entries so saves are reflected in the month
  // grid immediately (design prototype — no backend persistence).
  const [revenue, setRevenue] = useState<RevenueEntry[]>(seedRevenue);
  const [expenses, setExpenses] = useState<ExpenseEntry[]>(seedExpenses);

  const isRoomBased = activeProperty.rentalModel === "room_rental";
  const selectedUnit = activeUnits.find((u) => u.id === unitId);

  // Reset to the requested tab / pinned property / current month whenever it opens.
  useEffect(() => {
    if (!open) return;
    setTab(initialTab);
    setActivePropertyId(property.id);
    setYear(now.getFullYear());
    setMonth(now.getMonth() + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, property.id, initialTab, now]);

  // Snap the room selection to the active property's first unit whenever the
  // property changes (on open, or via the header picker).
  useEffect(() => {
    if (!open) return;
    setUnitId(activeUnits[0]?.id ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeProperty.id]);

  // Lock body scroll + close on Escape while open.
  const requestClose = useCallback(() => onClose(), [onClose]);
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") requestClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, requestClose]);

  // Entries for the displayed year — drive the grid's paid/unpaid colouring.
  const yearRevenue = useMemo(
    () => revenue.filter((e) => e.unitId === unitId && e.year === year),
    [revenue, unitId, year]
  );
  const yearExpenses = useMemo(
    () => expenses.filter((e) => e.propertyId === activeProperty.id && e.year === year),
    [expenses, activeProperty.id, year]
  );

  // Tenant move-in period for the selected unit — earlier months are dimmed.
  const moveIn = useMemo(() => {
    const lease = tenants.find((t) => t.unitId === unitId)?.leaseStart;
    if (!lease) return null;
    const d = new Date(lease);
    if (Number.isNaN(d.getTime())) return null;
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  }, [unitId]);

  if (!open) return null;

  const showRoomTabs = isRoomBased && activeUnits.length > 1;
  const handleSaved = () => setTimeout(onClose, 700);

  const datePanel = (
    <div className="flex flex-col gap-3">
      {/* Revenue / Expense toggle */}
      <div className="rounded-xl p-1.5 flex flex-col gap-1.5" style={{ border: "1px solid var(--border-soft)" }}>
        {(["revenue", "expense"] as QuickEntryTab[]).map((t) => {
          const active = tab === t;
          const accent = t === "revenue" ? "var(--accent)" : "var(--danger)";
          return (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              aria-pressed={active}
              className="py-1.5 rounded-lg text-sm font-semibold capitalize transition"
              style={{
                background: active ? accent : "var(--surface-muted)",
                color: active ? "#fff" : "var(--text-secondary)",
                border: `1px solid ${active ? accent : "var(--border-soft)"}`,
              }}
            >
              {t}
            </button>
          );
        })}
      </div>
      {/* Billing month */}
      <div className="rounded-xl p-2.5" style={{ border: "1px solid var(--border-soft)" }}>
        <MonthGrid
          year={year}
          month={month}
          onYear={setYear}
          onSelect={setMonth}
          mode={tab}
          entries={tab === "revenue" ? yearRevenue : []}
          expenseEntries={tab === "expense" ? yearExpenses : []}
          moveIn={tab === "revenue" ? moveIn : null}
        />
      </div>
    </div>
  );

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 sm:p-6">
      <button
        type="button"
        aria-label="Close"
        onClick={requestClose}
        className="absolute inset-0"
        style={{ background: "rgba(15,17,22,0.45)", animation: "qeFadeIn 140ms ease" }}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-entry-title"
        className="relative w-full max-w-5xl h-[88vh] max-h-[840px] flex flex-col rounded-2xl overflow-hidden"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border-soft)",
          boxShadow: "0 24px 64px rgba(15,17,22,0.24)",
          animation: "qePop 180ms cubic-bezier(.2,.7,.2,1)",
        }}
      >
        {/* Header — Quick Entry + date left, property + tenant centered */}
        <div className="flex items-start gap-4 px-6 py-5 shrink-0" style={{ borderBottom: "1px solid var(--border-soft)" }}>
          <div className="min-w-0 shrink-0 w-32">
            <p className="text-[11px] uppercase tracking-[0.16em]" style={{ color: "var(--text-faint)" }}>Quick Entry</p>
            <span className="text-[11px] tabular-nums" style={{ color: "var(--text-faint)" }}>
              {now.toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" })}
            </span>
          </div>
          <div className="flex-1 min-w-0 text-center">
            {selectableProperties ? (
              <select
                id="quick-entry-title"
                aria-label="Property"
                className="ui-select mx-auto max-w-full text-center text-base font-semibold"
                value={activePropertyId}
                onChange={(e) => setActivePropertyId(e.target.value)}
              >
                {selectableProperties.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            ) : (
              <h1 id="quick-entry-title" className="text-xl font-semibold tracking-tight truncate" style={{ color: "var(--text-primary)" }}>
                {activeProperty.name}
              </h1>
            )}
            <p className="text-sm mt-1 truncate" style={{ color: "var(--text-muted)" }}>
              {tab === "revenue" && selectedUnit
                ? selectedUnit.tenantName || "Vacant"
                : `Record ${tab === "revenue" ? "revenue" : "an expense"}`}
            </p>
          </div>
          <div className="w-32 shrink-0 flex justify-end">
            <button
              type="button"
              onClick={requestClose}
              aria-label="Close"
              className="w-8 h-8 rounded-md flex items-center justify-center shrink-0 transition hover:bg-[var(--surface-muted)]"
              style={{ color: "var(--text-muted)", border: "1px solid var(--border-soft)", background: "var(--surface)" }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        {/* Body — the form owns the split layout + sticky footer */}
        <div className="flex-1 min-h-0 flex flex-col">
          {tab === "revenue" ? (
            <RevenueForm
              key={`${activeProperty.id}:${unitId}:${year}-${month}`}
              unit={selectedUnit}
              year={year}
              month={month}
              entries={revenue}
              onSave={(entry) => {
                let existed = false;
                setRevenue((prev) => {
                  const i = prev.findIndex((e) => e.unitId === entry.unitId && e.year === entry.year && e.month === entry.month);
                  existed = i >= 0;
                  return i >= 0 ? prev.map((e, j) => (j === i ? { ...entry, id: e.id } : e)) : [entry, ...prev];
                });
                if (existed) toast.updated("Revenue entry updated");
                else toast.created("Revenue entry created");
                handleSaved();
              }}
              datePanel={datePanel}
              contextSlot={showRoomTabs ? <RoomTabs units={activeUnits} unitId={unitId} onSelect={setUnitId} /> : undefined}
              propertyId={activeProperty.id}
            />
          ) : (
            <ExpenseForm
              key={`${activeProperty.id}:${year}-${month}`}
              propertyId={activeProperty.id}
              units={isRoomBased ? activeUnits : []}
              year={year}
              month={month}
              onSave={(list) => {
                setExpenses((prev) => [...list, ...prev]);
                toast.created(list.length > 1 ? `${list.length} expenses created` : "Expense created");
                handleSaved();
              }}
              datePanel={datePanel}
            />
          )}
        </div>
      </div>

      <style jsx global>{`
        @keyframes qeFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes qePop { from { transform: scale(.97); opacity: 0; } to { transform: scale(1); opacity: 1; } }
      `}</style>
    </div>,
    document.body
  );
}

/* ────────────────────────────── Revenue form ────────────────────────────── */

function RevenueForm({
  propertyId,
  unit,
  year,
  month,
  entries,
  onSave,
  datePanel,
  contextSlot,
}: {
  propertyId: string;
  unit: Unit | undefined;
  year: number;
  month: number;
  entries: RevenueEntry[];
  onSave: (entry: RevenueEntry) => void;
  datePanel: React.ReactNode;
  contextSlot?: React.ReactNode;
}) {
  const unitId = unit?.id ?? "";
  const existing = entries.find((e) => e.unitId === unitId && e.year === year && e.month === month);
  const firstOfMonth = `${year}-${String(month).padStart(2, "0")}-01`;

  const [rental, setRental] = useState(existing ? String(existing.rental) : unit?.rentalRate ? String(unit.rentalRate) : "");
  const [elecUnits, setElecUnits] = useState(existing?.electricityReading != null ? String(existing.electricityReading) : "");
  const [otherCharges, setOtherCharges] = useState(existing?.other != null ? String(existing.other) : "");
  const [payDate, setPayDate] = useState(existing?.paymentDate ?? firstOfMonth);
  const [payMethod, setPayMethod] = useState<PaymentMethod>(existing?.method ?? "bank_transfer");
  const [customPayMethod, setCustomPayMethod] = useState("");
  const [payStatus, setPayStatus] = useState<PaymentStatus>(existing?.status ?? "paid");
  const [notes, setNotes] = useState("");
  const [prorate, setProrate] = useState(false);
  const [startDate, setStartDate] = useState(firstOfMonth);
  const [notesFocused, setNotesFocused] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Electricity is entered as the current meter reading. Usage for the month
  // is (this reading − last month's reading); the charge applies the free
  // allowance + TNB tiers to that usage. The first-ever reading only sets the
  // baseline — the charge starts from next month's reading.
  const reading = parseFloat(elecUnits) || 0;
  const freeUnits = unit?.electricityFreeUnits ?? 0;
  const prevReading = previousReading(entries, unitId, year, month);
  const elecUsage = reading > 0 && prevReading != null ? Math.max(0, reading - prevReading) : 0;
  const elecBill = reading > 0 && prevReading != null ? calculateElectricityCharge(elecUsage, freeUnits) : null;
  const elecAmount = elecBill?.chargeAmount ?? 0;
  const rentalNum = parseFloat(rental) || 0;
  const otherNum = parseFloat(otherCharges) || 0;

  // Proration for a mid-month move-in: rent × (days occupied / days in month).
  const monthStr = String(month).padStart(2, "0");
  const dim = daysInMonth(year, month);
  const startInMonth = startDate.startsWith(`${year}-${monthStr}-`);
  const startDay = startInMonth ? Number(startDate.slice(8, 10)) : 0;
  const chargeableDays = startInMonth ? dim - startDay + 1 : dim;
  const proratedAmount = Math.round(((rentalNum * chargeableDays) / dim) * 100) / 100;
  const proration = prorate && startInMonth ? { chargeableDays, proratedAmount } : null;
  const effectiveRental = proration ? proration.proratedAmount : rentalNum;
  const totalAmount = effectiveRental + elecAmount + otherNum;

  function validate() {
    const e: Record<string, string> = {};
    if (!unitId) e.unitId = "Select a room or unit.";
    if (!rental || rentalNum <= 0) e.rental = "Enter a rental amount greater than 0.";
    if (!payDate) e.payDate = "Enter a payment date.";
    if (payMethod === "other" && !customPayMethod.trim()) e.customPayMethod = "Describe the payment method.";
    if (prorate && !startInMonth) e.startDate = `Start date must be within ${MONTHS_FULL[month - 1]} ${year}.`;
    return e;
  }

  function handleSave(generateInvoice: boolean) {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    setErrors({});
    setSaved(true);
    onSave({
      id: `r-${Date.now()}`,
      propertyId,
      unitId,
      month,
      year,
      paymentDate: payDate,
      rental: effectiveRental,
      // Persist the meter reading (not the usage) so it becomes next month's
      // "last month" reading for the delta calculation.
      electricityReading: reading || null,
      electricity: elecAmount || null,
      other: otherNum || null,
      method: payMethod,
      status: payStatus,
      invoiceGenerated: generateInvoice,
      invoiceNumber: `${(unit?.name ?? "U").slice(-1)}${month}-${monthStr}${String(year).slice(2)}`,
    });
  }

  // Clear a single field's error so each message persists until its own
  // field is fixed.
  function clearError(field: string) {
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  function onText(setter: (v: string) => void, errorKey?: string) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setter(e.target.value);
      if (saved) setSaved(false);
      if (errorKey) clearError(errorKey);
    };
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] flex-1 min-h-0">
        {/* LEFT — toggle + billing month */}
        <div className="flex flex-col gap-3 px-5 py-4 lg:border-r min-h-0 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" style={{ borderColor: "var(--border-soft)" }}>
          {datePanel}
        </div>

        {/* RIGHT — room tabs + charges + payment (only this scrolls) */}
        <div className="flex flex-col gap-4 px-5 py-4 overflow-y-auto min-h-0 ui-scroll">
          {contextSlot}

          {existing && (
            <div className="flex items-start gap-2.5 rounded-lg px-3 py-2.5 text-xs" style={{ background: "rgba(224,162,61,0.10)", border: "1px solid var(--warning)", color: "var(--warning)" }}>
              <span className="mt-px">&#9888;</span>
              <span>An entry already exists for {MONTHS_FULL[month - 1]} {year}. Saving will update it.</span>
            </div>
          )}

          {/* Base Rent */}
          <div>
            <label className={labelCls} style={labelStyle}>
              {prorate ? "Base rent — full month (RM)" : "Base Rent (RM)"}
            </label>
            <input
              type="number" inputMode="decimal" min={0} step="0.01" placeholder="0.00"
              className={fieldCls}
              style={errors.rental ? { borderColor: "var(--danger)" } : undefined}
              value={rental} onChange={onText(setRental, "rental")}
            />
            {errors.rental && <p className="text-xs mt-1" style={{ color: "var(--danger)" }}>{errors.rental}</p>}
            <label className="flex items-center gap-1.5 mt-2 cursor-pointer select-none" title="Prorate for a mid-month move-in">
              <input
                type="checkbox" checked={prorate}
                onChange={(e) => { setProrate(e.target.checked); if (saved) setSaved(false); }}
                style={{ accentColor: "var(--accent)", width: 14, height: 14 }}
              />
              <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Prorate (mid-month start)</span>
            </label>
          </div>

          {prorate && (
            <div className="rounded-lg px-3 py-3 flex flex-col gap-2.5" style={{ background: "var(--surface-muted)", border: "1px solid var(--border-soft)" }}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelCls} style={labelStyle}>Start date</label>
                  <DateField
                    className={fieldCls}
                    style={errors.startDate ? { borderColor: "var(--danger)" } : undefined}
                    min={`${year}-${monthStr}-01`}
                    max={`${year}-${monthStr}-${String(dim).padStart(2, "0")}`}
                    value={startDate}
                    ariaLabel="Prorate start date"
                    onChange={(v) => { setStartDate(v); if (saved) setSaved(false); clearError("startDate"); }}
                  />
                  {errors.startDate && <p className="text-xs mt-1" style={{ color: "var(--danger)" }}>{errors.startDate}</p>}
                </div>
                <div>
                  <label className={labelCls} style={labelStyle}>End date</label>
                  <div className={`${fieldCls} flex items-center cursor-not-allowed`}
                    style={{ background: "var(--surface-muted)", color: "var(--text-muted)" }}
                    title="Rent is charged through the end of the billing month">
                    {`${String(dim).padStart(2, "0")} ${MONTHS[month - 1]} ${year}`}
                  </div>
                </div>
              </div>
              {proration && (
                <div className="text-xs flex flex-col gap-0.5" style={{ color: "var(--text-muted)" }}>
                  <div className="flex justify-between"><span>Full rent</span><span className="tabular-nums">{fmtMYR(rentalNum)}</span></div>
                  <div className="flex justify-between"><span>Days used</span><span className="tabular-nums">{proration.chargeableDays} / {dim} days</span></div>
                  <div className="flex justify-between font-semibold" style={{ color: "var(--text-primary)" }}>
                    <span>Prorated rent</span><span className="tabular-nums">{fmtMYR(proration.proratedAmount)}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Electricity — meter reading; the calculation is shown below */}
          <div>
            <label className={labelCls} style={labelStyle}>Electricity Usage (kWh)</label>
            <input
              type="number" inputMode="decimal" min={0} step="1" placeholder="e.g. 3800"
              className={fieldCls} value={elecUnits} onChange={onText(setElecUnits)}
            />
            {reading > 0 && prevReading != null && elecBill ? (
              <p className="text-xs mt-1.5" style={{ color: "var(--text-muted)" }}>
                {reading} &minus; {prevReading} (last month) = {elecUsage} kWh &minus; {freeUnits} free = {elecBill.chargeableUnits} kWh &#8594;{" "}
                <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{fmtMYR(elecBill.chargeAmount)}</span>
              </p>
            ) : reading > 0 && prevReading == null ? (
              <p className="text-xs mt-1.5" style={{ color: "var(--text-faint)" }}>
                First reading for this room — saved as the baseline. The charge starts from next month&apos;s reading.
              </p>
            ) : (
              <p className="text-xs mt-1.5" style={{ color: "var(--text-faint)" }}>
                Enter this month&apos;s meter reading{prevReading != null ? ` (last month: ${prevReading})` : ""}. Last month and {freeUnits} free kWh are subtracted automatically.
              </p>
            )}
          </div>

          {/* Other Charges */}
          <div>
            <label className={labelCls} style={labelStyle}>Other Charges (RM)</label>
            <input
              type="number" inputMode="decimal" min={0} step="0.01" placeholder="0.00"
              className={fieldCls} value={otherCharges} onChange={onText(setOtherCharges)}
            />
          </div>

          {/* Payment */}
          <div className="flex flex-col gap-3 pt-1">
            <p className="text-[10px] uppercase tracking-[0.16em]" style={{ color: "var(--text-faint)" }}>Payment</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls} style={labelStyle}>Payment date</label>
                <DateField
                  className={fieldCls}
                  style={errors.payDate ? { borderColor: "var(--danger)" } : undefined}
                  value={payDate}
                  ariaLabel="Payment date"
                  onChange={(v) => { setPayDate(v); if (saved) setSaved(false); clearError("payDate"); }}
                />
                {errors.payDate && <p className="text-xs mt-1" style={{ color: "var(--danger)" }}>{errors.payDate}</p>}
              </div>
              <div>
                <label className={labelCls} style={labelStyle}>Status</label>
                <select className="ui-select w-full" value={payStatus}
                  onChange={(e) => { setPayStatus(e.target.value as PaymentStatus); if (saved) setSaved(false); }}>
                  {PAYMENT_STATUSES.map((s) => <option key={s} value={s}>{PAYMENT_STATUS_LABEL[s]}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls} style={labelStyle}>Method</label>
                <select className="ui-select w-full" value={payMethod}
                  onChange={(e) => { setPayMethod(e.target.value as PaymentMethod); if (saved) setSaved(false); }}>
                  {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{PAYMENT_METHOD_LABEL[m]}</option>)}
                </select>
              </div>
              {payMethod === "other" && (
                <div>
                  <label className={labelCls} style={labelStyle}>Custom method</label>
                  <input type="text" placeholder="Describe..." className={fieldCls}
                    style={errors.customPayMethod ? { borderColor: "var(--danger)" } : undefined}
                    value={customPayMethod} onChange={onText(setCustomPayMethod, "customPayMethod")} />
                  {errors.customPayMethod && <p className="text-xs mt-1" style={{ color: "var(--danger)" }}>{errors.customPayMethod}</p>}
                </div>
              )}
            </div>
            <div>
              <label className={labelCls} style={labelStyle}>Notes (optional)</label>
              <textarea
                rows={notesFocused ? 4 : 2} placeholder="Any remarks..."
                className={`${fieldCls} resize-none transition-[height]`}
                value={notes} onChange={onText(setNotes)}
                onFocus={() => setNotesFocused(true)} onBlur={() => setNotesFocused(false)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* STICKY FOOTER — total + save actions, always visible */}
      <div className="px-5 py-3 flex flex-col gap-2.5 shrink-0" style={{ borderTop: "1px solid var(--border-soft)", background: "var(--surface)" }}>
        {saved && (
          <div className="rounded-lg px-4 py-2.5 flex items-center gap-2" style={{ background: "rgba(47,158,111,0.10)", border: "1px solid var(--success)" }}>
            <span style={{ color: "var(--success)" }}>&#10003;</span>
            <span className="text-xs font-medium" style={{ color: "var(--success)" }}>Saved &mdash; {MONTHS_FULL[month - 1]} {year}</span>
          </div>
        )}
        <div className="flex items-center justify-between rounded-lg px-3 py-2.5" style={{ background: "var(--surface-muted)", border: "1px solid var(--border-soft)" }}>
          <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Total month revenue</span>
          <span className="text-xl font-bold tabular-nums" style={{ color: "var(--accent)" }}>{fmtMYR(totalAmount)}</span>
        </div>
        <div className="flex items-center justify-end gap-2">
          <button type="button" className="ui-btn justify-center" onClick={() => handleSave(false)}>Save only</button>
          <button type="button" className="ui-btn ui-btn-primary justify-center" onClick={() => handleSave(true)}>
            {existing ? "Update & invoice" : "Save & invoice"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────── Expense form ────────────────────────────── */

type ExpenseItem = {
  key: string;
  category: ExpenseCategory;
  description: string;
  amount: string;
  date: string;
  fixed: boolean;
};

let _seq = 0;
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function newItem(): ExpenseItem {
  _seq += 1;
  return { key: `qe-item-${_seq}`, category: "maintenance", description: "", amount: "", date: todayISO(), fixed: false };
}

function ExpenseForm({
  propertyId,
  units,
  year,
  month,
  onSave,
  datePanel,
}: {
  propertyId: string;
  units: Unit[];
  year: number;
  month: number;
  onSave: (entries: ExpenseEntry[]) => void;
  datePanel: React.ReactNode;
}) {
  const [unitId, setUnitId] = useState("");
  const [items, setItems] = useState<ExpenseItem[]>([newItem()]);
  const [savedCount, setSavedCount] = useState(0);

  const showRoomSelector = units.length > 1;
  const validItems = items.filter((it) => (parseFloat(it.amount) || 0) > 0);
  const total = validItems.reduce((s, it) => s + (parseFloat(it.amount) || 0), 0);
  const canSave = validItems.length > 0;

  function updateItem(key: string, patch: Partial<ExpenseItem>) {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
    if (savedCount) setSavedCount(0);
  }

  function handleSave() {
    if (!canSave) return;
    setSavedCount(validItems.length);
    onSave(
      validItems.map((it, i) => ({
        id: `e-${Date.now()}-${i}`,
        propertyId,
        unitId: showRoomSelector ? unitId || null : null,
        month,
        year,
        expenseDate: it.date || todayISO(),
        category: it.category,
        description: it.description.trim() || null,
        type: null,
        amount: parseFloat(it.amount) || 0,
        fixed: it.fixed,
      }))
    );
    setItems([newItem()]);
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] flex-1 min-h-0">
        {/* LEFT — toggle + billing month */}
        <div className="flex flex-col gap-3 px-5 py-4 lg:border-r min-h-0 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" style={{ borderColor: "var(--border-soft)" }}>
          {datePanel}
        </div>

        {/* RIGHT — expense items (only this scrolls) */}
        <div className="flex flex-col gap-4 px-5 py-4 overflow-y-auto min-h-0 ui-scroll">
          {showRoomSelector && (
            <div>
              <label className={labelCls} style={labelStyle}>Room (optional)</label>
              <RoomTabs
                units={units}
                unitId={unitId}
                onSelect={setUnitId}
                allOption={{ id: "", label: "All", title: "Whole property / shared" }}
              />
            </div>
          )}

          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            List everything you paid for this month - one line each.
          </p>

          {items.map((it, i) => (
            <div key={it.key} className="rounded-xl p-3 flex flex-col gap-2.5" style={{ background: "var(--surface-muted)", border: "1px solid var(--border-soft)" }}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-[0.14em]" style={{ color: "var(--text-faint)" }}>Item {i + 1}</span>
                <button
                  type="button"
                  onClick={() => setItems((prev) => (prev.length === 1 ? [newItem()] : prev.filter((x) => x.key !== it.key)))}
                  aria-label="Remove item"
                  className="w-6 h-6 rounded flex items-center justify-center transition hover:bg-[var(--surface)]"
                  style={{ color: "var(--text-faint)" }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                </button>
              </div>

              {/* Category + amount */}
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px] gap-2.5">
                <select
                  className="ui-select w-full"
                  aria-label={`Expense category for item ${i + 1}`}
                  value={it.category}
                  onChange={(e) => updateItem(it.key, { category: e.target.value as ExpenseCategory })}
                  style={{ background: "var(--surface)" }}
                >
                  {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{EXPENSE_CATEGORY_LABEL[c]}</option>)}
                </select>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: "var(--text-faint)" }}>RM</span>
                  <input
                    type="number" inputMode="decimal" min={0} step="0.01" placeholder="0.00"
                    className={`${fieldCls} pl-9 text-right tabular-nums`}
                    value={it.amount} onChange={(e) => updateItem(it.key, { amount: e.target.value })}
                  />
                </div>
              </div>

              {/* Detail (optional) */}
              <input
                type="text" placeholder="Detail (Optional)" className={fieldCls}
                value={it.description} onChange={(e) => updateItem(it.key, { description: e.target.value })}
              />

              {/* Payment date */}
              <div>
                <label className={labelCls} style={labelStyle}>Payment date</label>
                <DateField
                  className={fieldCls} value={it.date}
                  ariaLabel={`Payment date for item ${i + 1}`}
                  onChange={(v) => updateItem(it.key, { date: v })}
                />
              </div>

              {/* Fixed toggle — drives the green vs yellow month colouring */}
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox" checked={it.fixed}
                  onChange={(e) => updateItem(it.key, { fixed: e.target.checked })}
                  style={{ accentColor: "var(--success)", width: 14, height: 14 }}
                />
                <span className="text-xs font-medium" style={{ color: it.fixed ? "var(--success)" : "var(--text-muted)" }}>
                  Fixed / resolved
                </span>
              </label>
            </div>
          ))}

          <button
            type="button"
            onClick={() => setItems((prev) => [...prev, newItem()])}
            className="w-full rounded-xl py-2.5 text-sm font-medium transition hover:bg-[var(--surface-muted)]"
            style={{ border: "1px dashed var(--border-strong)", color: "var(--accent)", background: "transparent" }}
          >
            + Add another item
          </button>
        </div>
      </div>

      {/* STICKY FOOTER — total + save, always visible */}
      <div className="px-5 py-3 flex flex-col gap-2.5 shrink-0" style={{ borderTop: "1px solid var(--border-soft)", background: "var(--surface)" }}>
        {savedCount > 0 && (
          <div className="rounded-lg px-4 py-2.5 flex items-center gap-2" style={{ background: "rgba(47,158,111,0.10)", border: "1px solid var(--success)" }}>
            <span style={{ color: "var(--success)" }}>&#10003;</span>
            <span className="text-xs font-medium" style={{ color: "var(--success)" }}>
              Saved {savedCount} {savedCount === 1 ? "expense" : "expenses"} &mdash; {MONTHS_FULL[month - 1]} {year}
            </span>
          </div>
        )}
        <div className="flex items-center justify-between rounded-lg px-3 py-2.5" style={{ background: "var(--surface-muted)", border: "1px solid var(--border-soft)" }}>
          <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Total month expenses</span>
          <span className="text-xl font-bold tabular-nums" style={{ color: "var(--danger)" }}>{fmtMYR(total)}</span>
        </div>
        <div className="flex items-center justify-end gap-2">
          <button
            type="button" className="ui-btn ui-btn-primary justify-center" disabled={!canSave}
            style={{ opacity: !canSave ? 0.55 : 1 }} onClick={handleSave}
          >
            {validItems.length > 1 ? `Save ${validItems.length} Expenses` : "Save Expenses"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── Shared sub-pieces ─────────────────────────── */

/** Month picker grid — Jan–Jun left column, Jul–Dec right (column-major), with
 *  a year stepper above. Paid months are green, due-but-unpaid yellow, future
 *  and pre-move-in months stay neutral. */
function MonthGrid({
  year,
  month,
  onYear,
  onSelect,
  mode,
  entries,
  expenseEntries,
  moveIn,
}: {
  year: number;
  month: number;
  onYear: (y: number) => void;
  onSelect: (m: number) => void;
  mode: QuickEntryTab;
  entries: RevenueEntry[];
  expenseEntries: ExpenseEntry[];
  moveIn: { year: number; month: number } | null;
}) {
  const now = new Date();
  const nowYear = now.getFullYear();
  const nowMonth = now.getMonth() + 1;
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={labelStyle}>Billing month</p>
      {/* Year stepper */}
      <div className="flex items-center justify-between rounded-lg px-2 py-1" style={{ background: "var(--surface-muted)", border: "1px solid var(--border-soft)" }}>
        <button type="button" aria-label="Previous year" onClick={() => onYear(year - 1)} className="w-6 h-6 rounded-md inline-flex items-center justify-center transition hover:bg-[var(--surface)]" style={{ color: "var(--text-muted)" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
        </button>
        <span className="text-sm font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>{year}</span>
        <button type="button" aria-label="Next year" onClick={() => onYear(year + 1)} className="w-6 h-6 rounded-md inline-flex items-center justify-center transition hover:bg-[var(--surface)]" style={{ color: "var(--text-muted)" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
        </button>
      </div>
      {/* Column-major grid: 6 rows × 2 cols → Jan–Jun | Jul–Dec */}
      <div className="grid grid-rows-6 grid-flow-col gap-1">
        {MONTHS.map((label, i) => {
          const m = i + 1;
          const active = m === month;

          let bg = "var(--surface-muted)";
          let color = "var(--text-secondary)";
          let border = "var(--border-soft)";
          let dimmed = false;

          if (mode === "expense") {
            // No expense → neutral; any unfixed → yellow; all fixed → green.
            const monthExp = expenseEntries.filter((e) => e.month === m);
            if (monthExp.length > 0) {
              if (monthExp.every((e) => e.fixed)) {
                bg = "rgba(47,158,111,0.14)"; color = "var(--success)"; border = "var(--success)";
              } else {
                bg = "rgba(224,162,61,0.16)"; color = "var(--warning)"; border = "var(--warning)";
              }
            }
          } else {
            // Green (paid) / yellow (unpaid & due) / neutral (future or pre-move-in).
            const entry = entries.find((e) => e.month === m);
            const paid = entry?.status === "paid";
            const excluded = moveIn ? year < moveIn.year || (year === moveIn.year && m < moveIn.month) : false;
            const future = year > nowYear || (year === nowYear && m > nowMonth);
            dimmed = excluded;
            if (excluded) {
              bg = "var(--surface-muted)"; color = "var(--text-faint)";
            } else if (paid) {
              bg = "rgba(47,158,111,0.14)"; color = "var(--success)"; border = "var(--success)";
            } else if (!future) {
              bg = "rgba(224,162,61,0.16)"; color = "var(--warning)"; border = "var(--warning)";
            }
          }

          if (active) {
            bg = "var(--accent)";
            color = "#fff";
            border = "var(--accent)";
          }

          return (
            <button
              key={label}
              type="button"
              onClick={() => onSelect(m)}
              aria-pressed={active}
              className="py-1 rounded-md text-xs font-medium transition"
              style={{
                background: bg,
                color,
                border: `1px solid ${border}`,
                boxShadow: active ? "0 0 0 2px var(--accent-soft)" : "none",
                opacity: dimmed && !active ? 0.6 : 1,
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Horizontal room tabs for room-based properties — the selected room drives
 *  the tenant name and charges. Rooms come straight from `units`, so adding a
 *  room automatically adds a button. An optional leading "All" button (used by
 *  the expense form) selects the whole property. */
function RoomTabs({
  units,
  unitId,
  onSelect,
  allOption,
}: {
  units: Unit[];
  unitId: string;
  onSelect: (id: string) => void;
  allOption?: { id: string; label: string; title?: string };
}) {
  const tabs = [
    ...(allOption ? [{ id: allOption.id, name: allOption.label, title: allOption.title }] : []),
    ...units.map((u) => ({ id: u.id, name: u.name, title: undefined as string | undefined })),
  ];
  return (
    <div className="flex flex-wrap gap-1.5">
      {tabs.map((t) => {
        const active = t.id === unitId;
        return (
          <button
            key={t.id || "__all__"}
            type="button"
            onClick={() => onSelect(t.id)}
            aria-pressed={active}
            title={t.title}
            className="px-4 py-2 rounded-lg text-sm font-medium transition"
            style={{
              background: active ? "var(--accent-soft)" : "var(--surface-muted)",
              color: active ? "var(--accent)" : "var(--text-secondary)",
              border: `1px solid ${active ? "var(--accent)" : "var(--border-soft)"}`,
            }}
          >
            {t.name}
          </button>
        );
      })}
    </div>
  );
}
