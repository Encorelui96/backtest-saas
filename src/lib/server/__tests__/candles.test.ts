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

import { DOWNLOAD_BARS_PER_MINUTE, EARLIEST, getCandles, isKnownSymbol, meterDownload } from "../candles";
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

  it("does nothing for a range entirely in the future or invalid", async () => {
    await getCandles("BTCUSDT", "1d", Date.UTC(2090, 0, 1), Date.UTC(2100, 0, 1));
    await getCandles("BTCUSDT", "1d", Number.NaN, NOW);
    await getCandles("BTCUSDT", "1d", EARLIEST - 86_400_000 * 10, EARLIEST - 86_400_000);
    expect(db.query).not.toHaveBeenCalled();
    expect(binance.fetchKlines).not.toHaveBeenCalled();
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
