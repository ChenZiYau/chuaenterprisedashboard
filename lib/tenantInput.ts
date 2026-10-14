export type TenantRowInput = {
  name: string;
  ic_number: string;
  phone: string;
  email: string | null;
  unit_id: string;
  lease_start: string;
  lease_end: string;
};

function isDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Both tenant endpoints accept a complete tenant, including lease-date edits. */
export function parseTenantInput(body: unknown):
  | { row: TenantRowInput; error?: never }
  | { row?: never; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "A tenant record is required." };
  }
  const t = body as Record<string, unknown>;
  if (typeof t.name !== "string" || !t.name.trim()) return { error: "Tenant name is required." };
  if (typeof t.icNumber !== "string" || !t.icNumber.trim()) return { error: "IC / Passport number is required." };
  if (typeof t.phone !== "string" || !t.phone.trim()) return { error: "Phone number is required." };
  if (typeof t.unitId !== "string" || !t.unitId.trim()) return { error: "A unit must be selected." };
  if (t.email != null && typeof t.email !== "string") return { error: "Email must be text." };
  if (!isDate(t.leaseStart) || !isDate(t.leaseEnd)) return { error: "Valid lease start and end dates are required." };
  if (t.leaseEnd < t.leaseStart) return { error: "Lease end cannot be before the start." };
  return {
    row: {
      name: t.name.trim(),
      ic_number: t.icNumber.trim(),
      phone: t.phone.trim(),
      email: typeof t.email === "string" ? t.email.trim() || null : null,
      unit_id: t.unitId.trim(),
      lease_start: t.leaseStart,
      lease_end: t.leaseEnd,
    },
  };
}
