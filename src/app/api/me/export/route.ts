import { connection } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { query } from "@/lib/server/db";
import { handle } from "@/lib/server/http";

/** Right of access and portability: everything stored about the signed-in user, as a JSON file. */
export async function GET(req: Request) {
  await connection();
  return handle(async () => {
    const user = await requireUser(req.headers);
    const [account, plan, strategies, backtests, usage, sessions, feedback, interest, marketRequests, settings, telegram, alerts, credits] = await Promise.all([
      query(`SELECT email, name, "createdAt" AS created_at FROM "user" WHERE id = $1`, [user.id]),
      query("SELECT plan, updated_at FROM plans WHERE user_id = $1", [user.id]),
      query("SELECT name, json AS rules, source_text AS description, created_at, updated_at FROM strategies WHERE user_id = $1 ORDER BY created_at", [user.id]),
      // The full reports can weigh several MB each and are recomputable: the export keeps the settings and the results summary.
      query("SELECT name, strategy, config, summary, created_at FROM backtests WHERE user_id = $1 ORDER BY created_at", [user.id]),
      query("SELECT kind, created_at FROM usage_events WHERE user_id = $1 ORDER BY created_at", [user.id]),
      query(`SELECT "createdAt" AS created_at, "expiresAt" AS expires_at, "ipAddress" AS ip_address, "userAgent" AS user_agent FROM session WHERE "userId" = $1`, [user.id]),
      query("SELECT kind, answer, comment, created_at FROM feedback WHERE user_id = $1", [user.id]),
      query("SELECT plan, billing, created_at FROM plan_interest WHERE user_id = $1", [user.id]),
      query("SELECT market, created_at FROM market_requests WHERE user_id = $1 ORDER BY created_at", [user.id]),
      query("SELECT test_emails FROM user_settings WHERE user_id = $1", [user.id]),
      query("SELECT chat_id, username, linked_at FROM telegram_links WHERE user_id = $1", [user.id]),
      query(
        `SELECT s.name AS strategy, a.enabled, a.last_signal_at, a.created_at FROM alerts a JOIN strategies s ON s.id = a.strategy_id
         WHERE a.user_id = $1 ORDER BY a.created_at`,
        [user.id],
      ),
      query("SELECT kind, delta, reason, created_at FROM credit_ledger WHERE user_id = $1 ORDER BY created_at", [user.id]),
    ]);
    const data = {
      exportedAt: new Date().toISOString(),
      account: account[0] ?? null,
      plan: plan[0] ?? { plan: "free" },
      strategies,
      backtests,
      usage,
      sessions,
      feedback,
      planInterest: interest,
      marketRequests,
      settings: settings[0] ?? { test_emails: true },
      telegram: telegram[0] ?? null,
      alerts,
      credits,
    };
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="backtest-lab-mes-donnees-${new Date().toISOString().slice(0, 10)}.json"`,
        "cache-control": "no-store",
      },
    });
  });
}
