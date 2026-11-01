import { describe, expect, it } from "vitest";
import { rowsToCandles, type CandleRow, type Interval } from "../../types";
import { defaultStrategy, normalizeStrategy, num, operand, type Strategy } from "../../strategy/schema";
import { warmupMs } from "../../strategy/warmup";
import { engulfing, ichimoku, insideBar, mfi, narrowRange, obv, pinBar, psar, squeeze, supertrend, zscore } from "../indicators";
import { SeriesContext } from "../evaluate";

const F = (xs: number[]) => Float64Array.from(xs);
const M5 = 5 * 60_000;
const DAY = 86_400_000;
const T0 = Date.UTC(2024, 0, 1); // a Monday

function candles(rows: Omit<CandleRow, "v">[]) {
  return rowsToCandles(rows.map((r) => ({ ...r, v: 1 })));
}

describe("trend indicators", () => {
  // 40 bars up, then 40 bars down twice as fast.
  const c = F([...Array.from({ length: 40 }, (_, i) => 100 + i), ...Array.from({ length: 40 }, (_, i) => 139 - i * 2)]);
  const h = c.map((x) => x + 0.5);
  const l = c.map((x) => x - 0.5);

  it("supertrend sits under a rising price and above it after the fall", () => {
    const st = supertrend(h, l, c, 10, 3);
    expect(st[35]).toBeLessThan(c[35]);
    expect(st[79]).toBeGreaterThan(c[79]);
  });

  it("the parabolic SAR follows the trend the same way", () => {
    const sar = psar(h, l, 0.02, 0.2);
    expect(sar[35]).toBeLessThan(c[35]);
    expect(sar[79]).toBeGreaterThan(c[79]);
  });

  it("the Ichimoku cloud under a bar was computed kijun bars earlier", () => {
    const hi = F(Array.from({ length: 100 }, (_, i) => 10 + i));
    const k = ichimoku(hi, hi.map((x) => x - 2), 9, 26, 52);
    expect(k.spanA[90]).toBeCloseTo((k.tenkan[64] + k.kijun[64]) / 2);
    expect(Number.isNaN(k.spanB[60])).toBe(true);
    expect(Number.isFinite(k.spanB[77])).toBe(true);
  });
});

describe("volatility and volume", () => {
  it("the squeeze is on in a flat market and off once it trends", () => {
    const closes = [...Array.from({ length: 60 }, (_, i) => 100 + (i % 2) * 0.01), ...Array.from({ length: 40 }, (_, i) => 100 + (i + 1) * 3)];
    const c = F(closes);
    const s = squeeze(c.map((x) => x + 0.5), c.map((x) => x - 0.5), c, 20, 1.5);
    expect(s[59]).toBe(1);
    expect(s[99]).toBe(0);
  });

  it("OBV adds volume on up closes and removes it on down closes", () => {
    expect(Array.from(obv(F([1, 2, 1, 1]), F([10, 20, 30, 40])))).toEqual([0, 20, -10, -10]);
  });

  it("MFI is 100 when every bar rises and 50 when nothing moves", () => {
    const up = F(Array.from({ length: 20 }, (_, i) => 10 + i));
    expect(mfi(up, up, up, up.map(() => 1), 14)[19]).toBe(100);
    const flat = F(Array.from({ length: 20 }, () => 10));
    expect(mfi(flat, flat, flat, flat.map(() => 1), 14)[19]).toBe(50);
  });

  it("the z-score counts standard deviations from the mean", () => {
    const z = zscore(F([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), 10);
    expect(z[9]).toBeCloseTo(4.5 / Math.sqrt(8.25));
  });
});

describe("candle patterns", () => {
  it("inside bar", () => {
    expect(insideBar(F([10, 9]), F([5, 6]))[1]).toBe(1);
    expect(insideBar(F([10, 11]), F([5, 6]))[1]).toBe(0);
  });

  it("engulfing is 1 when buyers take over, −1 when sellers do", () => {
    expect(engulfing(F([10, 8]), F([9, 11]))[1]).toBe(1);
    expect(engulfing(F([9, 11]), F([10, 8]))[1]).toBe(-1);
    expect(engulfing(F([10, 10.2]), F([9, 10.4]))[1]).toBe(0);
  });

  it("pin bar reads the long wick", () => {
    expect(pinBar(F([10]), F([10.8]), F([7]), F([10.5]))[0]).toBe(1);
    expect(pinBar(F([10]), F([13]), F([9.5]), F([9.6]))[0]).toBe(-1);
    expect(pinBar(F([10]), F([11]), F([9]), F([10.5]))[0]).toBe(0);
  });

  it("narrow range marks the calmest bar of the last N", () => {
    const nr = narrowRange(F([5, 4, 3, 6, 2]), F([0, 0, 0, 0, 0]), 3);
    expect(Array.from(nr.slice(2))).toEqual([1, 0, 1]);
  });
});

describe("day-trader levels", () => {
  // Two days of 5-minute bars in UTC. Normal bars trade 99–101; the 09:30–09:45 window spikes.
  const spikes: Record<string, [number, number]> = { "09:30": [110, 95], "09:35": [112, 97], "09:40": [111, 96] };
  const rows = Array.from({ length: 2 * 288 }, (_, i) => {
    const t = T0 + i * M5;
    const hhmm = new Date(t).toISOString().slice(11, 16);
    const [h, l] = i < 288 && spikes[hhmm] ? spikes[hhmm] : [101, 99];
    return { t, o: 100, h, l, c: 100 };
  });
  const ctx = new SeriesContext(candles(rows), "5m", "UTC");
  const at = (day: number, hh: number, mm: number) => day * 288 + (hh * 60 + mm) / 5;

  it("the range of a time window exists from the bar that closes it until the end of the day", () => {
    const high = ctx.series(operand("range_high", { window: { start: "09:30", end: "09:45" } }));
    const low = ctx.series(operand("range_low", { window: { start: "09:30", end: "09:45" } }));
    expect(Number.isNaN(high[at(0, 9, 35)])).toBe(true);
    expect(high[at(0, 9, 40)]).toBe(112);
    expect(low[at(0, 9, 40)]).toBe(95);
    expect(high[at(0, 15, 0)]).toBe(112);
    expect(Number.isNaN(high[at(1, 8, 0)])).toBe(true);
    expect(high[at(1, 9, 40)]).toBe(101);
  });

  it("a window across midnight lasts until the next one starts", () => {
    const high = ctx.series(operand("range_high", { window: { start: "22:00", end: "02:00" } }));
    expect(Number.isNaN(high[at(1, 1, 50)])).toBe(true);
    expect(high[at(1, 1, 55)]).toBe(101);
    expect(high[at(1, 12, 0)]).toBe(101);
    expect(Number.isNaN(high[at(1, 22, 5)])).toBe(true);
  });

  const daily = (bars: [number, number, number][], interval: Interval = "1d") =>
    new SeriesContext(
      candles(bars.map(([h, l, c], i) => ({ t: T0 + i * DAY, o: c, h, l, c }))),
      interval,
      "UTC",
    );

  it("previous week high and low run Monday to Sunday", () => {
    const ctx = daily(Array.from({ length: 21 }, (_, i) => [100 + i, 90 + i, 95 + i]));
    const high = ctx.series(operand("prev_week_high"));
    const low = ctx.series(operand("prev_week_low"));
    expect(Number.isNaN(high[6])).toBe(true);
    expect(high[7]).toBe(106);
    expect(low[7]).toBe(90);
    expect(high[13]).toBe(106);
    expect(high[14]).toBe(113);
  });

  it("floor pivots and Camarilla come from the previous day", () => {
    const ctx = daily([
      [110, 90, 100],
      [105, 95, 101],
    ]);
    const v = (name: Parameters<typeof operand>[0]) => ctx.series(operand(name))[1];
    expect(v("pivot")).toBeCloseTo(100);
    expect(v("pivot_r1")).toBeCloseTo(110);
    expect(v("pivot_s1")).toBeCloseTo(90);
    expect(v("pivot_r2")).toBeCloseTo(120);
    expect(v("pivot_s2")).toBeCloseTo(80);
    expect(v("cam_r3")).toBeCloseTo(105.5);
    expect(v("cam_s4")).toBeCloseTo(89);
  });
});

describe("strategy format", () => {
  const withEntry = (left: ReturnType<typeof operand>): Strategy => ({
    ...defaultStrategy(),
    interval: "5m",
    entryLong: [{ conditions: [{ left, op: ">", right: num(0) }] }],
  });

  it("gives a range without a window the night window, and flags it", () => {
    const { strategy, problems } = normalizeStrategy(withEntry(operand("range_high")));
    expect(strategy.entryLong[0].conditions[0].left.window).toEqual({ start: "00:00", end: "08:00" });
    expect(problems.some((p) => p.includes("Plage horaire"))).toBe(true);
  });

  it("reads strategies saved before the window field existed", () => {
    const old = operand("rsi", { period: 14 }) as Partial<ReturnType<typeof operand>>;
    delete old.window;
    const { strategy } = normalizeStrategy(withEntry(old as ReturnType<typeof operand>));
    expect(strategy.entryLong[0].conditions[0].left.window).toBeNull();
  });

  it("loads two weeks of history for last week's levels", () => {
    expect(warmupMs(withEntry(operand("prev_week_high")))).toBeGreaterThanOrEqual(14 * DAY);
  });
});
