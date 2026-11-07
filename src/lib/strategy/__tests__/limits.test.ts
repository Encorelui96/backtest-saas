import { describe, expect, it } from "vitest";
import { LIMITS, StrategySchema, defaultStrategy, num, operand } from "../schema";
import { TEMPLATES } from "../templates";

const cond = (period: number) => ({ left: operand("sma", { period }), op: ">" as const, right: num(1) });

describe("strategy size limits", () => {
  it("accept every template", () => {
    for (const t of TEMPLATES) expect(StrategySchema.safeParse(t.strategy).success, t.label).toBe(true);
  });
  it("refuse a strategy that would keep the worker busy for everyone", () => {
    const tooManyConditions = { ...defaultStrategy(), entryLong: [{ conditions: Array.from({ length: LIMITS.conditionsPerGroup + 1 }, () => cond(10)) }] };
    expect(StrategySchema.safeParse(tooManyConditions).success).toBe(false);
    const tooManyGroups = { ...defaultStrategy(), entryLong: Array.from({ length: LIMITS.groups + 1 }, () => ({ conditions: [cond(10)] })) };
    expect(StrategySchema.safeParse(tooManyGroups).success).toBe(false);
    const hugePeriod = { ...defaultStrategy(), entryLong: [{ conditions: [cond(LIMITS.period + 1)] }] };
    expect(StrategySchema.safeParse(hugePeriod).success).toBe(false);
    const longName = { ...defaultStrategy(), name: "x".repeat(LIMITS.name + 1) };
    expect(StrategySchema.safeParse(longName).success).toBe(false);
  });
  it("still accept the widest reasonable strategy", () => {
    const wide = {
      ...defaultStrategy(),
      entryLong: Array.from({ length: LIMITS.groups }, () => ({ conditions: Array.from({ length: LIMITS.conditionsPerGroup }, () => cond(LIMITS.period)) })),
    };
    expect(StrategySchema.safeParse(wide).success).toBe(true);
  });
});
