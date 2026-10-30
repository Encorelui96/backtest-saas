import { connection } from "next/server";
import { deleteStrategy, getStrategy } from "@/lib/server/strategies";
import { handle } from "@/lib/server/http";

export async function GET(_req: Request, ctx: RouteContext<"/api/strategies/[id]">) {
  await connection();
  return handle(async () => {
    const s = getStrategy((await ctx.params).id);
    return s ? Response.json(s) : Response.json({ error: "Stratégie introuvable" }, { status: 404 });
  });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/strategies/[id]">) {
  return handle(async () => {
    deleteStrategy((await ctx.params).id);
    return Response.json({ ok: true });
  });
}
