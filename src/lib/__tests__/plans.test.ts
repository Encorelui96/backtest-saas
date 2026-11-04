import { describe, expect, it } from "vitest";
import { ENTERPRISE, PLANS, clampStartDate, earliestStart, historyMonths, quoteHref } from "../plans";

const NOW = Date.parse("2026-11-03T16:30:00Z");

describe("enterprise offer", () => {
  it("stays outside the plans, so quotas and billing never see it", () => {
    expect(Object.keys(PLANS)).toEqual(["free", "trader", "pro"]);
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
    for (const p of [PLANS.trader, PLANS.pro]) {
      expect(p.live).toBe(true);
      expect(p.advanced).toBe(true);
      expect(p.historyDays).toBeNull();
      expect(p.minInterval).toBe("1m");
    }
  });

  it("keeps the prices", () => {
    expect([PLANS.trader.monthly, PLANS.trader.yearly, PLANS.pro.monthly, PLANS.pro.yearly]).toEqual([15, 150, 39, 390]);
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
