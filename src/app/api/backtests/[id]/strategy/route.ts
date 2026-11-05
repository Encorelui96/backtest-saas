import { getBacktest, linkBacktest } from "@/lib/server/backtests";
import { requireUser } from "@/lib/server/auth";
import { handle } from "@/lib/server/http";
import { requestT } from "@/lib/server/lang";
import { getStrategy, saveStrategy } from "@/lib/server/strategies";
import { sameRules } from "@/lib/strategy/same-rules";

/**
 * The saved strategy with this test's rules. A strategy changes with each run, so when
 * it no longer matches (or is gone), the test gets its own, under the test's name.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/backtests/[id]/strategy">) {
  return handle(async () => {
    const user = await requireUser(req.headers);
    const id = (await ctx.params).id;
    const b = await getBacktest(user.id, id);
    if (!b) return Response.json({ error: (await requestT())("Backtest introuvable") }, { status: 404 });
    const current = b.strategyId ? await getStrategy(user.id, b.strategyId) : null;
    if (current && sameRules(current.strategy, b.strategy)) return Response.json({ id: current.id });
    const saved = await saveStrategy(user.id, { ...b.strategy, name: b.name }, null);
    await linkBacktest(user.id, id, saved.id);
    return Response.json({ id: saved.id });
  });
}
