import { requireUser } from "@/lib/server/auth";
import { handle } from "@/lib/server/http";
import { limitJournal } from "@/lib/server/journal";
import { Day, NoteInput, deleteNote, saveNote } from "@/lib/server/journal-media";

/** Writes the day's note (the session's review); an empty note without images is removed. */
export async function PUT(req: Request, ctx: RouteContext<"/api/journal/notes/[day]">) {
  return handle(async () => {
    const user = await requireUser(req.headers);
    limitJournal(user.id);
    const day = Day.parse((await ctx.params).day);
    return Response.json({ note: await saveNote(user.id, day, NoteInput.parse(await req.json()).text) });
  });
}

export async function DELETE(req: Request, ctx: RouteContext<"/api/journal/notes/[day]">) {
  return handle(async () => {
    const user = await requireUser(req.headers);
    limitJournal(user.id);
    await deleteNote(user.id, Day.parse((await ctx.params).day));
    return Response.json({ ok: true });
  });
}
