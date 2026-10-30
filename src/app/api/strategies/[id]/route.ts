import { connection } from "next/server";
import { deleteStrategy, getStrategy } from "@/lib/server/strategies";
import { requireUser } from "@/lib/server/auth";
import { handle } from "@/lib/server/http";

export async function GET(req: Request, ctx: RouteContext<"/api/strategies/[id]">) {
  await connection();
  return handle(async () => {
    const user = await requireUser(req.headers);
    const s = await getStrategy(user.id, (await ctx.params).id);
    return s ? Response.json(s) : Response.json({ error: "Stratégie introuvable" }, { status: 404 });
  });
}

export async function DELETE(req: Request, ctx: RouteContext<"/api/strategies/[id]">) {
  return handle(async () => {
    const user = await requireUser(req.headers);
    await deleteStrategy(user.id, (await ctx.params).id);
    return Response.json({ ok: true });
  });
}
