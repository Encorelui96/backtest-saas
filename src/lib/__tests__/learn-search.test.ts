import { describe, expect, it } from "vitest";
import { fold, highlights, matchScore, queryWords } from "../learn/search";

describe("learn search", () => {
  it("ignores accents, case and ligatures", () => {
    expect(fold("Clôture de la Veille")).toBe("cloture de la veille");
    expect(fold("Cœur")).toBe("coeur");
    expect(queryWords("  Espérance,  GAIN ")).toEqual(["esperance", "gain"]);
    expect(queryWords("")).toEqual([]);
  });

  it("needs every word, and ranks the title first", () => {
    const words = queryWords("profit factor");
    expect(matchScore(words, "Profit factor", "Gains divisés par pertes")).toBeGreaterThan(matchScore(words, "Résultats", "Le profit factor compare gains et pertes"));
    expect(matchScore(words, "Résultats", "Le profit compte")).toBe(0);
    expect(matchScore(queryWords("rsi"), "RSI")).toBeGreaterThan(matchScore(queryWords("rsi"), "Stoch RSI %K"));
  });

  it("finds a word inside another, but prefers word starts", () => {
    const words = queryWords("moy");
    expect(matchScore(words, "Moyenne mobile (MM)")).toBeGreaterThan(0);
    expect(matchScore(queryWords("ma"), "MACD")).toBeGreaterThan(matchScore(queryWords("ma"), "Gamma"));
  });

  it("marks where the words are", () => {
    expect(highlights("Bougie la plus étroite", queryWords("etroite bougie"))).toEqual([
      [0, 6],
      [15, 22],
    ]);
    expect(highlights("aaa", ["a", "aa"])).toEqual([[0, 3]]);
  });
});
