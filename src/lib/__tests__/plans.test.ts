import { describe, expect, it } from "vitest";
import { ENTERPRISE, PLANS, clampStartDate, earliestStart, historyMonths, quoteHref } from "../plans";

const NOW = Date.parse("2026-11-03T16:30:00Z");

describe("enterprise offer", () => {
  it("stays outside the plans, so quotas and billing never see it", () => {
    expect(Object.keys(PLANS)).toEqual(["free", "trader", "advanced", "pro"]);
    expect(ENTERPRISE).not.toHaveProperty("monthly");
  });

  it("prepares an e-mail with its subject and lines encoded", () => {
    const href = quoteHref("a@b.fr", "Devis & co", ["Société :", "Besoin :"]);
    const url = new URL(href);
    expect(url.protocol).toBe("mailto:");
    expect(url.pathname).toBe("a@b.fr");
    expect(url.searchParams.get("subject")).toBe("Devis & co");
    expect(url.searchParams.get("body")).toBe("Société :\nBesoin :");
  });
});

describe("free plan", () => {
  it("allows 30 backtests and 5 AI translations a month, from 15 minutes", () => {
    expect(PLANS.free.backtestsPerMonth).toBe(30);
    expect(PLANS.free.aiPerMonth).toBe(5);
    expect(PLANS.free.minInterval).toBe("15m");
  });

  it("keeps Live and the detailed checks for the paid plans", () => {
    expect(PLANS.free.live).toBe(false);
    expect(PLANS.free.advanced).toBe(false);
    for (const p of [PLANS.trader, PLANS.advanced, PLANS.pro]) {
      expect(p.live).toBe(true);
      expect(p.advanced).toBe(true);
      expect(p.historyDays).toBeNull();
      expect(p.minInterval).toBe("1m");
    }
  });

  it("opens the journal to all, with one account and no full dashboard on the free plan", () => {
    expect([PLANS.free.journalAccounts, PLANS.free.journalDashboard]).toEqual([1, false]);
    expect([PLANS.trader, PLANS.advanced, PLANS.pro].map((p) => [p.journalAccounts, p.journalDashboard])).toEqual([
      [20, true],
      [20, true],
      [50, true],
    ]);
  });

  it("counts the journal's screenshots apart: 5 a month to try, then 150, 400 and 1 000", () => {
    expect(Object.values(PLANS).map((p) => p.journalCaptures)).toEqual([5, 150, 400, 1000]);
  });

  it("keeps 20 chart images in the free journal, then 750, 2 000 and 5 000", () => {
    expect(Object.values(PLANS).map((p) => p.journalImages)).toEqual([20, 750, 2000, 5000]);
  });

  it("keeps the prices, two months free when paid yearly", () => {
    expect(Object.values(PLANS).map((p) => [p.monthly, p.yearly])).toEqual([
      [0, 0],
      [14.9, 149],
      [29, 290],
      [49, 490],
    ]);
  });
});

describe("paid plans", () => {
  it("give more at each step up", () => {
    const keys = ["backtestsPerMonth", "aiPerMonth", "concurrentJobs", "alerts", "journalImages"] as const;
    const plans = Object.values(PLANS);
    for (const k of keys) for (let i = 1; i < plans.length; i++) expect(plans[i][k], `${plans[i].id} ${k}`).toBeGreaterThan(plans[i - 1][k]);
  });

  it("open some indicators from Trader, all of them from Avancé", () => {
    expect(Object.values(PLANS).map((p) => p.indicatorTier)).toEqual([0, 1, 2, 2]);
  });
});

describe("history limit", () => {
  it("counts 12 months back from today, at midnight UTC", () => {
    expect(new Date(earliestStart(PLANS.free, NOW) as number).toISOString()).toBe("2025-11-03T00:00:00.000Z");
    expect(historyMonths(PLANS.free)).toBe(12);
  });

  it("leaves the paid plans the whole history", () => {
    expect(earliestStart(PLANS.pro, NOW)).toBeNull();
    expect(historyMonths(PLANS.trader)).toBeNull();
    expect(clampStartDate("2018-01-01", PLANS.trader, NOW)).toBe("2018-01-01");
  });

  it("moves an older start date forward, and leaves a recent one alone", () => {
    expect(clampStartDate("2021-01-01", PLANS.free, NOW)).toBe("2025-11-03");
    expect(clampStartDate("2026-06-01", PLANS.free, NOW)).toBe("2026-06-01");
  });

  it("accepts the date it clamps to, so the server agrees with the page", () => {
    const start = clampStartDate("2021-01-01", PLANS.free, NOW);
    expect(Date.parse(`${start}T00:00:00Z`) >= (earliestStart(PLANS.free, NOW) as number)).toBe(true);
  });
});
