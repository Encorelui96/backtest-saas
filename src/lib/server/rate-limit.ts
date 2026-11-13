import "server-only";
import { QuotaError } from "./quotas";

/**
 * Requests per account and per minute on the routes that load market data, so
 * a script can't drain the Twelve Data daily quota or run up Databento's bill.
 * Counted in this process's memory, in fixed one-minute windows: exact with one
 * web instance; with several, each one counts on its own.
 */

const WINDOW_MS = 60_000;
const windows = new Map<string, { start: number; count: number }>();

function count(key: string, max: number, refusal: string) {
  const now = Date.now();
  const w = windows.get(key);
  if (!w || now - w.start >= WINDOW_MS) {
    windows.set(key, { start: now, count: 1 });
    // Forget finished windows now and then, so the map doesn't grow with every visitor.
    if (windows.size > 5_000) for (const [k, v] of windows) if (now - v.start >= WINDOW_MS) windows.delete(k);
    return;
  }
  if (++w.count > max) throw new QuotaError(refusal);
}

export function limitPerMinute(userId: string, route: string, max: number) {
  count(`${route}:${userId}`, max, "Trop de demandes de cours d'affilée : attends une minute.");
}

/** The visitor's address: Render's proxies (Cloudflare) put it in these headers, the first one that is set wins. */
export function clientIp(headers: Headers): string {
  for (const name of ["cf-connecting-ip", "true-client-ip", "x-real-ip", "x-forwarded-for"]) {
    const value = headers.get(name)?.split(",")[0].trim();
    if (value) return value;
  }
  return "inconnue";
}

/**
 * The same count per visitor address, for the routes that need no account: a script looping on a
 * shared report or on the symbol search must not keep the site's half CPU for itself.
 */
export function limitVisitor(headers: Headers, route: string, max: number) {
  count(`${route}:ip:${clientIp(headers)}`, max, "Trop de demandes d'affilée : attends une minute.");
}
