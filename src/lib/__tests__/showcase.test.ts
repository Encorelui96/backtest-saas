import { describe, expect, it } from "vitest";
import { PROP_FIRMS } from "../prop-firms";
import { PERIOD_TRAP, SHOWCASE } from "../showcase";

describe("home page example", () => {
  it("meets the criteria set before the tests", () => {
    expect(SHOWCASE.trades >= 100).toBe(true);
    expect(SHOWCASE.validationPercent > 0).toBe(true);
    expect(SHOWCASE.doubleCostsPercent > 0).toBe(true);
    expect(SHOWCASE.returnPercent > SHOWCASE.buyAndHoldPercent).toBe(true);
  });

  it("isn't presented as more robust than it is", () => {
    expect(SHOWCASE.checksPassed).toBe(3);
  });

  it("counts the challenge fees at the price of the rules read", () => {
    const ftmo = PROP_FIRMS.find((f) => f.id === "ftmo-2step");
    const { attempts, feesEuros } = SHOWCASE.challenge;
    expect(Math.abs(feesEuros - attempts * (ftmo?.priceValue ?? 0)) / feesEuros < 0.01).toBe(true);
  });
});

describe("home page warning about short tests", () => {
  it("compares the same end date, a short test that wins and a long one that loses", () => {
    const { short, long } = PERIOD_TRAP;
    expect(short.to).toBe(long.to);
    expect(long.from < short.from).toBe(true);
    expect(short.returnPercent > 0 && long.returnPercent < 0).toBe(true);
    expect(long.trades > short.trades).toBe(true);
  });
});
