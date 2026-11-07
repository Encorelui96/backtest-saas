import { connection } from "next/server";
import { z } from "zod";
import { deleteBacktest, getBacktest, renameBacktest } from "@/lib/server/backtests";
import { requireUser } from "@/lib/server/auth";
import { shareOf } from "@/lib/server/shares";
import { getStrategy } from "@/lib/server/strategies";
import { sameRules } from "@/lib/strategy/same-rules";
import { handle } from "@/lib/server/http";
import { requestT } from "@/lib/server/lang";

export async function GET(req: Request, ctx: RouteContext<"/api/backtests/[id]">) {
  await connection();
  return handle(async () => {
    const user = await requireUser(req.headers);
    const id = (await ctx.params).id;
    const [b, share] = await Promise.all([getBacktest(user.id, id), shareOf(user.id, id)]);
    if (!b) return Response.json({ error: (await requestT())("Backtest introuvable") }, { status: 404 });
    const saved = b.strategyId ? await getStrategy(user.id, b.strategyId) : null;
    return Response.json({ ...b, share, strategyCurrent: saved !== null && sameRules(saved.strategy, b.strategy), strategyFavorite: saved?.favorite ?? null });
  });
}

const Rename = z.object({ name: z.string().max(500) });

/** An empty name gives the backtest its strategy's name back. */
export async function PATCH(req: Request, ctx: RouteContext<"/api/backtests/[id]">) {
  return handle(async () => {
    const user = await requireUser(req.headers);
    const name = await renameBacktest(user.id, (await ctx.params).id, Rename.parse(await req.json()).name);
    return name === null ? Response.json({ error: (await requestT())("Backtest introuvable") }, { status: 404 }) : Response.json({ name });
  });
}

export async function DELETE(req: Request, ctx: RouteContext<"/api/backtests/[id]">) {
  return handle(async () => {
    const user = await requireUser(req.headers);
    await deleteBacktest(user.id, (await ctx.params).id);
    return Response.json({ ok: true });
  });
}
