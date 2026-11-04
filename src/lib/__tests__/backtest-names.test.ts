import { describe, expect, it } from "vitest";
import { BACKTEST_NAME_MAX, SEARCH_FROM, SEARCH_TO, cleanBacktestName, matchesSearch, searchPatterns } from "../backtest-names";

describe("backtest names", () => {
  it("tidies the spaces", () => {
    expect(cleanBacktestName("  BTC   4h\tfinal ")).toBe("BTC 4h final");
  });

  it("treats an empty name as going back to the strategy's name", () => {
    expect(cleanBacktestName("   ")).toBeNull();
  });

  it("keeps a name within the limit", () => {
    expect(cleanBacktestName("x".repeat(500))?.length).toBe(BACKTEST_NAME_MAX);
  });
});

describe("backtest search", () => {
  it("makes one pattern per word", () => {
    expect(searchPatterns("  MME   BTC ")).toEqual(["%mme%", "%btc%"]);
  });

  it("gives no pattern for an empty search, so nothing is filtered out", () => {
    expect(searchPatterns("   ")).toEqual([]);
    expect(searchPatterns("/")).toEqual([]);
  });

  it("ignores accents, case and slashes", () => {
    expect(searchPatterns("Stratégie EUR/USD")).toEqual(["%strategie%", "%eurusd%"]);
  });

  it("takes the user's % and _ literally", () => {
    expect(searchPatterns("100% a_b")).toEqual(["%100\\%%", "%a\\_b%"]);
    expect(searchPatterns("a\\b")).toEqual(["%a\\\\b%"]);
  });

  it("ignores the end of a long paste", () => {
    expect(searchPatterns("a b c d e f g h")).toHaveLength(6);
  });

  it("needs every word, in any order", () => {
    expect(matchesSearch("Croisement MME 20/50 BTCUSDT 4h", "4h mme")).toBe(true);
    expect(matchesSearch("Croisement MME 20/50 BTCUSDT 4h", "mme eth")).toBe(false);
  });

  it("finds a name with accents or a slash", () => {
    expect(matchesSearch("Stratégie été", "strategie ete")).toBe(true);
    expect(matchesSearch("Croisement MME 20/50", "20/50")).toBe(true);
  });

  it("matches everything without a search", () => {
    expect(matchesSearch("Croisement", "  ")).toBe(true);
  });

  it("folds SQL text like the browser, with the slash dropped", () => {
    expect(SEARCH_FROM.length).toBe(SEARCH_TO.length + 1);
    expect(SEARCH_FROM.endsWith("/")).toBe(true);
  });
});
