import "server-only";
import type { CandleRow, Interval } from "../types";
import { INTERVAL_MS } from "../types";
import type { Market } from "../markets";
import { UserError } from "./backtests";

/**
 * Nasdaq 100 futures (NQ, CME Globex) from Databento's historical API, as a
 * continuous front-month contract. Billed per volume downloaded: the shared
 * candle cache makes sure each month is paid for once.
 */

const BASE = process.env.DATABENTO_API_URL ?? "https://hist.databento.com/v0";
const DATASET = "GLBX.MDP3";
const HOUR = 3_600_000;

function auth() {
  const key = process.env.DATABENTO_API_KEY;
  if (!key) throw new UserError("Le Nasdaq 100 (future NQ) n'est pas encore configuré sur ce site (clé DATABENTO_API_KEY manquante).");
  return `Basic ${Buffer.from(`${key}:`).toString("base64")}`;
}

async function failure(res: Response): Promise<never> {
  const text = await res.text();
  let detail = text;
  try {
    detail = (JSON.parse(text) as { detail?: string }).detail ?? text;
  } catch {
    // Not JSON: keep the raw text.
  }
  if (res.status === 401 || res.status === 403) throw new UserError("Clé Databento refusée : vérifie DATABENTO_API_KEY.");
  if (res.status === 402) throw new UserError("Crédits Databento épuisés : ajoute du crédit sur ton compte Databento.");
  throw new Error(`Databento ${res.status}: ${String(detail).slice(0, 200)}`);
}

let available: { at: number; end: number } | null = null;

/** The latest moment Databento has published for the dataset; asking past it is an error. */
async function availableEnd(): Promise<number> {
  if (available && Date.now() - available.at < 10 * 60_000) return available.end;
  const res = await fetch(`${BASE}/metadata.get_dataset_range?dataset=${DATASET}`, { headers: { Authorization: auth() }, cache: "no-store" });
  if (!res.ok) return failure(res);
  const body = (await res.json()) as { end?: string; end_date?: string };
  const end = Date.parse(body.end ?? body.end_date ?? "");
  available = { at: Date.now(), end: Number.isFinite(end) ? end : Date.now() - HOUR };
  return available.end;
}

/** Databento prices are fixed-point integers (1e-9) unless pretty-printed; a fixed-point price is always huge. */
function price(v: string) {
  const x = Number(v);
  return !v.includes(".") && Math.abs(x) >= 1e8 ? x / 1e9 : x;
}

/** Milliseconds to the nanosecond timestamps Databento takes, as text (no float rounding). */
const toNs = (ms: number) => `${Math.round(ms)}000000`;

/** Nanoseconds since the epoch, or an ISO date when pretty-printed. */
function time(v: string) {
  return /^\d+$/.test(v) ? Math.round(Number(v) / 1e6) : Date.parse(v);
}

export function parseCsv(csv: string): CandleRow[] {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const head = lines[0].split(",");
  const col = (name: string) => head.indexOf(name);
  const [t, o, h, l, c, v] = ["ts_event", "open", "high", "low", "close", "volume"].map(col);
  if ([t, o, h, l, c].some((i) => i < 0)) throw new Error(`Databento : colonnes inattendues (${lines[0]})`);
  return lines.slice(1).map((line) => {
    const f = line.split(",");
    return { t: time(f[t]), o: price(f[o]), h: price(f[h]), l: price(f[l]), c: price(f[c]), v: v >= 0 ? Number(f[v]) : 0 };
  });
}

async function getRange(m: Market, schema: "ohlcv-1m" | "ohlcv-1h", from: number, to: number): Promise<CandleRow[]> {
  const end = Math.min(to + 1, await availableEnd());
  if (end <= from) return [];
  const form = new URLSearchParams({
    dataset: DATASET,
    schema,
    symbols: m.feed,
    stype_in: "continuous",
    start: toNs(from),
    end: toNs(end),
    encoding: "csv",
    compression: "none",
    pretty_px: "true",
    pretty_ts: "false",
  });
  const res = await fetch(`${BASE}/timeseries.get_range`, {
    method: "POST",
    headers: { Authorization: auth(), "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
    cache: "no-store",
  });
  if (!res.ok) return failure(res);
  return parseCsv(await res.text());
}

/** Merges finer candles into UTC-aligned buckets of `ms`. */
function aggregate(rows: CandleRow[], ms: number): CandleRow[] {
  const out: CandleRow[] = [];
  for (const r of rows) {
    const t = Math.floor(r.t / ms) * ms;
    const last = out[out.length - 1];
    if (last && last.t === t) {
      last.h = Math.max(last.h, r.h);
      last.l = Math.min(last.l, r.l);
      last.c = r.c;
      last.v += r.v;
    } else out.push({ ...r, t });
  }
  return out;
}

/**
 * Every closed candle opening in [from, to]. 5m and 15m bars are built from
 * 1m bars, 4h and daily bars from 1h bars, all aligned on UTC like Binance's.
 */
export async function fetchDatabento(m: Market, interval: Interval, from: number, to: number): Promise<CandleRow[]> {
  const ms = INTERVAL_MS[interval];
  const hourly = ms >= HOUR;
  const start = Math.floor(from / ms) * ms;
  const rows = await getRange(m, hourly ? "ohlcv-1h" : "ohlcv-1m", start, to + ms - (hourly ? HOUR : 60_000));
  const bars = ms === HOUR || ms === 60_000 ? rows : aggregate(rows, ms);
  // A bar is final only once Databento has published every minute of it.
  const until = Math.min(Date.now(), available?.end ?? Date.now());
  return bars.filter((r) => r.t >= from && r.t <= to && r.t + ms <= until);
}
