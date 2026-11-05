import "server-only";
import { UserError } from "./errors";

export { UserError };
import { gunzipSync, gzipSync } from "node:zlib";
import { MAX_HISTORY_DAYS, type Candles, type Interval } from "../types";
import type { BacktestConfig, Strategy } from "../strategy/schema";
import { normalizeStrategy } from "../strategy/schema";
import { higherTimeframeWarmupMs, higherTimeframes, warmupMs } from "../strategy/warmup";
import { buildReport, type BacktestReport } from "../engine/report";
import { BACKTEST_LIST_LIMIT, SEARCH_FROM, SEARCH_TO, cleanBacktestName, searchPatterns } from "../backtest-names";
import { getCandles } from "./candles";
import { newId, query, queryOne } from "./db";

export interface BacktestSummary {
  trades: number;
  totalReturnPercent: number;
  maxDrawdownPercent: number;
  winRate: number;
  profitFactor: number | null;
  avgR: number | null;
}

/** Checks a request before it is queued, so the user hears about a bad period right away. */
export function validateBacktest(input: Strategy, config: BacktestConfig) {
  const { strategy, problems } = normalizeStrategy(input);
  const blocking = problems.filter((p) => p.startsWith("Aucune condition") || p.startsWith("Symbole"));
  if (blocking.length) throw blocking.length === 1 ? new UserError(blocking[0]) : new UserError("{0:t} {1:t}", blocking);
  const start = Date.parse(`${config.startDate}T00:00:00Z`);
  const end = Date.parse(`${config.endDate}T23:59:59Z`);
  if (!(start < end)) throw new UserError("La date de fin doit être après la date de début.");
  const maxDays = MAX_HISTORY_DAYS[strategy.interval];
  if ((end - start) / 86_400_000 > maxDays) {
    throw new UserError("En {0}, la période est limitée à {1} jours pour garder le test rapide.", [strategy.interval, maxDays]);
  }
  return { strategy, problems, start, end };
}

/** Downloads the data and computes the full report. Runs in the worker. */
export async function computeBacktest(input: Strategy, config: BacktestConfig, onProgress: (share: number, label: string) => Promise<void>) {
  const { strategy, problems, start, end } = validateBacktest(input, config);
  await onProgress(0.02, "Chargement des cours");
  const candles = await getCandles(strategy.symbol, strategy.interval, start - warmupMs(strategy), end);
  let startIndex = candles.t.findIndex((t) => t >= start);
  if (candles.t.length === 0 || startIndex === -1) {
    throw new UserError("Aucune donnée pour {0} en {1} sur cette période. Vérifie le symbole (ex. BTCUSDT).", [strategy.symbol, strategy.interval]);
  }
  if (startIndex === 0 && candles.t.length > 200) startIndex = Math.min(200, candles.t.length - 1);
  const higher: Partial<Record<Interval, Candles>> = {};
  for (const tf of higherTimeframes(strategy)) {
    higher[tf] = await getCandles(strategy.symbol, tf, start - higherTimeframeWarmupMs(strategy, tf), end);
  }
  await onProgress(0.2, "Simulation des trades");
  const report = await buildReport(candles, startIndex, strategy, config, higher, (d) =>
    onProgress(0.2 + d * 0.75, d < 0.25 ? "Simulation des trades" : "Tests de robustesse"),
  );
  if (problems.length) report.warnings.unshift(...problems);
  const summary: BacktestSummary = {
    trades: report.metrics.trades,
    totalReturnPercent: report.metrics.totalReturnPercent,
    maxDrawdownPercent: report.metrics.maxDrawdownPercent,
    winRate: report.metrics.winRate,
    profitFactor: report.metrics.profitFactor,
    avgR: report.metrics.avgR,
  };
  return { strategy, report, summary };
}

export async function saveBacktest(
  userId: string,
  strategyId: string | null,
  strategy: Strategy,
  config: BacktestConfig,
  summary: BacktestSummary,
  report: BacktestReport,
): Promise<string> {
  const id = newId();
  await query("INSERT INTO backtests (id, user_id, strategy_id, strategy, config, summary, report) VALUES ($1, $2, $3, $4, $5, $6, $7)", [
    id,
    userId,
    strategyId,
    JSON.stringify(strategy),
    JSON.stringify(config),
    JSON.stringify(summary),
    gzipSync(JSON.stringify(report)),
  ]);
  return id;
}

export interface StoredBacktest {
  id: string;
  /** The name the owner gave it, or its strategy's. */
  name: string;
  strategyId: string | null;
  strategy: Strategy;
  config: BacktestConfig;
  summary: BacktestSummary;
  report: BacktestReport;
  createdAt: number;
}

export async function getBacktest(userId: string, id: string): Promise<StoredBacktest | null> {
  const r = await queryOne<{ id: string; name: string | null; strategy_id: string | null; strategy: Strategy; config: BacktestConfig; summary: BacktestSummary; report: Buffer; created_at: Date }>(
    "SELECT * FROM backtests WHERE id = $1 AND user_id = $2",
    [id, userId],
  );
  if (!r) return null;
  return {
    id: r.id,
    name: r.name ?? r.strategy.name,
    strategyId: r.strategy_id,
    strategy: r.strategy,
    config: r.config,
    summary: r.summary,
    report: JSON.parse(gunzipSync(r.report).toString("utf8")),
    createdAt: r.created_at.getTime(),
  };
}

/** What a search reads, folded like searchPatterns(). */
const SEARCH_TEXT = `translate(lower(COALESCE(name, strategy->>'name') || ' ' || (strategy->>'symbol') || ' ' || (strategy->>'interval')), '${SEARCH_FROM}', '${SEARCH_TO}')`;

export async function listBacktests(userId: string, { strategyId, search = "" }: { strategyId?: string; search?: string } = {}) {
  const rows = await query<{ id: string; label: string; strategy_id: string | null; strategy: Strategy; config: BacktestConfig; summary: BacktestSummary; created_at: Date }>(
    `SELECT id, COALESCE(name, strategy->>'name') AS label, strategy_id, strategy, config, summary, created_at FROM backtests
     WHERE user_id = $1 AND ($2::text IS NULL OR strategy_id = $2) AND ${SEARCH_TEXT} LIKE ALL ($3::text[])
     ORDER BY created_at DESC LIMIT $4`,
    [userId, strategyId ?? null, searchPatterns(search), BACKTEST_LIST_LIMIT],
  );
  return rows.map((r) => ({
    id: r.id,
    strategyId: r.strategy_id,
    name: r.label,
    symbol: r.strategy.symbol,
    interval: r.strategy.interval,
    startDate: r.config.startDate,
    endDate: r.config.endDate,
    summary: r.summary,
    createdAt: r.created_at.getTime(),
  }));
}

/** Names a result, or gives it its strategy's name back. Returns the name to show, null if it isn't this user's. */
export async function renameBacktest(userId: string, id: string, name: string) {
  const r = await queryOne<{ label: string }>("UPDATE backtests SET name = $3 WHERE id = $1 AND user_id = $2 RETURNING COALESCE(name, strategy->>'name') AS label", [
    id,
    userId,
    cleanBacktestName(name),
  ]);
  return r?.label ?? null;
}

export async function linkBacktest(userId: string, id: string, strategyId: string) {
  await query("UPDATE backtests SET strategy_id = $3 WHERE id = $1 AND user_id = $2", [id, userId, strategyId]);
}

export async function deleteBacktest(userId: string, id: string) {
  await query("DELETE FROM backtests WHERE id = $1 AND user_id = $2", [id, userId]);
}
