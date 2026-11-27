import { describe, expect, it } from "vitest";
import {
  ALL_DAYS,
  NO_ANSWERS,
  balance,
  closeProblem,
  defaultPointValue,
  discipline,
  isTimeZone,
  isWebLink,
  localTime,
  minutesOf,
  openProblem,
  planChecks,
  planStatus,
  proposedCost,
  resultAmount,
  resultR,
  riskAmount,
  riskPercent,
  sizeUnit,
  suggestedErrors,
  sizeForRisk,
  sizeStep,
  stopFromTicks,
  summarize,
  targetR,
  tickOf,
  ticksBetween,
  futureOf,
  type AccountPlan,
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

describe("the account's plan", () => {
  // Friday 27 November 2026, 10:00 in Paris (09:00 UTC).
  const FRI_10H = Date.parse("2026-11-27T09:00:00Z");
  const HOUR = 3_600_000;
  const plan: AccountPlan = {
    riskPct: 1,
    maxDailyLossR: 2,
    maxTradesDay: 3,
    tradingDays: 0b0011111,
    sessionStart: "09:00",
    sessionEnd: "17:30",
    timeZone: "Europe/Paris",
  };
  const trade = { openedAt: FRI_10H, setupId: "s1", riskPct: 1 };

  it("reads hours and days in the plan's time zone", () => {
    expect(localTime(FRI_10H, "Europe/Paris")).toEqual({ day: "2026-11-27", weekday: 4, minutes: 600 });
    expect(localTime(FRI_10H, "America/New_York")).toEqual({ day: "2026-11-27", weekday: 4, minutes: 240 });
    expect(minutesOf("17:30")).toBe(1050);
    expect(minutesOf("25:00")).toBeNull();
    expect(isTimeZone("Europe/Paris")).toBe(true);
    expect(isTimeZone("Mars/Olympus")).toBe(false);
  });

  it("passes a trade that follows every rule", () => {
    expect(planChecks(trade, plan, [])).toEqual([]);
  });

  it("flags a trade taken without a stop", () => {
    expect(planChecks({ ...trade, noStop: true }, plan, [])).toEqual(["no-stop"]);
  });

  it("flags a missing setup, a too big risk, a closed day and the hours", () => {
    expect(planChecks({ ...trade, setupId: null }, plan, [])).toEqual(["no-setup"]);
    expect(planChecks({ ...trade, riskPct: 1.05 }, plan, [])).toEqual([]);
    expect(planChecks({ ...trade, riskPct: 1.5 }, plan, [])).toEqual(["risk"]);
    expect(planChecks({ ...trade, openedAt: FRI_10H + 24 * HOUR }, plan, [])).toEqual(["day"]);
    expect(planChecks({ ...trade, openedAt: FRI_10H + 8 * HOUR }, plan, [])).toEqual(["hours"]);
  });

  it("handles a session across midnight and a plan without rules", () => {
    const night = { ...plan, sessionStart: "22:00", sessionEnd: "02:00", tradingDays: ALL_DAYS };
    expect(planChecks({ ...trade, openedAt: FRI_10H + 14 * HOUR }, night, [])).toEqual([]);
    expect(planChecks(trade, night, [])).toEqual(["hours"]);
    const none: AccountPlan = { riskPct: 1, maxDailyLossR: null, maxTradesDay: null, tradingDays: null, sessionStart: null, sessionEnd: null, timeZone: "UTC" };
    expect(planChecks({ ...trade, openedAt: FRI_10H + 24 * HOUR }, none, [])).toEqual([]);
  });

  it("stops the day after the max loss or the max number of trades", () => {
    const lost = [
      { openedAt: FRI_10H - 3 * HOUR, closedAt: FRI_10H - 2 * HOUR, r: -1 },
      { openedAt: FRI_10H - 2 * HOUR, closedAt: FRI_10H - HOUR, r: -1 },
    ];
    expect(planChecks(trade, plan, lost)).toEqual(["daily-loss"]);
    // The day before doesn't count, nor a loss closed after this trade opened.
    expect(planChecks(trade, plan, lost.map((o) => ({ ...o, closedAt: o.closedAt - 24 * HOUR })))).toEqual([]);
    expect(planChecks(trade, plan, [{ openedAt: FRI_10H - HOUR, closedAt: FRI_10H + HOUR, r: -3 }])).toEqual([]);
    const three = [1, 2, 3].map((h) => ({ openedAt: FRI_10H - h * 10 * 60_000, closedAt: null, r: null }));
    expect(planChecks(trade, plan, three)).toEqual(["max-trades"]);
    expect(planChecks(trade, plan, three.slice(1))).toEqual([]);
  });

  it("puts a trade in the plan only when every answer is yes and no rule broke", () => {
    const yes = { setup: true, entry: true, exit: true };
    expect(planStatus([], yes)).toBe(true);
    expect(planStatus([], NO_ANSWERS)).toBeNull();
    expect(planStatus([], { ...yes, exit: null })).toBeNull();
    expect(planStatus([], { ...yes, entry: false })).toBe(false);
    expect(planStatus(["hours"], yes)).toBe(false);
  });
});

describe("error register", () => {
  it("points to the errors the checks and answers suggest", () => {
    expect(suggestedErrors(["risk", "hours"], NO_ANSWERS)).toEqual(["E4", "E7"]);
    expect(suggestedErrors([], { setup: false, entry: true, exit: false })).toEqual(["E1", "E5", "E6"]);
    expect(suggestedErrors(["daily-loss"], NO_ANSWERS)).toEqual(["E8"]);
    // A trade without a stop points to E3, "stop moved or removed".
    expect(suggestedErrors(["no-stop"], NO_ANSWERS)).toEqual(["E3"]);
  });

  it("proposes the cost it can work out", () => {
    expect(proposedCost("E1", 2, null)).toBe(2);
    expect(proposedCost("E3", -1.6, null)).toBe(-0.6);
    expect(proposedCost("E3", -1.5000000000000568, null)).toBe(-0.5);
    expect(proposedCost("E4", -1.5, 1.9621)).toBe(-1.44);
    expect(proposedCost("E3", -0.4, null)).toBe(0);
    expect(proposedCost("E4", -1, 2)).toBe(-1);
    expect(proposedCost("E4", -1, null)).toBeNull();
    expect(proposedCost("E5", 0.5, null)).toBeNull();
    expect(proposedCost("E1", null, null)).toBeNull();
  });

  it("splits the method from the discipline", () => {
    const d = discipline([
      { planFollowed: true, r: 2, errors: [] },
      { planFollowed: true, r: -1, errors: [] },
      { planFollowed: false, r: -2, errors: [{ code: "E3", costR: -1 }, { code: "E8", costR: -2 }] },
      { planFollowed: false, r: 1, errors: [{ code: "E1", costR: 1 }] },
      { planFollowed: null, r: 0.5, errors: [] },
    ]);
    expect([d.judged, d.inPlan, d.rate]).toEqual([4, 2, 0.5]);
    expect(d.inPlanR).toBeCloseTo(0.5, 9);
    expect(d.offPlanR).toBeCloseTo(-0.5, 9);
    expect(d.register.map((x) => x.code)).toEqual(["E1", "E3", "E8"]);
    expect(d.costR).toBeCloseTo(-2, 9);
  });
});

describe("futures, ticks and sizing from the risk", () => {
  it("knows the CME micros and minis, whatever the contract month", () => {
    expect(futureOf("MGC")).toBe("MGC");
    expect(futureOf("MGCZ5")).toBe("MGC");
    expect(futureOf("mgc1!")).toBe("MGC");
    expect(futureOf("ES")).toBe("ES");
    expect(futureOf("MESH26")).toBe("MES");
    expect(futureOf("ESUSDT")).toBeNull();
    expect(futureOf("EURUSD")).toBeNull();
    // A Micro Gold point is 10 $ (1 $ a tick of 0.1); a Micro Nasdaq point 2 $.
    expect(defaultPointValue("MGC")).toBe(10);
    expect(defaultPointValue("MNQZ5")).toBe(2);
    expect(sizeUnit("MGC")).toBe("contracts");
    expect(sizeStep("MGC")).toBe(1);
    expect(sizeStep("EURUSD")).toBe(0.01);
    expect(sizeStep("BTCUSDT")).toBe(0.0001);
  });

  it("counts a stop in ticks for futures and in pips for forex", () => {
    expect(tickOf("MGC")).toEqual({ size: 0.1, unit: "ticks" });
    expect(tickOf("EURUSD")).toEqual({ size: 0.0001, unit: "pips" });
    expect(tickOf("USDJPY")).toEqual({ size: 0.01, unit: "pips" });
    expect(tickOf("BTCUSDT")).toBeNull();
    expect(stopFromTicks("short", 3324.1, 23, 0.1)).toBe(3326.4);
    expect(stopFromTicks("long", 1.08, 20, 0.0001)).toBe(1.078);
    expect(ticksBetween(3324.1, 3326.4, 0.1)).toBe(23);
  });

  it("works out the size from the risk, rounded down so the risk is never exceeded", () => {
    // 230 $ of risk, 23 ticks of Micro Gold at 1 $ each: 10 contracts.
    expect(sizeForRisk(230, 3324.1, 3326.4, 10, 1)).toBe(10);
    expect(sizeForRisk(229, 3324.1, 3326.4, 10, 1)).toBe(9);
    // 100 $ on EURUSD with a 20-pip stop: 0.5 lot.
    expect(sizeForRisk(100, 1.08, 1.078, 100_000, 0.01)).toBe(0.5);
    expect(sizeForRisk(10, 3324.1, 3326.4, 10, 1)).toBe(0);
    expect(sizeForRisk(100, 1.08, 1.08, 100_000, 0.01)).toBeNull();
  });
});
