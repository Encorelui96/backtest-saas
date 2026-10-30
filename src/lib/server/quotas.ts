import "server-only";
import { INTERVAL_MS, type Interval } from "../types";
import type { PoolClient } from "pg";
import { query, queryOne, transaction } from "./db";
import type { SessionUser } from "./auth";

export type PlanId = "free" | "trader" | "pro";

export interface Plan {
  id: PlanId;
  label: string;
  backtestsPerMonth: number;
  aiPerMonth: number;
  /** Shortest strategy timeframe allowed. */
  minInterval: Interval;
  /** Backtests running or waiting at the same time. */
  concurrentJobs: number;
  alerts: number;
}

export const PLANS: Record<PlanId, Plan> = {
  free: { id: "free", label: "Découverte", backtestsPerMonth: 5, aiPerMonth: 3, minInterval: "1h", concurrentJobs: 1, alerts: 0 },
  trader: { id: "trader", label: "Trader", backtestsPerMonth: 100, aiPerMonth: 50, minInterval: "1m", concurrentJobs: 2, alerts: 3 },
  // "Without a fixed quota" for customers, with a ceiling that protects the bill.
  pro: { id: "pro", label: "Pro", backtestsPerMonth: 1000, aiPerMonth: 400, minInterval: "1m", concurrentJobs: 3, alerts: 20 },
};

/** AI translations per minute, whatever the plan: a scripted loop must not drain the API key. */
const AI_PER_MINUTE = 5;

export class QuotaError extends Error {}

function isAdmin(email: string) {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());
}

export async function planOf(user: SessionUser): Promise<Plan> {
  if (isAdmin(user.email)) return PLANS.pro;
  const row = await queryOne<{ plan: PlanId }>("SELECT plan FROM plans WHERE user_id = $1", [user.id]);
  return PLANS[row?.plan ?? "free"] ?? PLANS.free;
}

function monthStart() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export interface Usage {
  plan: Plan;
  backtests: number;
  ai: number;
  activeJobs: number;
  resetsAt: string;
}

type Runner = <T extends Record<string, unknown>>(text: string, params: unknown[]) => Promise<T[]>;

export async function usageOf(user: SessionUser, run: Runner = query): Promise<Usage> {
  const plan = await planOf(user);
  const since = monthStart();
  const [row] = await run<{ backtests: string; ai: string; active: string }>(
    `SELECT
       (SELECT count(*) FROM jobs WHERE user_id = $1 AND kind = 'backtest' AND created_at >= $2 AND status <> 'failed') AS backtests,
       (SELECT count(*) FROM usage_events WHERE user_id = $1 AND kind = 'ai' AND created_at >= $2) AS ai,
       (SELECT count(*) FROM jobs WHERE user_id = $1 AND status IN ('queued', 'running')) AS active`,
    [user.id, since],
  );
  const next = new Date(since);
  next.setUTCMonth(next.getUTCMonth() + 1);
  return { plan, backtests: Number(row.backtests), ai: Number(row.ai), activeJobs: Number(row.active), resetsAt: next.toISOString() };
}

/**
 * Runs `fn` while holding a per-user lock, so two requests sent at the same
 * moment can't both pass a quota check before either is recorded.
 */
export async function withUserLock<T>(user: SessionUser, fn: (run: Runner, client: PoolClient) => Promise<T>): Promise<T> {
  return transaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [user.id]);
    const run: Runner = async (text, params) => (await client.query(text, params)).rows;
    return fn(run, client);
  });
}

/** Throws a QuotaError with a message for the user when a new backtest isn't allowed. */
export async function checkBacktestAllowed(user: SessionUser, interval: Interval, run: Runner = query) {
  const u = await usageOf(user, run);
  if (INTERVAL_MS[interval] < INTERVAL_MS[u.plan.minInterval]) {
    throw new QuotaError(`L'offre ${u.plan.label} teste à partir de l'unité ${u.plan.minInterval}. Passe à l'offre Trader pour le scalp en ${interval}.`);
  }
  if (u.backtests >= u.plan.backtestsPerMonth) {
    throw new QuotaError(`Tu as utilisé tes ${u.plan.backtestsPerMonth} backtests du mois (offre ${u.plan.label}). Ils reviennent le ${new Date(u.resetsAt).toLocaleDateString("fr-FR")}.`);
  }
  if (u.activeJobs >= u.plan.concurrentJobs) {
    throw new QuotaError(`${u.activeJobs} backtest${u.activeJobs > 1 ? "s sont" : " est"} déjà en cours : attends qu'il se termine.`);
  }
}

/** Checks the AI quotas and records the use. */
export async function consumeAi(user: SessionUser) {
  await withUserLock(user, async (run) => {
    const u = await usageOf(user, run);
    if (u.ai >= u.plan.aiPerMonth) {
      throw new QuotaError(`Tu as utilisé tes ${u.plan.aiPerMonth} traductions IA du mois (offre ${u.plan.label}). Le constructeur manuel reste disponible.`);
    }
    const [recent] = await run<{ n: string }>("SELECT count(*) AS n FROM usage_events WHERE user_id = $1 AND kind = 'ai' AND created_at > now() - interval '1 minute'", [user.id]);
    if (Number(recent.n) >= AI_PER_MINUTE) throw new QuotaError("Trop de traductions d'affilée : attends une minute.");
    await run("INSERT INTO usage_events (user_id, kind) VALUES ($1, 'ai')", [user.id]);
  });
}
