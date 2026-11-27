import { requireUser } from "@/lib/server/auth";
import { handle } from "@/lib/server/http";
import { AccountInput, deleteAccount, updateAccount, limitJournal } from "@/lib/server/journal";
import { requestT } from "@/lib/server/lang";

export async function PUT(req: Request, ctx: RouteContext<"/api/journal/accounts/[id]">) {
  return handle(async () => {
    const user = await requireUser(req.headers);
    limitJournal(user.id);
    const a = await updateAccount(user.id, (await ctx.params).id, AccountInput.parse(await req.json()));
    return a ? Response.json(a) : Response.json({ error: (await requestT())("Compte introuvable") }, { status: 404 });
  });
}

/** Deletes the account with its trades: the page asks for a confirmation first. */
export async function DELETE(req: Request, ctx: RouteContext<"/api/journal/accounts/[id]">) {
  return handle(async () => {
    const user = await requireUser(req.headers);
    limitJournal(user.id);
    await deleteAccount(user.id, (await ctx.params).id);
    return Response.json({ ok: true });
  });
}
