import { describe, expect, it } from "vitest";
import type { Trade } from "../backtest";
import { PROP_PRESETS, simulatePropFirm, type PropRules } from "../propfirm";
import { PROP_FIRMS } from "../../prop-firms";

const DAY = 86_400_000;
const T0 = Date.UTC(2025, 0, 6, 10); // a Monday, 10:00 UTC

/** One trade a day at 10:00 UTC, `pnl` in % of the account, dipping `mae` % on the way. */
function trade(day: number, pnl: number, mae = Math.min(0, pnl)): Trade {
  const entryTime = T0 + day * DAY;
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
    exitReason: pnl > 0 ? "target" : "stop",
    qty: 1,
    notional: 100,
    pnl: pnl * 100,
    pnlPercent: pnl,
    r: pnl,
    riskAmount: 100,
    costs: 0,
    bars: 1,
    maePercent: mae,
    mfePercent: Math.max(0, pnl),
    equityBefore: 10_000,
    equityAfter: 10_000 + pnl * 100,
  };
}

const rules = (patch: Partial<PropRules>): PropRules => ({ ...PROP_PRESETS[0], phases: [{ name: "Phase", targetPercent: 10, maxDays: null }], minDays: 0, ...patch });
const run = (trades: Trade[], r: PropRules) => simulatePropFirm(trades, r, 1, { iterations: 10, noEdge: false }).fromStart;

describe("prop firm rules", () => {
  it("passes when the target is reached within the limits", () => {
    expect(run([trade(0, 4), trade(1, 3), trade(2, 4)], rules({}))).toEqual({ outcome: "pass", days: 3, phaseReached: 1 });
  });

  it("gives each phase its own time limit", () => {
    // 1 % a day: phase 1 (5 %) passes on day 5, phase 2 (5 %) needs 5 more days but only has 3.
    const r = rules({
      phases: [
        { name: "Phase 1", targetPercent: 5, maxDays: 30 },
        { name: "Phase 2", targetPercent: 5, maxDays: 3 },
      ],
    });
    const out = run(Array.from({ length: 12 }, (_, i) => trade(i, 1)), r);
    expect(out.outcome).toBe("fail_time");
    expect(out.phaseReached).toBe(1);
  });

  it("raises a trailing maximum loss with the best end-of-day balance", () => {
    // +8 % on the first day, then −11 %: 97 is above a static floor at 90, but under the trailing one at 98.
    const trades = [trade(0, 8), trade(1, -11)];
    expect(run(trades, rules({ maxDailyLossPercent: 20, maxTotalLossPercent: 10, maxLossType: "static" })).outcome).toBe("unfinished");
    expect(run(trades, rules({ maxDailyLossPercent: 20, maxTotalLossPercent: 10, maxLossType: "eod-trailing" })).outcome).toBe("fail_total");
  });

  it("only counts the profitable days when the firm asks for them", () => {
    // Target reached on day 2 with a single day above 0.5 %.
    const trades = [trade(0, 9), trade(1, 0.2), trade(2, 1), trade(3, 0.1), trade(4, 0.6)];
    const r = rules({ minDays: 3 });
    expect(run(trades, { ...r, minDaysKind: "trading" })).toMatchObject({ outcome: "pass", days: 3 });
    expect(run(trades, { ...r, minDaysKind: "profitable" })).toMatchObject({ outcome: "pass", days: 5 });
  });

  it("waits for the best day to fall under its share of the profit", () => {
    // Day 1 makes 8 % of a 10 % target: 80 % of the profit, then 8 / 16 = 50 % once 16 % is made.
    const trades = [trade(0, 8), trade(1, 2), trade(2, 3), trade(3, 3)];
    expect(run(trades, rules({ bestDayPercent: null }))).toMatchObject({ outcome: "pass", days: 2 });
    expect(run(trades, rules({ bestDayPercent: 50 }))).toMatchObject({ outcome: "pass", days: 4 });
  });

  it("resets the day where the firm does", () => {
    // 22:30 and 23:30 UTC on the same UTC day are two days in Prague in winter (UTC+1).
    const late = (h: number, pnl: number): Trade => ({ ...trade(0, pnl), entryTime: Date.UTC(2025, 0, 6, h, 30), exitTime: Date.UTC(2025, 0, 6, h, 45) });
    const trades = [late(22, -3), late(23, -3)];
    expect(run(trades, rules({ maxDailyLossPercent: 5, dayZone: "UTC" })).outcome).toBe("fail_daily");
    expect(run(trades, rules({ maxDailyLossPercent: 5, dayZone: "Europe/Prague" })).outcome).toBe("unfinished");
  });

  it("counts a challenge still going after a year as too slow", () => {
    // +0.1 % a week: 5 % after a year, far from the 10 % target.
    const trades = Array.from({ length: 60 }, (_, i) => trade(i * 7, 0.1));
    expect(run(trades, rules({})).outcome).toBe("too_slow");
  });

  it("expires an account left too long without a trade", () => {
    const trades = [trade(0, 2), trade(40, 2)];
    expect(run(trades, rules({ maxInactiveDays: 30 })).outcome).toBe("fail_inactive");
    expect(run(trades, rules({ maxInactiveDays: null })).outcome).toBe("unfinished");
  });

  it("describes the three firms with their flagship challenges", () => {
    expect(PROP_FIRMS.filter((f) => f.flagship).map((f) => f.firm)).toEqual(["FTMO", "FundedNext", "The5ers"]);
    for (const f of PROP_FIRMS) {
      expect(f.url).toMatch(/^https:\/\//);
      expect(f.rules.phases.length).toBeGreaterThan(0);
      expect(f.priceValue).toBeGreaterThan(0);
    }
  });
});
