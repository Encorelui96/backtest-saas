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

/**
 * The home page's warning about short tests: one strategy, the same rules and costs, two start dates.
 * Figures copied from reports 755e400f0e044ec8 (2 years) and 68b4e32ff55a4fb0 (6 years) on 27 November 2026:
 * gold 15 min, sells only, 0.0035 % fees per side, 0.01 % spread, 0.005 % slippage, 1 % risk per trade.
 */
export const PERIOD_TRAP = {
  strategy: "Cassure du range asiatique sur l'or",
  market: "XAUUSD",
  interval: "15 min",
  short: { from: Date.UTC(2024, 10, 27), to: Date.UTC(2026, 10, 27), returnPercent: 20.5, trades: 250, maxDrawdownPercent: 17.6 },
  long: { from: Date.UTC(2020, 10, 18), to: Date.UTC(2026, 10, 27), returnPercent: -59.6, trades: 926, maxDrawdownPercent: 69.2 },
  /** Calendar years 2021 to 2026 that lost money, out of 6. */
  losingYears: 4,
};
