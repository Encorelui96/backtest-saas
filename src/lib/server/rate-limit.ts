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

export function limitPerMinute(userId: string, route: string, max: number) {
  const now = Date.now();
  const key = `${route}:${userId}`;
  const w = windows.get(key);
  if (!w || now - w.start >= WINDOW_MS) {
    windows.set(key, { start: now, count: 1 });
    // Forget finished windows now and then, so the map doesn't grow with every visitor.
    if (windows.size > 5_000) for (const [k, v] of windows) if (now - v.start >= WINDOW_MS) windows.delete(k);
    return;
  }
  if (++w.count > max) throw new QuotaError("Trop de demandes de cours d'affilée : attends une minute.");
}
