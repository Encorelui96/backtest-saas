import { describe, expect, it } from "vitest";
import { rowsToCandles } from "../../types";
import { defaultStrategy, num, operand, type Strategy } from "../../strategy/schema";
import { SeriesContext } from "../evaluate";
import { signalsAt } from "../signals";

const H = 3_600_000;
const T0 = Date.UTC(2026, 0, 5);
const candles = (closes: number[]) => rowsToCandles(closes.map((c, i) => ({ t: T0 + i * H, o: c, h: c, l: c, c, v: 1 })));

const above = (level: number) => [{ conditions: [{ left: operand("close"), op: ">" as const, right: num(level) }] }];
const below = (level: number) => [{ conditions: [{ left: operand("close"), op: "<" as const, right: num(level) }] }];

function strat(over: Partial<Strategy>): Strategy {
  return { ...defaultStrategy(), interval: "1h", timezone: "UTC", entryLong: [], entryShort: [], ...over };
}

describe("signalsAt", () => {
  it("reports the entry and exit rules that fire on the last closed bar", () => {
    const ctx = new SeriesContext(candles([100, 101, 105]), "1h", "UTC");
    expect(signalsAt(ctx, strat({ entryLong: above(104) }))).toEqual(["long"]);
    expect(signalsAt(ctx, strat({ entryLong: above(110) }))).toEqual([]);
    expect(signalsAt(ctx, strat({ entryLong: above(110), exitLong: above(104) }))).toEqual(["exit_long"]);
  });

  it("follows the strategy's direction", () => {
    const ctx = new SeriesContext(candles([100, 99, 95]), "1h", "UTC");
    const s = strat({ entryLong: below(96), entryShort: below(96) });
    expect(signalsAt(ctx, { ...s, direction: "long" })).toEqual(["long"]);
    expect(signalsAt(ctx, { ...s, direction: "short" })).toEqual(["short"]);
    // With both, the long rule wins on the same bar, as in the backtest.
    expect(signalsAt(ctx, { ...s, direction: "both" })).toEqual(["long"]);
  });

  it("ignores empty rule groups", () => {
    const ctx = new SeriesContext(candles([100, 101]), "1h", "UTC");
    expect(signalsAt(ctx, strat({ entryLong: [{ conditions: [] }] }))).toEqual([]);
  });
});
