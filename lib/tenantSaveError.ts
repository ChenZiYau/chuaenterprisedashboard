/** Return actionable schema errors without exposing database record details. */
export function tenantSaveError(error: unknown, fallback: string) {
  if (error && typeof error === "object") {
    const { code, message } = error as { code?: unknown; message?: unknown };
    if ((code === "42703" || code === "PGRST204") && typeof message === "string" &&
      /\b(base_rent|deposit_amount)\b/.test(message)) {
      return { error: "The database update for tenant rent and deposit has not been applied. Ask the administrator to apply scripts/tenant-rent-deposit.sql to this app's Supabase project, then retry. Your entries have been kept.", status: 503 };
    }
  }
  return { error: fallback, status: 500 };
}
