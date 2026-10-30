import { connection, type NextRequest } from "next/server";
import { listBacktests, validateBacktest } from "@/lib/server/backtests";
import { BacktestPayload, enqueue } from "@/lib/server/jobs";
import { getStrategy } from "@/lib/server/strategies";
import { checkBacktestAllowed, withUserLock } from "@/lib/server/quotas";
import { requireUser } from "@/lib/server/auth";
import { handle } from "@/lib/server/http";

export async function GET(req: NextRequest) {
  await connection();
  return handle(async () => {
    const user = await requireUser(req.headers);
    return Response.json(await listBacktests(user.id, req.nextUrl.searchParams.get("strategyId") ?? undefined));
  });
}

/** Queues a backtest; the worker computes it. The client follows it at /api/jobs/:id. */
export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser(req.headers);
    const body = BacktestPayload.extend({ strategyId: BacktestPayload.shape.strategyId.optional() }).parse(await req.json());
    const { strategy } = validateBacktest(body.strategy, body.config);
    // Only link the result to a strategy the user owns.
    const strategyId = body.strategyId && (await getStrategy(user.id, body.strategyId)) ? body.strategyId : null;
    const job = await withUserLock(user, async (run, client) => {
      await checkBacktestAllowed(user, strategy.interval, run);
      return enqueue(user.id, "backtest", { strategy: body.strategy, config: body.config, strategyId }, client);
    });
    return Response.json({ jobId: job.id });
  });
}
