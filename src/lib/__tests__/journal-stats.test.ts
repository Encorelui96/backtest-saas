import { describe, expect, it } from "vitest";
import { NO_ANSWERS, type JournalAccount, type JournalTrade } from "../journal";
import {
  MIN_SAMPLE,
  NO_FILTER,
  calendarMonth,
  filterTrades,
  groupTrades,
  maxDrawdown,
  periodDays,
  rCurve,
  shiftDay,
  shiftMonth,
  statTrades,
  streaks,
  summaryOf,
} from "../journal-stats";

const account: JournalAccount = {
  id: "a1",
  name: "Réel",
  kind: "real",
  currency: "USD",
  capital: 10_000,
  archived: false,
  createdAt: 0,
  riskPct: 1,
  maxDailyLossR: null,
  maxTradesDay: null,
  tradingDays: null,
  sessionStart: null,
  sessionEnd: null,
  timeZone: "Europe/Paris",
};

/** A buy of 1 unit, entry 100 and stop 99: 1R = 1 $, so the exit 100 + r gives r. Opened an hour before closing. */
function trade(id: string, closedAt: string, r: number, extra: Partial<JournalTrade> = {}): JournalTrade {
  const closed = Date.parse(closedAt);
  return {
    id,
    accountId: "a1",
    setupId: null,
    offPlan: false,
    market: "EURUSD",
    side: "long",
    quality: null,
    openedAt: closed - 3_600_000,
    entry: 100,
    stop: 99,
    size: 1,
    pointValue: 1,
    target: null,
    timeframe: null,
    context: null,
    plannedEntry: null,
    announcement: null,
    captureUrl: null,
    close: { closedAt: closed, exit: 100 + r, exitReason: "manual-plan", fees: 0, comment: null, captureUrl: null, maeR: null, mfeR: null },
    checks: [],
    planAnswers: NO_ANSWERS,
    errors: [],
    planFollowed: null,
    createdAt: 0,
    updatedAt: 0,
    ...extra,
  };
}

const stats = (trades: JournalTrade[]) => statTrades(trades, [account]);
const series = (rs: number[]) => stats(rs.map((r, i) => trade(`t${i}`, `2026-11-${String(i + 1).padStart(2, "0")}T10:00:00Z`, r)));

describe("closed trades for the statistics", () => {
  it("keeps the closed trades, oldest first, with their result", () => {
    const open = { ...trade("o", "2026-11-20T10:00:00Z", 0), close: null };
    const s = stats([trade("b", "2026-11-21T10:00:00Z", -1), open, trade("a", "2026-11-20T10:00:00Z", 2)]);
    expect(s.map((t) => t.id)).toEqual(["a", "b"]);
    expect(s[0].r).toBeCloseTo(2, 9);
    expect(s[1].amount).toBeCloseTo(-1, 9);
  });

  it("reads the day, the weekday and the hour in the account's time zone", () => {
    // 23:30 in UTC on Monday 30 November is already 1 December in Paris; opened at 23:30 Paris time, a Monday.
    const [t] = stats([trade("a", "2026-11-30T23:30:00Z", 1)]);
    expect(t.day).toBe("2026-12-01");
    expect(t.weekday).toBe(0);
    expect(t.hour).toBe(23);
    const [ny] = statTrades([trade("a", "2026-11-30T23:30:00Z", 1)], [{ ...account, timeZone: "America/New_York" }]);
    expect(ny.day).toBe("2026-11-30");
    expect(ny.hour).toBe(17);
  });
});

describe("days and months", () => {
  it("moves across months and years", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-11", 2)).toBe("2027-01");
    expect(shiftDay("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("filters", () => {
  const now = Date.parse("2026-11-27T10:00:00Z");

  it("turns a period into its first and last days", () => {
    expect(periodDays("all", now, "Europe/Paris")).toEqual({ from: null, to: null });
    expect(periodDays("month", now, "Europe/Paris")).toEqual({ from: "2026-11-01", to: null });
    expect(periodDays("last-month", now, "Europe/Paris")).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(periodDays("last-month", Date.parse("2026-01-15T10:00:00Z"), "Europe/Paris")).toEqual({ from: "2025-12-01", to: "2025-12-31" });
    expect(periodDays("90d", now, "Europe/Paris")).toEqual({ from: "2026-08-30", to: null });
    expect(periodDays("year", now, "Europe/Paris")).toEqual({ from: "2026-01-01", to: null });
  });

  it("keeps the trades of the account, setup, plan status and period chosen", () => {
    const s = stats([
      trade("oct", "2026-10-30T10:00:00Z", 1, { setupId: "s1", planFollowed: true }),
      trade("nov", "2026-11-03T10:00:00Z", -1, { planFollowed: false, offPlan: true }),
      trade("demo", "2026-11-04T10:00:00Z", 2, { accountId: "a2", setupId: "s1" }),
    ]);
    const f = { ...NO_FILTER, now, timeZone: "Europe/Paris" };
    expect(filterTrades(s, f).map((t) => t.id)).toEqual(["oct", "nov", "demo"]);
    expect(filterTrades(s, { ...f, period: "month" }).map((t) => t.id)).toEqual(["nov", "demo"]);
    expect(filterTrades(s, { ...f, period: "last-month" }).map((t) => t.id)).toEqual(["oct"]);
    expect(filterTrades(s, { ...f, setupId: "off" }).map((t) => t.id)).toEqual(["nov"]);
    expect(filterTrades(s, { ...f, setupId: "s1", accountId: "a1" }).map((t) => t.id)).toEqual(["oct"]);
    expect(filterTrades(s, { ...f, plan: "in" }).map((t) => t.id)).toEqual(["oct"]);
    expect(filterTrades(s, { ...f, plan: "out" }).map((t) => t.id)).toEqual(["nov"]);
    expect(filterTrades(s, { ...f, period: "month" }, false)).toHaveLength(3);
  });
});

describe("calendar", () => {
  it("lays a month out in weeks from Monday, with the days around it left empty", () => {
    // 1 November 2026 is a Sunday: the first week starts on Monday 26 October.
    const m = calendarMonth("2026-11", stats([trade("oct", "2026-10-31T10:00:00Z", 3)]));
    expect(m.weeks).toHaveLength(6);
    expect(m.weeks.every((w) => w.days.length === 7)).toBe(true);
    expect(m.weeks[0].days[0]).toMatchObject({ day: "2026-10-26", inMonth: false });
    expect(m.weeks[0].days[5]).toMatchObject({ day: "2026-10-31", inMonth: false, trades: [], r: 0 });
    expect(m.weeks[0].days[6]).toMatchObject({ day: "2026-11-01", date: 1, inMonth: true });
    expect(m.weeks[5].days[0].day).toBe("2026-11-30");
    expect(m.trades).toBe(0);
  });

  it("adds each day's R, then each week's and the month's", () => {
    const m = calendarMonth(
      "2026-11",
      stats([trade("a", "2026-11-02T09:00:00Z", 2), trade("b", "2026-11-02T15:00:00Z", -1), trade("c", "2026-11-03T10:00:00Z", -0.5), trade("d", "2026-11-27T10:00:00Z", 1)]),
    );
    const monday = m.weeks[1].days[0];
    expect(monday.day).toBe("2026-11-02");
    expect(monday.trades.map((t) => t.id)).toEqual(["a", "b"]);
    expect(monday.r).toBeCloseTo(1, 9);
    expect(m.weeks[1].trades).toBe(3);
    expect(m.weeks[1].r).toBeCloseTo(0.5, 9);
    expect(m.trades).toBe(4);
    expect(m.r).toBeCloseTo(1.5, 9);
    expect([m.activeDays, m.greenDays, m.redDays]).toEqual([3, 2, 1]);
  });

  it("puts a trade on the day it closes in its account's time zone", () => {
    const m = calendarMonth("2026-12", stats([trade("late", "2026-11-30T23:30:00Z", 1)]));
    // 1 December 2026 is a Tuesday.
    expect(m.weeks[0].days[1]).toMatchObject({ day: "2026-12-01", r: expect.closeTo(1, 9) });
  });
});

describe("R curve, drawdown and streaks", () => {
  it("adds the R up and finds the deepest fall from a high", () => {
    const curve = rCurve(series([1, 2, -1, -2, 1, 3]));
    expect(curve.map((p) => p.total)).toEqual([1, 3, 2, 0, 1, 4].map((x) => expect.closeTo(x, 9)));
    expect(maxDrawdown(curve)).toEqual({ depth: expect.closeTo(-3, 9), peak: 2, trough: 4, recovered: true });
  });

  it("measures a fall from the start and says when it isn't recovered", () => {
    expect(maxDrawdown(rCurve(series([-1, -1, 2])))).toMatchObject({ depth: expect.closeTo(-2, 9), peak: 0, trough: 2, recovered: true });
    expect(maxDrawdown(rCurve(series([1, -2])))).toMatchObject({ depth: expect.closeTo(-2, 9), recovered: false });
    expect(maxDrawdown(rCurve(series([1, 2])))).toEqual({ depth: 0, peak: 0, trough: 0, recovered: true });
    expect(maxDrawdown([])).toBeNull();
  });

  it("leaves the trades without a measured risk out of the curve", () => {
    const zeroRisk = trade("z", "2026-11-05T10:00:00Z", 1, { stop: 100, entry: 100 });
    expect(rCurve(stats([trade("a", "2026-11-04T10:00:00Z", 1), zeroRisk])).map((p) => p.id)).toEqual(["a"]);
  });

  it("counts the longest runs of gains and losses", () => {
    const s = streaks([1, 1, -1, -1, -1, 0, -1, 2].map((amount) => ({ amount })));
    expect(s).toEqual({ wins: 2, losses: 3, current: { win: true, length: 1 } });
    expect(streaks([]).current).toBeNull();
  });
});

describe("analyses", () => {
  it("splits by setup, biggest first, and marks the small samples", () => {
    const ts = stats([
      ...Array.from({ length: MIN_SAMPLE }, (_, i) => trade(`s${i}`, "2026-11-02T10:00:00Z", i % 2 ? 1 : -0.5, { setupId: "s1" })),
      trade("off", "2026-11-03T10:00:00Z", -1, { offPlan: true }),
    ]);
    const g = groupTrades(ts, "setup");
    expect(g.map((x) => [x.key, x.summary.closed, x.indicative])).toEqual([
      ["s1", MIN_SAMPLE, false],
      ["off", 1, true],
    ]);
    expect(g[0].summary.expectancy).toBeCloseTo(0.25, 9);
  });

  it("merges the spellings of a market and keeps the first one", () => {
    const g = groupTrades(stats([trade("a", "2026-11-02T10:00:00Z", 1, { market: "US100.cash" }), trade("b", "2026-11-03T10:00:00Z", 1, { market: " us100.CASH" })]), "market");
    expect(g.map((x) => [x.key, x.label, x.summary.closed])).toEqual([["US100.CASH", "US100.cash", 2]]);
  });

  it("orders hours, days, sides, qualities and plan status the natural way", () => {
    const ts = stats([
      trade("a", "2026-11-04T15:00:00Z", 1, { quality: "C", side: "short", planFollowed: false }),
      trade("b", "2026-11-02T08:00:00Z", 1, { quality: "A", planFollowed: true }),
      trade("c", "2026-11-03T10:00:00Z", 1),
    ]);
    // Opened an hour before closing, read in Paris (UTC+1): 15h, 8h and 10h UTC open at 15h, 8h and 10h Paris time.
    expect(groupTrades(ts, "hour").map((x) => x.key)).toEqual(["08", "10", "15"]);
    expect(groupTrades(ts, "weekday").map((x) => x.key)).toEqual(["0", "1", "2"]);
    expect(groupTrades(ts, "side").map((x) => x.key)).toEqual(["long", "short"]);
    expect(groupTrades(ts, "quality").map((x) => x.key)).toEqual(["A", "C", "none"]);
    expect(groupTrades(ts, "plan").map((x) => x.key)).toEqual(["in", "out", "unknown"]);
    expect(summaryOf(ts).closed).toBe(3);
  });
});
