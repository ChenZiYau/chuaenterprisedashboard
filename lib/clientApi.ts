"use client";

/** Fire a DELETE against an API route and normalise the outcome for the UI.
 *  A 404 counts as success: the row is already gone server-side (e.g. an
 *  entry created locally this session that was never persisted), so the UI
 *  should drop it either way. */
export async function deleteResource(
  path: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(path, { method: "DELETE" });
    if (res.ok || res.status === 404) return { ok: true };
    const data = await res.json().catch(() => ({}));
    return {
      ok: false,
      error: (data as { error?: string }).error ?? "Could not delete the record.",
    };
  } catch {
    return { ok: false, error: "Network error — could not delete the record." };
  }
}
