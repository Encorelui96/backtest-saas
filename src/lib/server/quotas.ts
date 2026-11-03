import "server-only";
import { INTERVAL_MS, type Interval } from "../types";
import type { PoolClient } from "pg";
import { PACK_BY_ID, PLANS, type CreditKind, type PackId, type Plan, type PlanId } from "../plans";
import { query, queryOne, transaction } from "./db";
import type { SessionUser } from "./auth";
import { UserError } from "./errors";

export { PLANS, type Plan, type PlanId };

/** AI translations per minute, whatever the plan: a scripted loop must not drain the API key. */
const AI_PER_MINUTE = 5;
/** AI translations a day for the whole site: a crowd of new accounts, each with its free quota, can't run up the bill. */
const AI_DAILY_CAP = Number(process.env.AI_DAILY_CAP) > 0 ? Number(process.env.AI_DAILY_CAP) : 200;

export class QuotaError extends UserError {
  constructor(
    text: string,
    values: readonly unknown[] = [],
    /** The recharge that would lift this limit, offered next to the message. */
    readonly recharge?: PackId,
  ) {
    super(text, values);
  }
}

const listOf = (name: string) =>
  (process.env[name] ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);

/**
 * The site's administrators: an account listed by id in ADMIN_USER_IDS, or one whose address is in
 * ADMIN_EMAILS and confirmed. An unconfirmed address proves nothing: whoever registered it first would be admin.
 */
export function isAdmin(user: Pick<SessionUser, "id" | "email" | "emailVerified">) {
  if (listOf("ADMIN_USER_IDS").includes(user.id)) return true;
  return user.emailVerified && listOf("ADMIN_EMAILS").some((e) => e.toLowerCase() === user.email.toLowerCase());
}

export async function planOf(user: SessionUser): Promise<Plan> {
  if (isAdmin(user)) return PLANS.pro;
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
  /** Recharge credits left, used once the monthly quota is spent. */
  credits: Record<CreditKind, number>;
}

type Runner = <T extends Record<string, unknown>>(text: string, params: unknown[]) => Promise<T[]>;

export async function usageOf(user: SessionUser, run: Runner = query): Promise<Usage> {
  const plan = await planOf(user);
  const since = monthStart();
  const [row] = await run<{ backtests: string; ai: string; active: string; credit_ai: string; credit_backtest: string }>(
    `SELECT
       (SELECT count(*) FROM jobs WHERE user_id = $1 AND kind = 'backtest' AND created_at >= $2 AND status <> 'failed') AS backtests,
       (SELECT count(*) FROM usage_events WHERE user_id = $1 AND kind = 'ai' AND created_at >= $2) AS ai,
       (SELECT count(*) FROM jobs WHERE user_id = $1 AND status IN ('queued', 'running')) AS active,
       (SELECT coalesce(sum(delta), 0) FROM credit_ledger WHERE user_id = $1 AND kind = 'ai') AS credit_ai,
       (SELECT coalesce(sum(delta), 0) FROM credit_ledger WHERE user_id = $1 AND kind = 'backtest') AS credit_backtest`,
    [user.id, since],
  );
  const next = new Date(since);
  next.setUTCMonth(next.getUTCMonth() + 1);
  return {
    plan,
    backtests: Number(row.backtests),
    ai: Number(row.ai),
    activeJobs: Number(row.active),
    resetsAt: next.toISOString(),
    credits: { ai: Math.max(0, Number(row.credit_ai)), backtest: Math.max(0, Number(row.credit_backtest)) },
  };
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

function quotaSpent(text: string, count: number, u: Usage, pack: PackId) {
  const p = PACK_BY_ID[pack];
  return new QuotaError(text, [count, u.plan.label, u.resetsAt, p.label, p.price], pack);
}

/**
 * Throws a QuotaError with a message for the user when a new backtest isn't
 * allowed. Past the monthly quota, a recharge credit pays for it: `useCredit`
 * then tells the caller to record it with spendCredit once the job exists.
 */
export async function checkBacktestAllowed(user: SessionUser, interval: Interval, run: Runner = query): Promise<{ useCredit: boolean }> {
  const u = await usageOf(user, run);
  if (INTERVAL_MS[interval] < INTERVAL_MS[u.plan.minInterval]) {
    throw new QuotaError("L'offre {0:t} teste à partir de l'unité {1}. Passe à l'offre Trader pour le scalp en {2}.", [u.plan.label, u.plan.minInterval, interval]);
  }
  if (u.activeJobs >= u.plan.concurrentJobs) {
    throw new QuotaError(u.activeJobs > 1 ? "{0} backtests sont déjà en cours : attends qu'ils se terminent." : "1 backtest est déjà en cours : attends qu'il se termine.", [u.activeJobs]);
  }
  if (u.backtests < u.plan.backtestsPerMonth) return { useCredit: false };
  if (u.credits.backtest > 0) return { useCredit: true };
  throw quotaSpent("Tu as utilisé tes {0} backtests du mois (offre {1:t}). Ils reviennent le {2:date}, ou recharge tout de suite : {3:t} pour {4:euros}.", u.plan.backtestsPerMonth, u, "bt100");
}

/** Records the use of one recharge credit (`reason` names what it paid for). */
export async function spendCredit(run: Runner, userId: string, kind: CreditKind, reason: string) {
  await run("INSERT INTO credit_ledger (user_id, kind, delta, reason) VALUES ($1, $2, -1, $3)", [userId, kind, reason]);
}

/** Adds a pack's credits, or a manual grant from an admin. */
export async function grantCredits(userId: string, credits: Partial<Record<CreditKind, number>>, reason: string) {
  for (const [kind, n] of Object.entries(credits)) {
    if (n && n > 0) await query("INSERT INTO credit_ledger (user_id, kind, delta, reason) VALUES ($1, $2, $3, $4)", [userId, kind, n, reason]);
  }
}

/** Gives back the credit a failed backtest used, once. */
export async function refundBacktestCredit(jobId: string) {
  await query(
    `INSERT INTO credit_ledger (user_id, kind, delta, reason)
     SELECT user_id, 'backtest', 1, 'refund:' || $1 FROM credit_ledger WHERE reason = 'job:' || $1 AND delta < 0
     ON CONFLICT DO NOTHING`,
    [jobId],
  );
}

/** Checks the AI quotas and records the use. Returns the event's id, to attach the tokens once the call is done. */
export async function consumeAi(user: SessionUser): Promise<string> {
  return withUserLock(user, async (run) => {
    const u = await usageOf(user, run);
    const useCredit = u.ai >= u.plan.aiPerMonth;
    if (useCredit && u.credits.ai === 0) throw quotaSpent("Tu as utilisé tes {0} traductions par l'IA du mois (offre {1:t}). Elles reviennent le {2:date}, ou recharge tout de suite : {3:t} pour {4:euros}.", u.plan.aiPerMonth, u, "ai50");
    const [recent] = await run<{ n: string }>("SELECT count(*) AS n FROM usage_events WHERE user_id = $1 AND kind = 'ai' AND created_at > now() - interval '1 minute'", [user.id]);
    if (Number(recent.n) >= AI_PER_MINUTE) throw new QuotaError("Trop de traductions d'affilée : attends une minute.");
    // The site-wide count runs under its own lock, so accounts translating at the same moment can't all slip under the cap.
    await run("SELECT pg_advisory_xact_lock(hashtext('ai:daily'))", []);
    const [today] = await run<{ n: string }>("SELECT count(*) AS n FROM usage_events WHERE kind = 'ai' AND created_at > now() - interval '1 day'", []);
    if (Number(today.n) >= AI_DAILY_CAP) throw new QuotaError("Les traductions par l'IA sont très demandées aujourd'hui : réessaie demain, ou utilise le constructeur manuel.");
    const [row] = await run<{ id: string }>("INSERT INTO usage_events (user_id, kind) VALUES ($1, 'ai') RETURNING id", [user.id]);
    if (useCredit) await spendCredit(run, user.id, "ai", `ai:${row.id}`);
    return row.id;
  });
}

export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
  /** The model that answered last (a fallback model can stand in). */
  model: string | null;
}

/** Stores what an AI translation consumed, so the cost per user can be followed. */
export async function recordAiUsage(eventId: string, usage: AiUsage) {
  if (!usage.model) return;
  await query("UPDATE usage_events SET input_tokens = $2, output_tokens = $3, model = $4 WHERE id = $1", [eventId, usage.inputTokens, usage.outputTokens, usage.model]);
}
