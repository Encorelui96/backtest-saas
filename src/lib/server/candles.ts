import "server-only";
import { gunzipSync, gzipSync } from "node:zlib";
import type { CandleRow, Candles, Interval } from "../types";
import { INTERVAL_MS, emptyCandles } from "../types";
import { query } from "./db";
import { fetchKlines } from "./binance";
import { fetchTwelveData } from "./twelvedata";
import { fetchDatabento } from "./databento";
import { isWeekendClose, market } from "../markets";

/** Candles opening in [from, to] from the symbol's source: Binance, Twelve Data (forex, gold, QQQ) or Databento (NQ). */
export function fetchHistory(symbol: string, interval: Interval, from: number, to: number): Promise<CandleRow[]> {
  const m = market(symbol);
  if (!m) return fetchKlines(symbol, interval, from, to);
  return m.source === "databento" ? fetchDatabento(m, interval, from, to) : fetchTwelveData(m, interval, from, to);
}

/** The latest `limit` candles (on Binance, with the one still forming), for the live view. */
export async function fetchRecent(symbol: string, interval: Interval, limit: number): Promise<CandleRow[]> {
  const ms = INTERVAL_MS[interval];
  const end = Date.now();
  const m = market(symbol);
  if (!m) return fetchKlines(symbol, interval, end - limit * ms, end);
  // Twelve Data's daily quota is small: go through the shared cache, which only asks for the bars since its last fill.
  // Closed on weekends (and the Nasdaq at night): look back far enough to still find `limit` bars.
  const c = await getCandles(symbol, interval, end - Math.ceil(limit * ms * 1.6) - 3 * 86_400_000, end);
  const rows: CandleRow[] = [];
  for (let i = Math.max(0, c.t.length - limit); i < c.t.length; i++) rows.push({ t: c.t[i], o: c.o[i], h: c.h[i], l: c.l[i], c: c.c[i], v: c.v[i] });
  return rows;
}

/**
 * Historical candles shared by every user. Each symbol, interval and UTC month
 * is one gzipped chunk: a past month is downloaded once and never again, the
 * current month is topped up as time passes.
 */

const COLUMNS = 6;

function encode(rows: CandleRow[]): Buffer {
  const arr = new Float64Array(rows.length * COLUMNS);
  rows.forEach((r, i) => arr.set([r.t, r.o, r.h, r.l, r.c, r.v], i * COLUMNS));
  return gzipSync(Buffer.from(arr.buffer), { level: 6 });
}

function decode(buf: Buffer): CandleRow[] {
  const raw = gunzipSync(buf);
  // Copy into a fresh buffer: a Float64Array view needs an 8-byte aligned offset.
  const arr = new Float64Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
  const rows: CandleRow[] = new Array(arr.length / COLUMNS);
  for (let i = 0; i < rows.length; i++) {
    const k = i * COLUMNS;
    rows[i] = { t: arr[k], o: arr[k + 1], h: arr[k + 2], l: arr[k + 3], c: arr[k + 4], v: arr[k + 5] };
  }
  return rows;
}

function monthKey(t: number) {
  return new Date(t).toISOString().slice(0, 7);
}

function monthBounds(key: string) {
  const [y, m] = key.split("-").map(Number);
  return { start: Date.UTC(y, m - 1, 1), end: Date.UTC(y, m, 1) };
}

function monthsBetween(from: number, to: number): string[] {
  const out: string[] = [];
  const d = new Date(Date.UTC(new Date(from).getUTCFullYear(), new Date(from).getUTCMonth(), 1));
  while (d.getTime() <= to) {
    out.push(monthKey(d.getTime()));
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return out;
}

function saveMonth(symbol: string, interval: Interval, month: string, rows: CandleRow[], filledTo: number, complete: boolean) {
  return query(
    `INSERT INTO candle_chunks (symbol, interval, month, bars, data, filled_to, complete) VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (symbol, interval, month) DO UPDATE SET bars = $4, data = $5, filled_to = $6, complete = $7`,
    [symbol, interval, month, rows.length, encode(rows), filledTo, complete],
  );
}

/**
 * Twelve Data allows only a few requests a minute, so one request per month is
 * too slow: every month still missing is fetched in one run of 4500-bar
 * requests, then stored month by month for monthRows to find.
 */
async function prefillMonths(symbol: string, interval: Interval, months: string[], needUntil: number) {
  const ms = INTERVAL_MS[interval];
  const lastClosed = Math.floor((Date.now() - ms) / ms) * ms;
  const cached = await query<{ month: string; filled_to: string; complete: boolean }>(
    "SELECT month, filled_to, complete FROM candle_chunks WHERE symbol = $1 AND interval = $2 AND month = ANY($3)",
    [symbol, interval, months],
  );
  const state = new Map(cached.map((c) => [c.month, c]));
  const missing = months.filter((key) => {
    const c = state.get(key);
    return !c || !(c.complete || Number(c.filled_to) >= Math.min(needUntil, monthBounds(key).end - ms, lastClosed));
  });
  if (missing.length < 2) return;
  const fetchTo = Math.min(monthBounds(missing[missing.length - 1]).end - ms, lastClosed);
  const rows = await fetchHistory(symbol, interval, monthBounds(missing[0]).start, fetchTo);
  for (const key of missing) {
    const { start, end } = monthBounds(key);
    const part = rows.filter((r) => r.t >= start && r.t < end);
    await saveMonth(symbol, interval, key, part, Math.min(end - ms, lastClosed), end - ms <= lastClosed);
  }
}

const inflight = new Map<string, Promise<CandleRow[]>>();

/** One month of closed candles, from the shared cache or the market's source. */
async function monthRows(symbol: string, interval: Interval, month: string, needUntil: number): Promise<CandleRow[]> {
  const key = `${symbol}:${interval}:${month}`;
  const running = inflight.get(key);
  if (running) return running;
  const job = (async () => {
    const ms = INTERVAL_MS[interval];
    const lastClosed = Math.floor((Date.now() - ms) / ms) * ms;
    const { start, end } = monthBounds(month);
    const [cached] = await query<{ data: Buffer; filled_to: string; complete: boolean }>(
      "SELECT data, filled_to, complete FROM candle_chunks WHERE symbol = $1 AND interval = $2 AND month = $3",
      [symbol, interval, month],
    );
    const wanted = Math.min(needUntil, end - ms, lastClosed);
    if (cached && (cached.complete || Number(cached.filled_to) >= wanted)) return decode(cached.data);

    const have = cached ? decode(cached.data) : [];
    const fetchFrom = have.length ? have[have.length - 1].t + ms : start;
    const fetchTo = Math.min(end - ms, lastClosed);
    const fresh = fetchTo >= fetchFrom ? (await fetchHistory(symbol, interval, fetchFrom, fetchTo)).filter((r) => r.t <= lastClosed) : [];
    const rows = [...have, ...fresh];
    await saveMonth(symbol, interval, month, rows, fetchTo, end - ms <= lastClosed);
    return rows;
  })();
  inflight.set(key, job);
  try {
    return await job;
  } finally {
    inflight.delete(key);
  }
}

/** Every closed candle in [from, to]. Months load a few at a time to stay gentle with the sources. */
export async function getCandles(symbol: string, interval: Interval, from: number, to: number): Promise<Candles> {
  const months = monthsBetween(from, to);
  if (market(symbol)) await prefillMonths(symbol, interval, months, to);
  const parts: CandleRow[][] = new Array(months.length);
  let next = 0;
  const worker = async () => {
    while (next < months.length) {
      const k = next++;
      parts[k] = await monthRows(symbol, interval, months[k], to);
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, months.length) }, worker));
  const closedWeekends = !!market(symbol);
  // Also drops weekend filler stored before Twelve Data's fetch filtered it out.
  const rows = parts.flat().filter((r) => r.t >= from && r.t <= to && !(closedWeekends && isWeekendClose(r.t)));
  const out = emptyCandles(rows.length);
  rows.forEach((r, i) => {
    out.t[i] = r.t;
    out.o[i] = r.o;
    out.h[i] = r.h;
    out.l[i] = r.l;
    out.c[i] = r.c;
    out.v[i] = r.v;
  });
  return out;
}
