import "server-only";
import { supabaseAdmin } from "@/lib/supabaseServer";
import type {
  Property,
  Unit,
  Tenant,
  RevenueEntry,
  ExpenseEntry,
  PropertyType,
  PropertyStatus,
  RentalModel,
  PaymentMethod,
  PaymentStatus,
  ExpenseCategory,
} from "@/lib/data";

/** Coerce Postgres numeric (which PostgREST may return as a string) to number,
 *  preserving null. */
function num(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isNaN(n) ? null : n;
}

// --- Row -> app-type mappers ------------------------------------------------
// The DB uses snake_case and a slightly richer schema; the UI expects the
// camelCase shapes declared in lib/data.ts. These mappers bridge the two so no
// component has to know about the database column names.

export function mapProperty(r: Record<string, unknown>): Property {
  return {
    id: r.id as string,
    slug: (r.slug as string) ?? undefined,
    name: (r.name as string) ?? "",
    shortName: (r.short_name as string) ?? (r.name as string) ?? "",
    city: (r.city as string) ?? "",
    rentalModel: ((r.rental_model as RentalModel) ?? "room_rental"),
    address: (r.address as string) ?? undefined,
    state: (r.state as string) ?? undefined,
    postcode: (r.postcode as string) ?? undefined,
    propertyType: (r.property_type as PropertyType) ?? undefined,
    status: (r.status as PropertyStatus) ?? undefined,
    description: (r.description as string) ?? undefined,
    imageUrl: (r.image_url as string) ?? undefined,
  };
}

export function mapUnit(r: Record<string, unknown>): Unit {
  return {
    id: r.id as string,
    propertyId: r.property_id as string,
    name: (r.name as string) ?? "",
    tenantName: (r.tenant_name as string) ?? undefined,
    rentalRate: num(r.rental_rate) ?? 0,
    depositMonths: num(r.deposit_months),
    depositAmount: num(r.deposit_amount),
    electricityFreeUnits: num(r.electricity_free_units) ?? 0,
  };
}

export function mapTenant(r: Record<string, unknown>): Tenant {
  return {
    id: r.id as string,
    name: (r.name as string) ?? "",
    icNumber: (r.ic_number as string) ?? "",
    phone: (r.phone as string) ?? "",
    email: (r.email as string) ?? null,
    unitId: (r.unit_id as string) ?? "",
    leaseStart: (r.lease_start as string) ?? "",
    leaseEnd: (r.lease_end as string) ?? "",
  };
}

export function mapRevenue(r: Record<string, unknown>): RevenueEntry {
  const method = typeof r.payment_method === "string" ? r.payment_method : "bank_transfer";
  const standardMethod = ["bank_transfer", "cash", "cheque", "other"].includes(method);
  return {
    id: r.id as string,
    propertyId: r.property_id as string,
    unitId: r.unit_id as string,
    month: num(r.month) ?? 0,
    year: num(r.year) ?? 0,
    paymentDate: (r.payment_date as string) ?? "",
    rental: num(r.rental_amount) ?? 0,
    electricityReading: num(r.electricity_units),
    electricity: num(r.electricity_amount),
    other: num(r.other_charges_amount),
    method: standardMethod ? method as PaymentMethod : "other",
    customPaymentMethod: standardMethod ? undefined : method,
    notes: typeof r.notes === "string" ? r.notes : "",
    status: ((r.payment_status as PaymentStatus) ?? "pending"),
    invoiceGenerated: Boolean(r.invoice_generated),
    invoiceNumber: (r.invoice_number as string) ?? "",
  };
}

export function mapExpense(r: Record<string, unknown>): ExpenseEntry {
  const recurring = Boolean(r.is_recurring);
  const irregular = Boolean(r.is_irregular);
  return {
    id: r.id as string,
    propertyId: r.property_id as string,
    unitId: (r.unit_id as string) ?? null,
    month: num(r.month) ?? 0,
    year: num(r.year) ?? 0,
    expenseDate: (r.expense_date as string) ?? "",
    category: ((r.category as ExpenseCategory) ?? "other"),
    description: (r.description as string) ?? null,
    type: recurring ? "recurring" : irregular ? "irregular" : null,
    amount: num(r.amount) ?? 0,
    fixed: r.is_fixed == null ? undefined : Boolean(r.is_fixed),
  };
}

// --- Fetchers ---------------------------------------------------------------

/** PostgREST caps each response. Page with a stable unique tie-breaker so
 *  older entries are included in ledgers and dashboard totals. */
async function getAllRows(table: string, orders: [string, boolean][]): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  const pageSize = 500;
  for (;;) {
    let query = supabaseAdmin.from(table).select("*");
    for (const [column, ascending] of orders) query = query.order(column, { ascending });
    const { data, error } = await query.order("id", { ascending: true }).range(rows.length, rows.length + pageSize - 1);
    if (error) throw error;
    if (!data?.length) return rows;
    rows.push(...data);
  }
}

export async function getProperties(): Promise<Property[]> {
  return (await getAllRows("properties", [["name", true]])).map(mapProperty);
}

export async function getUnits(): Promise<Unit[]> {
  return (await getAllRows("units", [["sort_order", true]])).map(mapUnit);
}

export async function getTenants(): Promise<Tenant[]> {
  return (await getAllRows("tenants", [["name", true]])).map(mapTenant);
}

export async function getRevenue(): Promise<RevenueEntry[]> {
  return (await getAllRows("revenue", [["year", false], ["month", false]])).map(mapRevenue);
}

export async function getExpenses(): Promise<ExpenseEntry[]> {
  return (await getAllRows("expenses", [["expense_date", false]])).map(mapExpense);
}

export type DashboardData = {
  properties: Property[];
  units: Unit[];
  tenants: Tenant[];
  revenueEntries: RevenueEntry[];
  expenseEntries: ExpenseEntry[];
};

/** Fetch everything the dashboard needs in one round of parallel queries. */
export async function getDashboardData(): Promise<DashboardData> {
  const [properties, units, tenants, revenueEntries, expenseEntries] = await Promise.all([
    getProperties(),
    getUnits(),
    getTenants(),
    getRevenue(),
    getExpenses(),
  ]);
  return { properties, units, tenants, revenueEntries, expenseEntries };
}
