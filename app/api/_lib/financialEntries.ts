import { EXPENSE_CATEGORIES, PAYMENT_METHODS, PAYMENT_STATUSES, type ExpenseEntry, type RevenueEntry } from "@/lib/data";
import { supabaseAdmin } from "@/lib/supabaseServer";

function validDate(value: unknown): boolean {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function amount(value: unknown, positive = false): boolean {
  return typeof value === "number" && Number.isFinite(value) && (positive ? value > 0 : value >= 0);
}

function period(entry: { propertyId?: unknown; month?: unknown; year?: unknown }): boolean {
  return typeof entry.propertyId === "string" && entry.propertyId.trim().length > 0 &&
    Number.isInteger(entry.month) && Number(entry.month) >= 1 && Number(entry.month) <= 12 &&
    Number.isInteger(entry.year) && Number(entry.year) >= 1 && Number(entry.year) <= 9999;
}

export function isRevenueEntry(value: unknown): value is RevenueEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as RevenueEntry;
  return period(entry) && typeof entry.unitId === "string" && entry.unitId.trim().length > 0 &&
    validDate(entry.paymentDate) && amount(entry.rental, true) &&
    [entry.electricityReading, entry.electricity, entry.other].every((value) => value == null || amount(value)) &&
    PAYMENT_METHODS.includes(entry.method) && PAYMENT_STATUSES.includes(entry.status) &&
    (entry.notes == null || typeof entry.notes === "string") &&
    (entry.customPaymentMethod == null || typeof entry.customPaymentMethod === "string") &&
    typeof entry.invoiceGenerated === "boolean" && typeof entry.invoiceNumber === "string";
}

export function isExpenseEntry(value: unknown): value is ExpenseEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as ExpenseEntry;
  return period(entry) && (entry.unitId == null || (typeof entry.unitId === "string" && entry.unitId.trim().length > 0)) &&
    validDate(entry.expenseDate) && amount(entry.amount, true) && EXPENSE_CATEGORIES.includes(entry.category) &&
    (entry.description == null || typeof entry.description === "string") &&
    (entry.type == null || entry.type === "recurring" || entry.type === "irregular");
}

/** A valid foreign key alone does not prove that a room belongs to this property. */
export async function hasValidEntryTarget(propertyId: string, unitId: string | null | undefined): Promise<boolean> {
  const query = unitId
    ? supabaseAdmin.from("units").select("id").eq("id", unitId).eq("property_id", propertyId)
    : supabaseAdmin.from("properties").select("id").eq("id", propertyId);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export function revenueRow(entry: RevenueEntry, existing?: Record<string, unknown>) {
  return {
    property_id: entry.propertyId,
    unit_id: entry.unitId,
    month: entry.month,
    year: entry.year,
    payment_date: entry.paymentDate,
    rental_amount: entry.rental,
    electricity_units: entry.electricityReading ?? null,
    electricity_amount: entry.electricity ?? null,
    other_charges_amount: entry.other ?? null,
    total_amount: entry.rental + (entry.electricity ?? 0) + (entry.other ?? 0),
    payment_method: entry.method === "other" ? entry.customPaymentMethod?.trim() || "other" : entry.method,
    notes: entry.notes ?? existing?.notes ?? null,
    payment_status: entry.status,
    invoice_generated: Boolean(existing?.invoice_generated) || entry.invoiceGenerated,
    invoice_number: (existing?.invoice_number as string) || entry.invoiceNumber,
  };
}

export function expenseRow(entry: ExpenseEntry) {
  return {
    property_id: entry.propertyId,
    unit_id: entry.unitId ?? null,
    month: entry.month,
    year: entry.year,
    expense_date: entry.expenseDate,
    category: entry.category,
    description: entry.description ?? null,
    is_recurring: entry.type === "recurring",
    is_irregular: entry.type === "irregular",
    amount: entry.amount,
  };
}
