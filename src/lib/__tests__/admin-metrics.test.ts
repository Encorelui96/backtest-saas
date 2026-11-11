import { describe, expect, it } from "vitest";
import { cohorts, funnel, latestSignups, median, quotaPressure, weekOf } from "../admin-metrics";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 31, 12); // Saturday 31 October 2026, noon UTC

describe("median", () => {
  it("handles empty, odd and even lists", () => {
    expect(median([])).toBeNull();
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});

describe("weekOf", () => {
  it("returns the Monday of the week, in UTC", () => {
    expect(weekOf(NOW)).toBe("2026-10-26");
    expect(weekOf(Date.UTC(2026, 9, 26, 0, 30))).toBe("2026-10-26");
    expect(weekOf(Date.UTC(2026, 9, 25, 23))).toBe("2026-10-19");
  });
});

describe("funnel", () => {
  const rows = [
    // Activated within an hour, back after 10 days.
    { createdAt: NOW - 40 * DAY, firstBacktest: NOW - 40 * DAY + 3_600_000, lastActivity: NOW - 30 * DAY },
    // Activated after two days, never came back.
    { createdAt: NOW - 20 * DAY, firstBacktest: NOW - 18 * DAY, lastActivity: NOW - 18 * DAY },
    // Never activated.
    { createdAt: NOW - 3 * DAY, firstBacktest: null, lastActivity: null },
    // Signed up an hour ago: too recent for the 24 h ratio.
    { createdAt: NOW - 3_600_000, firstBacktest: null, lastActivity: null },
  ];

  it("counts activation, time to value and retention", () => {
    const f = funnel(rows, NOW);
    expect(f.users).toBe(4);
    expect(f.signups7d).toBe(2);
    expect(f.signups30d).toBe(3);
    expect(f.activated).toEqual({ n: 2, of: 4 });
    expect(f.activatedWithinDay).toEqual({ n: 1, of: 3 });
    expect(f.medianHoursToValue).toBe(24.5);
    expect(f.back7).toEqual({ n: 1, of: 2 });
    // Only the first user is old enough, and came back 10 days after signing up, not 30.
    expect(f.back30).toEqual({ n: 0, of: 1 });
  });

  it("groups users by sign-up week, newest first", () => {
    const c = cohorts(rows, NOW);
    expect(c.map((x) => x.week)).toEqual(["2026-10-26", "2026-10-05", "2026-09-21"]);
    expect(c[0]).toMatchObject({ signups: 2, activated: 0 });
  });
});

describe("quotaPressure", () => {
  it("counts users near and at their monthly limit", () => {
    expect(
      quotaPressure([
        { plan: "free", backtests: 24, ai: 0 },
        { plan: "free", backtests: 30, ai: 0 },
        { plan: "free", backtests: 1, ai: 5 },
        { plan: "trader", backtests: 10, ai: 5 },
      ]),
    ).toEqual({ near: 1, at: 2 });
  });
});

describe("latestSignups", () => {
  const signup = (email: string, daysAgo: number) => ({ email, emailVerified: true, createdAt: NOW - daysAgo * DAY, plan: "free" as const, backtests: 0, lastActivity: null });

  it("lists the newest accounts first and caps the list", () => {
    const rows = [signup("old@x.fr", 30), signup("new@x.fr", 1), signup("mid@x.fr", 10)];
    expect(latestSignups(rows).map((s) => s.email)).toEqual(["new@x.fr", "mid@x.fr", "old@x.fr"]);
    expect(latestSignups(rows, 2).map((s) => s.email)).toEqual(["new@x.fr", "mid@x.fr"]);
    expect(rows[0].email).toBe("old@x.fr");
  });
});
