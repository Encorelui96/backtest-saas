import { describe, expect, it } from "vitest";
import type { Trade } from "../backtest";
import { breakdowns, excursions, riskSizing, safeRisk } from "../insights";

const DAY = 86_400_000;
const T0 = Date.UTC(2025, 0, 6); // a Monday

/** A trade risking 1 % of a 10 000 account (1R = 100), with 0.05R of costs. */
function trade(r: number, day: number, hour = 10, extra: Partial<Trade> = {}): Trade {
  const entryTime = T0 + day * DAY + hour * 3_600_000;
  return {
    side: "long",
    entryIndex: 0,
    exitIndex: 1,
    entryTime,
    exitTime: entryTime + 3_600_000,
    entryPrice: 100,
    exitPrice: 100,
    stopPrice: 99,
    targetPrice: null,
    exitReason: r > 0 ? "target" : "stop",
    qty: 1,
    notional: 100,
    pnl: r * 100,
    pnlPercent: r,
    r,
    riskAmount: 100,
    costs: 5,
    bars: 1,
    maePercent: r > 0 ? -0.2 : -1,
    mfePercent: r > 0 ? r : 0.3,
    equityBefore: 10_000,
    equityAfter: 10_000 + r * 100,
    ...extra,
  };
}

describe("breakdowns", () => {
  it("finds the hour that loses on both parts of the test", () => {
    const trades: Trade[] = [];
    for (let d = 0; d < 20; d++) trades.push(trade(1, d * 5, 10), trade(-0.5, d * 5 + 1, 16));
    const from = trades[0].entryTime;
    const to = trades[trades.length - 1].entryTime;
    const b = breakdowns(trades, "UTC", "1h", from, to);
    expect(b.unit).toBe("R");
    expect(b.byHour?.map((x) => x.key)).toEqual(["h10", "h16"]);
    expect(b.bySide).toBeNull();
    const w = b.findings[0];
    expect(w.kind).toBe("weak");
    expect(w.bucket.key).toBe("h16");
    expect(w.bucket.subject).toBe("Les trades ouverts entre 16 h et 17 h");
    expect(w.avgAll).toBeCloseTo(0.25);
    expect(w.avgWithout).toBeCloseTo(1);
    expect(w.steady).toBe(true);
  });

  it("has no hour breakdown on daily bars", () => {
    const trades = Array.from({ length: 30 }, (_, i) => trade(i % 2 ? 1 : -1, i, 0));
    const b = breakdowns(trades, "UTC", "1d", trades[0].entryTime, trades[29].entryTime);
    expect(b.byHour).toBeNull();
    expect(b.byWeekday?.length).toBe(7);
  });

  it("ignores groups too small to be a lesson", () => {
    const trades = [...Array.from({ length: 40 }, (_, i) => trade(1, i, 10)), ...Array.from({ length: 3 }, (_, i) => trade(-1, i, 16))];
    const b = breakdowns(trades, "UTC", "1h", trades[0].entryTime, trades[39].entryTime);
    expect(b.findings.filter((w) => w.bucket.key === "h16")).toHaveLength(0);
  });

  it("points at what still wins when the strategy loses overall", () => {
    const trades: Trade[] = [];
    for (let d = 0; d < 30; d++) trades.push(trade(0.5, d * 3, 10), trade(-1.5, d * 3 + 1, 10, { side: "short" }));
    const b = breakdowns(trades, "UTC", "1h", trades[0].entryTime, trades[trades.length - 1].entryTime);
    expect(b.avg).toBeCloseTo(-0.5);
    const f = b.findings[0];
    expect(f.kind).toBe("strong");
    expect(f.bucket.key).toBe("long");
    expect(f.steady).toBe(true);
    // Never a "weak" finding in a losing strategy: every group loses a little there.
    expect(b.findings.every((x) => x.kind === "strong")).toBe(true);
    expect(b.bySide?.find((x) => x.key === "short")?.feminine).toBe(true);
  });
});

describe("excursions", () => {
  it("reads the worst and best moments in R", () => {
    const trades = [
      ...Array.from({ length: 10 }, (_, i) => trade(2, i)),
      ...Array.from({ length: 6 }, (_, i) => trade(-1, i + 10, 10, { mfePercent: 1.5 })),
      ...Array.from({ length: 4 }, (_, i) => trade(-1, i + 16)),
    ];
    const e = excursions(trades)!;
    expect(e.winners).toBe(10);
    expect(e.winnersDepthP80).toBeCloseTo(0.2);
    expect(e.losersPast1R).toBe(6);
    expect(e.winnersKept).toBeCloseTo(1);
    // The 10 winners dipped 0.2R: first band (0 to 0.25R).
    expect(e.depth[0]).toMatchObject({ wins: 10, losses: 0 });
    // The 10 losers went to −1R: last band (1R and beyond).
    expect(e.depth[4]).toMatchObject({ from: 1, to: null, losses: 10 });
  });

  it("needs a stop on every trade", () => {
    const trades = Array.from({ length: 20 }, (_, i) => trade(1, i, 10, { r: null, riskAmount: null }));
    expect(excursions(trades)).toBeNull();
  });
});

describe("riskSizing", () => {
  const trades = Array.from({ length: 60 }, (_, i) => trade(i % 2 ? 2 : -1, i));

  it("shows drawdowns growing with the risk", () => {
    const s = riskSizing(trades, 1)!;
    expect(s.levels.map((l) => l.risk)).toEqual([0.5, 1, 2, 3, 5]);
    for (let i = 1; i < s.levels.length; i++) expect(s.levels[i].drawdownP95).toBeGreaterThan(s.levels[i - 1].drawdownP95);
    expect(s.streakP95).toBeGreaterThanOrEqual(s.streakP50);
  });

  it("adds the backtest's own risk to the levels", () => {
    expect(riskSizing(trades, 1.5)!.levels.map((l) => l.risk)).toContain(1.5);
  });

  it("computes Kelly, the break-even win rate and the weight of costs", () => {
    const s = riskSizing(trades, 1)!;
    // Half winners at +2R, half losers at −1R: f = 0.5 − 0.5 / 2.
    expect(s.kelly).toBeCloseTo(25);
    expect(s.breakEven.needed).toBeCloseTo(100 / 3);
    expect(s.breakEven.actual).toBeCloseTo(50);
    // Before costs: wins 2.05R, losses 0.95R.
    expect(s.breakEven.neededWithoutCosts).toBeCloseTo((0.95 / 3) * 100);
    expect(s.costPerTrade).toBeCloseTo(0.05);
    expect(s.costShareOfEdge).toBeCloseTo((0.05 / 0.55) * 100);
  });

  it("has no risk levels without a stop", () => {
    const noStop = trades.map((t) => ({ ...t, r: null, riskAmount: null }));
    const s = riskSizing(noStop, 100)!;
    expect(s.unit).toBe("%");
    expect(s.levels).toEqual([]);
    expect(s.kelly).toBeNull();
  });

  it("picks the highest risk that keeps the unlucky drawdown under the limit", () => {
    const levels = [
      { risk: 0.5, medianReturn: 5, drawdownP50: 3, drawdownP95: 6, probDrawdown20: 0, probDrawdown50: 0 },
      { risk: 1, medianReturn: 10, drawdownP50: 6, drawdownP95: 12, probDrawdown20: 1, probDrawdown50: 0 },
      { risk: 2, medianReturn: 20, drawdownP50: 12, drawdownP95: 24, probDrawdown20: 30, probDrawdown50: 0 },
    ];
    expect(safeRisk(levels)).toBe(1);
    expect(safeRisk(levels, 5)).toBeNull();
  });
});
