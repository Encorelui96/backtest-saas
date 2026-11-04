import { describe, expect, it } from "vitest";
import { INTERVAL_MS, rowsToCandles, sliceCandles, type CandleRow } from "../../types";
import { INDICATORS, defaultConfig, defaultStrategy, num, operand, type Strategy } from "../../strategy/schema";
import { DEFAULT_PERIODS } from "../../strategy/describe";
import { runBacktest } from "../backtest";
import { SeriesContext } from "../evaluate";

/** Exact-value checks: each expected number is worked out by hand from the trade's own prices. */

const H = 3_600_000;
const T0 = Date.UTC(2024, 0, 1);

function flat(n: number, price = 100): CandleRow[] {
  return Array.from({ length: n }, (_, i) => ({ t: T0 + i * H, o: price, h: price, l: price, c: price, v: 1 }));
}

const base = {
  ...defaultConfig(),
  initialCapital: 10_000,
  feePercent: 0,
  spreadPercent: 0,
  slippagePercent: 0,
  fundingPercentPer8h: 0,
};

function always(over: Partial<Strategy> = {}): Strategy {
  return {
    ...defaultStrategy(),
    timezone: "UTC",
    entryLong: [{ conditions: [{ left: operand("close"), op: ">", right: num(0) }] }],
    stop: { type: "none", value: null, atrPeriod: null },
    takeProfit: { type: "none", value: null, atrPeriod: null },
    positionSizePercent: 100,
    maxLeverage: 1,
    ...over,
  };
}

describe("exact costs", () => {
  it("a round trip on a flat market costs exactly fees + spread + slippage", () => {
    const c = rowsToCandles(flat(4));
    const config = { ...base, feePercent: 0.1, spreadPercent: 0.2, slippagePercent: 0.1 };
    const t = runBacktest(c, always({ maxBarsInTrade: 1 }), config).trades[0];
    // Entry at the bar 1 open: 100 × (1 + 0.1 % half spread + 0.1 % slippage) = 100.2.
    const qty = 10_000 / 100.2;
    // Exit at the bar 1 close: 100 × (1 − 0.1 % − 0.1 %) = 99.8.
    const expected = -(qty * (100.2 - 99.8) + 10_000 * 0.001 + qty * 99.8 * 0.001);
    expect(t.entryPrice).toBeCloseTo(100.2, 10);
    expect(t.exitPrice).toBeCloseTo(99.8, 10);
    expect(t.pnl).toBeCloseTo(expected, 2);
    expect(t.pnl).toBeCloseTo(-59.88, 2);
    expect(t.costs).toBeCloseTo(-t.pnl, 2);
  });

  it("spread and slippage alone cost 0.4 % of the position, not twice that", () => {
    const c = rowsToCandles(flat(4));
    const t = runBacktest(c, always({ maxBarsInTrade: 1 }), { ...base, spreadPercent: 0.2, slippagePercent: 0.1 }).trades[0];
    expect(t.pnl).toBeCloseTo(-(10_000 / 100.2) * 0.4, 2);
    expect(t.pnl).toBeCloseTo(-39.92, 2);
    expect(t.costs).toBeCloseTo(39.92, 2);
  });
});

describe("exact excursions", () => {
  it("the MAE of a stopped trade is the loss at the stop, even with a long wick", () => {
    const rows = flat(4);
    // Bar 2 wicks 10.9 % below the entry; the 2 % stop closes the trade on the way down.
    rows[2] = { ...rows[2], l: 89.1 };
    const s = always({ stop: { type: "percent", value: 2, atrPeriod: null }, riskPerTradePercent: 1, maxLeverage: 10 });
    const t = runBacktest(rowsToCandles(rows), s, base).trades[0];
    expect(t.exitReason).toBe("stop");
    expect(t.pnlPercent).toBeCloseTo(-1, 10);
    expect(t.maePercent).toBeCloseTo(-1, 10);
  });

  it("the MFE of a trade closed at its target is the gain at the target", () => {
    const rows = flat(4);
    rows[2] = { ...rows[2], h: 120 };
    const s = always({ stop: { type: "percent", value: 2, atrPeriod: null }, takeProfit: { type: "r_multiple", value: 2, atrPeriod: null }, maxLeverage: 10 });
    const t = runBacktest(rowsToCandles(rows), s, base).trades[0];
    expect(t.exitReason).toBe("target");
    expect(t.pnlPercent).toBeCloseTo(2, 10);
    expect(t.mfePercent).toBeCloseTo(2, 10);
  });
});

describe("exact holding period", () => {
  it("a trade opened at one open and closed at the next is held one bar and pays one hour of funding", () => {
    const c = rowsToCandles(flat(5));
    const s = always({ exitLong: [{ conditions: [{ left: operand("close"), op: ">", right: num(0) }] }] });
    const t = runBacktest(c, s, { ...base, fundingPercentPer8h: 0.08 }).trades[0];
    expect(t.entryIndex).toBe(1);
    expect(t.exitIndex).toBe(2);
    expect(t.exitReason).toBe("signal");
    expect(t.bars).toBe(1);
    // 0.08 % per 8 h → 0.01 % for 1 h on 10 000 = 1.
    expect(t.pnl).toBeCloseTo(-1, 6);
  });
});

describe("liquidation", () => {
  it("cuts a leveraged trade when the loss reaches the account", () => {
    const rows = flat(4);
    rows[2] = { ...rows[2], l: 50, c: 50 };
    const t = runBacktest(rowsToCandles(rows), always({ positionSizePercent: 500, maxLeverage: 5 }), base).trades[0];
    expect(t.exitReason).toBe("liquidation");
    // 5× leverage: liquidated 20 % below the entry, the whole account is lost and no more.
    expect(t.exitPrice).toBeCloseTo(80, 6);
    expect(t.equityAfter).toBeCloseTo(0, 6);
  });
});

describe("higher timeframe in live", () => {
  it("a daily MM50 filter has values on 300 bars of 15m when daily candles are attached", () => {
    const m15 = INTERVAL_MS["15m"];
    const D = INTERVAL_MS["1d"];
    const start = Date.UTC(2024, 5, 1);
    const daily: CandleRow[] = Array.from({ length: 80 }, (_, i) => ({ t: start - (80 - i) * D, o: i, h: i, l: i, c: i, v: 1 }));
    const fifteen: CandleRow[] = Array.from({ length: 300 }, (_, i) => ({ t: start + i * m15, o: 1, h: 1, l: 1, c: 1, v: 1 }));
    const ctx = new SeriesContext(rowsToCandles(fifteen), "15m", "UTC");
    ctx.attachHigherTimeframe("1d", rowsToCandles(daily));
    const sma = ctx.series(operand("sma", { period: 50, timeframe: "1d" }));
    expect(Array.from(sma).every((v) => Number.isFinite(v))).toBe(true);
    // First bar of the day: the latest completed day is daily[79] (close 79), so MM50 = mean(30…79) = 54.5.
    expect(sma[0]).toBe(54.5);
    // Bar 96 closes the next UTC day, which has no daily candle here: the value stays on the last completed one.
    expect(sma[299]).toBe(54.5);
  });
});

describe("no look-ahead", () => {
  it("adding future candles never changes a past indicator value", () => {
    let price = 100;
    const rows: CandleRow[] = Array.from({ length: 1500 }, (_, i) => {
      const o = price;
      price *= 1 + Math.sin(i / 7) * 0.01 + Math.cos(i / 3) * 0.004;
      return { t: T0 + i * H, o, h: Math.max(o, price) * 1.002, l: Math.min(o, price) * 0.998, c: price, v: 1 + (i % 5) };
    });
    const full = rowsToCandles(rows);
    const cut = 1000;
    const past = sliceCandles(full, 0, cut);
    const ops = INDICATORS.filter((i) => i !== "number").flatMap((indicator) => [
      operand(indicator, DEFAULT_PERIODS[indicator] ?? {}),
      operand(indicator, { ...(DEFAULT_PERIODS[indicator] ?? {}), offset: 2 }),
      operand(indicator, { ...(DEFAULT_PERIODS[indicator] ?? {}), timeframe: "4h" }),
      operand(indicator, { ...(DEFAULT_PERIODS[indicator] ?? {}), timeframe: "1d" }),
    ]);
    const a = new SeriesContext(full, "1h", "Europe/Paris");
    const b = new SeriesContext(past, "1h", "Europe/Paris");
    for (const op of ops) {
      const x = a.series(op);
      const y = b.series(op);
      for (let i = 0; i < cut; i++) {
        if (Number.isNaN(y[i])) {
          expect(Number.isNaN(x[i]), `${JSON.stringify(op)} at ${i}`).toBe(true);
        } else {
          expect(x[i], `${JSON.stringify(op)} at ${i}`).toBe(y[i]);
        }
      }
    }
    // Compares every indicator candle by candle: a slower machine goes past the default 5 s.
  }, 30_000);
});
