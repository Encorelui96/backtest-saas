import "server-only";
import type { CandleRow, Interval } from "../types";
import { INTERVAL_MS } from "../types";
import type { Market } from "../markets";
import { UserError } from "./backtests";

/**
 * Forex, gold and Nasdaq 100 candles from the Twelve Data API. The free plan
 * allows 8 requests a minute and 800 a day, so calls are paced per minute and
 * each one asks for as many bars as allowed.
 */

const BASE = process.env.TWELVEDATA_API_URL ?? "https://api.twelvedata.com";
export const TWELVEDATA_PAGE = 4500; // Twelve Data returns at most 5000 bars per request.
const PER_MINUTE = Number(process.env.TWELVEDATA_PER_MINUTE ?? 8);

const INTERVAL: Record<Interval, string> = { "1m": "1min", "5m": "5min", "15m": "15min", "1h": "1h", "4h": "4h", "1d": "1day" };

/** Start times of the calls made in the last minute, to stay under the per-minute cap. */
const recent: number[] = [];
let queue = Promise.resolve();

function paced(): Promise<void> {
  const turn = queue.then(async () => {
    for (;;) {
      const now = Date.now();
      while (recent.length && recent[0] <= now - 60_000) recent.shift();
      if (recent.length < PER_MINUTE) break;
      await new Promise((r) => setTimeout(r, recent[0] + 60_000 - now + 50));
    }
    recent.push(Date.now());
  });
  queue = turn;
  return turn;
}

interface Body {
  status: "ok" | "error";
  code?: number;
  message?: string;
  values?: { datetime: string; open: string; high: string; low: string; close: string; volume?: string }[];
}

function toTime(s: string) {
  return Date.parse(s.length === 10 ? `${s}T00:00:00Z` : `${s.replace(" ", "T")}Z`);
}

/** "2026-08-03 14:00:00" in UTC, the format Twelve Data takes for start and end dates. */
function fmt(t: number) {
  return new Date(t).toISOString().slice(0, 19).replace("T", " ");
}

async function getPage(m: Market, interval: Interval, from: number, to: number, attempt = 0): Promise<CandleRow[]> {
  const key = process.env.TWELVEDATA_API_KEY;
  if (!key) throw new UserError("Le forex, l'or et le Nasdaq ne sont pas encore configurés sur ce site (clé TWELVEDATA_API_KEY manquante).");
  const params = new URLSearchParams({
    symbol: m.feed,
    interval: INTERVAL[interval],
    start_date: fmt(from),
    end_date: fmt(to),
    timezone: "UTC",
    order: "ASC",
    outputsize: "5000",
  });
  await paced();
  const res = await fetch(`${BASE}/time_series?${params}`, { headers: { Authorization: `apikey ${key}` }, cache: "no-store" });
  const body = (await res.json().catch(() => ({ status: "error", code: res.status }))) as Body;
  if (body.status === "ok") {
    return (body.values ?? []).map((v) => ({ t: toTime(v.datetime), o: +v.open, h: +v.high, l: +v.low, c: +v.close, v: v.volume ? +v.volume : 0 }));
  }
  const code = body.code ?? res.status;
  const message = body.message ?? "";
  if (code === 429 || code >= 500) {
    if (attempt >= 3) throw new UserError("Limite de requêtes Twelve Data atteinte : réessaie dans quelques minutes (ou demain si le quota du jour est épuisé).");
    await new Promise((r) => setTimeout(r, 61_000));
    return getPage(m, interval, from, to, attempt + 1);
  }
  if (code === 401) throw new UserError("Clé Twelve Data refusée : vérifie TWELVEDATA_API_KEY.");
  if (/no data is available/i.test(message)) return [];
  if (code === 403 || /plan|upgrade|available/i.test(message)) {
    throw new UserError(`${m.label} n'est pas inclus dans l'offre Twelve Data actuelle.`);
  }
  throw new Error(`Twelve Data ${code}: ${message.slice(0, 200)}`);
}

/** Every closed candle opening in [from, to], in requests of up to 4500 bars. */
export async function fetchTwelveData(m: Market, interval: Interval, from: number, to: number): Promise<CandleRow[]> {
  const ms = INTERVAL_MS[interval];
  const now = Date.now();
  const end = Math.min(to, now);
  const rows: CandleRow[] = [];
  // One after the other: the per-minute cap makes parallel calls pointless.
  for (let s = from; s <= end; s += TWELVEDATA_PAGE * ms) {
    rows.push(...(await getPage(m, interval, s, Math.min(end, s + TWELVEDATA_PAGE * ms - 1))));
  }
  // The last bar may still be forming.
  return rows.filter((r) => r.t >= from && r.t <= to && r.t + ms <= now);
}
