import "server-only";
import type { CandleRow, Candles, Interval } from "../types";
import { INTERVAL_MS, emptyCandles } from "../types";
import { db } from "./db";
import { fetchKlines } from "./binance";

/**
 * Historical candles with a local cache. Coverage is tracked per symbol and
 * interval as one contiguous range, so a request only downloads what's missing.
 */

function ensureCoverageTable() {
  db().exec(`CREATE TABLE IF NOT EXISTS candle_coverage (
    symbol TEXT NOT NULL, interval TEXT NOT NULL, from_t INTEGER NOT NULL, to_t INTEGER NOT NULL,
    PRIMARY KEY (symbol, interval)
  )`);
}

function insertRows(symbol: string, interval: Interval, rows: CandleRow[]) {
  const d = db();
  const stmt = d.prepare("INSERT OR REPLACE INTO candles (symbol, interval, t, o, h, l, c, v) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
  d.exec("BEGIN");
  try {
    for (const r of rows) stmt.run(symbol, interval, r.t, r.o, r.h, r.l, r.c, r.v);
    d.exec("COMMIT");
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
}

const inflight = new Map<string, Promise<void>>();

/** Makes sure every closed candle in [from, to] is cached. */
export async function ensureCandles(symbol: string, interval: Interval, from: number, to: number) {
  const key = `${symbol}:${interval}`;
  // Serialize downloads per series so two requests don't fetch the same pages.
  while (inflight.has(key)) await inflight.get(key);
  const job = (async () => {
    ensureCoverageTable();
    const ms = INTERVAL_MS[interval];
    const lastClosed = Math.floor((Date.now() - ms) / ms) * ms;
    const end = Math.min(to, lastClosed);
    const start = Math.floor(from / ms) * ms;
    if (end < start) return;
    const cov = db()
      .prepare("SELECT from_t, to_t FROM candle_coverage WHERE symbol = ? AND interval = ?")
      .get(symbol, interval) as { from_t: number; to_t: number } | undefined;
    const ranges: [number, number][] = [];
    if (!cov) ranges.push([start, end]);
    else {
      if (start < cov.from_t) ranges.push([start, cov.from_t - ms]);
      if (end > cov.to_t) ranges.push([cov.to_t + ms, end]);
    }
    for (const [a, b] of ranges) {
      const rows = (await fetchKlines(symbol, interval, a, b)).filter((r) => r.t <= lastClosed);
      insertRows(symbol, interval, rows);
    }
    if (ranges.length) {
      const newFrom = Math.min(start, cov?.from_t ?? start);
      const newTo = Math.max(end, cov?.to_t ?? end);
      db()
        .prepare("INSERT OR REPLACE INTO candle_coverage (symbol, interval, from_t, to_t) VALUES (?, ?, ?, ?)")
        .run(symbol, interval, newFrom, newTo);
    }
  })();
  inflight.set(key, job);
  try {
    await job;
  } finally {
    inflight.delete(key);
  }
}

export function readCandles(symbol: string, interval: Interval, from: number, to: number): Candles {
  const rows = db()
    .prepare("SELECT t, o, h, l, c, v FROM candles WHERE symbol = ? AND interval = ? AND t >= ? AND t <= ? ORDER BY t")
    .all(symbol, interval, from, to) as unknown as CandleRow[];
  const out = emptyCandles(rows.length);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    out.t[i] = r.t;
    out.o[i] = r.o;
    out.h[i] = r.h;
    out.l[i] = r.l;
    out.c[i] = r.c;
    out.v[i] = r.v;
  }
  return out;
}

export async function getCandles(symbol: string, interval: Interval, from: number, to: number): Promise<Candles> {
  await ensureCandles(symbol, interval, from, to);
  return readCandles(symbol, interval, from, to);
}
