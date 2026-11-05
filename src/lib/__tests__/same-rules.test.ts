import { describe, expect, it } from "vitest";
import { defaultStrategy } from "@/lib/strategy/schema";
import { sameRules } from "@/lib/strategy/same-rules";

describe("sameRules", () => {
  it("ignores the name and the description", () => {
    expect(sameRules(defaultStrategy(), { ...defaultStrategy(), name: "Bonne", description: "Mon test" })).toBe(true);
  });

  it("sees another market or unit", () => {
    expect(sameRules(defaultStrategy(), { ...defaultStrategy(), symbol: "XAUUSD" })).toBe(false);
    expect(sameRules(defaultStrategy(), { ...defaultStrategy(), interval: "4h" })).toBe(false);
  });

  it("ignores what normalizing drops", () => {
    const long = { ...defaultStrategy(), direction: "long" as const };
    expect(sameRules(long, { ...long, entryShort: [{ conditions: [] }] })).toBe(true);
  });
});
