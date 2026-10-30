import type { RevenueEntry, Tenant, Unit } from "./data";

export function tenantForMonth(tenants: Tenant[], unitId: string, year: number, month: number) {
  const period = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
  return tenants.filter((t) => t.unitId === unitId && t.leaseStart.slice(0, 7) <= period && t.leaseEnd.slice(0, 7) >= period)
    .sort((a, b) => b.leaseStart.localeCompare(a.leaseStart) || a.id.localeCompare(b.id))[0];
}

/** Pending rent is derived from the saved lease; recorded months always win.
 * Only project the selected date range, so no scheduler or monthly re-entry is needed.
 */
export function withScheduledRent(entries: RevenueEntry[], tenants: Tenant[], units: Unit[], from: string, to: string): RevenueEntry[] {
  const result = [...entries];
  const occupied = new Set(entries.map((e) => `${e.unitId}:${e.year}:${e.month}`));
  const currentYear = new Date().getFullYear();
  const start = from || `${currentYear}-01-01`;
  const end = to || `${currentYear}-12-31`;
  for (let index = Number(start.slice(0, 4)) * 12 + Number(start.slice(5, 7)) - 1;
    index <= Number(end.slice(0, 4)) * 12 + Number(end.slice(5, 7)) - 1; index++) {
    const year = Math.floor(index / 12), month = index % 12 + 1;
    for (const unit of units) {
      const key = `${unit.id}:${year}:${month}`;
      if (occupied.has(key)) continue;
      const tenant = tenantForMonth(tenants, unit.id, year, month);
      if (!tenant || tenant.baseRent == null || tenant.baseRent <= 0) continue;
      const first = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-01`;
      result.push({ id: `scheduled:${key}`, scheduled: true, propertyId: unit.propertyId, unitId: unit.id,
        year, month, paymentDate: first < tenant.leaseStart ? tenant.leaseStart : first,
        rental: tenant.baseRent, electricityReading: null, electricity: null, other: null,
        method: "bank_transfer", status: "pending", invoiceGenerated: false, invoiceNumber: "" });
      occupied.add(key);
    }
  }
  return result;
}
