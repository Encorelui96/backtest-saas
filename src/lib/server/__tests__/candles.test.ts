import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const db = vi.hoisted(() => ({
  query: vi.fn(async (..._args: unknown[]) => [] as unknown[]),
  queryOne: vi.fn(async (..._args: unknown[]) => null as unknown),
  transaction: vi.fn(),
  newId: () => "test",
}));
vi.mock("../db", () => db);
const binance = vi.hoisted(() => ({
  fetchKlines: vi.fn(async (..._args: unknown[]) => []),
  listSymbols: vi.fn(async () => [{ symbol: "BTCUSDT", base: "BTC", quote: "USDT", volume: 1 }]),
}));
vi.mock("../binance", () => binance);
const databento = vi.hoisted(() => ({ fetchDatabento: vi.fn(async (..._args: unknown[]) => []) }));
vi.mock("../databento", () => databento);

import { DOWNLOAD_BARS_PER_MINUTE, EARLIEST, getCandles, isKnownSymbol, meterDownload, prefillBatchMonths } from "../candles";
import { QuotaError } from "../quotas";

const NOW = Date.UTC(2026, 10, 1, 12);

describe("meterDownload", () => {
  it("refuses a download over the source's minute, then lets it through the next minute", () => {
    const cap = DOWNLOAD_BARS_PER_MINUTE.databento;
    meterDownload("databento", cap - 10, NOW);
    expect(() => meterDownload("databento", 20, NOW + 1000)).toThrow(QuotaError);
    expect(() => meterDownload("binance", 20, NOW + 1000)).not.toThrow();
    expect(() => meterDownload("databento", 20, NOW + 60_000)).not.toThrow();
  });

  it("lets a single download larger than the cap go through alone", () => {
    const later = NOW + 10 * 60_000;
    expect(() => meterDownload("twelvedata", DOWNLOAD_BARS_PER_MINUTE.twelvedata * 2, later)).not.toThrow();
    expect(() => meterDownload("twelvedata", 1, later + 1)).toThrow(QuotaError);
  });
});

describe("getCandles", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    db.query.mockClear();
    binance.fetchKlines.mockClear();
  });
  afterEach(() => vi.useRealTimers());

  const savedMonths = () =>
    db.query.mock.calls.filter(([text]) => String(text).startsWith("INSERT INTO candle_chunks")).map(([, params]) => (params as unknown[])[2] as string);

  it("never stores a month after the current one, nor before 2000", async () => {
    await getCandles("BTCUSDT", "1d", Date.UTC(1990, 0, 1), Date.UTC(2100, 0, 1));
    const months = savedMonths();
    expect(months.length).toBeGreaterThan(0);
    expect(months.every((m) => m >= "2000-01" && m <= "2026-11")).toBe(true);
    expect(months).toHaveLength((2026 - 2000) * 12 + 11);
  });

  it("fetches the missing months of a market in runs of a few months, never all at once", async () => {
    const DAY = 86_400_000;
    const spans = () => databento.fetchDatabento.mock.calls.map(([, , from, to]) => (to as number) - (from as number));
    // Five years of 15m NQ are built from 1m bars: they come at most two months at a time.
    databento.fetchDatabento.mockClear();
    await getCandles("NAS100", "15m", Date.UTC(2021, 10, 8), Date.UTC(2026, 10, 6));
    const runs15 = spans().filter((d) => d > 32 * DAY);
    expect(runs15.length).toBeGreaterThanOrEqual(30);
    expect(Math.max(...spans())).toBeLessThanOrEqual(62 * DAY);
    // The same months in 4h come from hourly bars, in runs of up to two years.
    databento.fetchDatabento.mockClear();
    await getCandles("NAS100", "4h", Date.UTC(2021, 10, 8), Date.UTC(2026, 10, 6));
    const runs4h = spans().filter((d) => d > 32 * DAY);
    expect(runs4h.length).toBeGreaterThanOrEqual(2);
    expect(runs4h.length).toBeLessThanOrEqual(4);
    expect(Math.max(...runs4h)).toBeLessThanOrEqual(731 * DAY);
    expect(prefillBatchMonths("databento", "1m")).toBe(2);
    expect(prefillBatchMonths("databento", "1h")).toBe(24);
    expect(prefillBatchMonths("twelvedata", "1m")).toBe(2);
    expect(prefillBatchMonths("twelvedata", "5m")).toBe(6);
    expect(prefillBatchMonths("twelvedata", "4h")).toBe(24);
    expect(prefillBatchMonths("binance", "1h")).toBe(24);
  });

  it("does nothing for a range entirely in the future or invalid", async () => {
    await getCandles("BTCUSDT", "1d", Date.UTC(2090, 0, 1), Date.UTC(2100, 0, 1));
    await getCandles("BTCUSDT", "1d", Number.NaN, NOW);
    await getCandles("BTCUSDT", "1d", EARLIEST - 86_400_000 * 10, EARLIEST - 86_400_000);
    expect(db.query).not.toHaveBeenCalled();
    expect(binance.fetchKlines).not.toHaveBeenCalled();
  });

  it("leaves a candle the source hasn't published yet to a later call", async () => {
    const M = 5 * 60_000;
    // At 12:00 the last candle published is 11:50 (5 s of delay for Binance); the source still stops at 11:45.
    const upTo = (last: number) => Array.from({ length: (last - Date.UTC(2026, 10, 1)) / M + 1 }, (_, i) => ({ t: Date.UTC(2026, 10, 1) + i * M, o: 1, h: 1, l: 1, c: 1, v: 1 }));
    binance.fetchKlines.mockResolvedValueOnce(upTo(Date.UTC(2026, 10, 1, 11, 45)) as never);
    await getCandles("BTCUSDT", "5m", Date.UTC(2026, 10, 1), NOW);
    const [saved] = db.query.mock.calls.filter(([text]) => String(text).startsWith("INSERT INTO candle_chunks"));
    expect((saved[1] as unknown[])[5]).toBe(Date.UTC(2026, 10, 1, 11, 45));

    db.query.mockClear();
    binance.fetchKlines.mockResolvedValueOnce(upTo(Date.UTC(2026, 10, 1, 11, 50)) as never);
    await getCandles("ETHUSDT", "5m", Date.UTC(2026, 10, 1), NOW);
    const [complete] = db.query.mock.calls.filter(([text]) => String(text).startsWith("INSERT INTO candle_chunks"));
    expect((complete[1] as unknown[])[5]).toBe(Date.UTC(2026, 10, 1, 11, 50));
  });

  it("reports the share of months loaded", async () => {
    const shares: number[] = [];
    await getCandles("BTCUSDT", "1d", Date.UTC(2026, 6, 1), Date.UTC(2026, 9, 31), { onProgress: (d) => void shares.push(d) });
    expect(shares).toEqual([0.25, 0.5, 0.75, 1]);
  });
});

describe("isKnownSymbol", () => {
  it("accepts the site's markets, listed Binance pairs and cached symbols only", async () => {
    expect(await isKnownSymbol("EURUSD")).toBe(true);
    expect(await isKnownSymbol("BTCUSDT")).toBe(true);
    expect(await isKnownSymbol("A/B")).toBe(false);
    expect(await isKnownSymbol("NOTAPAIR")).toBe(false);
    db.queryOne.mockResolvedValueOnce({ "?column?": 1 });
    expect(await isKnownSymbol("OLDPAIRUSDT")).toBe(true);
  });
});
