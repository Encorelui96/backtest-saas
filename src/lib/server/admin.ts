import "server-only";
import { cohorts, funnel, latestSignups, quotaPressure, type AdminMetrics } from "../admin-metrics";
import type { PlanId } from "../plans";
import { AI_PRICES } from "./ai";
import { query } from "./db";
import { isAdmin } from "./quotas";

function monthStart() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

const time = (d: Date | null) => (d ? d.getTime() : null);

/** Everything the admin page shows. One row per user is fine up to tens of thousands of accounts. */
export async function adminMetrics(): Promise<AdminMetrics> {
  const since = monthStart();
  const now = Date.now();
  const [users, ai, feedback, interest, marketRequests] = await Promise.all([
    query<{ id: string; email: string; email_verified: boolean; created_at: Date; first_backtest: Date | null; backtests_total: string; last_activity: Date | null; plan: PlanId; backtests_month: string; ai_month: string }>(
      `SELECT u.id, u.email, u."emailVerified" AS email_verified, u."createdAt" AS created_at,
         (SELECT min(b.created_at) FROM backtests b WHERE b.user_id = u.id) AS first_backtest,
         (SELECT count(*) FROM backtests b WHERE b.user_id = u.id) AS backtests_total,
         GREATEST(
           (SELECT max(j.created_at) FROM jobs j WHERE j.user_id = u.id),
           (SELECT max(e.created_at) FROM usage_events e WHERE e.user_id = u.id)
         ) AS last_activity,
         COALESCE((SELECT p.plan FROM plans p WHERE p.user_id = u.id), 'free') AS plan,
         (SELECT count(*) FROM jobs j WHERE j.user_id = u.id AND j.kind = 'backtest' AND j.created_at >= $1 AND j.status <> 'failed') AS backtests_month,
         (SELECT count(*) FROM usage_events e WHERE e.user_id = u.id AND e.kind = 'ai' AND e.created_at >= $1) AS ai_month
       FROM "user" u`,
      [since],
    ),
    query<{ email: string; model: string | null; calls: string; input: string | null; output: string | null }>(
      `SELECT u.email, e.model, count(*) AS calls, sum(e.input_tokens) AS input, sum(e.output_tokens) AS output
       FROM usage_events e JOIN "user" u ON u.id = e.user_id
       WHERE e.kind = 'ai' AND e.created_at >= $1
       GROUP BY u.email, e.model`,
      [since],
    ),
    query<{ answer: string; comment: string | null; created_at: Date }>("SELECT answer, comment, created_at FROM feedback WHERE kind = 'pmf' ORDER BY created_at DESC"),
    query<{ plan: PlanId; billing: string; n: string }>("SELECT plan, billing, count(*) AS n FROM plan_interest GROUP BY plan, billing ORDER BY plan, billing"),
    query<{ market: string; n: string }>("SELECT market, count(*) AS n FROM market_requests GROUP BY market ORDER BY count(*) DESC, market LIMIT 30"),
  ]);

  const rows = users.map((u) => ({ createdAt: u.created_at.getTime(), firstBacktest: time(u.first_backtest), lastActivity: time(u.last_activity) }));

  // Unknown models are priced like the default one: a safe overestimate for a cheaper fallback.
  const byUser = new Map<string, { calls: number; costUsd: number }>();
  let calls = 0;
  let measured = 0;
  let costUsd = 0;
  for (const r of ai) {
    const [pin, pout] = AI_PRICES[r.model ?? ""] ?? AI_PRICES["claude-opus-5-5"];
    const cost = (Number(r.input ?? 0) * pin + Number(r.output ?? 0) * pout) / 1e6;
    calls += Number(r.calls);
    if (r.model) measured += Number(r.calls);
    costUsd += cost;
    const u = byUser.get(r.email) ?? { calls: 0, costUsd: 0 };
    byUser.set(r.email, { calls: u.calls + Number(r.calls), costUsd: u.costUsd + cost });
  }

  const count = (a: string) => feedback.filter((f) => f.answer === a).length;
  // Admins have the Pro plan whatever the table says.
  const planOf = (u: (typeof users)[number]): PlanId => (isAdmin({ id: u.id, email: u.email, emailVerified: u.email_verified }) ? "pro" : u.plan);
  return {
    generatedAt: now,
    funnel: funnel(rows, now),
    cohorts: cohorts(rows, now),
    signups: latestSignups(
      users.map((u) => ({
        email: u.email,
        emailVerified: u.email_verified,
        createdAt: u.created_at.getTime(),
        plan: planOf(u),
        backtests: Number(u.backtests_total),
        lastActivity: time(u.last_activity),
      })),
    ),
    quotas: quotaPressure(users.map((u) => ({ plan: planOf(u), backtests: Number(u.backtests_month), ai: Number(u.ai_month) }))),
    ai: {
      calls,
      measured,
      costUsd,
      perCallUsd: measured ? costUsd / measured : null,
      topUsers: [...byUser.entries()]
        .map(([email, u]) => ({ email, ...u }))
        .sort((a, b) => b.costUsd - a.costUsd)
        .slice(0, 10),
    },
    pmf: {
      answers: { very: count("very"), somewhat: count("somewhat"), not: count("not") },
      comments: feedback.filter((f) => f.comment).slice(0, 20).map((f) => ({ answer: f.answer, comment: f.comment!, createdAt: f.created_at.getTime() })),
    },
    interest: interest.map((i) => ({ plan: i.plan, billing: i.billing, n: Number(i.n) })),
    marketRequests: marketRequests.map((r) => ({ market: r.market, n: Number(r.n) })),
  };
}
