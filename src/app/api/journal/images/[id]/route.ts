import { connection } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { handle } from "@/lib/server/http";
import { limitJournal } from "@/lib/server/journal";
import { deleteImage, imageUsage, readImage } from "@/lib/server/journal-media";
import { requestT } from "@/lib/server/lang";

/** The image itself, for its owner only. An image never changes: the browser keeps it. */
export async function GET(req: Request, ctx: RouteContext<"/api/journal/images/[id]">) {
  await connection();
  return handle(async () => {
    const user = await requireUser(req.headers);
    const image = await readImage(user.id, (await ctx.params).id);
    if (!image) return Response.json({ error: (await requestT())("Image introuvable") }, { status: 404 });
    return new Response(new Uint8Array(image.data), {
      headers: { "content-type": image.mime, "cache-control": "private, max-age=31536000, immutable", "x-content-type-options": "nosniff" },
    });
  });
}

export async function DELETE(req: Request, ctx: RouteContext<"/api/journal/images/[id]">) {
  return handle(async () => {
    const user = await requireUser(req.headers);
    limitJournal(user.id);
    await deleteImage(user.id, (await ctx.params).id);
    return Response.json({ ok: true, images: await imageUsage(user) });
  });
}
