import { describe, expect, it } from "vitest";
import { rowsToCandles, type CandleRow } from "../../types";
import { PRO_INDICATORS, defaultStrategy, num, operand, proIndicatorsIn, type Strategy } from "../../strategy/schema";
import { operandLabel } from "../../strategy/describe";
import { PLANS } from "../../plans";
import { adx, aroon, cci, cmf, divergence, dmi, fairValueGaps, heikinAshi, hma, orderBlocks, sma, stochRsi, structure, swings, williamsR, wma } from "../indicators";
import { SeriesContext } from "../evaluate";

const F = (xs: number[]) => Float64Array.from(xs);
const H = 3_600_000;
const T0 = Date.UTC(2024, 0, 1);

/** Weighted average written the long way, to check the rolling one. */
function naiveWma(src: Float64Array, n: number) {
  return src.map((_, i) => {
    if (i < n - 1) return NaN;
    let s = 0;
    for (let k = 0; k < n; k++) s += (n - k) * src[i - k];
    return s / ((n * (n + 1)) / 2);
  });
}

const wave = F(Array.from({ length: 400 }, (_, i) => 100 + 10 * Math.sin(i / 9) + 3 * Math.cos(i / 2.3)));

describe("moving averages", () => {
  it("WMA weighs the newest value most", () => {
    const w = wma(F([1, 2, 3, 4, 5]), 3);
    expect(Number.isNaN(w[1])).toBe(true);
    expect(w[2]).toBeCloseTo(14 / 6, 12);
    expect(w[4]).toBeCloseTo(26 / 6, 12);
  });

  it("the rolling WMA matches the definition on a long series", () => {
    const fast = wma(wave, 20);
    const slow = naiveWma(wave, 20);
    for (let i = 19; i < wave.length; i++) expect(fast[i]).toBeCloseTo(slow[i], 9);
  });

  it("HMA is WMA(2 × WMA(n/2) − WMA(n), √n)", () => {
    const h = hma(wave, 16);
    const diff = naiveWma(wave, 8).map((x, i) => 2 * x - naiveWma(wave, 16)[i]);
    const want = naiveWma(diff, 4);
    expect(Number.isNaN(h[17])).toBe(true);
    for (let i = 18; i < wave.length; i++) expect(h[i]).toBeCloseTo(want[i], 9);
  });

  it("HMA lags a trend less than the simple average", () => {
    const up = F(Array.from({ length: 100 }, (_, i) => 100 + i));
    expect(99 + 100 - hma(up, 20)[99]).toBeLessThan(99 + 100 - sma(up, 20)[99]);
  });
});

describe("oscillators", () => {
  it("CCI is 100 when the price is one mean deviation / 0.015 above its mean", () => {
    // Mean 2, mean deviation 2/3: (3 − 2) / (0.015 × 2/3) = 100.
    expect(cci(F([1, 2, 3]), 3)[2]).toBeCloseTo(100, 9);
    expect(cci(F([5, 5, 5]), 3)[2]).toBe(0);
  });

  it("Williams %R reads 0 at the high and −100 at the low", () => {
    const h = F([10, 12, 11, 13]);
    const l = F([8, 9, 7, 9]);
    expect(williamsR(h, l, F([9, 12, 10, 13]), 3)[3]).toBe(-0);
    expect(williamsR(h, l, F([9, 12, 7, 9]), 3)[2]).toBe(-100);
    expect(williamsR(h, l, F([9, 12, 9.5, 10]), 3)[2]).toBeCloseTo(-50, 9);
  });

  it("+DI leads in a rise, −DI in a fall, and the ADX is unchanged", () => {
    const c = F([...Array.from({ length: 60 }, (_, i) => 100 + i), ...Array.from({ length: 60 }, (_, i) => 159 - i)]);
    const h = c.map((x) => x + 1);
    const l = c.map((x) => x - 1);
    const d = dmi(h, l, c, 14);
    expect(d.plus[55]).toBeGreaterThan(d.minus[55]);
    expect(d.minus[115]).toBeGreaterThan(d.plus[115]);
    expect(Array.from(d.adx)).toEqual(Array.from(adx(h, l, c, 14)));
  });

  it("Stoch RSI stays between 0 and 100 and its %D averages 3 %K", () => {
    const { k, d } = stochRsi(wave, 14, 14, 3);
    for (let i = 60; i < wave.length; i++) {
      // A rolling sum leaves a trace of float noise around the bounds.
      expect(k[i]).toBeGreaterThanOrEqual(-1e-9);
      expect(k[i]).toBeLessThanOrEqual(100 + 1e-9);
      expect(d[i]).toBeCloseTo((k[i] + k[i - 1] + k[i - 2]) / 3, 9);
    }
  });

  it("Aroon up is 100 on a new high, Aroon down 0 when the low is N bars old", () => {
    const up = F(Array.from({ length: 30 }, (_, i) => 10 + i));
    const a = aroon(up, up.map((x) => x - 1), 14);
    expect(a.up[29]).toBe(100);
    expect(a.down[29]).toBe(0);
    expect(Number.isNaN(a.up[13])).toBe(true);
  });

  it("CMF is 1 when every bar closes on its high", () => {
    const h = F([11, 12, 13, 14]);
    const l = F([9, 10, 11, 12]);
    expect(cmf(h, l, h, F([1, 2, 3, 4]), 3)[3]).toBe(1);
    expect(cmf(h, l, l, F([1, 2, 3, 4]), 3)[3]).toBe(-1);
  });
});

describe("market structure", () => {
  //            0  1  2  3   4  5  6  7  8  9  10  11
  const h = F([3, 4, 5, 10, 6, 5, 4, 5, 6, 8, 11, 12]);
  const l = h.map((x) => x - 2);

  it("a swing high is known only once the bars after it have closed", () => {
    const s = swings(h, l, 2, 2);
    expect(Number.isNaN(s.high[4])).toBe(true);
    expect(s.high[5]).toBe(10);
    expect(s.high[9]).toBe(10);
  });

  it("the break of a swing high fires once, then the structure stays bullish", () => {
    const c = F([3, 4, 5, 9, 6, 5, 4, 5, 6, 8, 10.5, 11.5]);
    const r = structure(h, l, c, 2, 2);
    expect(Array.from(r.bos)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0]);
    expect(r.trend[9]).toBe(0);
    expect(r.trend[11]).toBe(1);
  });

  it("a fair value gap marks its zone until a close goes through it", () => {
    const hi = F([10, 14, 15, 15, 14, 12]);
    const lo = F([9, 10, 11, 12, 10.5, 9]);
    const cl = F([10, 13, 14, 13, 11, 9.5]);
    const g = fairValueGaps(hi, lo, cl);
    // Bar 2's low (11) is above bar 0's high (10).
    expect(g.signal[2]).toBe(1);
    expect([g.bullTop[2], g.bullBottom[2]]).toEqual([11, 10]);
    expect(g.bullBottom[4]).toBe(10);
    // Bar 5 closes at 9.5, under the zone.
    expect(Number.isNaN(g.bullTop[5])).toBe(true);
  });

  describe("order blocks", () => {
    // Swing high 10 at bar 2, a drop to a hammer at bar 6 (the lowest low), then the rise closes above 10 at bar 8.
    // The last bearish candle at or before the low is bar 5: its high 6 and low 4 make the bullish block.
    //            0    1    2    3    4    5    6    7    8     9     10   11   12
    const o = F([3, 3.5, 4.5, 9, 6.5, 5.5, 4.2, 4.8, 7.5, 10.5, 9.5, 7, 6]);
    const hi = F([4, 5, 10, 9, 7, 6, 5, 8, 11, 11, 9.6, 7.5, 6.2]);
    const lo = F([2, 3, 4, 6, 5, 4, 3, 4.7, 7.4, 9, 5.5, 5, 3.5]);
    const cl = F([3.5, 4.5, 9, 6.5, 5.5, 4.5, 4.8, 7.5, 10.5, 9.5, 7, 6, 3.8]);

    it("the last bearish candle before the rise that broke the swing high, from the breaking bar on", () => {
      const b = orderBlocks(o, hi, lo, cl, 2, 2);
      expect(Number.isNaN(b.bullTop[7])).toBe(true);
      expect([b.bullTop[8], b.bullBottom[8]]).toEqual([6, 4]);
      expect([b.bullTop[11], b.bullBottom[11]]).toEqual([6, 4]);
    });

    it("signals the first return into the block only, and drops the block when a close goes under it", () => {
      const b = orderBlocks(o, hi, lo, cl, 2, 2);
      // Bar 10's low (5.5) reaches the top of the block (6); bar 11 touches it again; bar 12 closes at 3.8, under 4.
      expect(Array.from(b.signal)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0]);
      expect(Number.isNaN(b.bullTop[12])).toBe(true);
      expect(Array.from(b.bearTop).every(Number.isNaN)).toBe(true);
    });

    it("bearish blocks mirror bullish ones", () => {
      const neg = (x: Float64Array) => x.map((v) => -v);
      const b = orderBlocks(neg(o), neg(lo), neg(hi), neg(cl), 2, 2);
      expect([b.bearTop[8], b.bearBottom[8]]).toEqual([-4, -6]);
      expect(b.signal[10]).toBe(-1);
      expect(Array.from(b.signal).filter((x) => x !== 0)).toHaveLength(1);
      expect(Number.isNaN(b.bearTop[12])).toBe(true);
    });

    it("never looks ahead: each bar is the same whatever comes after it", () => {
      const n = wave.length;
      const wo = wave.map((x, i) => (i ? wave[i - 1] : x));
      const wh = wave.map((x, i) => Math.max(x, wo[i]) + 0.4 + (i % 3) * 0.2);
      const wl = wave.map((x, i) => Math.min(x, wo[i]) - 0.4 - (i % 5) * 0.1);
      const full = orderBlocks(wo, wh, wl, wave, 3, 3);
      expect(Array.from(full.signal).filter((x) => x !== 0).length).toBeGreaterThan(3);
      for (const m of [40, 97, 211, n - 1]) {
        const part = orderBlocks(wo.slice(0, m), wh.slice(0, m), wl.slice(0, m), wave.slice(0, m), 3, 3);
        for (const k of ["signal", "bullTop", "bullBottom", "bearTop", "bearBottom"] as const) expect(Array.from(part[k]), `${k} up to ${m}`).toEqual(Array.from(full[k].slice(0, m)));
      }
    });
  });

  it("Heikin Ashi closes on the average price and opens mid previous body", () => {
    const k = heikinAshi(F([10, 12]), F([13, 14]), F([9, 11]), F([12, 13]));
    expect(k.close[0]).toBe(11);
    expect(k.open[0]).toBe(11);
    expect(k.open[1]).toBe(11);
    expect(k.close[1]).toBe(12.5);
    expect(k.high[1]).toBe(14);
  });

  it("a bullish divergence: lower low in price, higher low in the oscillator", () => {
    const osc = F([50, 45, 40, 30, 40, 45, 50, 48, 45, 35, 45, 50, 55]);
    const low = F([10, 9, 8, 7, 8, 9, 10, 9, 8, 6, 8, 9, 10]);
    const d = divergence(osc, low.map((x) => x + 1), low, 2);
    // Oscillator lows at bars 3 (30) and 9 (35); price lows 7 then 6. Confirmed 2 bars after the second.
    expect(d[11]).toBe(1);
    expect(Array.from(d).filter((x) => x !== 0)).toHaveLength(1);
  });
});

describe("engine wiring", () => {
  let price = 100;
  const rows: CandleRow[] = Array.from({ length: 300 }, (_, i) => {
    const o = price;
    price *= 1 + Math.sin(i / 7) * 0.01;
    return { t: T0 + i * H, o, h: Math.max(o, price) * 1.002, l: Math.min(o, price) * 0.998, c: price, v: 1 + (i % 4) };
  });
  const c = rowsToCandles(rows);
  const ctx = new SeriesContext(c, "1h", "UTC");

  it("averages read the mid of the candle with the hl2 source", () => {
    const got = ctx.series(operand("sma", { period: 15, source: "hl2" }));
    const want = sma(c.h.map((x, i) => (x + c.l[i]) / 2), 15);
    expect(Array.from(got)).toEqual(Array.from(want));
  });

  it("CCI reads hlc3 unless told otherwise", () => {
    const tp = c.h.map((x, i) => (x + c.l[i] + c.c[i]) / 3);
    expect(Array.from(ctx.series(operand("cci", { period: 20 })))).toEqual(Array.from(cci(tp, 20)));
    expect(Array.from(ctx.series(operand("cci", { period: 20, source: "close" })))).toEqual(Array.from(cci(c.c, 20)));
  });

  it("+DI and −DI come from the same computation as the ADX", () => {
    const d = dmi(c.h, c.l, c.c, 14);
    expect(Array.from(ctx.series(operand("plus_di", { period: 14 })))).toEqual(Array.from(d.plus));
    expect(Array.from(ctx.series(operand("minus_di", { period: 14 })))).toEqual(Array.from(d.minus));
    expect(Array.from(ctx.series(operand("adx", { period: 14 })))).toEqual(Array.from(d.adx));
  });

  it("order blocks come from one computation per swing setting", () => {
    const b = orderBlocks(c.o, c.h, c.l, c.c, 3, 4);
    expect(Array.from(ctx.series(operand("ob_bull_top", { period: 3, period2: 4 })))).toEqual(Array.from(b.bullTop));
    expect(Array.from(ctx.series(operand("ob_bear_bottom", { period: 3, period2: 4 })))).toEqual(Array.from(b.bearBottom));
    expect(Array.from(ctx.series(operand("order_block", { period: 3, period2: 4 })))).toEqual(Array.from(b.signal));
    expect(Array.from(ctx.series(operand("order_block")))).toEqual(Array.from(orderBlocks(c.o, c.h, c.l, c.c, 5, 5).signal));
    expect(operandLabel(operand("ob_bull_bottom", { period: 5, period2: 5 }))).toBe("OB haussier bas(5, 5)");
  });

  it("labels show a source other than the indicator's default", () => {
    expect(operandLabel(operand("sma", { period: 15, source: "hl2" }))).toBe("MM(15, hl2)");
    expect(operandLabel(operand("cci", { period: 20, source: "hlc3" }))).toBe("CCI(20)");
    expect(operandLabel(operand("highest", { period: 20, source: "high" }))).toBe("Plus haut(20)");
  });
});

describe("Pro indicators", () => {
  const rule = (indicator: Parameters<typeof operand>[0]) => [{ conditions: [{ left: operand(indicator), op: "==" as const, right: num(1) }] }];

  it("only the Pro plan includes them", () => {
    expect([PLANS.free.proIndicators, PLANS.trader.proIndicators, PLANS.pro.proIndicators]).toEqual([false, false, true]);
    expect(PRO_INDICATORS.has("bos")).toBe(true);
    expect(PRO_INDICATORS.has("order_block")).toBe(true);
    expect(PRO_INDICATORS.has("ob_bull_top")).toBe(true);
    expect(PRO_INDICATORS.has("hma")).toBe(false);
  });

  it("are found in the rules a strategy uses, each once", () => {
    const s: Strategy = { ...defaultStrategy(), direction: "both", entryLong: rule("bos"), entryShort: rule("bos"), exitLong: rule("fvg"), exitShort: rule("rsi") };
    expect(proIndicatorsIn(s)).toEqual(["bos", "fvg"]);
  });

  it("a long-only strategy ignores its short rules", () => {
    const s: Strategy = { ...defaultStrategy(), direction: "long", entryLong: rule("rsi"), exitShort: rule("ha_close") };
    expect(proIndicatorsIn(s)).toEqual([]);
  });
});
