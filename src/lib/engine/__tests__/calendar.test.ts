import { describe, expect, it } from "vitest";
import type { Trade } from "../backtest";
import { CALENDAR_FROM, CALENDAR_TO, eventsBetween, marketEvents } from "../calendar";
import { breakdowns, tradeEvents } from "../insights";

const H = 3_600_000;

describe("calendar", () => {
  it("holds every announcement of the official calendars, sorted and inside its years", () => {
    const all = marketEvents();
    const count = (kind: string) => all.filter((e) => e.kind === kind).length;
    // 8 Fed decisions a year from 2017 to 2027, plus 3 emergency ones in March 2020; the ECB the same, plus PEPP.
    expect(count("fed")).toBe(11 * 8 + 2);
    expect(count("ecb")).toBe(11 * 8 + 1);
    // 12 CPI and 12 NFP a year, minus the release the 2025 shutdown cancelled.
    expect(count("cpi")).toBe(11 * 12 - 1);
    expect(count("nfp")).toBe(11 * 12 - 1);
    expect(all.every((e, i) => i === 0 || all[i - 1].start <= e.start)).toBe(true);
    expect(all.every((e) => e.start >= CALENDAR_FROM - 12 * H && e.end <= CALENDAR_TO + 12 * H)).toBe(true);
  });

  it("takes the day where the announcement is made", () => {
    const fed = marketEvents().find((e) => e.kind === "fed" && e.day === "2024-06-12")!;
    // New York in summer is UTC−4.
    expect(fed.start).toBe(Date.UTC(2024, 5, 12, 4));
    expect(fed.end).toBe(Date.UTC(2024, 5, 13, 4));
    const ecb = marketEvents().find((e) => e.kind === "ecb" && e.day === "2024-06-06")!;
    // Frankfurt in summer is UTC+2.
    expect(ecb.start).toBe(Date.UTC(2024, 5, 5, 22));
  });

  it("finds the announcements a trade lived through", () => {
    // 12 June 2024: CPI in the morning, Fed decision in the evening (same day, so in the calendar's order).
    expect(eventsBetween(Date.UTC(2024, 5, 12, 13), Date.UTC(2024, 5, 12, 14)).map((e) => e.kind)).toEqual(["fed", "cpi"]);
    // 03:00 UTC on the 12th is still the 11th in New York: nothing announced that day.
    expect(eventsBetween(Date.UTC(2024, 5, 12, 0), Date.UTC(2024, 5, 12, 3))).toEqual([]);
    // The Fed's emergency cut of Sunday 15 March 2020.
    expect(eventsBetween(Date.UTC(2020, 2, 15, 20), Date.UTC(2020, 2, 15, 22)).map((e) => e.day)).toEqual(["2020-03-15"]);
    // A swing trade open for three weeks of June 2024 goes through all four kinds.
    expect(new Set(eventsBetween(Date.UTC(2024, 5, 3), Date.UTC(2024, 5, 21)).map((e) => e.kind))).toEqual(new Set(["fed", "cpi", "nfp", "ecb"]));
  });
});

/** A one-hour trade at `time`, with a 1 % risk (1R = 100). */
function trade(r: number, time: number): Trade {
  return {
    side: "long",
    entryIndex: 0,
    exitIndex: 1,
    entryTime: time,
    exitTime: time + H,
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
    maePercent: -0.5,
    mfePercent: 0.5,
    equityBefore: 10_000,
    equityAfter: 10_000 + r * 100,
  };
}

describe("announcement days in the analysis", () => {
  // Losing trades on the 12 CPI days of 2023, winning ones on 30 Saturdays (never an announcement).
  const cpiDays = marketEvents().filter((e) => e.kind === "cpi" && e.day.startsWith("2023"));
  const losers = cpiDays.map((e) => trade(-1, e.start + 10 * H));
  const winners = Array.from({ length: 30 }, (_, i) => trade(1, Date.UTC(2023, 0, 7 + 7 * i, 12)));
  const trades = [...losers, ...winners].sort((a, b) => a.entryTime - b.entryTime);
  const b = breakdowns(trades, "UTC", "1h", trades[0].entryTime, trades.at(-1)!.entryTime);

  it("tags each trade with the announcements of its day", () => {
    expect(losers.every((t) => tradeEvents(t).includes("cpi"))).toBe(true);
    expect(winners.every((t) => tradeEvents(t).length === 0)).toBe(true);
  });

  it("compares announcement days with the others", () => {
    const [on, off] = b.events!.split;
    expect([on.key, on.trades, on.avg]).toEqual(["event", 12, -1]);
    expect([off.key, off.trades, off.avg]).toEqual(["quiet", 30, 1]);
    expect(b.events!.kinds.find((k) => k.key === "cpi")?.trades).toBe(12);
    expect(b.events!.outside).toBe(0);
  });

  it("points at announcement days when they cost the strategy", () => {
    expect(b.findings[0].kind).toBe("weak");
    expect(b.findings[0].bucket.key).toBe("event");
    expect(b.findings[0].bucket.subject).toBe("Les trades en position un jour d'annonce");
  });

  it("leaves out the trades before the calendar", () => {
    const old = Array.from({ length: 12 }, (_, i) => trade(1, Date.UTC(2016, 0, 2 + 7 * i, 12)));
    expect(breakdowns(old, "UTC", "1h", old[0].entryTime, old.at(-1)!.entryTime).events).toBeNull();
    const mixed = [...old, ...trades];
    expect(breakdowns(mixed, "UTC", "1h", mixed[0].entryTime, mixed.at(-1)!.entryTime).events!.outside).toBe(12);
  });
});
