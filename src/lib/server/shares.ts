import "server-only";
import { randomBytes } from "node:crypto";
import { gunzipSync } from "node:zlib";
import type { BacktestReport } from "../engine/report";
import type { BacktestConfig, Strategy } from "../strategy/schema";
import { UserError, type BacktestSummary } from "./backtests";
import { query, queryOne } from "./db";

/**
 * Public links to a backtest report. The link id is random and unguessable:
 * only people the owner gives it to can open the report. The report shows the
 * strategy and its results, never who made it.
 */

export interface Share {
  id: string;
  featured: boolean;
}

export async function shareOf(userId: string, backtestId: string): Promise<Share | null> {
  return queryOne<{ id: string; featured: boolean }>("SELECT id, featured FROM shares WHERE backtest_id = $1 AND user_id = $2", [backtestId, userId]);
}

/** Creates the backtest's link, or returns the existing one. */
export async function shareBacktest(userId: string, backtestId: string): Promise<Share> {
  const owned = await queryOne("SELECT 1 FROM backtests WHERE id = $1 AND user_id = $2", [backtestId, userId]);
  if (!owned) throw new UserError("Backtest introuvable.");
  const [row] = await query<{ id: string; featured: boolean }>(
    `INSERT INTO shares (id, backtest_id, user_id) VALUES ($1, $2, $3)
     ON CONFLICT (backtest_id) DO UPDATE SET backtest_id = EXCLUDED.backtest_id
     RETURNING id, featured`,
    [randomBytes(12).toString("base64url"), backtestId, userId],
  );
  return row;
}

export async function unshareBacktest(userId: string, backtestId: string) {
  await query("DELETE FROM shares WHERE backtest_id = $1 AND user_id = $2", [backtestId, userId]);
}

/** Makes one of the user's own shared reports the home page example, or stops it being one. */
export async function setFeatured(userId: string, backtestId: string, featured: boolean) {
  const share = await shareOf(userId, backtestId);
  if (!share) throw new UserError("Partage d'abord ce rapport.");
  if (featured) await query("UPDATE shares SET featured = (id = $1) WHERE featured OR id = $1", [share.id]);
  else await query("UPDATE shares SET featured = false WHERE id = $1", [share.id]);
}

export interface SharedSummary {
  id: string;
  featured: boolean;
  name: string;
  symbol: string;
  interval: string;
  startDate: string;
  endDate: string;
  summary: BacktestSummary;
}

/** What link previews need, without unpacking the full report. */
export async function sharedSummary(shareId: string): Promise<SharedSummary | null> {
  const r = await queryOne<{ id: string; featured: boolean; strategy: Strategy; config: BacktestConfig; summary: BacktestSummary }>(
    "SELECT s.id, s.featured, b.strategy, b.config, b.summary FROM shares s JOIN backtests b ON b.id = s.backtest_id WHERE s.id = $1",
    [shareId],
  );
  if (!r) return null;
  return {
    id: r.id,
    featured: r.featured,
    name: r.strategy.name,
    symbol: r.strategy.symbol,
    interval: r.strategy.interval,
    startDate: r.config.startDate,
    endDate: r.config.endDate,
    summary: r.summary,
  };
}

/** The full report behind a link, shaped like the owner's view without its ids. */
export async function sharedBacktest(shareId: string) {
  const r = await queryOne<{ strategy: Strategy; config: BacktestConfig; report: Buffer; created_at: Date }>(
    "SELECT b.strategy, b.config, b.report, b.created_at FROM shares s JOIN backtests b ON b.id = s.backtest_id WHERE s.id = $1",
    [shareId],
  );
  if (!r) return null;
  return {
    id: shareId,
    strategyId: null,
    strategy: r.strategy,
    config: r.config,
    report: JSON.parse(gunzipSync(r.report).toString("utf8")) as BacktestReport,
    createdAt: r.created_at.getTime(),
  };
}

export async function featuredShareId(): Promise<string | null> {
  const r = await queryOne<{ id: string }>("SELECT id FROM shares WHERE featured ORDER BY created_at DESC LIMIT 1");
  return r?.id ?? null;
}
