import { connection } from "next/server";
import { deleteBacktest, getBacktest } from "@/lib/server/backtests";
import { handle } from "@/lib/server/http";

export async function GET(_req: Request, ctx: RouteContext<"/api/backtests/[id]">) {
  await connection();
  return handle(async () => {
    const b = getBacktest((await ctx.params).id);
    return b ? Response.json(b) : Response.json({ error: "Backtest introuvable" }, { status: 404 });
  });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/backtests/[id]">) {
  return handle(async () => {
    deleteBacktest((await ctx.params).id);
    return Response.json({ ok: true });
  });
}
