import "server-only";
import { MAX_HISTORY_DAYS } from "../types";
import type { BacktestConfig, Strategy } from "../strategy/schema";
import { normalizeStrategy } from "../strategy/schema";
import { warmupMs } from "../strategy/warmup";
import { buildReport, type BacktestReport } from "../engine/report";
import { getCandles } from "./candles";
import { LOCAL_USER, db, newId } from "./db";

export interface BacktestSummary {
  trades: number;
  totalReturnPercent: number;
  maxDrawdownPercent: number;
  winRate: number;
  profitFactor: number | null;
  avgR: number | null;
}

export class UserError extends Error {}

export async function runAndSaveBacktest(input: Strategy, config: BacktestConfig, strategyId: string | null) {
  const { strategy, problems } = normalizeStrategy(input);
  const blocking = problems.filter((p) => p.startsWith("Aucune condition") || p.startsWith("Symbole"));
  if (blocking.length) throw new UserError(blocking.join(" "));

  const start = Date.parse(`${config.startDate}T00:00:00Z`);
  const end = Date.parse(`${config.endDate}T23:59:59Z`);
  if (!(start < end)) throw new UserError("La date de fin doit être après la date de début.");
  const maxDays = MAX_HISTORY_DAYS[strategy.interval];
  if ((end - start) / 86_400_000 > maxDays) {
    throw new UserError(`En ${strategy.interval}, la période est limitée à ${maxDays} jours pour garder le test rapide.`);
  }

  const candles = await getCandles(strategy.symbol, strategy.interval, start - warmupMs(strategy), end);
  let startIndex = candles.t.findIndex((t) => t >= start);
  if (candles.t.length === 0 || startIndex === -1) {
    throw new UserError(`Aucune donnée pour ${strategy.symbol} en ${strategy.interval} sur cette période. Vérifie le symbole (ex. BTCUSDT).`);
  }
  if (startIndex === 0 && candles.t.length > 200) startIndex = Math.min(200, candles.t.length - 1);

  const report = buildReport(candles, startIndex, strategy, config);
  if (problems.length) report.warnings.unshift(...problems);

  const summary: BacktestSummary = {
    trades: report.metrics.trades,
    totalReturnPercent: report.metrics.totalReturnPercent,
    maxDrawdownPercent: report.metrics.maxDrawdownPercent,
    winRate: report.metrics.winRate,
    profitFactor: report.metrics.profitFactor,
    avgR: report.metrics.avgR,
  };
  const id = newId();
  db()
    .prepare(
      "INSERT INTO backtests (id, user_id, strategy_id, strategy_json, config_json, summary_json, report_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(id, LOCAL_USER, strategyId, JSON.stringify(strategy), JSON.stringify(config), JSON.stringify(summary), JSON.stringify(report), Date.now());
  return { id, summary };
}

export interface StoredBacktest {
  id: string;
  strategyId: string | null;
  strategy: Strategy;
  config: BacktestConfig;
  summary: BacktestSummary;
  report: BacktestReport;
  createdAt: number;
}

export function getBacktest(id: string): StoredBacktest | null {
  const row = db().prepare("SELECT * FROM backtests WHERE id = ? AND user_id = ?").get(id, LOCAL_USER) as Record<string, string | number> | undefined;
  if (!row) return null;
  return {
    id: row.id as string,
    strategyId: (row.strategy_id as string) ?? null,
    strategy: JSON.parse(row.strategy_json as string),
    config: JSON.parse(row.config_json as string),
    summary: JSON.parse(row.summary_json as string),
    report: JSON.parse(row.report_json as string),
    createdAt: row.created_at as number,
  };
}

export function listBacktests(strategyId?: string, limit = 50) {
  const rows = (
    strategyId
      ? db().prepare("SELECT id, strategy_id, strategy_json, config_json, summary_json, created_at FROM backtests WHERE user_id = ? AND strategy_id = ? ORDER BY created_at DESC LIMIT ?").all(LOCAL_USER, strategyId, limit)
      : db().prepare("SELECT id, strategy_id, strategy_json, config_json, summary_json, created_at FROM backtests WHERE user_id = ? ORDER BY created_at DESC LIMIT ?").all(LOCAL_USER, limit)
  ) as Record<string, string | number>[];
  return rows.map((r) => {
    const s = JSON.parse(r.strategy_json as string) as Strategy;
    const c = JSON.parse(r.config_json as string) as BacktestConfig;
    return {
      id: r.id as string,
      strategyId: (r.strategy_id as string) ?? null,
      name: s.name,
      symbol: s.symbol,
      interval: s.interval,
      startDate: c.startDate,
      endDate: c.endDate,
      summary: JSON.parse(r.summary_json as string) as BacktestSummary,
      createdAt: r.created_at as number,
    };
  });
}

export function deleteBacktest(id: string) {
  db().prepare("DELETE FROM backtests WHERE id = ? AND user_id = ?").run(id, LOCAL_USER);
}
