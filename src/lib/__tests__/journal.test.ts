import { describe, expect, it } from "vitest";
import {
  balance,
  closeProblem,
  defaultPointValue,
  isWebLink,
  openProblem,
  resultAmount,
  resultR,
  riskAmount,
  riskPercent,
  sizeUnit,
  summarize,
  targetR,
  type OpenFields,
} from "../journal";

const T0 = Date.parse("2026-11-27T09:00:00Z");

// An EURUSD buy: 0.5 lot, stop 20 pips away. 1R = 0.0020 × 0.5 × 100 000 = 100 $.
const eurusd: OpenFields = { side: "long", entry: 1.08, stop: 1.078, size: 0.5, pointValue: 100_000, target: 1.084, openedAt: T0 };

describe("risk", () => {
  it("puts 1R in the account's currency", () => {
    expect(riskAmount(eurusd)).toBeCloseTo(100, 6);
    expect(riskPercent(100, 10_000)).toBeCloseTo(1, 9);
    expect(riskPercent(100, 0)).toBeNull();
  });

  it("measures the target in R", () => {
    expect(targetR(eurusd)).toBeCloseTo(2, 6);
    expect(targetR({ ...eurusd, target: null })).toBeNull();
    expect(targetR({ side: "short", entry: 100, stop: 102, target: 95 })).toBeCloseTo(2.5, 9);
  });
});

describe("result", () => {
  it("takes the fees off, in the currency and in R", () => {
    const close = { exit: 1.084, closedAt: T0 + 3_600_000, fees: 7 };
    expect(resultAmount(eurusd, close)).toBeCloseTo(193, 6);
    expect(resultR(eurusd, close)).toBeCloseTo(1.93, 6);
  });

  it("counts a sell the other way round", () => {
    const short: OpenFields = { side: "short", entry: 2400, stop: 2410, size: 1, pointValue: 100, openedAt: T0 };
    expect(resultR(short, { exit: 2415, closedAt: T0, fees: 0 })).toBeCloseTo(-1.5, 9);
    expect(resultAmount(short, { exit: 2380, closedAt: T0, fees: 0 })).toBeCloseTo(2000, 9);
  });

  it("keeps the initial stop as 1R: a stop moved to breakeven gives 0R minus the fees", () => {
    expect(resultR(eurusd, { exit: 1.08, closedAt: T0, fees: 5 })).toBeCloseTo(-0.05, 9);
  });
});

describe("checks before saving", () => {
  it("accepts a well-formed trade", () => {
    expect(openProblem(eurusd)).toBeNull();
  });

  it("refuses a stop on the wrong side or equal to the entry", () => {
    expect(openProblem({ ...eurusd, stop: 1.081 })).toBe("Pour un achat, le stop se place sous l'entrée.");
    expect(openProblem({ ...eurusd, side: "short" })).toBe("Pour une vente, le stop se place au-dessus de l'entrée.");
    expect(openProblem({ ...eurusd, stop: 1.08 })).toMatch(/différent de l'entrée/);
  });

  it("refuses a target behind the entry, a zero size or a missing price", () => {
    expect(openProblem({ ...eurusd, target: 1.07 })).toBe("Pour un achat, l'objectif se place au-dessus de l'entrée.");
    expect(openProblem({ ...eurusd, size: 0 })).toBe("La taille doit être positive.");
    expect(openProblem({ ...eurusd, entry: Number.NaN })).toMatch(/prix positifs/);
  });

  it("refuses an exit before the entry and negative fees", () => {
    expect(closeProblem(eurusd, { exit: 1.09, closedAt: T0 - 1, fees: 0 })).toBe("La sortie ne peut pas précéder l'entrée.");
    expect(closeProblem(eurusd, { exit: 1.09, closedAt: T0, fees: -1 })).toBe("Les frais ne peuvent pas être négatifs.");
    expect(closeProblem(eurusd, { exit: 1.09, closedAt: T0, fees: 0 })).toBeNull();
  });

  it("only takes web addresses as capture links", () => {
    expect(isWebLink("https://www.tradingview.com/x/AbC123/")).toBe(true);
    expect(isWebLink("javascript:alert(1)")).toBe(false);
    expect(isWebLink("capture.png")).toBe(false);
  });
});

describe("point value", () => {
  it("knows the markets where it doesn't depend on the broker", () => {
    expect(defaultPointValue("EURUSD")).toBe(100_000);
    expect(defaultPointValue("eur/usd")).toBe(100_000);
    expect(defaultPointValue("XAUUSD")).toBe(100);
    expect(defaultPointValue("BTCUSDT")).toBe(1);
    expect(defaultPointValue("USDJPY")).toBeNull();
    expect(defaultPointValue("NAS100")).toBeNull();
    expect(sizeUnit("GBPUSD")).toBe("lots");
    expect(sizeUnit("ETHUSDT")).toBe("units");
  });
});

describe("summary", () => {
  const trades = [
    { r: 2, amount: 200, currency: "USD" },
    { r: -1, amount: -100, currency: "USD" },
    { r: 1, amount: 100, currency: "USD" },
    { r: -1, amount: -100, currency: "USD" },
  ];

  it("gives the win rate, the expectancy and the profit factor in R", () => {
    const s = summarize(trades);
    expect(s.closed).toBe(4);
    expect(s.winRate).toBe(0.5);
    expect(s.expectancy).toBeCloseTo(0.25, 9);
    expect(s.profitFactor).toBeCloseTo(1.5, 9);
    expect(s.totalR).toBeCloseTo(1, 9);
    expect(s.avgWinR).toBeCloseTo(1.5, 9);
    expect(s.avgLossR).toBeCloseTo(-1, 9);
    expect([s.bestR, s.worstR]).toEqual([2, -1]);
    expect(s.amount).toEqual({ value: 100, currency: "USD" });
  });

  it("leaves out what can't be measured", () => {
    const empty = summarize([]);
    expect([empty.winRate, empty.expectancy, empty.profitFactor, empty.bestR]).toEqual([null, null, null, null]);
    expect(summarize([{ r: 1, amount: 50, currency: "USD" }]).profitFactor).toBeNull();
    expect(summarize([...trades, { r: 1, amount: 90, currency: "EUR" }]).amount).toBeNull();
  });

  it("adds the closed trades to the starting capital", () => {
    expect(balance(10_000, [200, -100])).toBe(10_100);
  });
});
