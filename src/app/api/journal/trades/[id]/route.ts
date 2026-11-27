import { requireUser } from "@/lib/server/auth";
import { handle } from "@/lib/server/http";
import { TradeInput, deleteTrade, updateTrade, limitJournal } from "@/lib/server/journal";
import { requestT } from "@/lib/server/lang";

/** Saves the whole trade: an edit, its close, or a reopening (close: null). */
export async function PUT(req: Request, ctx: RouteContext<"/api/journal/trades/[id]">) {
  return handle(async () => {
    const user = await requireUser(req.headers);
    limitJournal(user.id);
    const t = await updateTrade(user.id, (await ctx.params).id, TradeInput.parse(await req.json()));
    return t ? Response.json(t) : Response.json({ error: (await requestT())("Trade introuvable") }, { status: 404 });
  });
}

export async function DELETE(req: Request, ctx: RouteContext<"/api/journal/trades/[id]">) {
  return handle(async () => {
    const user = await requireUser(req.headers);
    limitJournal(user.id);
    await deleteTrade(user.id, (await ctx.params).id);
    return Response.json({ ok: true });
  });
}
