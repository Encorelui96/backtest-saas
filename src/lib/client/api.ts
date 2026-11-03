/** Fetch helper for the app's API: throws the server's French error message. */
/** An API error, with the recharge that would lift it when it is a spent quota. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly recharge: string | null = null,
  ) {
    super(message);
  }
}

export async function api<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(url, {
    ...init,
    method: init?.method ?? (init?.json !== undefined ? "POST" : "GET"),
    headers: init?.json !== undefined ? { "content-type": "application/json" } : init?.headers,
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && typeof window !== "undefined" && !window.location.pathname.startsWith("/connexion")) {
    // Session missing or expired: sign in, then come back here.
    window.location.href = `/connexion?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
  }
  if (!res.ok) {
    const body = data as { error?: string; recharge?: string | null };
    throw new ApiError(body.error ?? `Erreur ${res.status}`, res.status, body.recharge ?? null);
  }
  return data as T;
}
