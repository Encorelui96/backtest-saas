import { connection } from "next/server";
import { deleteBacktest, getBacktest } from "@/lib/server/backtests";
import { requireUser } from "@/lib/server/auth";
import { shareOf } from "@/lib/server/shares";
import { handle } from "@/lib/server/http";
import { requestT } from "@/lib/server/lang";

export async function GET(req: Request, ctx: RouteContext<"/api/backtests/[id]">) {
  await connection();
  return handle(async () => {
    const user = await requireUser(req.headers);
    const id = (await ctx.params).id;
    const [b, share] = await Promise.all([getBacktest(user.id, id), shareOf(user.id, id)]);
    return b ? Response.json({ ...b, share }) : Response.json({ error: (await requestT())("Backtest introuvable") }, { status: 404 });
  });
}

export async function DELETE(req: Request, ctx: RouteContext<"/api/backtests/[id]">) {
  return handle(async () => {
    const user = await requireUser(req.headers);
    await deleteBacktest(user.id, (await ctx.params).id);
    return Response.json({ ok: true });
  });
}
