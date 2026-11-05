import { connection, type NextRequest } from "next/server";
import { listBacktests, validateBacktest } from "@/lib/server/backtests";
import { BacktestPayload, enqueue } from "@/lib/server/jobs";
import { getStrategy } from "@/lib/server/strategies";
import { checkBacktestAllowed, spendCredit, withUserLock } from "@/lib/server/quotas";
import { requireUser } from "@/lib/server/auth";
import { handle } from "@/lib/server/http";
import { langOf } from "@/lib/server/lang";

export async function GET(req: NextRequest) {
  await connection();
  return handle(async () => {
    const user = await requireUser(req.headers);
    const params = req.nextUrl.searchParams;
    return Response.json(await listBacktests(user.id, { strategyId: params.get("strategyId") ?? undefined, search: params.get("q") ?? undefined }));
  });
}

/** Queues a backtest; the worker computes it. The client follows it at /api/jobs/:id. */
export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser(req.headers);
    const body = BacktestPayload.extend({ strategyId: BacktestPayload.shape.strategyId.optional() }).parse(await req.json());
    const { strategy, start } = validateBacktest(body.strategy, body.config);
    // Only link the result to a strategy the user owns.
    const strategyId = body.strategyId && (await getStrategy(user.id, body.strategyId)) ? body.strategyId : null;
    const job = await withUserLock(user, async (run, client) => {
      const { useCredit } = await checkBacktestAllowed(user, strategy.interval, run, start);
      const queued = await enqueue(user.id, "backtest", { strategy: body.strategy, config: body.config, strategyId, lang: langOf(req) }, client);
      // Past the monthly quota, the backtest uses a recharge credit; a failure gives it back (failJob).
      if (useCredit) await spendCredit(run, user.id, "backtest", `job:${queued.id}`);
      return queued;
    });
    return Response.json({ jobId: job.id });
  });
}
