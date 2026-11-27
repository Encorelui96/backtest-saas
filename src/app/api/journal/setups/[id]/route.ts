import { requireUser } from "@/lib/server/auth";
import { handle } from "@/lib/server/http";
import { SetupInput, deleteSetup, updateSetup, limitJournal } from "@/lib/server/journal";
import { requestT } from "@/lib/server/lang";

export async function PUT(req: Request, ctx: RouteContext<"/api/journal/setups/[id]">) {
  return handle(async () => {
    const user = await requireUser(req.headers);
    limitJournal(user.id);
    const s = await updateSetup(user.id, (await ctx.params).id, SetupInput.parse(await req.json()));
    return s ? Response.json(s) : Response.json({ error: (await requestT())("Configuration introuvable") }, { status: 404 });
  });
}

/** Deletes the setup, or archives it when trades follow it. */
export async function DELETE(req: Request, ctx: RouteContext<"/api/journal/setups/[id]">) {
  return handle(async () => {
    const user = await requireUser(req.headers);
    limitJournal(user.id);
    return Response.json(await deleteSetup(user.id, (await ctx.params).id));
  });
}
