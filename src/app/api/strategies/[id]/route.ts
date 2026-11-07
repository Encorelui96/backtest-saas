import { connection } from "next/server";
import { z } from "zod";
import { deleteStrategy, getStrategy, setFavorite } from "@/lib/server/strategies";
import { requireUser } from "@/lib/server/auth";
import { handle } from "@/lib/server/http";
import { requestT } from "@/lib/server/lang";

export async function GET(req: Request, ctx: RouteContext<"/api/strategies/[id]">) {
  await connection();
  return handle(async () => {
    const user = await requireUser(req.headers);
    const s = await getStrategy(user.id, (await ctx.params).id);
    return s ? Response.json(s) : Response.json({ error: (await requestT())("Stratégie introuvable") }, { status: 404 });
  });
}

const Patch = z.object({ favorite: z.boolean() });

/** Stars or unstars the strategy. */
export async function PATCH(req: Request, ctx: RouteContext<"/api/strategies/[id]">) {
  return handle(async () => {
    const user = await requireUser(req.headers);
    const { favorite } = Patch.parse(await req.json());
    const ok = await setFavorite(user.id, (await ctx.params).id, favorite);
    return ok ? Response.json({ ok: true, favorite }) : Response.json({ error: (await requestT())("Stratégie introuvable") }, { status: 404 });
  });
}

export async function DELETE(req: Request, ctx: RouteContext<"/api/strategies/[id]">) {
  return handle(async () => {
    const user = await requireUser(req.headers);
    await deleteStrategy(user.id, (await ctx.params).id);
    return Response.json({ ok: true });
  });
}
