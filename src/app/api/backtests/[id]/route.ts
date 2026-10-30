import { connection } from "next/server";
import { deleteBacktest, getBacktest } from "@/lib/server/backtests";
import { requireUser } from "@/lib/server/auth";
import { handle } from "@/lib/server/http";

export async function GET(req: Request, ctx: RouteContext<"/api/backtests/[id]">) {
  await connection();
  return handle(async () => {
    const user = await requireUser(req.headers);
    const b = await getBacktest(user.id, (await ctx.params).id);
    return b ? Response.json(b) : Response.json({ error: "Backtest introuvable" }, { status: 404 });
  });
}

export async function DELETE(req: Request, ctx: RouteContext<"/api/backtests/[id]">) {
  return handle(async () => {
    const user = await requireUser(req.headers);
    await deleteBacktest(user.id, (await ctx.params).id);
    return Response.json({ ok: true });
  });
}
