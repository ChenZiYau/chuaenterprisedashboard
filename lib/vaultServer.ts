import "server-only";

/** Server-only bridge to the Image Vault's bearer-protected API.
 *
 *  All photo reads/writes flow dashboard → vault over this helper, so the
 *  shared secret never reaches the browser and the vault itself exposes no
 *  admin surface — only public galleries. */

export class VaultError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "VaultError";
    this.status = status;
  }
}

function getConfig(): { baseUrl: string; apiKey: string } {
  const baseUrl = process.env.VAULT_URL ?? process.env.NEXT_PUBLIC_VAULT_URL;
  const apiKey = process.env.VAULT_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new VaultError(
      "Server is not configured: set NEXT_PUBLIC_VAULT_URL and VAULT_API_KEY.",
      500,
    );
  }
  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey };
}

/** Fetch from the vault with bearer auth. `path` starts with "/api/...". */
export async function vaultFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const { baseUrl, apiKey } = getConfig();
  try {
    return await fetch(`${baseUrl}${path}`, {
      cache: "no-store",
      ...init,
      headers: {
        ...(init.headers ?? {}),
        Authorization: `Bearer ${apiKey}`,
      },
    });
  } catch {
    throw new VaultError("Could not reach the Image Vault.", 502);
  }
}
