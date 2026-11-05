import { describe, expect, it } from "vitest";
import { failedEmail, finishedEmail } from "../backtest-email";

const test_ = { lang: "fr" as const, name: "Rebond VWAP", symbol: "BTCUSDT", interval: "1m", startDate: "2026-05-05", endDate: "2026-11-05", site: "https://backtestlab.fr" };
const results = { totalReturnPercent: -12.4, trades: 486, maxDrawdownPercent: 18.2 };

describe("finishedEmail", () => {
  it("gives the key figures and the link to the report", () => {
    const mail = finishedEmail(test_, "abc", results);
    expect(mail.subject).toBe("Ton backtest est terminé : Rebond VWAP");
    expect(mail.text).toContain("Rendement : -12,4 %");
    expect(mail.text).toContain("Baisse max : -18,2 %");
    expect(mail.text).toContain("https://backtestlab.fr/backtests/abc");
    expect(mail.html).toContain('href="https://backtestlab.fr/compte#emails"');
  });

  it("follows the language of the test", () => {
    const mail = finishedEmail({ ...test_, lang: "en" }, "abc", results);
    expect(mail.subject).toBe("Your backtest is done: Rebond VWAP");
    expect(mail.text).toContain("Return: -12.4%");
    expect(mail.text).toContain("https://backtestlab.fr/en/backtests/abc");
    expect(mail.html).toContain("/en/compte#emails");
  });

  it("escapes the name the user chose", () => {
    const mail = finishedEmail({ ...test_, name: '<img src="x">' }, "abc", results);
    expect(mail.html).not.toContain("<img");
    expect(mail.html).toContain("&lt;img src=&quot;x&quot;&gt;");
  });
});

describe("failedEmail", () => {
  it("says why and that the test doesn't count", () => {
    const mail = failedEmail(test_, "Le calcul a échoué (réf. x).");
    expect(mail.subject).toBe("Ton backtest n'a pas pu aboutir : Rebond VWAP");
    expect(mail.text).toContain("Le calcul a échoué (réf. x).");
    expect(mail.text).toContain("Ce test n'a pas été compté dans ton quota du mois.");
    expect(mail.text).toContain("https://backtestlab.fr/strategies/new");
  });
});
