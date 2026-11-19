import { describe, expect, it } from "vitest";
import { WELCOME_WINDOW_MS, welcomeDue, welcomeEmail } from "../welcome-email";

const site = "https://backtestlab.fr";

describe("welcomeEmail", () => {
  it("welcomes and links to a first backtest", () => {
    const mail = welcomeEmail({ lang: "fr", site });
    expect(mail.subject).toBe("Bienvenue sur Backtest Lab");
    expect(mail.text.startsWith("Bienvenue !")).toBe(true);
    expect(mail.text).toContain("30 backtests et 5 traductions par l'IA chaque mois, sans carte bancaire.");
    expect(mail.text).toContain("https://backtestlab.fr/strategies/new");
    expect(mail.html).toContain('href="https://backtestlab.fr/strategies/new"');
    expect(mail.text).toContain("les résultats passés ne garantissent pas les résultats futurs");
  });

  it("follows the language of the sign-up", () => {
    const mail = welcomeEmail({ lang: "en", site });
    expect(mail.subject).toBe("Welcome to Backtest Lab");
    expect(mail.text.startsWith("Welcome!")).toBe(true);
    expect(mail.text).toContain("https://backtestlab.fr/en/strategies/new");
  });
});

describe("welcomeDue", () => {
  const now = Date.UTC(2026, 10, 19);
  it("waits for a confirmed address", () => {
    expect(welcomeDue({ emailVerified: false, createdAt: now }, now)).toBe(false);
    expect(welcomeDue({ emailVerified: true, createdAt: now - 60_000 }, now)).toBe(true);
  });

  it("leaves out the accounts made before the e-mail existed", () => {
    expect(welcomeDue({ emailVerified: true, createdAt: now - WELCOME_WINDOW_MS - 1 }, now)).toBe(false);
  });
});
