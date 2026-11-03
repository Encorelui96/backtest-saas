import { describe, expect, it } from "vitest";
import { BEGINNER_TABS, firstStepsDone, nextStep } from "../next-step";

describe("nextStep", () => {
  it("says nothing can be concluded under 30 trades, even on a gain", () => {
    expect(nextStep(29, 50, true)).toBe("few-trades");
  });

  it("suggests another template for a losing strategy", () => {
    expect(nextStep(30, 0, true)).toBe("losing");
    expect(nextStep(120, -12, false)).toBe("losing");
  });

  it("points a fragile gain to the robustness checks", () => {
    expect(nextStep(120, 12, false)).toBe("fragile");
  });

  it("points a solid gain to the challenge", () => {
    expect(nextStep(120, 12, true)).toBe("solid");
  });
});

describe("beginner tabs", () => {
  it("keeps the essentials and leaves the rest to expert mode", () => {
    expect([...BEGINNER_TABS]).toEqual(["overview", "trades", "prop"]);
  });
});

describe("firstStepsDone", () => {
  const none = { strategies: 0, backtests: 0, verdictSeen: false, challengeSeen: false };

  it("starts with nothing ticked", () => {
    expect(firstStepsDone(none)).toEqual({ model: false, run: false, verdict: false, challenge: false });
  });

  it("ticks the template once a strategy exists, and the test once it ran", () => {
    expect(firstStepsDone({ ...none, strategies: 1 })).toEqual({ model: true, run: false, verdict: false, challenge: false });
    expect(firstStepsDone({ ...none, backtests: 1 })).toEqual({ model: true, run: true, verdict: false, challenge: false });
  });

  it("ticks the verdict and the challenge when they were opened", () => {
    expect(firstStepsDone({ ...none, backtests: 1, verdictSeen: true, challengeSeen: true })).toEqual({ model: true, run: true, verdict: true, challenge: true });
  });

  it("doesn't ask someone with several tests to read a verdict again", () => {
    expect(firstStepsDone({ ...none, backtests: 3 }).verdict).toBe(true);
  });
});
