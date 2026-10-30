import { INTERVAL_MS, type Candles, type Interval } from "../types";
import type { BacktestConfig, Strategy } from "../strategy/schema";
import { runBacktest, type Trade } from "./backtest";
import { SeriesContext } from "./evaluate";
import { computeMetrics, downsampleEquity, periodBreakdown, type Metrics } from "./metrics";
import {
  type Progress,
  costStress,
  edgeTest,
  inOutSample,
  monteCarlo,
  sensitivity,
  type EdgeTest,
  type MonteCarloResult,
  type SensitivityRow,
  type SplitStats,
} from "./robustness";

export interface BacktestReport {
  metrics: Metrics;
  trades: Trade[];
  equity: { t: number; equity: number }[];
  byYear: ReturnType<typeof periodBreakdown>;
  byMonth: ReturnType<typeof periodBreakdown>;
  skippedSignals: number;
  period: { from: number; to: number; bars: number };
  robustness: {
    monteCarlo: MonteCarloResult | null;
    edge: EdgeTest | null;
    split: SplitStats[];
    sensitivity: { rows: SensitivityRow[]; profitableShare: number };
    doubleCosts: ReturnType<typeof costStress>;
  };
  warnings: string[];
}

/**
 * Runs the backtest and every robustness check. `startIndex` is the first
 * tradable bar; earlier bars warm indicators up. `higher` holds real candles
 * for the higher timeframes the rules read. `onProgress` gets the share done
 * between steps, which also lets the process answer other work meanwhile.
 */
export async function buildReport(
  candles: Candles,
  startIndex: number,
  strategy: Strategy,
  config: BacktestConfig,
  higher: Partial<Record<Interval, Candles>> = {},
  onProgress?: Progress,
): Promise<BacktestReport> {
  const ctx = new SeriesContext(candles, strategy.interval, strategy.timezone);
  for (const [tf, htf] of Object.entries(higher)) ctx.attachHigherTimeframe(tf as Interval, htf);
  const run = runBacktest(candles, strategy, config, ctx, startIndex);
  const metrics = computeMetrics(run, startIndex);
  await onProgress?.(0.15);
  const monteCarloResult = monteCarlo(run.trades);
  const edge = edgeTest(run.trades);
  await onProgress?.(0.25);
  // Parameter variants are most of the work: they get 25 % → 95 %.
  const sens = await sensitivity(candles, strategy, config, startIndex, ctx, (d) => onProgress?.(0.25 + d * 0.7));
  const doubleCosts = costStress(candles, strategy, config, startIndex, ctx);
  await onProgress?.(1);
  const from = candles.t[startIndex];
  const to = candles.t[candles.t.length - 1];

  const warnings: string[] = [];
  if (metrics.trades < 30) warnings.push(`Seulement ${metrics.trades} trades : trop peu pour conclure. Allonge la période ou assouplis les règles.`);
  if (metrics.days < 180) warnings.push("Moins de 6 mois de données : le résultat peut dépendre d'un seul type de marché.");
  if (config.feePercent === 0 && config.spreadPercent === 0 && config.slippagePercent === 0) warnings.push("Aucun frais : le résultat réel sera moins bon.");
  if (metrics.trades > 0 && metrics.losses === 0) warnings.push("Aucun trade perdant : c'est presque toujours le signe d'une erreur ou d'un échantillon trop court.");
  const gaps = countGaps(candles, startIndex, INTERVAL_MS[strategy.interval]);
  if (gaps.missing > 0) {
    warnings.push(
      `${gaps.missing} bougie${gaps.missing > 1 ? "s" : ""} manquante${gaps.missing > 1 ? "s" : ""} dans les données (${gaps.holes} trou${gaps.holes > 1 ? "s" : ""}, souvent une panne de la plateforme) : les indicateurs enjambent ces trous.`,
    );
  }
  if (run.trades.some((t) => t.exitReason === "liquidation")) warnings.push("Au moins un trade a été liquidé : la perte a atteint tout le capital engagé. Baisse le levier ou le risque.");
  if (run.skippedSignals > 0) warnings.push(`${run.skippedSignals} signaux ignorés (stop du mauvais côté du prix ou capital épuisé).`);

  return {
    metrics,
    trades: run.trades,
    equity: downsampleEquity(run, startIndex),
    byYear: periodBreakdown(run.trades, "year"),
    byMonth: periodBreakdown(run.trades, "month"),
    skippedSignals: run.skippedSignals,
    period: { from, to, bars: candles.t.length - startIndex },
    robustness: {
      monteCarlo: monteCarloResult,
      edge,
      split: inOutSample(run.trades, from, to),
      sensitivity: sens,
      doubleCosts,
    },
    warnings,
  };
}

function countGaps(c: Candles, from: number, barMs: number) {
  let holes = 0;
  let missing = 0;
  for (let i = Math.max(1, from); i < c.t.length; i++) {
    const step = Math.round((c.t[i] - c.t[i - 1]) / barMs);
    if (step > 1) {
      holes++;
      missing += step - 1;
    }
  }
  return { holes, missing };
}
