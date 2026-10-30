import "server-only";
import { gunzipSync, gzipSync } from "node:zlib";
import type { CandleRow, Candles, Interval } from "../types";
import { INTERVAL_MS, emptyCandles } from "../types";
import { query } from "./db";
import { fetchKlines } from "./binance";

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

const inflight = new Map<string, Promise<CandleRow[]>>();

/** One month of closed candles, from the shared cache or Binance. */
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
    const fresh = fetchTo >= fetchFrom ? (await fetchKlines(symbol, interval, fetchFrom, fetchTo)).filter((r) => r.t <= lastClosed) : [];
    const rows = [...have, ...fresh];
    const complete = end - ms <= lastClosed;
    await query(
      `INSERT INTO candle_chunks (symbol, interval, month, bars, data, filled_to, complete) VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (symbol, interval, month) DO UPDATE SET bars = $4, data = $5, filled_to = $6, complete = $7`,
      [symbol, interval, month, rows.length, encode(rows), fetchTo, complete],
    );
    return rows;
  })();
  inflight.set(key, job);
  try {
    return await job;
  } finally {
    inflight.delete(key);
  }
}

/** Every closed candle in [from, to]. Months load a few at a time to stay gentle with Binance. */
export async function getCandles(symbol: string, interval: Interval, from: number, to: number): Promise<Candles> {
  const months = monthsBetween(from, to);
  const parts: CandleRow[][] = new Array(months.length);
  let next = 0;
  const worker = async () => {
    while (next < months.length) {
      const k = next++;
      parts[k] = await monthRows(symbol, interval, months[k], to);
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, months.length) }, worker));
  const rows = parts.flat().filter((r) => r.t >= from && r.t <= to);
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
