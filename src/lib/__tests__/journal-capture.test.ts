import { describe, expect, it } from "vitest";
import { resultAmount, resultR } from "../journal";
import { captureDraft, feesOf, guessExitReason, plannedStop, platformTime, pointValueFromProfit, reachedTarget, type CaptureTrade } from "../journal-capture";

// A MetaTrader 5 trade detail on a phone: BTCUSD sell 1, 60676.53 → 60535.82, +127.24 on a euro account, commission −35.88,
// S/L "-", T/P 60550.00, server time 1 hour ahead of Paris.
const mt5: CaptureTrade = {
  market: "BTCUSD",
  side: "short",
  size: 1,
  entry: 60676.53,
  exit: 60535.82,
  openedAt: "2026-11-26T17:00:25",
  closedAt: "2026-11-26T17:02:37",
  stop: null,
  target: 60550,
  profit: 127.24,
  commission: -35.88,
  swap: null,
  ticket: "#593516600",
};

describe("reading a screenshot", () => {
  it("works out the point value from the profit shown: contract size and currency included", () => {
    // 140.71 dollars of move pay 127.24 euros: one point of one lot is worth 0.904 €.
    expect(pointValueFromProfit(mt5)).toBe(0.904271);
    expect(pointValueFromProfit({ ...mt5, profit: null })).toBeNull();
    expect(pointValueFromProfit({ ...mt5, exit: mt5.entry })).toBeNull();
    // A profit whose sign contradicts the prices is a misreading, not a point value.
    expect(pointValueFromProfit({ ...mt5, profit: -127.24 })).toBeNull();
  });

  it("turns commission and swap into fees", () => {
    expect(feesOf(mt5)).toBe(35.88);
    expect(feesOf({ commission: -7, swap: -1.5 })).toBe(8.5);
    expect(feesOf({ commission: -2, swap: 5 })).toBe(0);
    expect(feesOf({ commission: null, swap: null })).toBe(0);
  });

  it("reads the platform's clock in the account's time zone, minus the server's lead", () => {
    expect(platformTime("2026-11-26T17:00:25", "Europe/Paris", 1)).toBe(Date.UTC(2026, 10, 26, 15, 0, 25));
    expect(platformTime("2026.11.24 09:54:55", "Europe/Paris")).toBe(Date.UTC(2026, 10, 24, 8, 54, 55));
    // Summer time: Paris is UTC+2 in July.
    expect(platformTime("2026-07-01T12:00", "Europe/Paris")).toBe(Date.UTC(2026, 6, 1, 10, 0, 0));
    expect(platformTime("hier", "Europe/Paris")).toBeNull();
    expect(platformTime(null, "Europe/Paris")).toBeNull();
  });

  it("knows when the exit reached the target, and proposes an exit reason", () => {
    expect(reachedTarget("short", 60535.82, 60550)).toBe(true);
    expect(reachedTarget("long", 1.0839, 1.084)).toBe(false);
    expect(reachedTarget("long", 1.084, 1.084)).toBe(true);
    expect(guessExitReason(1.2, false, true)).toBe("target");
    expect(guessExitReason(-1, false, false)).toBe("stop");
    // Without a stop, a loss of 1R (the planned risk) is a manual exit, not a stop.
    expect(guessExitReason(-1, true, false)).toBe("manual-plan");
    expect(guessExitReason(0.04, false, false)).toBe("breakeven");
    expect(guessExitReason(0.6, false, false)).toBe("manual-plan");
  });

  it("places a stop at the planned risk for a trade taken without one", () => {
    const pv = pointValueFromProfit(mt5)!;
    const stop = plannedStop("short", mt5.entry, 1, pv, 100)!;
    expect(stop).toBeGreaterThan(mt5.entry!);
    const t = { side: "short" as const, entry: mt5.entry!, stop, size: 1, pointValue: pv, openedAt: 0 };
    const close = { exit: mt5.exit!, closedAt: 1, fees: feesOf(mt5) };
    // 127.24 € gained, 35.88 € of commission: 91.36 € for 100 € of planned risk.
    expect(resultAmount(t, close)).toBeCloseTo(91.36, 2);
    expect(resultR(t, close)).toBeCloseTo(0.9136, 4);
    expect(plannedStop("long", 100, 1, 1, null)).toBeNull();
    // A planned risk larger than the price can't be placed under a buy.
    expect(plannedStop("long", 100, 1, 1, 150)).toBeNull();
  });

  it("gives the form a draft, with the entry at the close when a history list hides it", () => {
    const d = captureDraft(mt5, "Europe/Paris", 1);
    expect(d).toMatchObject({ market: "BTCUSD", side: "short", size: 1, pointValue: 0.904271, fees: 35.88, stop: null, target: 60550, ticket: "593516600" });
    expect(d.closedAt! - d.openedAt!).toBe(132_000);
    const row = captureDraft({ ...mt5, openedAt: null, profit: null, market: "EURUSD" }, "Europe/Paris", 1);
    expect(row.openedAt).toBe(row.closedAt);
    // Without a profit to work from, the market's usual value.
    expect(row.pointValue).toBe(100_000);
  });
});
