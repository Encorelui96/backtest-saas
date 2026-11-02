import { describe, expect, it } from "vitest";
import { rowsToCandles, type CandleRow } from "../../types";
import { defaultConfig, defaultStrategy, num, operand, type Strategy } from "../../strategy/schema";
import { TEMPLATES } from "../../strategy/templates";
import { atr, ema, highest, lowest, rsi, sma } from "../indicators";
import { SeriesContext, resample } from "../evaluate";
import { runBacktest } from "../backtest";
import { computeMetrics } from "../metrics";
import { buildReport } from "../report";
import { PROP_PRESETS, simulatePropFirm } from "../propfirm";
import { localTime } from "../time";

const H = 3_600_000;
const T0 = Date.UTC(2024, 0, 1);

function candlesFromCloses(closes: number[], stepMs = H, wick = 0.5) {
  const rows: CandleRow[] = closes.map((c, i) => {
    const o = i === 0 ? c : closes[i - 1];
    return { t: T0 + i * stepMs, o, h: Math.max(o, c) + wick, l: Math.min(o, c) - wick, c, v: 1 };
  });
  return rowsToCandles(rows);
}

const noCosts = { ...defaultConfig(), feePercent: 0, spreadPercent: 0, slippagePercent: 0, fundingPercentPer8h: 0, initialCapital: 10_000 };

describe("indicators", () => {
  const src = Float64Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  it("sma", () => {
    const s = sma(src, 3);
    expect(Number.isNaN(s[1])).toBe(true);
    expect(s[2]).toBe(2);
    expect(s[9]).toBe(9);
  });
  it("ema seeds with the sma then smooths", () => {
    const e = ema(src, 3);
    expect(e[2]).toBe(2);
    expect(e[3]).toBeCloseTo(3);
  });
  it("rsi is 100 on a straight rise and 0 on a straight fall", () => {
    expect(rsi(src, 2)[9]).toBe(100);
    expect(rsi(src.slice().reverse(), 2)[9]).toBe(0);
  });
  it("highest / lowest include the current bar", () => {
    const x = Float64Array.from([3, 1, 4, 1, 5, 9, 2, 6]);
    expect(Array.from(highest(x, 3)).slice(2)).toEqual([4, 4, 5, 9, 9, 9]);
    expect(Array.from(lowest(x, 3)).slice(2)).toEqual([1, 1, 1, 1, 2, 2]);
  });
  it("atr of constant-range bars equals the range", () => {
    const h = new Float64Array(30).fill(11);
    const l = new Float64Array(30).fill(9);
    const c = new Float64Array(30).fill(10);
    expect(atr(h, l, c, 14)[29]).toBeCloseTo(2);
  });
});

describe("time", () => {
  it("handles Paris summer and winter time", () => {
    expect(localTime("Europe/Paris", Date.UTC(2024, 6, 1, 12)).hour).toBe(14);
    expect(localTime("Europe/Paris", Date.UTC(2024, 0, 1, 12)).hour).toBe(13);
    expect(localTime("Europe/Paris", Date.UTC(2024, 0, 1, 12)).weekday).toBe(1);
  });
});

describe("higher timeframe", () => {
  it("only uses completed higher-timeframe bars", () => {
    const closes = Array.from({ length: 48 }, (_, i) => i + 1);
    const c = candlesFromCloses(closes);
    const { map, ctx } = resample(c, "1h", "4h", "UTC");
    // Hours 0-2 of the first 4h block: nothing completed yet.
    expect(map[0]).toBe(-1);
    expect(map[2]).toBe(-1);
    // Hour 3 closes the first block.
    expect(map[3]).toBe(0);
    expect(ctx.candles.c[0]).toBe(4);
    expect(map[4]).toBe(0);
    expect(map[7]).toBe(1);
  });
});

function longWhenCloseAbove(level: number, over: Partial<Strategy> = {}): Strategy {
  return {
    ...defaultStrategy(),
    stop: { type: "none", value: null, atrPeriod: null },
    takeProfit: { type: "none", value: null, atrPeriod: null },
    entryLong: [{ conditions: [{ left: operand("close"), op: ">", right: num(level) }] }],
    ...over,
  };
}

describe("backtest", () => {
  it("enters at the next open and exits on the signal at the following open", () => {
    const closes = [100, 100, 105, 110, 115, 120, 90, 90];
    const c = candlesFromCloses(closes);
    const s = longWhenCloseAbove(102, {
      exitLong: [{ conditions: [{ left: operand("close"), op: "<", right: num(95) }] }],
      positionSizePercent: 100,
      maxLeverage: 1,
    });
    const run = runBacktest(c, s, noCosts);
    expect(run.trades).toHaveLength(1);
    const t = run.trades[0];
    expect(t.entryIndex).toBe(3); // signal at bar 2 close, fill at bar 3 open (= 105)
    expect(t.entryPrice).toBe(105);
    expect(t.exitReason).toBe("signal"); // signal at bar 6 close, fill at bar 7 open (= 90)
    expect(t.exitPrice).toBe(90);
    expect(t.pnl).toBeCloseTo(10_000 * (90 / 105 - 1));
  });

  it("sizes from the stop and books exactly -1R when the stop is hit", () => {
    const closes = [100, 100, 101, 102, 95, 95];
    const c = candlesFromCloses(closes, H, 0);
    const s = longWhenCloseAbove(100.5, { stop: { type: "percent", value: 2, atrPeriod: null }, riskPerTradePercent: 1, maxLeverage: 10 });
    const run = runBacktest(c, s, noCosts);
    expect(run.trades[0].exitReason).toBe("stop");
    // Entry at the bar 3 open (101); bar 4 trades down to 95: the stop at 98.98 fills at its price.
    expect(run.trades[0].exitPrice).toBeCloseTo(101 * 0.98);
    expect(run.trades[0].r).toBeCloseTo(-1);
    expect(run.finalEquity).toBeCloseTo(9_900);
  });

  it("fills at the open when the market gaps through the stop", () => {
    const rows: CandleRow[] = [
      { t: T0, o: 100, h: 100, l: 100, c: 100, v: 1 },
      { t: T0 + H, o: 100, h: 101, l: 100, c: 101, v: 1 },
      { t: T0 + 2 * H, o: 101, h: 101, l: 101, c: 101, v: 1 },
      { t: T0 + 3 * H, o: 90, h: 91, l: 89, c: 90, v: 1 },
    ];
    const s = longWhenCloseAbove(100.5, { stop: { type: "percent", value: 2, atrPeriod: null } });
    const run = runBacktest(rowsToCandles(rows), s, noCosts);
    expect(run.trades[0].exitPrice).toBe(90);
    expect(run.trades[0].r!).toBeLessThan(-4);
  });

  it("takes the target with an r multiple", () => {
    const closes = [100, 100, 101, 101, 106, 106];
    const c = candlesFromCloses(closes, H, 0);
    const s = longWhenCloseAbove(100.5, {
      stop: { type: "percent", value: 2, atrPeriod: null },
      takeProfit: { type: "r_multiple", value: 2, atrPeriod: null },
    });
    const run = runBacktest(c, s, noCosts);
    expect(run.trades[0].exitReason).toBe("target");
    expect(run.trades[0].r).toBeCloseTo(2);
  });

  it("charges fees, spread and slippage", () => {
    const closes = [100, 100, 105, 110, 115, 120, 90, 90];
    const c = candlesFromCloses(closes);
    const s = longWhenCloseAbove(102, { exitLong: [{ conditions: [{ left: operand("close"), op: "<", right: num(95) }] }], maxLeverage: 1 });
    const free = runBacktest(c, s, noCosts).trades[0].pnl;
    const paid = runBacktest(c, s, { ...noCosts, feePercent: 0.1, spreadPercent: 0.05, slippagePercent: 0.02 }).trades[0].pnl;
    expect(paid).toBeLessThan(free);
  });

  it("closes day trades at the exit time", () => {
    // 24 hourly bars from midnight UTC, always above the level: enters at 01:00, must exit at the 18:00 close (UTC).
    const c = candlesFromCloses(Array.from({ length: 24 }, (_, i) => 101 + i * 0.1));
    const s = longWhenCloseAbove(100, { timezone: "UTC", exitAtTime: "18:00" });
    const run = runBacktest(c, s, noCosts);
    expect(run.trades[0].exitReason).toBe("time");
    expect(new Date(run.trades[0].exitTime + H).getUTCHours()).toBe(18);
  });

  it("evaluates the bundled templates without errors", async () => {
    let price = 100;
    const closes = Array.from({ length: 3000 }, (_, i) => (price *= 1 + Math.sin(i / 17) * 0.004 + Math.cos(i / 5) * 0.003));
    const c = candlesFromCloses(closes, H, 0.3);
    for (const tpl of TEMPLATES) {
      const s = { ...tpl.strategy, interval: "1h" as const };
      const report = await buildReport(c, 300, s, defaultConfig());
      expect(report.metrics.trades).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(report.metrics.totalReturnPercent)).toBe(true);
    }
  });
});

describe("metrics and prop firm", () => {
  it("computes drawdown and the prop firm pass rate", () => {
    let price = 100;
    const closes = Array.from({ length: 2000 }, (_, i) => (price *= 1 + Math.sin(i / 9) * 0.01));
    const c = candlesFromCloses(closes, H, 0.2);
    const s: Strategy = {
      ...defaultStrategy(),
      entryLong: [{ conditions: [{ left: operand("rsi", { period: 2 }), op: "<", right: num(20) }] }],
      exitLong: [{ conditions: [{ left: operand("rsi", { period: 2 }), op: ">", right: num(70) }] }],
      stop: { type: "atr", value: 3, atrPeriod: 14 },
      takeProfit: { type: "none", value: null, atrPeriod: null },
    };
    const ctx = new SeriesContext(c, s.interval, s.timezone);
    const run = runBacktest(c, s, defaultConfig(), ctx, 50);
    const m = computeMetrics(run, 50);
    expect(m.trades).toBeGreaterThan(10);
    expect(m.maxDrawdownPercent).toBeGreaterThanOrEqual(0);
    const prop = simulatePropFirm(run.trades, PROP_PRESETS[0], 1, { iterations: 200 });
    for (const summary of [prop.historical, prop.monteCarlo, prop.noEdge!]) {
      expect(summary.passRate).toBeGreaterThanOrEqual(0);
      expect(summary.passRate).toBeLessThanOrEqual(100);
    }
  });
});
