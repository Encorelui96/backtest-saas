import { z } from "zod";
import { requireUser } from "@/lib/server/auth";
import { handle } from "@/lib/server/http";
import { requestT } from "@/lib/server/lang";
import { isAdmin } from "@/lib/server/quotas";
import { setFeatured, shareBacktest, shareOf, unshareBacktest } from "@/lib/server/shares";

/** Creates (or returns) the public link of one of the user's backtests. */
export async function POST(req: Request, ctx: RouteContext<"/api/backtests/[id]/share">) {
  return handle(async () => {
    const user = await requireUser(req.headers);
    return Response.json(await shareBacktest(user.id, (await ctx.params).id));
  });
}

/** Removes the link: anyone who had it gets "link not found". */
export async function DELETE(req: Request, ctx: RouteContext<"/api/backtests/[id]/share">) {
  return handle(async () => {
    const user = await requireUser(req.headers);
    await unshareBacktest(user.id, (await ctx.params).id);
    return Response.json({ ok: true });
  });
}

const Featured = z.object({ featured: z.boolean() });

/** Admins only: shows this report as the example on the home page. */
export async function PATCH(req: Request, ctx: RouteContext<"/api/backtests/[id]/share">) {
  return handle(async () => {
    const user = await requireUser(req.headers);
    if (!isAdmin(user)) return Response.json({ error: (await requestT())("Réservé à l'administrateur.") }, { status: 403 });
    const id = (await ctx.params).id;
    await setFeatured(user.id, id, Featured.parse(await req.json()).featured);
    return Response.json(await shareOf(user.id, id));
  });
}
