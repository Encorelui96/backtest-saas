/**
 * The home page's example: a real backtest, shown with its weaknesses. Figures copied from report
 * cf39dc667b874502 on 3 November 2026; the challenge figures depend on the prices in prop-firms.ts,
 * so replace them all together. Picked as the only one of 23 tests to meet the criteria set
 * beforehand, which is why the page says so: picking the best of many flatters a result.
 */
export const SHOWCASE = {
  strategy: "Croisement MME 20/50 + ADX",
  market: "BTC",
  interval: "4 h",
  from: Date.UTC(2021, 10, 4),
  to: Date.UTC(2026, 10, 3),
  trades: 111,
  returnPercent: 24.3,
  buyAndHoldPercent: 23.5,
  maxDrawdownPercent: 11.5,
  validationPercent: 13.6,
  doubleCostsPercent: 13.1,
  /** Robustness checks passed, out of 4. */
  checksPassed: 3,
  /** FTMO 2-Step, 1 % risk per trade, Monte Carlo. */
  challenge: { firm: "FTMO", passPercent: 12, attempts: 8.6, feesEuros: 3784 },
  tested: 23,
};
