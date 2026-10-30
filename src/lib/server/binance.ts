import "server-only";
import type { CandleRow, Interval } from "../types";
import { INTERVAL_MS } from "../types";

/**
 * Binance spot market data. The default host is Binance's public market-data
 * mirror, which also answers from regions where api.binance.com is blocked.
 */
const BASE = process.env.BINANCE_API_URL ?? "https://data-api.binance.vision";
const PAGE = 1000;

async function getJson(url: string, attempt = 0): Promise<unknown> {
  const res = await fetch(url, { cache: "no-store" });
  if (res.status === 429 || res.status === 418 || res.status >= 500) {
    if (attempt >= 4) throw new Error(`Binance ${res.status} après plusieurs essais`);
    await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    return getJson(url, attempt + 1);
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Binance ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

type RawKline = [number, string, string, string, string, string, number, ...unknown[]];

function toRow(k: RawKline): CandleRow {
  return { t: k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5] };
}

export async function fetchKlinesPage(symbol: string, interval: Interval, startTime: number, endTime: number, limit = PAGE) {
  const url = `${BASE}/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}&startTime=${startTime}&endTime=${endTime}&limit=${limit}`;
  const data = (await getJson(url)) as RawKline[];
  return data.map(toRow);
}

/** Every kline in [from, to], fetched as parallel 1000-bar pages. */
export async function fetchKlines(symbol: string, interval: Interval, from: number, to: number, concurrency = 6): Promise<CandleRow[]> {
  const ms = INTERVAL_MS[interval];
  const starts: number[] = [];
  for (let s = from; s <= to; s += PAGE * ms) starts.push(s);
  const pages: CandleRow[][] = new Array(starts.length);
  let next = 0;
  const worker = async () => {
    while (next < starts.length) {
      const k = next++;
      const s = starts[k];
      pages[k] = await fetchKlinesPage(symbol, interval, s, Math.min(to, s + PAGE * ms - 1));
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, starts.length) }, worker));
  return pages.flat();
}

/** The latest `limit` klines, including the one still forming. */
export async function fetchRecentKlines(symbol: string, interval: Interval, limit: number): Promise<CandleRow[]> {
  const ms = INTERVAL_MS[interval];
  const end = Date.now();
  return fetchKlines(symbol, interval, end - limit * ms, end);
}

let symbolCache: { at: number; symbols: { symbol: string; base: string; quote: string; volume: number }[] } | null = null;

/** Spot USDT/USDC/BTC/EUR pairs ranked by 24h quote volume. */
export async function listSymbols() {
  if (symbolCache && Date.now() - symbolCache.at < 6 * 3600_000) return symbolCache.symbols;
  const [info, tickers] = (await Promise.all([
    getJson(`${BASE}/api/v3/exchangeInfo?permissions=SPOT&symbolStatus=TRADING`),
    getJson(`${BASE}/api/v3/ticker/24hr?type=MINI`),
  ])) as [{ symbols: { symbol: string; baseAsset: string; quoteAsset: string }[] }, { symbol: string; quoteVolume: string }[]];
  const vol = new Map(tickers.map((t) => [t.symbol, +t.quoteVolume]));
  const quotes = new Set(["USDT", "USDC", "BTC", "EUR", "FDUSD"]);
  const symbols = info.symbols
    .filter((s) => quotes.has(s.quoteAsset))
    .map((s) => ({ symbol: s.symbol, base: s.baseAsset, quote: s.quoteAsset, volume: vol.get(s.symbol) ?? 0 }))
    .sort((a, b) => b.volume - a.volume);
  symbolCache = { at: Date.now(), symbols };
  return symbols;
}
