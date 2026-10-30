import type { BacktestRun, Trade } from "./backtest";

export interface Metrics {
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalReturnPercent: number;
  cagrPercent: number | null;
  maxDrawdownPercent: number;
  profitFactor: number | null;
  avgTradePercent: number;
  avgWinPercent: number;
  avgLossPercent: number;
  avgR: number | null;
  avgWinR: number | null;
  avgLossR: number | null;
  expectancyR: number | null;
  sharpe: number | null;
  sortino: number | null;
  avgBars: number;
  exposurePercent: number;
  longestLosingStreak: number;
  bestTradePercent: number;
  worstTradePercent: number;
  tradesPerMonth: number;
  totalCosts: number;
  buyAndHoldPercent: number;
  days: number;
}

const DAY = 86_400_000;

export function computeMetrics(run: BacktestRun, startIndex = 0): Metrics {
  const trades = run.trades;
  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl <= 0);
  const grossWin = sum(wins.map((t) => t.pnl));
  const grossLoss = -sum(losses.map((t) => t.pnl));
  const rs = trades.map((t) => t.r).filter((r): r is number => r !== null);
  const hasR = rs.length === trades.length && trades.length > 0;

  const eq = run.equity;
  const times = run.candlesTime;
  const n = eq.length;
  let peak = run.initialCapital;
  let maxDd = 0;
  for (let i = startIndex; i < n; i++) {
    peak = Math.max(peak, eq[i]);
    if (peak > 0) maxDd = Math.max(maxDd, (peak - eq[i]) / peak);
  }

  const daily = dailyReturns(run, startIndex);
  const mean = avg(daily);
  const sd = stdev(daily);
  const downside = Math.sqrt(avg(daily.map((r) => Math.min(0, r) ** 2)));
  const days = n > startIndex ? (times[n - 1] - times[startIndex]) / DAY + 1 : 0;
  const years = days / 365.25;
  const finalRatio = run.finalEquity / run.initialCapital;

  let streak = 0;
  let longest = 0;
  for (const t of trades) {
    streak = t.pnl <= 0 ? streak + 1 : 0;
    longest = Math.max(longest, streak);
  }
  const barsInMarket = sum(trades.map((t) => t.bars));

  return {
    trades: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRate: trades.length ? (wins.length / trades.length) * 100 : 0,
    totalReturnPercent: (finalRatio - 1) * 100,
    cagrPercent: years >= 0.5 && finalRatio > 0 ? (finalRatio ** (1 / years) - 1) * 100 : null,
    maxDrawdownPercent: maxDd * 100,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? null : 0,
    avgTradePercent: avg(trades.map((t) => t.pnlPercent)),
    avgWinPercent: avg(wins.map((t) => t.pnlPercent)),
    avgLossPercent: avg(losses.map((t) => t.pnlPercent)),
    avgR: hasR ? avg(rs) : null,
    avgWinR: hasR ? avg(wins.map((t) => t.r!)) : null,
    avgLossR: hasR ? avg(losses.map((t) => t.r!)) : null,
    expectancyR: hasR ? avg(rs) : null,
    sharpe: sd > 0 ? (mean / sd) * Math.sqrt(365) : null,
    sortino: downside > 0 ? (mean / downside) * Math.sqrt(365) : null,
    avgBars: avg(trades.map((t) => t.bars)),
    exposurePercent: n > startIndex ? (barsInMarket / (n - startIndex)) * 100 : 0,
    longestLosingStreak: longest,
    bestTradePercent: trades.length ? Math.max(...trades.map((t) => t.pnlPercent)) : 0,
    worstTradePercent: trades.length ? Math.min(...trades.map((t) => t.pnlPercent)) : 0,
    tradesPerMonth: days > 0 ? trades.length / (days / 30.44) : 0,
    totalCosts: sum(trades.map((t) => t.costs)),
    buyAndHoldPercent: run.buyAndHoldPercent,
    days,
  };
}

/** Close-to-close daily returns of the mark-to-market equity (crypto trades every day). */
export function dailyReturns(run: BacktestRun, startIndex = 0): number[] {
  const out: number[] = [];
  let lastDay = -1;
  let lastEquity = run.initialCapital;
  let dayEquity = run.initialCapital;
  for (let i = startIndex; i < run.equity.length; i++) {
    const d = Math.floor(run.candlesTime[i] / DAY);
    if (d !== lastDay && lastDay !== -1) {
      out.push(dayEquity / lastEquity - 1);
      lastEquity = dayEquity;
    }
    lastDay = d;
    dayEquity = run.equity[i];
  }
  if (lastDay !== -1) out.push(dayEquity / lastEquity - 1);
  return out;
}

export function periodBreakdown(trades: Trade[], period: "year" | "month") {
  const map = new Map<string, { key: string; trades: number; pnlPercent: number; wins: number; r: number }>();
  for (const t of trades) {
    const d = new Date(t.exitTime);
    const key = period === "year" ? `${d.getUTCFullYear()}` : `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const row = map.get(key) ?? { key, trades: 0, pnlPercent: 0, wins: 0, r: 0 };
    row.trades++;
    row.wins += t.pnl > 0 ? 1 : 0;
    // Compounded return of the period.
    row.pnlPercent = ((1 + row.pnlPercent / 100) * (1 + t.pnlPercent / 100) - 1) * 100;
    row.r += t.r ?? 0;
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
}

/** At most `max` points of the equity curve, keeping each bucket's lowest point so drawdowns stay visible. */
export function downsampleEquity(run: BacktestRun, startIndex: number, max = 1500) {
  const n = run.equity.length - startIndex;
  if (n <= 0) return [];
  const step = Math.max(1, Math.ceil(n / max));
  const out: { t: number; equity: number }[] = [];
  for (let s = startIndex; s < run.equity.length; s += step) {
    let lowIdx = s;
    const end = Math.min(run.equity.length, s + step);
    for (let i = s; i < end; i++) if (run.equity[i] < run.equity[lowIdx]) lowIdx = i;
    const lastIdx = end - 1;
    if (lowIdx !== lastIdx) out.push({ t: run.candlesTime[lowIdx], equity: run.equity[lowIdx] });
    out.push({ t: run.candlesTime[lastIdx], equity: run.equity[lastIdx] });
  }
  return out;
}

export function sum(xs: number[]) {
  let s = 0;
  for (const x of xs) s += x;
  return s;
}

export function avg(xs: number[]) {
  return xs.length ? sum(xs) / xs.length : 0;
}

export function stdev(xs: number[]) {
  if (xs.length < 2) return 0;
  const m = avg(xs);
  return Math.sqrt(sum(xs.map((x) => (x - m) ** 2)) / (xs.length - 1));
}

export function percentile(sorted: number[], p: number) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
  return sorted[idx];
}
