import { describe, expect, it } from "vitest";
import { requestedMarket } from "../markets";

describe("requestedMarket", () => {
  it("counts one market however it is written", () => {
    for (const text of ["gbp/nzd", " GBP NZD ", "GBP-NZD", "GbpNzd"]) expect(requestedMarket(text)).toBe("GBPNZD");
  });

  it("keeps names that aren't pairs readable", () => {
    expect(requestedMarket("S&P 500")).toBe("S&P500");
    expect(requestedMarket("pétrole")).toBe("PÉTROLE");
  });
});
