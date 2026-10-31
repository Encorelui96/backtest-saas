import "server-only";
import type { CandleRow, Interval } from "../types";
import { INTERVAL_MS } from "../types";
import type { Market } from "../markets";
import { UserError } from "./backtests";

/**
 * Forex, gold and Nasdaq 100 candles from the OANDA v20 REST API (mid prices).
 * A free practice account gives the token; OANDA_API_URL switches to a live account.
 */

const BASE = process.env.OANDA_API_URL ?? "https://api-fxpractice.oanda.com";
const PAGE = 4500; // OANDA returns at most 5000 candles per request.

const GRANULARITY: Record<Interval, string> = { "1m": "M1", "5m": "M5", "15m": "M15", "1h": "H1", "4h": "H4", "1d": "D" };

const MAX_PARALLEL = Number(process.env.OANDA_MAX_PARALLEL ?? 4);
let active = 0;
const waiting: (() => void)[] = [];

async function limited<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_PARALLEL) await new Promise<void>((r) => waiting.push(r));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

interface RawCandle {
  time: string;
  complete: boolean;
  volume: number;
  mid: { o: string; h: string; l: string; c: string };
}

async function getCandlesPage(m: Market, interval: Interval, from: number, to: number, attempt = 0): Promise<CandleRow[]> {
  const key = process.env.OANDA_API_KEY;
  if (!key) throw new UserError("Le forex, l'or et le Nasdaq ne sont pas encore configurés sur ce site (clé OANDA_API_KEY manquante).");
  // Days and 4h bars start at midnight UTC, like Binance's, so higher-timeframe filters line up.
  const params = new URLSearchParams({
    price: "M",
    granularity: GRANULARITY[interval],
    from: String(from / 1000),
    to: String(to / 1000),
    dailyAlignment: "0",
    alignmentTimezone: "UTC",
  });
  const res = await limited(() =>
    fetch(`${BASE}/v3/instruments/${m.feed}/candles?${params}`, {
      headers: { Authorization: `Bearer ${key}`, "Accept-Datetime-Format": "UNIX" },
      cache: "no-store",
    }),
  );
  if (res.status === 401 || res.status === 403) throw new UserError("Clé OANDA refusée : vérifie OANDA_API_KEY (token d'un compte démo).");
  if (res.status === 429 || res.status >= 500) {
    if (attempt >= 4) throw new Error(`OANDA ${res.status} après plusieurs essais`);
    await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    return getCandlesPage(m, interval, from, to, attempt + 1);
  }
  if (!res.ok) throw new Error(`OANDA ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as { candles: RawCandle[] };
  return body.candles
    .filter((k) => k.complete)
    .map((k) => ({ t: Math.round(Number(k.time) * 1000), o: +k.mid.o, h: +k.mid.h, l: +k.mid.l, c: +k.mid.c, v: k.volume }));
}

/** Every closed candle opening in [from, to], fetched in pages of 4500 bars. */
export async function fetchOanda(m: Market, interval: Interval, from: number, to: number): Promise<CandleRow[]> {
  const ms = INTERVAL_MS[interval];
  const end = Math.min(to, Date.now());
  const starts: number[] = [];
  for (let s = from; s <= end; s += PAGE * ms) starts.push(s);
  const pages = await Promise.all(starts.map((s) => getCandlesPage(m, interval, s, Math.min(end, s + PAGE * ms - 1))));
  return pages.flat().filter((r) => r.t >= from && r.t <= to);
}
