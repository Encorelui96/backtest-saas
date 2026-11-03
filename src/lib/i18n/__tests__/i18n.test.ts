import { describe, expect, it } from "vitest";
import { localePath, switchPath, translate, translateText } from "..";
import { EN } from "../en";

describe("translate", () => {
  it("looks the French text up and fills the values", () => {
    expect(translate("fr", "{0} backtests par mois", [20])).toBe("20 backtests par mois");
    expect(translate("en", "{0} backtests par mois", [20])).toBe("20 backtests a month");
  });

  it("falls back to French for a text missing from the dictionary", () => {
    expect(translate("en", "Texte sans traduction")).toBe("Texte sans traduction");
  });

  it("formats dates, prices and translatable values", () => {
    const text = "Tu as utilisé tes {0} backtests du mois (offre {1:t}). Ils reviennent le {2:date}, ou recharge tout de suite : {3:t} pour {4:euros}.";
    const values = [20, "Découverte", "2026-12-01T00:00:00Z", "+100 backtests", 5];
    expect(translate("fr", text, values)).toBe(
      "Tu as utilisé tes 20 backtests du mois (offre Découverte). Ils reviennent le 1 décembre, ou recharge tout de suite : +100 backtests pour 5 €.",
    );
    expect(translate("en", text, values)).toBe(
      "You've used your 20 backtests for the month (Starter plan). They come back on December 1, or top up right now: +100 backtests for €5.",
    );
  });
});

describe("translateText", () => {
  it("translates a French text saved already filled in", () => {
    expect(translateText("en", "Seulement 12 trades : trop peu pour conclure. Allonge la période ou assouplis les règles.")).toBe(
      "Only 12 trades: too few to conclude. Lengthen the period or loosen the rules.",
    );
    expect(translateText("en", "3 bougies manquantes dans les données (2 trous, souvent une panne de la plateforme) : les indicateurs enjambent ces trous.")).toBe(
      "3 candles missing from the data (2 gaps, often an exchange outage): the indicators step over these gaps.",
    );
    expect(translateText("en", "Période d'étude (70 %)")).toBe("Study period (70%)");
    expect(translateText("en", "Durée max 16 bougies")).toBe("Max duration 16 candles");
    expect(translateText("fr", "Période d'étude (70 %)")).toBe("Période d'étude (70 %)");
  });
});

describe("dictionary", () => {
  it("keeps every placeholder of the French text", () => {
    const placeholders = (s: string) => [...new Set(s.match(/\{\d+(?::\w+)?\}|\{email\}/g) ?? [])].sort();
    // English can drop a French-only value (a plural ending, a gendered pronoun) but never invent one.
    for (const [fr, en] of Object.entries(EN)) for (const p of placeholders(en)) expect(placeholders(fr), `${fr} → ${en}`).toContain(p);
  });
});

describe("addresses", () => {
  it("puts English pages under /en and keeps French ones as they were", () => {
    expect(localePath("fr", "/tarifs")).toBe("/tarifs");
    expect(localePath("en", "/tarifs")).toBe("/en/tarifs");
    expect(localePath("en", "/")).toBe("/en");
    expect(localePath("en", "/api/me")).toBe("/api/me");
    expect(localePath("en", "/strategies/new?goal=prop")).toBe("/en/strategies/new?goal=prop");
    expect(switchPath("/en/tarifs", "fr")).toBe("/tarifs");
    expect(switchPath("/tarifs", "en")).toBe("/en/tarifs");
  });
});
