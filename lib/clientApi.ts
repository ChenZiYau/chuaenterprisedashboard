"use client";

/** POST/PUT a JSON body to an API route and normalise the outcome for the UI. */
export async function saveResource<T>(
  path: string,
  method: "POST" | "PUT" | "PATCH",
  body: unknown
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    if (res.redirected || (res.ok && (!data || typeof data !== "object"))) {
      return { ok: false, error: "The server did not confirm the save. Please check your session and try again." };
    }
    if (res.ok) return { ok: true, data: data as T };
    return {
      ok: false,
      error: (data as { error?: string } | null)?.error ?? "Could not save the record.",
    };
  } catch {
    return { ok: false, error: "Network error — could not save the record." };
  }
}

export async function deleteResource(
  path: string
): Promise<{ ok: true; warning?: string } | { ok: false; error: string }> {
  try {
    const res = await fetch(path, { method: "DELETE" });
    const data = await res.json().catch(() => null);
    if (!res.redirected && res.status === 404 && data?.error) return { ok: true };
    if (!res.redirected && res.ok && data?.ok === true) {
      return { ok: true, ...(typeof data.warning === "string" ? { warning: data.warning } : {}) };
    }
    return {
      ok: false,
      error: (data as { error?: string } | null)?.error ?? "Could not delete the record.",
    };
  } catch {
    return { ok: false, error: "Network error — could not delete the record." };
  }
}
