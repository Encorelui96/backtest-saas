import "server-only";
import { gunzipSync, gzipSync } from "node:zlib";
import type { CandleRow, Candles, Interval } from "../types";
import { INTERVAL_MS, emptyCandles } from "../types";
import { query, queryOne } from "./db";
import { fetchKlines, listSymbols } from "./binance";
import { fetchTwelveData } from "./twelvedata";
import { fetchDatabento } from "./databento";
import { QuotaError } from "./quotas";
import { isWeekendClose, market, type Market } from "../markets";

/** No market here has candles before 2000: an earlier start would only add empty months to the cache. */
export const EARLIEST = Date.UTC(2000, 0, 1);

type Source = Market["source"] | "binance";

/**
 * Bars the web server may download per source and per minute, all users
 * together, when a chart or the Live page misses the shared cache. Over the cap
 * the request is refused rather than queued: a script walking back through the
 * history must not get the server's IP banned by Binance, use up Twelve Data's
 * daily quota or run up Databento's bill. Backtests in the worker aren't
 * metered: the plan quotas already bound them.
 */
export const DOWNLOAD_BARS_PER_MINUTE: Record<Source, number> = {
  binance: 500_000, // 500 requests of 1000 bars: a sixth of Binance's weight limit per IP.
  twelvedata: 18_000, // 4 requests of 4500 bars: half of the 8 a minute of the free plan.
  databento: 100_000, // About 3 months of 1m NQ.
};

const downloads = new Map<Source, { start: number; bars: number }>();

/** Counts `bars` against the source's minute, or throws a QuotaError. A single request larger than the cap still goes through alone. */
export function meterDownload(source: Source, bars: number, now = Date.now()) {
  const w = downloads.get(source);
  if (!w || now - w.start >= 60_000) {
    downloads.set(source, { start: now, bars });
    return;
  }
  if (w.bars + bars > DOWNLOAD_BARS_PER_MINUTE[source]) throw new QuotaError("Beaucoup de cours sont téléchargés en ce moment : réessaie dans une minute.");
  w.bars += bars;
}

/** Bars a download of [from, to] asks the source for. Twelve Data builds 4h and 1d from 1h bars. */
function barsAsked(source: Source, interval: Interval, from: number, to: number) {
  const ms = source === "twelvedata" && INTERVAL_MS[interval] > INTERVAL_MS["1h"] ? INTERVAL_MS["1h"] : INTERVAL_MS[interval];
  return Math.max(1, Math.ceil((to - from + 1) / ms));
}

/** Candles opening in [from, to] from the symbol's source: Binance, Twelve Data (forex, gold, QQQ) or Databento (NQ). */
export async function fetchHistory(symbol: string, interval: Interval, from: number, to: number, metered = false): Promise<CandleRow[]> {
  const m = market(symbol);
  if (metered) meterDownload(m?.source ?? "binance", barsAsked(m?.source ?? "binance", interval, from, to));
  if (!m) return fetchKlines(symbol, interval, from, to);
  return m.source === "databento" ? fetchDatabento(m, interval, from, to) : fetchTwelveData(m, interval, from, to);
}

/** A market of the site, a Binance pair listed now, or a symbol already in the cache (a pair delisted since its backtest). */
export async function isKnownSymbol(symbol: string): Promise<boolean> {
  if (!/^[A-Z0-9]{2,20}$/.test(symbol)) return false;
  if (market(symbol)) return true;
  const listed = await listSymbols().catch(() => null);
  if (listed?.some((s) => s.symbol === symbol)) return true;
  return Boolean(await queryOne("SELECT 1 FROM candle_chunks WHERE symbol = $1 LIMIT 1", [symbol]));
}

/** The latest `limit` candles (on Binance, with the one still forming), for the live view. */
export async function fetchRecent(symbol: string, interval: Interval, limit: number, opts: { metered?: boolean } = {}): Promise<CandleRow[]> {
  const ms = INTERVAL_MS[interval];
  const end = Date.now();
  const m = market(symbol);
  if (!m) return fetchHistory(symbol, interval, end - limit * ms, end, opts.metered);
  // Twelve Data's daily quota is small: go through the shared cache, which only asks for the bars since its last fill.
  // Closed on weekends (and the Nasdaq at night): look back far enough to still find `limit` bars.
  const c = await getCandles(symbol, interval, end - Math.ceil(limit * ms * 1.6) - 3 * 86_400_000, end, opts);
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
async function prefillMonths(symbol: string, interval: Interval, months: string[], needUntil: number, metered: boolean) {
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
  const rows = await fetchHistory(symbol, interval, monthBounds(missing[0]).start, fetchTo, metered);
  for (const key of missing) {
    const { start, end } = monthBounds(key);
    const part = rows.filter((r) => r.t >= start && r.t < end);
    await saveMonth(symbol, interval, key, part, Math.min(end - ms, lastClosed), end - ms <= lastClosed);
  }
}

const inflight = new Map<string, Promise<CandleRow[]>>();

/** One month of closed candles, from the shared cache or the market's source. */
async function monthRows(symbol: string, interval: Interval, month: string, needUntil: number, metered: boolean): Promise<CandleRow[]> {
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
    const fresh = fetchTo >= fetchFrom ? (await fetchHistory(symbol, interval, fetchFrom, fetchTo, metered)).filter((r) => r.t <= lastClosed) : [];
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

/**
 * Every closed candle in [from, to]. Months load a few at a time to stay gentle with the sources.
 * `metered`: a page is asking (chart, Live), so downloads count against DOWNLOAD_BARS_PER_MINUTE.
 * `onProgress` gets the share of months loaded, from 0 to 1.
 */
export async function getCandles(
  symbol: string,
  interval: Interval,
  from: number,
  to: number,
  opts: { metered?: boolean; onProgress?: (share: number) => void | Promise<void> } = {},
): Promise<Candles> {
  // Each month of the range gets a row in candle_chunks: never one after today or before the data starts.
  to = Math.min(to, Date.now());
  from = Math.max(from, EARLIEST);
  if (!(from <= to)) return emptyCandles();
  const metered = opts.metered ?? false;
  const months = monthsBetween(from, to);
  if (market(symbol)) await prefillMonths(symbol, interval, months, to, metered);
  const parts: CandleRow[][] = new Array(months.length);
  let next = 0;
  let loaded = 0;
  const worker = async () => {
    while (next < months.length) {
      const k = next++;
      parts[k] = await monthRows(symbol, interval, months[k], to, metered);
      await opts.onProgress?.(++loaded / months.length);
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
